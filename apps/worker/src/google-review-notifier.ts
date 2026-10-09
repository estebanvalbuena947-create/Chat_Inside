import type { SupabaseServerClient } from '@chat-zernio/config';

type Delivery = { id: string; idempotency_key: string; review_id: string; tenant_id: string };

/** Entrega reseñas persistidas al flujo de n8n sin bloquear el webhook de Zernio. */
export async function sendPendingGoogleReviewDeliveries(
  supabase: SupabaseServerClient
): Promise<void> {
  const { data: deliveries } = await supabase
    .from('google_review_deliveries')
    .select('id, tenant_id, review_id, idempotency_key')
    .eq('status', 'pending')
    .limit(10);
  for (const delivery of (deliveries ?? []) as Delivery[]) {
    const { data: integration } = await supabase
      .from('google_review_integrations')
      .select('webhook_url, enabled')
      .eq('tenant_id', delivery.tenant_id)
      .maybeSingle();
    if (!integration?.enabled || !integration.webhook_url) continue;
    const { data: review } = await supabase
      .from('google_business_reviews')
      .select(
        'provider_review_id, rating, body, reviewer_name, review_updated_at, zernio_account_id, replied_at'
      )
      .eq('id', delivery.review_id)
      .maybeSingle();
    if (!review) continue;
    try {
      const response = await fetch(integration.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': delivery.idempotency_key
        },
        body: JSON.stringify({
          event: 'google.review.received',
          tenantId: delivery.tenant_id,
          review
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(String(response.status));
      await supabase
        .from('google_review_deliveries')
        .update({
          status: 'sent',
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery.id);
    } catch {
      await supabase
        .from('google_review_deliveries')
        .update({
          attempts: 1,
          last_error: 'n8n delivery failed',
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', delivery.id);
    }
  }
}
