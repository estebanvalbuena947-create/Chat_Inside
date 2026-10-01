import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { extractBearerToken } from './bearer-token';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

export type AuthenticatedIdentity = {
  userId: string;
};

@Injectable()
export class RequestAuthenticator {
  constructor(
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async authenticate(authorization: unknown): Promise<AuthenticatedIdentity> {
    const token = extractBearerToken(authorization);
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('La sesión no es válida o ha expirado.');
    }

    return { userId: data.user.id };
  }
}
