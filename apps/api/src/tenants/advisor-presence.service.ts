import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException
} from '@nestjs/common';
import { z } from 'zod';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from './tenant-access.service';
import { advisorActiveUntil } from './advisor-presence.rule';

/** Respuesta del pulso: hasta cuando cuenta esta persona como disponible. */
export type AdvisorPresenceResponse = { activeUntil: string; tenantId: string };

const tenantIdSchema = z.uuid();

/**
 * Presencia de una asesora en la bandeja.
 *
 * La rotacion de transferencias solo puede repartir entre quien esta mirando la bandeja en ese
 * momento; este es el unico sitio donde se declara esa disponibilidad. No es una sesion de
 * autenticacion: se puede estar dentro de la plataforma con la pestana de fondo y no contar.
 *
 * Dos reglas:
 *   1. El espacio se comprueba contra las membresias: un pulso no puede declarar presencia en un
 *      espacio ajeno, ni siquiera con un identificador valido.
 *   2. El pulso es idempotente: la misma persona puede mandarlo desde varias pestanas.
 */
@Injectable()
export class AdvisorPresenceService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async heartbeat(authorization: unknown, tenantId: string): Promise<AdvisorPresenceResponse> {
    // Se valida en el borde: un identificador que no es un UUID daria un error de base de datos
    // (500) en lugar de decir que la peticion esta mal.
    const identificador = tenantIdSchema.safeParse(tenantId);
    if (!identificador.success) {
      throw new BadRequestException('El espacio no es válido.');
    }

    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, identificador.data);

    const supabase = this.supabaseServerClientFactory.create();
    const { error } = await supabase.from('advisor_presence').upsert(
      {
        last_seen_at: new Date().toISOString(),
        tenant_id: identificador.data,
        user_id: identity.userId
      },
      { onConflict: 'tenant_id,user_id' }
    );
    if (error) throw new InternalServerErrorException('No fue posible actualizar la presencia.');

    return { activeUntil: advisorActiveUntil(), tenantId: identificador.data };
  }
}
