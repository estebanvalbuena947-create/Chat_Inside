import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import {
  inviteTenantMemberResponseSchema,
  ownProfileResponseSchema,
  removeTenantMemberResponseSchema,
  tenantListResponseSchema,
  tenantMemberListResponseSchema,
  tenantRoleSchema,
  updateTenantMemberRoleResponseSchema,
  type InviteTenantMember,
  type InviteTenantMemberResponse,
  type OwnProfileResponse,
  type RemoveTenantMemberResponse,
  type TenantMemberListResponse,
  type TenantListResponse,
  type TenantRole,
  type UpdateOwnProfile,
  type UpdateTenantMemberRole,
  type UpdateTenantMemberRoleResponse
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

/**
 * El nombre visible de una persona vive en los metadatos de su cuenta, porque es suyo y no
 * de un tenant: la misma persona puede pertenecer a varios. Se usa solo para presentacion;
 * nunca para autorizar.
 */
function readDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).display_name;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null;
}

@Injectable()
export class TenantAccessService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async assertMembership(userId: string, tenantId: string): Promise<void> {
    await this.getMembershipRole(userId, tenantId);
  }

  /**
   * Rol vigente de la persona en el tenant. Lo usan los comandos cuya regla depende del
   * rol ademas de la autoria, sin duplicar la verificacion de pertenencia.
   */
  async resolveRole(userId: string, tenantId: string): Promise<TenantRole> {
    return this.getMembershipRole(userId, tenantId);
  }

  async assertRole(userId: string, tenantId: string, allowedRoles: TenantRole[]): Promise<void> {
    const role = await this.getMembershipRole(userId, tenantId);
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException('No tienes permiso para administrar este recurso.');
    }
  }

  async memberExists(userId: string, tenantId: string): Promise<boolean> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data: membership, error } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar el integrante del tenant.');
    }
    return Boolean(membership);
  }

  async listTenantMembers(
    authorization: unknown,
    tenantId: string
  ): Promise<TenantMemberListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('user_id, role')
      .eq('tenant_id', tenantId);
    if (error) {
      throw new InternalServerErrorException('No fue posible cargar los integrantes del tenant.');
    }

    const items = await Promise.all(
      (memberships ?? []).map(async (membership) => {
        const { data, error: userError } = await supabase.auth.admin.getUserById(
          membership.user_id
        );
        if (userError || !data.user) {
          throw new InternalServerErrorException('No fue posible cargar un integrante del tenant.');
        }
        return {
          displayName: readDisplayName(data.user.user_metadata),
          email: data.user.email ?? null,
          role: membership.role,
          userId: membership.user_id
        };
      })
    );
    return tenantMemberListResponseSchema.parse({ items });
  }

  async getOwnProfile(authorization: unknown): Promise<OwnProfileResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase.auth.admin.getUserById(identity.userId);
    if (error || !data.user) {
      throw new InternalServerErrorException('No fue posible cargar tu perfil.');
    }

    return ownProfileResponseSchema.parse({
      item: {
        displayName: readDisplayName(data.user.user_metadata),
        email: data.user.email ?? null,
        userId: identity.userId
      }
    });
  }

  /**
   * Cada persona edita su propio nombre visible: es lo que veran sus companeros en las notas
   * y en las asignaciones, en lugar de su correo.
   */
  async updateOwnProfile(
    authorization: unknown,
    input: UpdateOwnProfile
  ): Promise<OwnProfileResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: current, error: readError } = await supabase.auth.admin.getUserById(
      identity.userId
    );
    if (readError || !current.user) {
      throw new InternalServerErrorException('No fue posible cargar tu perfil.');
    }

    const { data, error } = await supabase.auth.admin.updateUserById(identity.userId, {
      // Se envia la union explicita para no depender de si el proveedor combina o reemplaza.
      user_metadata: {
        ...(current.user.user_metadata ?? {}),
        display_name: input.displayName
      }
    });
    if (error || !data.user) {
      throw new InternalServerErrorException('No fue posible guardar tu perfil.');
    }

    return ownProfileResponseSchema.parse({
      item: {
        displayName: readDisplayName(data.user.user_metadata),
        email: data.user.email ?? null,
        userId: identity.userId
      }
    });
  }

  /**
   * Invita a una persona al tenant con un rol. La pertenencia es la unica fuente de acceso y
   * se crea de forma idempotente: repetir la invitacion no duplica el acceso ni cambia el rol
   * ya concedido. El enlace es un secreto de un solo uso y solo se entrega al administrador
   * que lo genera; nunca se registra.
   */
  async inviteMember(
    authorization: unknown,
    tenantId: string,
    input: InviteTenantMember
  ): Promise<InviteTenantMemberResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.assertRole(identity.userId, tenantId, ['admin']);

    const supabase = this.supabaseServerClientFactory.create();
    const email = input.email.trim().toLowerCase();
    const invitation = await this.createInvitation(supabase, email);

    const { data: existing, error: existingError } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', invitation.userId)
      .maybeSingle();
    if (existingError) {
      throw new InternalServerErrorException('No fue posible comprobar el acceso existente.');
    }
    if (existing) {
      return inviteTenantMemberResponseSchema.parse({
        item: {
          email,
          inviteLink: invitation.inviteLink,
          requiresPassword: invitation.requiresPassword,
          role: existing.role
        }
      });
    }

    const { error: insertError } = await supabase.from('memberships').insert({
      role: input.role,
      tenant_id: tenantId,
      user_id: invitation.userId
    });
    if (insertError && insertError.code !== '23505') {
      throw new InternalServerErrorException('No fue posible registrar el acceso.');
    }

    return inviteTenantMemberResponseSchema.parse({
      item: {
        email,
        inviteLink: invitation.inviteLink,
        requiresPassword: invitation.requiresPassword,
        role: input.role
      }
    });
  }

  async updateMemberRole(
    authorization: unknown,
    tenantId: string,
    userId: string,
    input: UpdateTenantMemberRole
  ): Promise<UpdateTenantMemberRoleResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.assertRole(identity.userId, tenantId, ['admin']);

    const supabase = this.supabaseServerClientFactory.create();
    const membership = await this.findMembership(supabase, tenantId, userId);

    if (membership.role === 'admin' && input.role !== 'admin') {
      await this.assertAnotherAdminRemains(supabase, tenantId, userId);
    }

    const { error } = await supabase
      .from('memberships')
      .update({ role: input.role })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException('No fue posible cambiar el rol.');

    const member = await this.readMemberIdentity(supabase, userId);
    return updateTenantMemberRoleResponseSchema.parse({
      item: {
        displayName: member.displayName,
        email: member.email,
        role: input.role,
        userId
      }
    });
  }

  async removeMember(
    authorization: unknown,
    tenantId: string,
    userId: string
  ): Promise<RemoveTenantMemberResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.assertRole(identity.userId, tenantId, ['admin']);

    const supabase = this.supabaseServerClientFactory.create();
    const membership = await this.findMembership(supabase, tenantId, userId);

    if (membership.role === 'admin') {
      await this.assertAnotherAdminRemains(supabase, tenantId, userId);
    }

    // Retirar la pertenencia no elimina la cuenta: la persona puede seguir en otros tenants,
    // y las conversaciones que tuviera asignadas quedan sin asignar por la propia relacion.
    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException('No fue posible retirar el acceso.');

    return removeTenantMemberResponseSchema.parse({ item: { userId } });
  }

  private async createInvitation(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    email: string
  ): Promise<{ inviteLink: string; requiresPassword: boolean; userId: string }> {
    // El enlace lleva a crear la contrasena: sin eso, la persona entra sin poder volver a entrar.
    const appPublicUrl = (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '');
    const redirectTo = appPublicUrl ? appPublicUrl + '/auth/password' : undefined;
    const options = redirectTo ? { redirectTo } : undefined;

    // El correo va aparte del enlace: inviteUserByEmail lo envia, generateLink solo lo devuelve.
    await supabase.auth.admin.inviteUserByEmail(email, options).catch(() => undefined);

    const invited = await supabase.auth.admin.generateLink({ email, options, type: 'invite' });
    const invitedUser = invited.data?.user;
    const invitedLink = invited.data?.properties?.action_link;
    if (!invited.error && invitedUser && typeof invitedLink === 'string') {
      return { inviteLink: invitedLink, requiresPassword: true, userId: invitedUser.id };
    }

    // Una cuenta existente no se invita de nuevo: se le entrega un enlace de acceso.
    // Para quien ya tiene cuenta, inviteUserByEmail falla: aqui lo correcto es un enlace magico.
    await supabase.auth
      .signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
      })
      .catch(() => undefined);

    const existing = await supabase.auth.admin.generateLink({ email, options, type: 'magiclink' });
    const existingUser = existing.data?.user;
    const existingLink = existing.data?.properties?.action_link;
    if (existing.error || !existingUser || typeof existingLink !== 'string') {
      throw new ServiceUnavailableException('No fue posible generar la invitación.');
    }

    return { inviteLink: existingLink, requiresPassword: false, userId: existingUser.id };
  }

  private async findMembership(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    userId: string
  ): Promise<{ role: TenantRole }> {
    const { data, error } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar el integrante.');
    if (!data) throw new NotFoundException('El integrante no existe en este tenant.');
    return { role: tenantRoleSchema.parse(data.role) };
  }

  private async assertAnotherAdminRemains(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    userId: string
  ): Promise<void> {
    const { data, error } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .neq('user_id', userId)
      .limit(1);
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar los administradores.');
    }
    if ((data ?? []).length === 0) {
      throw new ConflictException('El tenant debe conservar al menos un administrador.');
    }
  }

  private async readMemberIdentity(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    userId: string
  ): Promise<{ displayName: string | null; email: string | null }> {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new InternalServerErrorException('No fue posible cargar el integrante.');
    }
    return {
      displayName: readDisplayName(data.user.user_metadata),
      email: data.user.email ?? null
    };
  }

  private async getMembershipRole(userId: string, tenantId: string): Promise<TenantRole> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data: membership, error } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('No fue posible verificar el acceso al tenant.');
    }

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este tenant.');
    }

    return tenantRoleSchema.parse(membership.role);
  }

  async listAccessibleTenants(authorization: unknown): Promise<TenantListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('tenant_id, role, tenant:tenants(id, slug, name)')
      .eq('user_id', identity.userId);

    if (error) {
      throw new InternalServerErrorException('No fue posible cargar los tenants disponibles.');
    }

    return tenantListResponseSchema.parse({
      items: (memberships ?? []).flatMap((membership) => {
        const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant;

        return tenant
          ? [
              {
                id: tenant.id,
                name: tenant.name,
                role: membership.role,
                slug: tenant.slug
              }
            ]
          : [];
      })
    });
  }
}
