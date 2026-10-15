import { describe, expect, it } from 'vitest';
import {
  PASSWORD_REQUIREMENTS_HINT,
  PASSWORD_SAVE_MESSAGES,
  passwordMeetsRequirements,
  passwordSaveMessage,
  passwordSaveProblem,
  type PasswordSaveProblem
} from './password-save';

describe('requisitos de la contraseña', () => {
  it('acepta una contraseña que cumple la política del proyecto', () => {
    expect(passwordMeetsRequirements('Carmina1!')).toBe(true);
    expect(passwordMeetsRequirements('aB3#aB3#aB3#')).toBe(true);
  });

  it('rechaza lo que Auth rechazaría, nombrando cada requisito que falta', () => {
    for (const value of [
      'carmina1!', // sin mayuscula
      'CARMINA1!', // sin minuscula
      'Carmina!!', // sin numero
      'Carmina12', // sin simbolo
      'Ca1!aB3' // demasiado corta
    ]) {
      expect(passwordMeetsRequirements(value)).toBe(false);
    }
  });

  it('no acepta un espacio como símbolo', () => {
    expect(passwordMeetsRequirements('Carmina 1')).toBe(false);
  });

  it('explica los requisitos en el mismo texto que usa el mensaje de error', () => {
    expect(PASSWORD_REQUIREMENTS_HINT.length).toBeGreaterThan(40);
    expect(PASSWORD_SAVE_MESSAGES['contrasena-debil']).toContain(PASSWORD_REQUIREMENTS_HINT);
  });
});

describe('error al guardar la contraseña', () => {
  it('nombra la contraseña débil y la repetición de la anterior', () => {
    expect(passwordSaveProblem('weak_password')).toBe('contrasena-debil');
    expect(passwordSaveProblem('same_password')).toBe('contrasena-igual');
  });

  it('reconoce los límites de peticiones y la sesión vencida', () => {
    expect(passwordSaveProblem('over_request_rate_limit')).toBe('demasiados-intentos');
    expect(passwordSaveProblem('session_not_found')).toBe('sesion-no-valida');
    expect(passwordSaveProblem('session_expired')).toBe('sesion-no-valida');
  });

  it('no presenta un código desconocido como un motivo inventado', () => {
    for (const code of ['validation_failed', 'unexpected_failure', 'inventado']) {
      expect(passwordSaveProblem(code)).toBe('desconocido');
    }
  });

  it('no toma un código heredado del objeto como un motivo', () => {
    for (const code of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(passwordSaveProblem(code)).toBe('desconocido');
      expect(passwordSaveMessage(code)).toBe(PASSWORD_SAVE_MESSAGES.desconocido);
    }
  });

  it('no deja sin explicación un error sin código', () => {
    expect(passwordSaveProblem(undefined)).toBe('desconocido');
    expect(passwordSaveProblem(null)).toBe('desconocido');
    expect(passwordSaveProblem('')).toBe('desconocido');
  });

  it('explica cada motivo con un texto propio y accionable', () => {
    for (const message of Object.values(PASSWORD_SAVE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(40);
      expect(message).not.toContain('weak_password');
    }
  });

  it('entrega el texto del motivo que corresponde al código del proveedor', () => {
    for (const [code, problem] of Object.entries({
      weak_password: 'contrasena-debil',
      same_password: 'contrasena-igual',
      over_request_rate_limit: 'demasiados-intentos',
      session_expired: 'sesion-no-valida'
    })) {
      expect(passwordSaveMessage(code)).toBe(
        PASSWORD_SAVE_MESSAGES[problem as PasswordSaveProblem]
      );
    }
  });

  it('distingue los motivos entre sí, sin compartir un único texto', () => {
    const messages = Object.values(PASSWORD_SAVE_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
  });
});
