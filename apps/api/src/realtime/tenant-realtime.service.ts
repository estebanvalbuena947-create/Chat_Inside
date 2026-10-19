import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

export type RealtimeEvent = {
  cursor: string;
  event: 'inbox.changed' | 'inbox.resync' | 'inbox.offline';
};
type Listener = (event: RealtimeEvent) => void;
type Subscription = {
  client: SupabaseClient;
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  connected: boolean;
  batch: ReturnType<typeof setTimeout> | null;
  deadline: ReturnType<typeof setTimeout> | null;
};

/** Una suscripción privada por tenant/proceso. No consulta tablas para detectar cambios. */
@Injectable()
export class TenantRealtimeService implements OnModuleDestroy {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly logger = new Logger(TenantRealtimeService.name);

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

  subscribe(tenantId: string, listener: Listener): () => void {
    let subscription = this.subscriptions.get(tenantId);
    if (subscription) {
      subscription.listeners.add(listener);
      if (subscription.connected) listener({ cursor: randomUUID(), event: 'inbox.resync' });
    } else {
      const client = this.supabaseServerClientFactory.create();
      const channel = client.channel(`inbox:${tenantId}`, { config: { private: true } });
      subscription = {
        client,
        channel,
        listeners: new Set([listener]),
        connected: false,
        batch: null,
        deadline: null
      };
      const current = subscription;
      this.subscriptions.set(tenantId, current);
      current.deadline = setTimeout(() => this.fail(tenantId, current), 10_000);
      channel
        .on('broadcast', { event: 'inbox.changed' }, () => {
          if (this.subscriptions.get(tenantId) !== current || !current.connected || current.batch)
            return;
          current.batch = setTimeout(() => {
            current.batch = null;
            this.publish(current, 'inbox.changed');
          }, 200);
        })
        .subscribe((status) => {
          if (this.subscriptions.get(tenantId) !== current) return;
          if (status === 'SUBSCRIBED') {
            current.connected = true;
            if (current.deadline) clearTimeout(current.deadline);
            current.deadline = null;
            // Resincronizar tras suscribir cubre cambios durante la carga inicial
            // y cursores de versiones anteriores, sin consultar por temporizador.
            this.publish(current, 'inbox.resync');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // El SDK puede recuperarse de un error inicial de conexión. El plazo
            // de 10 s lo acota; una conexión que ya estaba lista se cierra y resync.
            if (current.connected || status === 'CLOSED') this.fail(tenantId, current);
          }
        });
    }
    const current = subscription;
    return () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0) this.dispose(tenantId, current);
    };
  }

  private publish(subscription: Subscription, event: RealtimeEvent['event']): void {
    const notification = { cursor: randomUUID(), event };
    for (const listener of [...subscription.listeners]) listener(notification);
  }

  private fail(tenantId: string, subscription: Subscription): void {
    if (this.subscriptions.get(tenantId) !== subscription) return;
    this.logger.warn('realtime_subscription_unavailable');
    // Quitar primero del mapa evita reentradas al cerrar canales y conexiones SSE.
    this.dispose(tenantId, subscription);
    this.publish(subscription, 'inbox.offline');
    subscription.listeners.clear();
  }

  private dispose(tenantId: string, subscription: Subscription): void {
    if (this.subscriptions.get(tenantId) !== subscription) return;
    this.subscriptions.delete(tenantId);
    if (subscription.batch) clearTimeout(subscription.batch);
    if (subscription.deadline) clearTimeout(subscription.deadline);
    void subscription.client.removeChannel(subscription.channel).catch(() => {
      this.logger.warn('realtime_subscription_cleanup_failed');
    });
  }

  onModuleDestroy(): void {
    for (const [tenantId, subscription] of this.subscriptions) {
      this.dispose(tenantId, subscription);
      this.publish(subscription, 'inbox.offline');
      subscription.listeners.clear();
    }
  }
}
