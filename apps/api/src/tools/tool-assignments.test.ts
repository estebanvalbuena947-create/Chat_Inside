import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolAssignmentsService } from './tool-assignments.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Asignaciones y etiquetas para el bot.
 *
 * Dos pruebas sostienen el contrato:
 *   1. NO se puede asignar a quien no pertenece al espacio. Si esa condicion cayera, el bot podria
 *      derivar una conversacion a alguien de otro negocio.
 *   2. La asignacion lleva version: si dos personas asignan a la vez, la segunda recibe un conflicto
 *      en lugar de pisar a la primera en silencio.
 *
 * El doble necesita una cola de respuestas porque la MISMA tabla 'conversations' se consulta dos
 * veces con formas distintas: una lectura de dos condiciones y una escritura de tres. Devolver un
 * unico resultado para ambas haria pasar la prueba sin comprobar nada.
 */

const CAMPOS_ASIGNACION = { assigned_user_id: 'user-1', assignment_version: 5, id: 'conv-1' };

function crearServicio(
  opciones: {
    conflicto?: boolean;
    esMiembro?: boolean;
    existeConversacion?: boolean;
    labels?: unknown[];
  } = {}
) {
  const cola: unknown[] = [
    // 1) membresia
    { data: opciones.esMiembro === false ? null : { user_id: 'user-1' }, error: null },
    // 2) conversacion leida
    {
      data: opciones.existeConversacion === false ? null : { assignment_version: 4, id: 'conv-1' },
      error: null
    },
    // 3) conversacion actualizada
    { data: opciones.conflicto ? null : CAMPOS_ASIGNACION, error: null }
  ];
  let indice = 0;
  const siguiente = () => cola[Math.min(indice++, cola.length - 1)];
  const update = vi.fn((_filas: unknown, _opciones?: unknown) => cadena());
  const insert = vi.fn().mockResolvedValue({ error: null });
  const cadena = (): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      maybeSingle: () => Promise.resolve(siguiente()),
      insert,
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => Promise.resolve(siguiente()).then(resolver),
      update
    };
    return encadenable;
  };

  const tablas: Record<string, unknown> = {
    labels: {
      data: opciones.labels ?? [{ color: '#fff', id: 'l1', name: 'Nuevo Cliente' }],
      error: null
    }
  };

  const supabase = {
    from: vi.fn((tabla: string) =>
      tabla === 'labels' ? { select: () => cadenaConResultado(tablas[tabla]) } : cadena()
    )
  };

  function cadenaConResultado(resultado: unknown) {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      order: () => Promise.resolve(resultado),
      select: () => encadenable
    };
    return encadenable;
  }

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['assignments', 'conversations'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolAssignmentsService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { insert, servicio, toolTokenService, update };
}

/**
 * Derivar apaga el bot.
 *
 * El contrato lo dice: `turnBotOff` por defecto es true. Y tiene sentido -- el propio texto de los
 * nodos de transferencia dice "para que el asesor continue la conversacion". Si el bot siguiera
 * contestando, la asesora y el bot le hablarian al cliente a la vez.
 */
describe('derivar apaga el bot', () => {
  it('por defecto lo apaga, como fija el contrato', async () => {
    const { insert, servicio, update } = crearServicio();

    await servicio.assign('Bearer token', { conversationId: 'conv-1', userId: 'user-1' });

    const filas = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filas).toMatchObject({ assigned_user_id: 'user-1', automation_mode: 'paused' });
    // Y sube la version de la automatizacion. Sin eso, un cambio de la asesora y otro del bot a la
    // vez se pisarian en silencio: el ultimo en escribir ganaria sin que nadie lo note.
    expect(typeof filas.automation_version).toBe('number');
    expect(filas.automation_version as number).toBeGreaterThan(0);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_user_id: 'user-1', conversation_id: 'conv-1' })
    );
  });

  it('con turnBotOff en false lo deja encendido', async () => {
    const { servicio, update } = crearServicio();

    await servicio.assign('Bearer token', {
      conversationId: 'conv-1',
      turnBotOff: false,
      userId: 'user-1'
    });

    const filas = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('automation_mode' in filas).toBe(false);
  });

  it('la respuesta usa los nombres del contrato, sin perder los mios', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.assign('Bearer token', {
      conversationId: 'conv-1',
      userId: 'user-1'
    })) as { assignedUserId: unknown; automationMode: string; userId: unknown };

    expect(resultado.automationMode).toBe('paused');
    expect(resultado.assignedUserId).toBe(resultado.userId);
  });
});

describe('asignaciones', () => {
  it('exige el permiso de asignaciones', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.assign('Bearer token', { conversationId: 'conv-1', userId: 'user-1' });

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'assignments'
    );
  });

  it('rechaza una asignacion sin conversacion o sin persona', async () => {
    const { servicio } = crearServicio();

    await expect(servicio.assign('Bearer token', { userId: 'user-1' })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    await expect(
      servicio.assign('Bearer token', { conversationId: 'conv-1' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('NO asigna a alguien que no pertenece al espacio, y no llega a escribir', async () => {
    const { servicio, update } = crearServicio({ esMiembro: false });

    await expect(
      servicio.assign('Bearer token', { conversationId: 'conv-1', userId: 'ajeno' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(update).not.toHaveBeenCalled();
  });

  it('una conversacion de otro espacio da 404', async () => {
    const { servicio } = crearServicio({ existeConversacion: false });

    await expect(
      servicio.assign('Bearer token', { conversationId: 'ajena', userId: 'user-1' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('con dos personas asignando a la vez, la segunda recibe conflicto', async () => {
    const { servicio } = crearServicio({ conflicto: true });

    await expect(
      servicio.assign('Bearer token', { conversationId: 'conv-1', userId: 'user-1' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('asigna en el espacio del token y devuelve la version nueva', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.assign('Bearer token', {
      conversationId: 'conv-1',
      userId: 'user-1'
    })) as { assignmentVersion: number; conversationId: string; tenantId: string; userId: unknown };

    expect(resultado).toMatchObject({
      assignmentVersion: 5,
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      userId: 'user-1'
    });
  });

  it('las etiquetas del espacio se devuelven con su color', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.listLabels('Bearer token')) as {
      labels: Array<{ color: string | null; name: string }>;
    };

    expect(resultado.labels).toHaveLength(1);
    expect(resultado.labels[0]).toMatchObject({ name: 'Nuevo Cliente' });
  });
});
