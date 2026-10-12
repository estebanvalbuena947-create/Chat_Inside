import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import type { TenantAccessService } from '../tenants/tenant-access.service';
import type { ToolTokenService } from '../tools/tool-token.service';
import type { ZernioApiClient } from '../zernio/zernio-api.client';
import { GoogleReviewsService } from './google-reviews.service';

/**
 * Responder resenas de Google.
 *
 * La regla que sostiene todo lo demas: Google guarda **una sola** respuesta del propietario, asi que
 * publicar sobre una resena ya contestada reemplaza lo que haya -- incluida una respuesta escrita a
 * mano en la interfaz de Google, que no se puede recuperar. Por eso lo que mas se prueba aqui es lo
 * que NO se hace: no se publica si ya hay respuesta, no se publica si falta un dato de la plantilla y
 * no se publica si el proveedor falla.
 */

const RESENA = {
  id: 'review-1',
  provider_review_id: 'accounts/123/locations/456/reviews/AbC123',
  rating: 3,
  replied_at: null,
  reviewer_name: 'Marta',
  routed_to_human_at: null,
  zernio_account_id: 'cuenta-1'
};

function crearServicio(
  opciones: {
    plantilla?: { body: string } | null;
    resena?: Record<string, unknown> | null;
    filasLista?: unknown[];
    fallaProveedor?: boolean;
    fallaEscritura?: boolean;
  } = {}
) {
  const resena = opciones.resena === undefined ? RESENA : opciones.resena;
  const plantilla =
    opciones.plantilla === undefined ? { body: 'Gracias, {nombre}.' } : opciones.plantilla;
  // El parametro se declara aunque no se use: sin el, el tipo de `mock.calls` es una tupla vacia y no
  // se puede leer la fila que se intento escribir.
  const update = vi.fn((_filas: unknown) => cadena('google_business_reviews', true));
  const eqs: string[] = [];

  function cadena(tabla: string, esEscritura = false) {
    const encadenable: Record<string, unknown> = {
      eq: (columna: string, valor: unknown) => {
        eqs.push(columna + '=' + String(valor));
        return encadenable;
      },
      is: () => encadenable,
      limit: () => Promise.resolve({ data: opciones.filasLista ?? [], error: null }),
      maybeSingle: () => {
        if (esEscritura) {
          return Promise.resolve({
            data: opciones.fallaEscritura ? null : { id: 'review-1' },
            error: opciones.fallaEscritura ? { message: 'x' } : null
          });
        }
        return Promise.resolve({
          data: tabla === 'message_templates' ? plantilla : resena,
          error: null
        });
      },
      not: () => encadenable,
      order: () => encadenable,
      select: () => encadenable,
      // La escritura se espera directamente (sin `select`), como en el cliente real: el constructor de
      // consultas es "esperable".
      then: (resolver: (valor: unknown) => unknown) =>
        Promise.resolve(
          esEscritura
            ? {
                data: opciones.fallaEscritura ? null : { id: 'review-1' },
                error: opciones.fallaEscritura ? { message: 'x' } : null
              }
            : { data: null, error: null }
        ).then(resolver),
      update
    };
    return encadenable;
  }

  const supabase = { from: vi.fn((tabla: string) => cadena(tabla)) };
  const replyToGoogleReview = opciones.fallaProveedor
    ? vi.fn().mockRejectedValue(new Error('Zernio rechazo la respuesta'))
    : vi.fn().mockResolvedValue({ reviewId: 'AbC123' });

  const servicio = new GoogleReviewsService(
    { replyToGoogleReview } as unknown as ZernioApiClient,
    {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' })
    } as unknown as RequestAuthenticator,
    { assertMembership: vi.fn() } as unknown as TenantAccessService,
    {
      assertScope: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ scopes: ['conversations'], tenantId: 'tenant-1' })
    } as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { eqs, replyToGoogleReview, servicio, update };
}

