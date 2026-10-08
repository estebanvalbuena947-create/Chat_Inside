import {
  Inject,
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  attachZernioChannelResponseSchema,
  disconnectZernioChannelResponseSchema,
  renameZernioChannelResponseSchema,
  startZernioChannelConnectionResponseSchema,
  whatsappTemplateListResponseSchema,
  zernioChannelListResponseSchema,
  zernioChannelSchema,
  zernioConnectPlatformSchema,
  type AttachZernioChannelResponse,
  type DisconnectZernioChannelResponse,
  type RenameZernioChannel,
  type RenameZernioChannelResponse,
  type StartZernioChannelConnectionResponse,
  type WhatsappTemplateListResponse,
  type ZernioChannel,
  type ZernioChannelListResponse,
  type ZernioConnectPlatform
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { ZernioApiClient } from './zernio-api.client';
import { WhatsappTemplateCatalog } from './whatsapp-template-catalog';

function asZernioChannel(row: {
  created_at: unknown;
  disconnected_at?: unknown;
  display_name: unknown;
  id: unknown;
  platform: unknown;
}): ZernioChannel {
  return zernioChannelSchema.parse({
    createdAt: new Date(String(row.created_at)).toISOString(),
    disconnectedAt:
      typeof row.disconnected_at === 'string' ? new Date(row.disconnected_at).toISOString() : null,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    id: row.id,
    platform: typeof row.platform === 'string' ? row.platform : null
  });
}

@Injectable()
export class ZernioChannelService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory,
    @Inject(ZernioApiClient) private readonly zernioApiClient: ZernioApiClient,
    @Inject(WhatsappTemplateCatalog)
    private readonly whatsappTemplateCatalog: WhatsappTemplateCatalog
  ) {}

  /**
   * Los canales OPERATIVOS del espacio.
   *
   * Un canal retirado no aparece: si sigue en la lista, la pantalla miente sobre lo que se puede
   * usar. Su historia y sus conversaciones no se tocan.
   */
  async list(authorization: unknown, tenantId: string): Promise<ZernioChannelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('channel_accounts')
      .select('id, platform, display_name, created_at, disconnected_at')
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .is('disconnected_at', null)
      .order('created_at', { ascending: false });
    if (error)
      throw new InternalServerErrorException('No fue posible cargar los canales conectados.');
    return zernioChannelListResponseSchema.parse({
      items: (data ?? []).map((channel) => asZernioChannel(channel))
    });
  }

  /**
   * Plantillas aprobadas de WhatsApp del espacio.
   *
   * Pertenecen a la cuenta de WhatsApp, no a la conversacion: el catalogo resuelve las cuentas de esa
   * plataforma y lee de cada una su catalogo. Sin ninguna cuenta conectada devuelve una lista vacia,
   * que es la verdad —no hay plantillas que mostrar— y no un error que la pantalla tenga que entender.
   */
  async listWhatsappTemplates(
    authorization: unknown,
    tenantId: string
  ): Promise<WhatsappTemplateListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    return whatsappTemplateListResponseSchema.parse({
      items: await this.whatsappTemplateCatalog.listForTenant(tenantId)
    });
  }

  /**
   * El nombre visible del canal lo decide el equipo: con varias cuentas de la misma
   * plataforma, el nombre es lo unico que las distingue en la bandeja. Solo un
   * administrador puede cambiarlo, y la API sigue siendo la fuente de verdad.
   */
  /**
   * Registra en el espacio una cuenta que ya existe en Zernio.
   *
   * Se llama al volver de la autorizacion, con el identificador que el proveedor dejo en la
   * direccion. Ese dato viaja por el navegador, asi que no se da por bueno: se comprueba contra
   * Zernio que la cuenta existe y que pertenece al perfil de este espacio. Sin esa comprobacion
   * cualquiera podria registrar una cuenta ajena y meter su trafico en esta bandeja.
   */
  async attachAccount(
    authorization: unknown,
    tenantId: string,
    accountId: string
  ): Promise<AttachZernioChannelResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const supabase = this.supabaseServerClientFactory.create();
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, zernio_profile_id')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantError || !tenant) {
      throw new InternalServerErrorException('No fue posible resolver el tenant para Zernio.');
    }
    if (typeof tenant.zernio_profile_id !== 'string' || !tenant.zernio_profile_id) {
      throw new ServiceUnavailableException('El perfil de Zernio todavía no está configurado.');
    }

    const account = await this.zernioApiClient.findAccount(accountId);
    if (!account) {
      throw new NotFoundException('La cuenta no existe en Zernio.');
    }
    if (account.profileId !== tenant.zernio_profile_id) {
      throw new ForbiddenException('La cuenta pertenece a otro perfil de Zernio.');
    }

    const { data, error } = await supabase
      .from('channel_accounts')
      .upsert(
        {
          display_name: account.displayName,
          // Volver a registrar una cuenta la devuelve al servicio: reconectar es esto mismo.
          disconnected_at: null,
          platform: account.platform,
          provider: 'zernio',
          provider_account_id: accountId,
          tenant_id: tenantId
        },
        { onConflict: 'provider,provider_account_id' }
      )
      .select('id, created_at, disconnected_at, display_name, platform')
      .single();
    if (error || !data) {
      throw new InternalServerErrorException('No fue posible registrar el canal.');
    }

    return attachZernioChannelResponseSchema.parse({ item: asZernioChannel(data) });
  }
  async rename(
    authorization: unknown,
    tenantId: string,
    channelId: string,
    input: RenameZernioChannel
  ): Promise<RenameZernioChannelResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('channel_accounts')
      .update({ display_name: input.displayName })
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .eq('id', channelId)
      .select('id, platform, display_name, created_at, disconnected_at')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible nombrar el canal.');
    if (!data) throw new NotFoundException('El canal no existe en este tenant.');

    return renameZernioChannelResponseSchema.parse({ item: asZernioChannel(data) });
  }

  /**
   * Retira un canal: lo desconecta en el proveedor y lo saca de la operacion.
   *
   * No se borra la fila. `conversations` y `messages` la referencian con `on delete restrict`, y
   * borrarla romperia la bandeja: se marca con un instante, y ese instante es lo que lo retira de
   * los listados y del catalogo. La historia se conserva entera.
   *
   * Idempotente: si el proveedor responde `404` es que la cuenta ya estaba fuera, y el resultado que
   * se busca —que deje de estar conectada— ya se cumplio. Si el proveedor falla de verdad (un `5xx`),
   * NO se marca nada: no se miente sobre el estado.
   */
  async disconnect(
    authorization: unknown,
    tenantId: string,
    channelId: string
  ): Promise<DisconnectZernioChannelResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const supabase = this.supabaseServerClientFactory.create();
    const { data: canal, error: canalError } = await supabase
      .from('channel_accounts')
      .select('id, provider_account_id, disconnected_at')
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .eq('id', channelId)
      .maybeSingle();
    if (canalError) {
      throw new InternalServerErrorException('No fue posible comprobar el canal.');
    }
    if (!canal) throw new NotFoundException('El canal no existe en este tenant.');

    // Desconectar en el proveedor es un efecto externo: se hace ANTES de marcar, para que un fallo
    // suyo no deje el canal retirado solo en nuestra base.
    await this.zernioApiClient.disconnectAccount(String(canal.provider_account_id ?? ''));

    const { data, error } = await supabase
      .from('channel_accounts')
      .update({ disconnected_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .eq('id', channelId)
      .select('id, platform, display_name, created_at, disconnected_at')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible retirar el canal.');
    if (!data) throw new NotFoundException('El canal no existe en este tenant.');

    return disconnectZernioChannelResponseSchema.parse({ item: asZernioChannel(data) });
  }

  /**
   * Vuelve a abrir el flujo de conexion para el canal retirado.
   *
   * Reconectar es autorizar de nuevo en el proveedor, igual que la primera vez: la cuenta vuelve por
   * el callback o por el webhook, y al registrarse se limpia su estado de retirado. No se inventa un
   * camino distinto para volver.
   */
  async reconnect(
    authorization: unknown,
    tenantId: string,
    channelId: string
  ): Promise<StartZernioChannelConnectionResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const { data: canal, error } = await this.supabaseServerClientFactory
      .create()
      .from('channel_accounts')
      .select('id, platform')
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .eq('id', channelId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar el canal.');
    if (!canal) throw new NotFoundException('El canal no existe en este tenant.');

    // La plataforma que guardamos viene del proveedor y puede ser cualquiera de sus valores; el
    // flujo de conexion solo sabe de las que se pueden autorizar.
    const plataforma = zernioConnectPlatformSchema.safeParse(canal.platform);
    if (!plataforma.success) {
      throw new UnprocessableEntityException('Ese canal no se reconecta desde aquí.');
    }

    const redirectUrl = this.assertConnectRedirectUrl();
    const profileId = await this.resolveProfileId(tenantId);
    return startZernioChannelConnectionResponseSchema.parse({
      authorizationUrl: await this.zernioApiClient.getConnectUrl({
        platform: plataforma.data,
        profileId,
        redirectUrl
      })
    });
  }

  async startConnection(
    authorization: unknown,
    tenantId: string,
    platform: ZernioConnectPlatform
  ): Promise<StartZernioChannelConnectionResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const redirectUrl = this.assertConnectRedirectUrl();
    const profileId = await this.resolveProfileId(tenantId);
    return startZernioChannelConnectionResponseSchema.parse({
      authorizationUrl: await this.zernioApiClient.getConnectUrl({
        platform,
        profileId,
        redirectUrl
      })
    });
  }

  /** La URL de retorno configurada, ya validada. Es la misma para conectar y para reconectar. */
  private assertConnectRedirectUrl(): string {
    const redirectUrl = process.env.ZERNIO_CONNECT_REDIRECT_URL;
    if (!redirectUrl) {
      throw new ServiceUnavailableException('Falta configurar la URL de retorno de Zernio.');
    }
    try {
      new URL(redirectUrl);
    } catch {
      throw new ServiceUnavailableException('La URL de retorno de Zernio no es válida.');
    }
    return redirectUrl;
  }

  /**
   * El perfil del espacio en Zernio, creandolo la primera vez.
   *
   * Se resuelve con una sola regla: si el espacio ya lo tiene, se usa; si no, se crea con una clave
   * de idempotencia derivada del espacio, de modo que dos intentos simultaneos no creen dos perfiles.
   */
  private async resolveProfileId(tenantId: string): Promise<string> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, zernio_profile_id')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantError || !tenant) {
      throw new InternalServerErrorException('No fue posible resolver el tenant para Zernio.');
    }

    let profileId = tenant.zernio_profile_id;
    if (!profileId) {
      profileId = await this.zernioApiClient.createProfile({
        idempotencyKey: `tenant-${tenantId}-zernio-profile`,
        name: `tenant-${tenantId}`
      });
      const { data: updated, error: updateError } = await supabase
        .from('tenants')
        .update({ zernio_profile_id: profileId })
        .eq('id', tenantId)
        .is('zernio_profile_id', null)
        .select('zernio_profile_id')
        .maybeSingle();
      if (updateError) {
        throw new InternalServerErrorException('No fue posible guardar el perfil de Zernio.');
      }
      profileId = updated?.zernio_profile_id ?? profileId;
    }
    return profileId;
  }
}
