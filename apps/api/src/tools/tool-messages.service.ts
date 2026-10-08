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
import { whatsappServiceWindow } from '@chat-zernio/domain';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantMessageService } from '../conversations/tenant-message.service';
import { claveIdempotencia } from './idempotency-key';
import { partIdempotencyKey, splitOutboundText } from './outbound-text-splitter';
import { ToolTokenService } from './tool-token.service';
import { readPlaceholders } from './tool-templates.service';

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

    // Fuera de la ventana de 24 horas, WhatsApp solo admite plantillas aprobadas. Se comprueba aqui,
    // en la puerta del bot, y no en el camino compartido: una persona que escribe desde la bandeja
    // no se bloquea (su fallo se ve en el mensaje), y asi la regla del bot no cambia la interfaz.
    await this.assertMessagingAllowed(supabase, identity.tenantId, conversationId);

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
    const adjuntos = await this.resolveAttachments(supabase, identity.tenantId, cuerpo.media);

    // Las dos partes se encolan seguidas, y la multimedia viaja con la primera.
    let item: Awaited<ReturnType<TenantMessageService['enqueueOutbound']>> | null = null;
    for (const comando of comandos) {
      const encolado = await this.tenantMessageService.enqueueOutbound({
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

    if (adjuntos.length > 0) {
      const { error: adjuntoError } = await supabase.from('message_attachments').insert(
        adjuntos.map((adjunto, orden) => ({
          conversation_id: conversationId,
          kind: adjunto.kind,
          message_id: item.item.id,
          ordinal: orden,
          source_kind: 'branch_media',
          storage_object_path: adjunto.path,
          tenant_id: identity.tenantId
        }))
      );
      if (adjuntoError) {
        throw new InternalServerErrorException('El mensaje se encolo, pero no su multimedia.');
      }
    }

    return { ...item, tenantId: identity.tenantId };
  }

  /**
   * Fuera de la ventana de 24 horas, WhatsApp solo admite plantillas aprobadas.
   *
   * Se aplica a TODO lo que no sea plantilla: un texto o una foto fuera de plazo tambien los rechaza
   * Meta, y ese rechazo llega minutos despues como un mensaje fallido que nadie mira. Fallar aqui es
   * inmediato y operable.
   *
   * No se bloquea cuando la ventana no se puede afirmar (otro canal, o un hilo sin mensajes
   * entrantes registrados): en ese caso decide el proveedor, que es quien tiene la ultima palabra.
   */
  private async assertMessagingAllowed(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string
  ): Promise<void> {
    const { data: conversacion, error } = await supabase
      .from('conversations')
      .select('id, channel_account:channel_accounts(platform)')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(
        'No fue posible comprobar el canal de la conversacion.'
      );
    }
    // Sin conversacion no hay nada que comprobar aqui: el encolado dara el error que corresponde.
    if (!conversacion) return;

    const canal = (conversacion as { channel_account?: unknown }).channel_account;
    const relacion = Array.isArray(canal) ? canal[0] : canal;
    const plataforma =
      relacion && typeof relacion === 'object' && 'platform' in relacion
        ? String((relacion as { platform?: unknown }).platform ?? '')
            .trim()
            .toLowerCase()
        : '';
    if (plataforma !== 'whatsapp') return;

    const { data: entrante, error: entranteError } = await supabase
      .from('messages')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entranteError) {
      throw new InternalServerErrorException('No fue posible comprobar la ventana de mensajeria.');
    }

    const ventana = whatsappServiceWindow(
      typeof entrante?.created_at === 'string' ? entrante.created_at : null,
      Date.now()
    );
    if (ventana && !ventana.open) {
      throw new UnprocessableEntityException(
        `La ventana de 24 horas de WhatsApp esta cerrada desde ${ventana.expiresAt}: envia una plantilla aprobada con whatsappTemplate.`
      );
    }
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
   * Tres reglas:
   *   1. Se acepta UNA: Meta admite una multimedia por mensaje.
   *   2. Si un identificador no existe en este espacio, se rechaza el envio entero en lugar de
   *      mandarlo sin la imagen: un mensaje mudo es peor que un error visible.
   *   3. La ruta tiene que estar en el deposito de sedes, que es donde el trabajador la busca.
   */
  private async resolveAttachments(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    valor: unknown
  ): Promise<Array<{ kind: string; path: string }>> {
    if (valor === undefined || valor === null) return [];
    if (!Array.isArray(valor) || valor.length === 0) {
      throw new UnprocessableEntityException('media debe ser una lista con al menos un elemento.');
    }
    if (valor.length > 1) {
      throw new UnprocessableEntityException('Solo se admite una imagen por mensaje.');
    }

    const ids = valor
      .map((elemento) => {
        const m = (elemento ?? {}) as Record<string, unknown>;
        return typeof m.branchMediaId === 'string' ? m.branchMediaId : null;
      })
      .filter((id): id is string => id !== null);
    if (ids.length === 0) {
      throw new UnprocessableEntityException('Cada elemento de media necesita branchMediaId.');
    }

    const { data, error } = await supabase
      .from('branch_media')
      .select('id, kind, storage_object_path')
      .eq('tenant_id', tenantId)
      .in('id', ids);
    if (error) throw new InternalServerErrorException('No fue posible leer la multimedia.');

    const filas = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (filas.length !== ids.length) {
      throw new UnprocessableEntityException('Alguna de las imagenes no existe en este espacio.');
    }

    return filas.map((fila) => {
      const path = typeof fila.storage_object_path === 'string' ? fila.storage_object_path : '';
      if (path.length === 0) {
        throw new UnprocessableEntityException(
          'Alguna de las imagenes no tiene archivo en el deposito de sedes.'
        );
      }
      return { kind: typeof fila.kind === 'string' ? fila.kind : 'image', path };
    });
  }
}
