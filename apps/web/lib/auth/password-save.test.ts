import { describe, expect, it } from 'vitest';
import {
  missingPasswordRequirements,
  PASSWORD_REQUIREMENTS_HINT,
  PASSWORD_SAVE_MESSAGES,
  passwordMeetsRequirements,
  passwordRequirementsChecklist,
  passwordRequirementsMessage,
  passwordSaveMessage,
  passwordSaveProblem,
  type PasswordSaveProblem
} from './password-save';

describe('requisitos de la contraseña', () => {
  it('acepta una contraseña que cumple la política del proyecto', () => {
    expect(passwordMeetsRequirements('Carmina1!')).toBe(true);
    expect(passwordMeetsRequirements('aB3#aB3#aB3#')).toBe(true);
    expect(missingPasswordRequirements('Carmina1!')).toEqual([]);
    expect(passwordRequirementsMessage('Carmina1!')).toBe('');
  });

  it('rechaza lo que Auth rechazaría', () => {
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

  it('dice exactamente qué falta, sin repetir la lista entera', () => {
    expect(passwordRequirementsMessage('Carmina12')).toBe('Todavía falta un símbolo.');
    expect(passwordRequirementsMessage('Carmina!!')).toBe('Todavía falta un número.');
    expect(passwordRequirementsMessage('carmina1!')).toBe('Todavía falta una mayúscula.');
    expect(passwordRequirementsMessage('CARMINA1!')).toBe('Todavía falta una minúscula.');
    expect(passwordRequirementsMessage('Ca1!aB3')).toBe('Todavía falta alcanzar los 8 caracteres.');
  });

  it('nombra varios requisitos juntos cuando faltan a la vez', () => {
    expect(passwordRequirementsMessage('Carmin1')).toBe(
      'Todavía faltan alcanzar los 8 caracteres y un símbolo.'
    );
    expect(passwordRequirementsMessage('carmina')).toBe(
      'Todavía faltan alcanzar los 8 caracteres, una mayúscula, un número y un símbolo.'
    );
    expect(missingPasswordRequirements('carmina')).toEqual([
      'longitud',
      'mayuscula',
      'numero',
      'simbolo'
    ]);
  });

  it('no acepta un espacio como símbolo', () => {
    expect(passwordMeetsRequirements('Carmina 1')).toBe(false);
    expect(passwordRequirementsMessage('Carmina 1')).toBe('Todavía falta un símbolo.');
  });

  it('marca cada requisito por separado mientras se escribe', () => {
    const checklist = passwordRequirementsChecklist('Carmina1!');
    expect(checklist.every((requirement) => requirement.met)).toBe(true);
    expect(checklist.map((requirement) => requirement.id)).toEqual([
      'longitud',
      'minuscula',
      'mayuscula',
      'numero',
      'simbolo'
    ]);

    const parcial = passwordRequirementsChecklist('carmina');
    expect(
      parcial.filter((requirement) => requirement.met).map((requirement) => requirement.id)
    ).toEqual(['minuscula']);
  });

  it('explica los requisitos en el mismo texto que usa el mensaje de error del proveedor', () => {
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
