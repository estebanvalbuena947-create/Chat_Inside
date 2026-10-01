import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { contactAvatarResponseSchema, type ContactAvatarResponse } from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

@Injectable()
export class ContactProfileService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async createAvatarUrl(
    authorization: unknown,
    tenantId: string,
    contactId: string
  ): Promise<ContactAvatarResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('avatar_object_path')
      .eq('tenant_id', tenantId)
      .eq('id', contactId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible resolver el avatar.');
    if (!contact?.avatar_object_path) throw new NotFoundException('El contacto no tiene avatar.');

    const { data, error: signingError } = await supabase.storage
      .from('contact-avatars')
      .createSignedUrl(contact.avatar_object_path, 600);
    if (signingError || !data?.signedUrl) {
      throw new InternalServerErrorException('No fue posible preparar el avatar.');
    }
    return contactAvatarResponseSchema.parse({ url: data.signedUrl });
  }
}
