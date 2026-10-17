import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  createOutboundTextMessageSchema,
  outboundIdempotencyKeySchema,
  whatsappTemplateReferenceSchema,
  type CreateOutboundMessage
} from '@chat-zernio/contracts';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { BRANCH_MEDIA_BUCKET } from '../branches/branch-media.service';
import {
  TenantMessageService,
  type OutboundAttachment
} from '../conversations/tenant-message.service';
import { claveIdempotencia } from './idempotency-key';
import { partIdempotencyKey, splitOutboundText } from './outbound-text-splitter';
import { ToolTokenService } from './tool-token.service';
import { readPlaceholders } from './tool-templates.service';

const ACCESSORIES_TITLE = 'accesorios';

/** La procedencia que se guarda cuando el archivo sale del catalogo administrado de una sede. */
const BRANCH_MEDIA_SOURCE = 'branch_media';

function isAccessoriesTitle(title: string): boolean {
  return title.trim().toLocaleLowerCase('es') === ACCESSORIES_TITLE;
}

/**
 * Envio de mensajes para el bot.
 *
 * Es el extremo que convierte al bot de escucha en alguien que responde. Reutiliza el mismo nucleo
 * que usa la interfaz, asi que hereda sus garantias: validacion del canal, idempotencia y encolado.
 *
 * Tres decisiones:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. Quien escribe es la automatizacion, no una persona: sender_type 'automation' y sin usuario.
 *   3. Y sobre todo: si el interruptor de envio esta apagado, la plataforma RECHAZA el envio. No
 *      depende de que n8n se acuerde de no llamar.
 */
