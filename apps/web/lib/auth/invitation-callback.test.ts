import { describe, expect, it } from 'vitest';
import {
  INVITATION_MESSAGES,
  invitationDestination,
  invitationLoginPath,
  invitationMessage,
  invitationProblemFromProviderCode,
  readInvitationCallback,
  readInvitationConfirmation,
  type InvitationProblem
} from './invitation-callback';

const CALLBACK = 'https://chat.insidespa.com.mx/auth/callback';
const SECRETO = 'token-que-no-debe-viajar';

describe('resultado del enlace de invitación', () => {
  it('acepta los tokens implícitos que Auth deja en el fragmento', () => {
    expect(
      readInvitationCallback(
        `${CALLBACK}#access_token=${SECRETO}&expires_in=3600&refresh_token=r-1&token_type=bearer&type=invite`
      )
    ).toEqual({ kind: 'session', accessToken: SECRETO, refreshToken: 'r-1' });
  });

  it('acepta los tokens que llegaran en la consulta', () => {
    expect(readInvitationCallback(`${CALLBACK}?access_token=a-1&refresh_token=r-1`)).toEqual({
      kind: 'session',
      accessToken: 'a-1',
      refreshToken: 'r-1'
    });
  });

  it('entrega el código de canje cuando Auth usa ese flujo', () => {
    expect(readInvitationCallback(`${CALLBACK}?code=c-1`)).toEqual({ kind: 'code', code: 'c-1' });
  });

  it('nombra el enlace usado o vencido por el código del proveedor', () => {
    expect(
      readInvitationCallback(
        `${CALLBACK}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
      )
    ).toEqual({ kind: 'problem', problem: 'enlace-usado' });
  });

  it('trata cualquier otro código del proveedor como rechazo, sin inventar la causa', () => {
    for (const code of [
      'unexpected_failure',
      'validation_failed',
      'otp_disabled',
      'bad_code_verifier'
    ]) {
      expect(readInvitationCallback(`${CALLBACK}#error=server_error&error_code=${code}`)).toEqual({
        kind: 'problem',
        problem: 'enlace-rechazado'
      });
    }
  });

  it('trata un error sin código como rechazo', () => {
    expect(readInvitationCallback(`${CALLBACK}#error=access_denied`)).toEqual({
      kind: 'problem',
      problem: 'enlace-rechazado'
    });
  });

  it('trata la dirección sin parámetros como enlace incompleto', () => {
    expect(readInvitationCallback(CALLBACK)).toEqual({
      kind: 'problem',
      problem: 'enlace-incompleto'
    });
  });

  it('trata un solo token o un token vacío como enlace incompleto', () => {
    for (const fragment of [
      'access_token=a-1',
      'refresh_token=r-1',
      'access_token=&refresh_token=r-1',
      'access_token=a-1&refresh_token=%20'
    ]) {
      expect(readInvitationCallback(`${CALLBACK}#${fragment}`)).toEqual({
        kind: 'problem',
        problem: 'enlace-incompleto'
      });
    }
  });

  it('da prioridad al veredicto del proveedor sobre un fragmento con tokens', () => {
    expect(
      readInvitationCallback(
        `${CALLBACK}#error=access_denied&error_code=otp_expired&access_token=a-1&refresh_token=r-1`
      )
    ).toEqual({ kind: 'problem', problem: 'enlace-usado' });
  });

  it('no deja el secreto en el resultado que viaja al acceso', () => {
    const result = readInvitationCallback(
      `${CALLBACK}#error=access_denied&error_code=otp_expired&error_description=${SECRETO}&access_token=${SECRETO}&refresh_token=${SECRETO}`
    );
    expect(JSON.stringify(result)).not.toContain(SECRETO);
    expect(invitationMessage(result.kind === 'problem' ? result.problem : null)).not.toContain(
      SECRETO
    );
  });
});

describe('confirmación explícita de invitación', () => {
  it('acepta los dos tipos que emite este producto', () => {
    expect(readInvitationConfirmation(`#token_hash=${SECRETO}&type=invite`)).toEqual({
      kind: 'verify',
      tokenHash: SECRETO,
      verificationType: 'invite'
    });
    expect(readInvitationConfirmation(`#token_hash=${SECRETO}&type=magiclink`)).toEqual({
      kind: 'verify',
      tokenHash: SECRETO,
      verificationType: 'magiclink'
    });
    expect(readInvitationConfirmation(`#token_hash=${SECRETO}&type=recovery`)).toEqual({
      kind: 'verify',
      tokenHash: SECRETO,
      verificationType: 'recovery'
    });
  });

  it('deriva el destino del tipo que Auth va a validar, no de la dirección', () => {
    expect(invitationDestination('invite')).toBe('/auth/password');
    expect(invitationDestination('magiclink')).toBe('/');
    expect(invitationDestination('recovery')).toBe('/auth/password?mode=recovery');
  });

  it('no llama a Auth con un fragmento incompleto, vacío o de otro tipo', () => {
    for (const fragment of [
      '',
      '#token_hash=',
      '#type=invite',
      `#token_hash=${SECRETO}&type=signup`,
      `#token_hash=${SECRETO}&type=INVITE`
    ]) {
      expect(readInvitationConfirmation(fragment)).toEqual({
        kind: 'problem',
        problem: 'enlace-incompleto'
      });
    }
  });

  it('traduce también el error que devuelve verifyOtp', () => {
    expect(invitationProblemFromProviderCode('otp_expired')).toBe('enlace-usado');
    expect(invitationProblemFromProviderCode('unexpected_failure')).toBe('enlace-rechazado');
    expect(invitationProblemFromProviderCode(undefined)).toBe('enlace-rechazado');
  });
});

describe('aviso del acceso', () => {
  it('explica cada motivo con un texto propio y comprensible', () => {
    for (const [reason, message] of Object.entries(INVITATION_MESSAGES)) {
      expect(invitationMessage(reason)).toBe(message);
      expect(message.length).toBeGreaterThan(40);
    }
  });

  it('no deja sin explicación un motivo ausente', () => {
    expect(invitationMessage(undefined)).toBe(invitationMessage(null));
    expect(invitationMessage(undefined).length).toBeGreaterThan(40);
    expect(Object.values(INVITATION_MESSAGES)).not.toContain(invitationMessage(undefined));
  });

  it('no confunde un motivo inventado con un texto heredado del objeto', () => {
    const general = invitationMessage(undefined);
    for (const reason of ['inventado', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(invitationMessage(reason)).toBe(general);
    }
  });

  it('transporta el motivo y nada más en la dirección del acceso', () => {
    for (const problem of Object.keys(INVITATION_MESSAGES) as InvitationProblem[]) {
      const [pathname, query] = invitationLoginPath(problem).split('?');
      const parameters = new URLSearchParams(query);
      expect(pathname).toBe('/login');
      expect(parameters.get('error')).toBe('invite');
      expect(parameters.get('motivo')).toBe(problem);
      expect([...parameters.keys()]).toEqual(['error', 'motivo']);
    }
  });
});
