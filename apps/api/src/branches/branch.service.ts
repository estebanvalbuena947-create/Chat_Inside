import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException
} from '@nestjs/common';
import { z } from 'zod';
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

  /** Un administrador crea una sede; nunca se usa el nombre visible como condición de negocio. */
  async create(authorization: unknown, tenantId: string, rawInput: unknown): Promise<unknown> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin']);

    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(rawInput);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Escribe un nombre de sede de hasta 80 caracteres.');
    }

    const name = parsed.data.name;
    const slug = this.slugFromName(name);
    if (!slug) throw new UnprocessableEntityException('El nombre debe contener letras o números.');

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('branches')
      .insert({ is_active: true, name, slug, tenant_id: tenantId })
      .select('id, name, slug')
      .single();
    if (error?.code === '23505') {
      throw new ConflictException('Ya existe una sede con ese nombre.');
    }
    if (error || !data) throw new InternalServerErrorException('No fue posible crear la sede.');

    const branch = data as Record<string, unknown>;
    return {
      item: {
        id: String(branch.id ?? ''),
        name: String(branch.name ?? name),
        slug: String(branch.slug ?? slug)
      },
      tenantId
    };
  }

  private slugFromName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 41);
  }
}
