import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

/**
 * Las sedes del espacio, para la pantalla que administra su material.
 *
 * Existe aparte del listado que usa el bot por una razon concreta: aquel se autentica con
 * credencial de maquina y este con la sesion de una persona que pertenece al espacio. Dos publicos,
 * dos puertas; mezclarlas obligaria a que un extremo aceptara las dos formas.
 *
 * Solo sedes activas: ofrecer una sucursal cerrada en un desplegable seria peor que no ofrecerla.
 */
@Injectable()
export class BranchService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /** Las sedes activas, ordenadas por su identificador legible. */
  async list(authorization: unknown, tenantId: string): Promise<unknown> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('slug', { ascending: true });
    if (error) throw new InternalServerErrorException('No fue posible leer las sedes.');

    return {
      branches: (Array.isArray(data) ? data : []).map((fila) => {
        const f = fila as Record<string, unknown>;
        return { id: String(f.id ?? ''), name: String(f.name ?? ''), slug: String(f.slug ?? '') };
      }),
      tenantId
    };
  }
}
