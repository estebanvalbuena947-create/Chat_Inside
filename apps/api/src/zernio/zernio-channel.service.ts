import {
  Inject,
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import {
  attachZernioChannelResponseSchema,
  renameZernioChannelResponseSchema,
  startZernioChannelConnectionResponseSchema,
  zernioChannelListResponseSchema,
  zernioChannelSchema,
  type AttachZernioChannelResponse,
  type RenameZernioChannel,
  type RenameZernioChannelResponse,
  type StartZernioChannelConnectionResponse,
  type ZernioChannel,
  type ZernioChannelListResponse,
  type ZernioConnectPlatform
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { ZernioApiClient } from './zernio-api.client';

function asZernioChannel(row: {
  created_at: unknown;
  display_name: unknown;
  id: unknown;
  platform: unknown;
}): ZernioChannel {
  return zernioChannelSchema.parse({
    createdAt: new Date(String(row.created_at)).toISOString(),
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
    @Inject(ZernioApiClient) private readonly zernioApiClient: ZernioApiClient
  ) {}

  async list(authorization: unknown, tenantId: string): Promise<ZernioChannelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('channel_accounts')
      .select('id, platform, display_name, created_at')
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .order('created_at', { ascending: false });
    if (error)
      throw new InternalServerErrorException('No fue posible cargar los canales conectados.');
    return zernioChannelListResponseSchema.parse({
      items: (data ?? []).map((channel) => asZernioChannel(channel))
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
          platform: account.platform,
          provider: 'zernio',
          provider_account_id: accountId,
          tenant_id: tenantId
        },
        { onConflict: 'provider,provider_account_id' }
      )
      .select('id, created_at, display_name, platform')
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
      .select('id, platform, display_name, created_at')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible nombrar el canal.');
    if (!data) throw new NotFoundException('El canal no existe en este tenant.');

    return renameZernioChannelResponseSchema.parse({ item: asZernioChannel(data) });
  }

  async startConnection(
    authorization: unknown,
    tenantId: string,
    platform: ZernioConnectPlatform
  ): Promise<StartZernioChannelConnectionResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);
    const redirectUrl = process.env.ZERNIO_CONNECT_REDIRECT_URL;
    if (!redirectUrl) {
      throw new ServiceUnavailableException('Falta configurar la URL de retorno de Zernio.');
    }
    try {
      new URL(redirectUrl);
    } catch {
      throw new ServiceUnavailableException('La URL de retorno de Zernio no es válida.');
    }

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

    return startZernioChannelConnectionResponseSchema.parse({
      authorizationUrl: await this.zernioApiClient.getConnectUrl({
        platform,
        profileId,
        redirectUrl
      })
    });
  }
}