describe('el bot responde una resena', () => {
  it('publica el texto de la plantilla con sus huecos rellenos y deja constancia', async () => {
    const { replyToGoogleReview, servicio, update } = crearServicio();

    const resultado = await servicio.replyFromBot('Bearer token', 'review-1', {
      templateCode: 'resena_positiva',
      variables: { nombre: 'Marta' }
    });

    expect(replyToGoogleReview).toHaveBeenCalledWith({
      accountId: 'cuenta-1',
      comment: 'Gracias, Marta.',
      // Zernio quiere el ultimo tramo del nombre de recurso, no el nombre completo de Google.
      providerReviewId: 'accounts/123/locations/456/reviews/AbC123'
    });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      reply_comment: 'Gracias, Marta.',
      reply_source: 'bot'
    });
    expect(resultado).toMatchObject({ source: 'bot', tenantId: 'tenant-1' });
  });

  it('si falta un valor de la plantilla NO publica nada', async () => {
    const { replyToGoogleReview, servicio, update } = crearServicio({
      plantilla: { body: 'Gracias, {nombre}, por tu visita a {sede}.' }
    });

    await expect(
      servicio.replyFromBot('Bearer token', 'review-1', {
        templateCode: 'resena_positiva',
        variables: { nombre: 'Marta' }
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(replyToGoogleReview).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('NO publica sobre una resena que ya tiene respuesta', async () => {
    const { replyToGoogleReview, servicio, update } = crearServicio({
      resena: { ...RESENA, replied_at: '2026-10-12T10:00:00.000Z' }
    });

    await expect(
      servicio.replyFromBot('Bearer token', 'review-1', { comment: 'Otra vez, gracias.' })
    ).rejects.toBeInstanceOf(ConflictException);

    // Esta es la comprobacion que importa: ni se llama al proveedor ni se toca la fila.
    expect(replyToGoogleReview).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('si el proveedor falla, no se marca como respondida', async () => {
    const { servicio, update } = crearServicio({ fallaProveedor: true });

    await expect(
      servicio.replyFromBot('Bearer token', 'review-1', { comment: 'Gracias.' })
    ).rejects.toThrow();

    expect(update).not.toHaveBeenCalled();
  });

  it('si la respuesta se publico pero no se pudo registrar, lo dice y no deja reintentar a ciegas', async () => {
    const { servicio } = crearServicio({ fallaEscritura: true });

    await expect(
      servicio.replyFromBot('Bearer token', 'review-1', { comment: 'Gracias.' })
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('una resena de otro espacio da 404', async () => {
    const { replyToGoogleReview, servicio } = crearServicio({ resena: null });

    await expect(
      servicio.replyFromBot('Bearer token', 'review-1', { comment: 'Gracias.' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(replyToGoogleReview).not.toHaveBeenCalled();
  });
});

describe('derivar una resena a una persona', () => {
  it('marca el momento en que se derivo', async () => {
    const { servicio, update } = crearServicio();

    const resultado = await servicio.routeToHuman('Bearer token', 'review-1');

    expect(update.mock.calls[0]?.[0]).toMatchObject({ routed_to_human_at: expect.any(String) });
    expect(resultado.reviewId).toBe(RESENA.provider_review_id);
  });

  it('volver a derivarla no borra cuando llego', async () => {
    const original = '2026-10-12T09:00:00.000Z';
    const { servicio, update } = crearServicio({
      resena: { ...RESENA, routed_to_human_at: original }
    });

    const resultado = await servicio.routeToHuman('Bearer token', 'review-1');

    expect(update).not.toHaveBeenCalled();
    expect(resultado.routedToHumanAt).toBe(original);
  });
});

describe('la respuesta de una persona', () => {
  it('queda registrada con quien la escribio', async () => {
    const { servicio, update } = crearServicio();

    const resultado = await servicio.replyFromAdvisor('Bearer token', 'tenant-1', 'review-1', {
      comment: 'Lamentamos lo ocurrido, Marta.'
    });

    expect(update.mock.calls[0]?.[0]).toMatchObject({
      reply_author_user_id: 'user-1',
      reply_source: 'advisor'
    });
    expect(resultado.source).toBe('advisor');
  });

  it('una respuesta vacia se rechaza antes de molestar al proveedor', async () => {
    const { replyToGoogleReview, servicio } = crearServicio();

    await expect(
      servicio.replyFromAdvisor('Bearer token', 'tenant-1', 'review-1', { comment: '   ' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(replyToGoogleReview).not.toHaveBeenCalled();
  });
});