@Injectable()
export class ToolMessagesService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    @Inject(TenantMessageService) private readonly tenantMessageService: TenantMessageService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async send(authorization: unknown, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'messages');

    const cuerpo = (rawBody ?? {}) as Record<string, unknown>;
    const conversationId = typeof cuerpo.conversationId === 'string' ? cuerpo.conversationId : '';
    if (!conversationId) {
      throw new UnprocessableEntityException('Hace falta conversationId.');
    }

    // El contrato del repositorio (docs/TOOLS_CONTRACT.md) habla de `text`. Se aceptan los dos
    // nombres: asi los flujos pueden migrarse al contrato sin dejar de funcionar los que ya estan
    // escritos con `body`.
    const texto =
      typeof cuerpo.text === 'string'
        ? cuerpo.text
        : typeof cuerpo.body === 'string'
          ? cuerpo.body
          : undefined;

    const supabase = this.supabaseServerClientFactory.create();
    const { data: integracion, error } = await supabase
      .from('bot_integrations')
      .select('sending_enabled')
      .eq('tenant_id', identity.tenantId)
      .maybeSingle();
    if (error) {
      throw new UnprocessableEntityException('No fue posible comprobar el estado del bot.');
    }
    if (integracion?.sending_enabled !== true) {
      throw new UnprocessableEntityException(
        'El envio del bot esta apagado en este espacio: puede leer y recibir, pero no escribir.'
      );
    }

    // El contrato pide `templateName`: una plantilla guardada en nuestra base. Los huecos los
    // rellena el SERVIDOR, no el flujo: asi un valor que falte no se convierte en un mensaje con
    // "{fecha}" a la vista del cliente, sino en un error claro.
    const dePlantilla = await this.resolveTemplate(
      supabase,
      identity.tenantId,
      cuerpo.templateName,
      cuerpo.variables
    );

    // El contrato dice "uno de los dos": texto o multimedia. El esquema de salida exige texto
    // (min 1), asi que un envio con archivo y sin texto se valida aqui. La clave de idempotencia se
    // comprueba SIEMPRE -- por el esquema o por su campo -- y el cuerpo vacio es legitimo: la base
    // lo acepta (body text not null default '') y ya hay mensajes asi, de clientes que mandaron solo
    // una foto.
    const tieneMultimedia = Array.isArray(cuerpo.media) && cuerpo.media.length > 0;
    const cuerpoFinal = dePlantilla ?? texto ?? '';

    // Un texto largo se manda en dos mensajes. El contrato admite 4000 caracteres, pero el canal
    // corta alrededor de 1000, y quien lo sabe es la plataforma, no cada flujo que manda texto.
    const partes = splitOutboundText(cuerpoFinal);

    // La clave que manda el flujo es legible ("catalogo-<turno>"); aqui se convierte en el UUID que
    // exigen la tabla y el contrato, sin obligar a 26 nodos de n8n a saber generar uno.
    const claveResuelta = claveIdempotencia(
      identity.tenantId,
      conversationId,
      cuerpo.idempotencyKey
    );
    const clave = outboundIdempotencyKeySchema.safeParse(claveResuelta);

    // Una plantilla aprobada de Meta es un envio completo y de otra clase: no lleva texto, ni
    // multimedia, ni plantilla interna, no se parte en trozos y no se le resuelven huecos.
    if (cuerpo.whatsappTemplate !== undefined) {
      const aprobada = whatsappTemplateReferenceSchema.safeParse(cuerpo.whatsappTemplate);
      const tienePlantillaInterna =
        typeof cuerpo.templateName === 'string' && cuerpo.templateName.trim().length > 0;
      if (!aprobada.success) {
        throw new UnprocessableEntityException(
          'La plantilla aprobada necesita un nombre y un idioma validos.'
        );
      }
      if (!clave.success) {
        throw new UnprocessableEntityException(
          'Hace falta una clave de idempotencia valida para enviar la plantilla.'
        );
      }
      if ((texto ?? '').trim() || tienePlantillaInterna || tieneMultimedia) {
        throw new UnprocessableEntityException(
          'Una plantilla aprobada no lleva texto, multimedia ni plantilla interna: envia solo whatsappTemplate.'
        );
      }
      const encolado = await this.tenantMessageService.enqueueOutbound({
        command: {
          idempotencyKey: clave.data,
          kind: 'whatsapp_template',
          whatsappTemplate: aprobada.data
        },
        conversationId,
        senderType: 'automation',
        senderUserId: null,
        tenantId: identity.tenantId
      });
      return { ...encolado, tenantId: identity.tenantId };
    }

    // La ventana de 24 horas NO se comprueba aqui: vive en el camino compartido del encolado
    // (`TenantMessageService`), para que valga igual para el bot y para la bandeja. Duplicarla aqui
    // solo serviria para que las dos copias se separaran con el tiempo.

    const comandos: Array<CreateOutboundMessage> = [];
    for (let indice = 0; indice < partes.length; indice++) {
      const command = createOutboundTextMessageSchema.safeParse({
        body: partes[indice],
        idempotencyKey:
          typeof claveResuelta === 'string'
            ? partIdempotencyKey(claveResuelta, indice + 1)
            : claveResuelta
      });
      // Mandar un archivo sin texto es legitimo, pero solo tiene sentido en la primera parte.
      const soloArchivo = indice === 0 && tieneMultimedia && clave.success;
      if (!command.success && !soloArchivo) {
        throw new UnprocessableEntityException(
          'El mensaje necesita un texto o una imagen, y una clave de idempotencia valida.'
        );
      }
      comandos.push(
        command.success
          ? command.data
          : { body: '', idempotencyKey: String(claveResuelta), kind: 'text' }
      );
    }

    // La multimedia se resuelve ANTES de encolar: si un archivo no existe en este espacio, no se
    // encola nada. Encolar primero y fallar despues dejaria un mensaje en la cola sin su imagen.
    const adjuntos = await this.resolveAttachments(
      supabase,
      identity.tenantId,
      conversationId,
      cuerpo.media
    );

    // Las dos partes se encolan seguidas, y la multimedia viaja con la primera. El adjunto no se
    // escribe despues: entra por el mismo camino que el de la bandeja, que lo deja escrito ANTES de
    // que exista el evento de envio. Escribirlo aparte dejaba al trabajador poder enviar el mensaje
    // sin su archivo, en silencio.
    let item: Awaited<ReturnType<TenantMessageService['enqueueOutbound']>> | null = null;
    for (const [indice, comando] of comandos.entries()) {
      const encolado = await this.tenantMessageService.enqueueOutbound({
        // Sin adjunto la llamada es exactamente la de siempre; con el, viaja solo en la primera parte.
        ...(indice === 0 && adjuntos.length > 0 ? { attachments: adjuntos } : {}),
        command: comando,
        conversationId,
        senderType: 'automation',
        senderUserId: null,
        tenantId: identity.tenantId
      });
      item ??= encolado;
    }
    if (!item) {
      throw new UnprocessableEntityException('El mensaje no tenia contenido que enviar.');
    }

    return { ...item, tenantId: identity.tenantId };
  }

  /**
   * El texto de una plantilla, con sus huecos ya rellenos.
   *
   * Devuelve undefined cuando no se pide plantilla. Si se pide y falta algun valor, LANZA: mandar el
   * texto con "{fecha}" a la vista seria peor que no mandarlo, y nadie lo notaria hasta que un
   * cliente preguntara que significa esa llave.
   */
  private async resolveTemplate(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    nombre: unknown,
    variables: unknown
  ): Promise<string | undefined> {
    if (nombre === undefined || nombre === null) return undefined;
    if (typeof nombre !== 'string' || nombre.trim().length === 0) {
      throw new UnprocessableEntityException('templateName debe ser el codigo de una plantilla.');
    }

    const { data, error } = await supabase
      .from('message_templates')
      .select('body')
      .eq('tenant_id', tenantId)
      .eq('code', nombre.trim())
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible leer la plantilla.');

    const body = (data as { body?: unknown } | null)?.body;
    if (typeof body !== 'string' || body.length === 0) {
      throw new UnprocessableEntityException('Esa plantilla no existe en este espacio.');
    }

    const valores = (variables ?? {}) as Record<string, unknown>;
    let texto = body;
    const faltan: string[] = [];
    for (const hueco of readPlaceholders(body)) {
      const valor = valores[hueco];
      if (valor === undefined || valor === null || String(valor).trim().length === 0) {
        faltan.push(hueco);
        continue;
      }
      // split/join en lugar de replaceAll: funciona en cualquier version de JavaScript.
      texto = texto.split('{' + hueco + '}').join(String(valor));
    }
    if (faltan.length > 0) {
      throw new UnprocessableEntityException(
        'Faltan valores para la plantilla: ' + faltan.join(', ') + '.'
      );
    }
    return texto;
  }

  /**
   * Resuelve la multimedia de sede a rutas concretas del deposito.
   *
   * Cuatro reglas:
   *   1. Se acepta UNA: Meta admite una multimedia por mensaje.
   *   2. El archivo se pide por identificador o por TITULO dentro de la sede de la conversacion. El
   *      titulo existe porque los flujos no conocen los identificadores de la base, y escribir uno a
   *      mano solo funciona en el espacio donde se copio: el titulo lo elige quien carga el material.
   *   3. Si no existe en este espacio, se rechaza el envio entero en lugar de mandarlo sin la imagen:
   *      un mensaje mudo es peor que un error visible.
   *   4. La ruta tiene que estar en el deposito de sedes, que es donde el trabajador la busca: el
   *      bucket viaja con el adjunto, porque con dos procedencias ya no se puede escribir a mano.
   */
  private async resolveAttachments(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string,
    valor: unknown
  ): Promise<OutboundAttachment[]> {
    if (valor === undefined || valor === null) return [];
    if (!Array.isArray(valor) || valor.length === 0) {
      throw new UnprocessableEntityException('media debe ser una lista con al menos un elemento.');
    }
    if (valor.length > 1) {
      throw new UnprocessableEntityException('Solo se admite una imagen por mensaje.');
    }

    const elemento = (valor[0] ?? {}) as Record<string, unknown>;
    const id = typeof elemento.branchMediaId === 'string' ? elemento.branchMediaId : null;
    const titulo =
      typeof elemento.branchMediaTitle === 'string' ? elemento.branchMediaTitle.trim() : null;
    if (id === null && titulo === null) {
      throw new UnprocessableEntityException(
        'Cada elemento de media necesita branchMediaId o branchMediaTitle.'
      );
    }
    if (id !== null && titulo !== null) {
      throw new UnprocessableEntityException(
        'Cada elemento de media se indica por identificador o por titulo, no por los dos.'
      );
    }

    // Un identificador de otra sede se acepta solo si es de este espacio. Los titulos normales se
    // buscan en la sede de la conversacion; «accesorios» es la unica ficha operativa compartida y
    // se busca una vez en todo el espacio, para no guardar ni enviar la misma tarjeta por sede.
    const consulta = supabase
      .from('branch_media')
      .select('id, kind, storage_object_path')
      .eq('tenant_id', tenantId);
    let data: unknown;
    let error: unknown;
    if (id) {
      ({ data, error } = await consulta.eq('id', id));
    } else {
      const sede = isAccessoriesTitle(titulo as string)
        ? null
        : await this.sedeDeLaConversacion(supabase, tenantId, conversationId);
      const buscar = async (patron: string): Promise<unknown[]> => {
        let consulta = supabase
          .from('branch_media')
          .select('id, kind, storage_object_path')
          .eq('tenant_id', tenantId)
          .ilike('title', patron)
          .order('sort_order', { ascending: true })
          .limit(1);
        if (sede) consulta = consulta.eq('branch_id', sede);
        const { data: filas, error: fallo } = await consulta;
        if (fallo) throw new InternalServerErrorException('No fue posible leer la multimedia.');
        return Array.isArray(filas) ? filas : [];
      };

      // Primero el titulo exacto -- sin distinguir mayusculas -- y solo si no hay, uno que lo
      // contenga. El titulo es la clave por la que el bot pide el material, y quien lo escribe es una
      // persona: «Accesorios», «accesorios» y «Accesorios spa» tienen que encontrar la misma foto, con
      // preferencia por la que se llama exactamente igual.
      const exacto = await buscar(this.patronDeTitulo(titulo as string));
      const filas =
        exacto.length > 0 ? exacto : await buscar(this.patronDeTitulo(titulo as string, true));
      data = filas;
      error = null;
    }
    if (error) throw new InternalServerErrorException('No fue posible leer la multimedia.');

    const filas = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (filas.length !== 1) {
      throw new UnprocessableEntityException(
        id
          ? 'La imagen no existe en este espacio.'
          : isAccessoriesTitle(titulo as string)
            ? 'No existe una imagen global titulada Accesorios en este espacio.'
            : 'La sede de la conversacion no tiene una imagen con ese titulo.'
      );
    }

    return filas.map((fila) => {
      const path = typeof fila.storage_object_path === 'string' ? fila.storage_object_path : '';
      if (path.length === 0) {
        throw new UnprocessableEntityException(
          'Alguna de las imagenes no tiene archivo en el deposito de sedes.'
        );
      }
      return {
        bucket: BRANCH_MEDIA_BUCKET,
        // El catalogo de una sede no guarda el tipo de contenido del archivo: la fila del adjunto
        // sale sin el, como salia hasta hoy.
        contentType: null,
        kind: typeof fila.kind === 'string' ? fila.kind : 'image',
        path,
        sourceKind: BRANCH_MEDIA_SOURCE
      };
    });
  }

  /** La sede de la conversacion: es la que decide que material se puede enviar por titulo. */
  private async sedeDeLaConversacion(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from('conversations')
      .select('branch_id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException('No fue posible leer la sede de la conversacion.');
    const sede = (data as { branch_id?: unknown } | null)?.branch_id;
    if (typeof sede !== 'string' || sede.length === 0) {
      throw new UnprocessableEntityException(
        'La conversacion no tiene sede: no se puede buscar la imagen por su titulo.'
      );
    }
    return sede;
  }

  /**
   * El titulo se busca por su texto: los comodines de SQL se escapan para que no cambien la busqueda.
   *
   * Con `contiene` se busca ademas en cualquier parte del titulo, que es la tolerancia que evita que
   * «Accesorios spa» deje de encontrar lo que un flujo pide como «accesorios».
   */
  private patronDeTitulo(titulo: string, contiene = false): string {
    const escapado = titulo.replace(/[\\%_]/g, (caracter) => '\\' + caracter);
    return contiene ? `%${escapado}%` : escapado;
  }
}
