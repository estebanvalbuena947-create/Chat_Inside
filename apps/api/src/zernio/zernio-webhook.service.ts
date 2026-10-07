import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnauthorizedException
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

const zernioWebhookEnvelopeSchema = z
  .object({
    account: z
      .object({
        accountId: z.string().trim().min(1).max(200).optional(),
        id: z.string().trim().min(1).max(200).optional(),
        platform: z.string().trim().min(1).max(64).optional(),
        profileId: z.string().trim().min(1).max(200).optional(),
        username: z.string().trim().min(1).max(160).optional()
      })
      .optional(),
    event: z.string().trim().min(1).max(120),
    id: z.string().trim().min(1).max(200)
  })
  .passthrough();

type ZernioWebhookEnvelope = z.infer<typeof zernioWebhookEnvelopeSchema>;

export function verifyZernioSignature(
  rawBody: Buffer,
  receivedSignature: string | undefined,
  secret: string
): boolean {
  if (!receivedSignature || !/^[a-f0-9]{64}$/i.test(receivedSignature)) {
    return false;
  }

  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest();
  const suppliedSignature = Buffer.from(receivedSignature, 'hex');

  return (
    suppliedSignature.length === expectedSignature.length &&
    timingSafeEqual(expectedSignature, suppliedSignature)
  );
}

@Injectable()
export class ZernioWebhookService {
  constructor(
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async receive(
    rawBody: Buffer,
    receivedSignature: string | undefined
  ): Promise<{ duplicate: boolean }> {
    const webhookSecret = process.env.ZERNIO_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new ServiceUnavailableException('El webhook de Zernio aún no está configurado.');
    }

    if (!receivedSignature) {
      throw new UnauthorizedException('Falta la firma del webhook.');
    }

    if (!verifyZernioSignature(rawBody, receivedSignature, webhookSecret)) {
      throw new BadRequestException('La firma del webhook no es válida.');
    }

    const payload = this.parsePayload(rawBody);

    if (payload.event === 'webhook.test') {
      return { duplicate: false };
    }

    if (payload.event === 'account.connected') {
      return this.registerConnectedAccount(payload);
    }

    const accountId = payload.account?.id;
    if (!accountId) {
      throw new UnprocessableEntityException('El evento no identifica una cuenta de Zernio.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    const { data: channelAccount, error: channelAccountError } = await supabase
      .from('channel_accounts')
      .select('tenant_id')
      .eq('provider', 'zernio')
      .eq('provider_account_id', accountId)
      .maybeSingle();

    if (channelAccountError) {
      throw new InternalServerErrorException('No fue posible resolver la cuenta de Zernio.');
    }

    if (!channelAccount) {
      throw new UnprocessableEntityException('La cuenta de Zernio no está asociada a un tenant.');
    }

    const { error: insertError } = await supabase.from('webhook_events').insert({
      event_type: payload.event,
      payload,
      provider_event_id: payload.id,
      tenant_id: channelAccount.tenant_id
    });

    if (!insertError) {
      return { duplicate: false };
    }

    if (insertError.code === '23505') {
      return { duplicate: true };
    }

    throw new InternalServerErrorException('No fue posible guardar el evento de Zernio.');
  }

  private async registerConnectedAccount(
    payload: ZernioWebhookEnvelope
  ): Promise<{ duplicate: boolean }> {
    const accountId = payload.account?.accountId;
    const profileId = payload.account?.profileId;
    const platform = payload.account?.platform;
    if (!accountId || !profileId || !platform) {
      throw new UnprocessableEntityException('El evento de conexión de Zernio no es válido.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('zernio_profile_id', profileId)
      .maybeSingle();
    if (tenantError) {
      throw new InternalServerErrorException('No fue posible resolver el perfil de Zernio.');
    }
    if (!tenant) {
      throw new UnprocessableEntityException('El perfil de Zernio no está asociado a un tenant.');
    }

    const { data: existing, error: existingError } = await supabase
      .from('channel_accounts')
      .select('id, tenant_id')
      .eq('provider', 'zernio')
      .eq('provider_account_id', accountId)
      .maybeSingle();
    if (existingError) {
      throw new InternalServerErrorException('No fue posible comprobar la cuenta conectada.');
    }
    if (existing && existing.tenant_id !== tenant.id) {
      throw new ConflictException('La cuenta de Zernio ya pertenece a otro tenant.');
    }

    const displayName = payload.account?.username ?? null;
    if (existing) {
      const { error } = await supabase
        .from('channel_accounts')
        .update({ display_name: displayName, platform })
        .eq('id', existing.id);
      if (error) {
        throw new InternalServerErrorException('No fue posible actualizar la cuenta conectada.');
      }
      return { duplicate: false };
    }

    const { error: insertError } = await supabase.from('channel_accounts').insert({
      display_name: displayName,
      platform,
      provider: 'zernio',
      provider_account_id: accountId,
      tenant_id: tenant.id
    });
    if (insertError?.code === '23505') {
      return { duplicate: false };
    }
    if (insertError) {
      throw new InternalServerErrorException('No fue posible registrar la cuenta conectada.');
    }
    return { duplicate: false };
  }

  private parsePayload(rawBody: Buffer): ZernioWebhookEnvelope {
    try {
      return zernioWebhookEnvelopeSchema.parse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw new BadRequestException('El cuerpo del webhook no es válido.');
    }
  }
}
