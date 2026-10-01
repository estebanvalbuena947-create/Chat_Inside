import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

type ActivityRow = Record<string, unknown> | null;

function opaqueCursor(activity: Record<string, ActivityRow>): string {
  return createHash('sha256').update(JSON.stringify(activity)).digest('base64url');
}

@Injectable()
export class TenantRealtimeService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async authorize(authorization: unknown, tenantId: string): Promise<void> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
  }

  async currentCursor(tenantId: string): Promise<string> {
    const supabase = this.supabaseServerClientFactory.create();
    const [webhook, outbox, message, conversation] = await Promise.all([
      supabase
        .from('webhook_events')
        .select('received_at, processed_at, failed_at')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('outbox_events')
        .select('created_at, processed_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('messages')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('conversations')
        .select('updated_at, status_version')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (webhook.error || outbox.error || message.error || conversation.error) {
      throw new InternalServerErrorException('No fue posible comprobar cambios de la bandeja.');
    }

    return opaqueCursor({
      conversation: (conversation.data as ActivityRow) ?? null,
      message: (message.data as ActivityRow) ?? null,
      outbox: (outbox.data as ActivityRow) ?? null,
      webhook: (webhook.data as ActivityRow) ?? null
    });
  }
}

export { opaqueCursor };
