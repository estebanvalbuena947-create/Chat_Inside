/**
 * Reglas y traduccion de errores al guardar la contrasena.
 *
 * El proyecto exige una contrasena con una minuscula, una mayuscula, un numero y un simbolo. Esa
 * politica vive en Auth, que sigue siendo la autoridad: aqui se comprueba tambien para dar respuesta
 * inmediata y su rechazo se traduce a un motivo propio, sin mostrar jamas el texto del proveedor.
 */

/** Requisitos vigentes, en el orden en que conviene explicarlos. */
export const PASSWORD_REQUIREMENTS_HINT =
  'Al menos 8 caracteres, con una minúscula, una mayúscula, un número y un símbolo.';

/** Motivos por los que Auth no guarda la contrasena. */
export type PasswordSaveProblem =
  | 'contrasena-debil'
  | 'contrasena-igual'
  | 'demasiados-intentos'
  | 'sesion-no-valida'
  | 'desconocido';

const PROBLEM_BY_PROVIDER_CODE: Record<string, PasswordSaveProblem> = {
  weak_password: 'contrasena-debil',
  same_password: 'contrasena-igual',
  over_request_rate_limit: 'demasiados-intentos',
  over_email_send_rate_limit: 'demasiados-intentos',
  session_not_found: 'sesion-no-valida',
  session_expired: 'sesion-no-valida',
  refresh_token_not_found: 'sesion-no-valida'
};

export const PASSWORD_SAVE_MESSAGES: Record<PasswordSaveProblem, string> = {
  'contrasena-debil': `La contraseña no cumple los requisitos. ${PASSWORD_REQUIREMENTS_HINT}`,
  'contrasena-igual': 'La contraseña nueva debe ser distinta a la anterior.',
  'demasiados-intentos': 'Demasiados intentos seguidos. Espera unos minutos e inténtalo otra vez.',
  'sesion-no-valida':
    'Tu enlace ya no está activo. Abre otra vez el correo de invitación o pide un enlace nuevo.',
  desconocido: 'No fue posible guardar la contraseña. Inténtalo de nuevo en unos minutos.'
};

/**
 * Comprobacion previa de los requisitos. El espacio no cuenta como simbolo: se exige un caracter
 * que no sea letra, numero ni espacio, para no aprobar algo que Auth rechazaria.
 */
export function passwordMeetsRequirements(value: string): boolean {
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9\s]/.test(value)
  );
}

/**
 * Un codigo desconocido no deja a la persona sin salida: recibe el texto general. Se comprueba
 * contra las claves propias para que un codigo heredado del objeto no se interprete como un motivo.
 */
export function passwordSaveProblem(code: string | null | undefined): PasswordSaveProblem {
  if (!code) return 'desconocido';
  if (!Object.prototype.hasOwnProperty.call(PROBLEM_BY_PROVIDER_CODE, code)) return 'desconocido';
  return PROBLEM_BY_PROVIDER_CODE[code];
}

export function passwordSaveMessage(code: string | null | undefined): string {
  return PASSWORD_SAVE_MESSAGES[passwordSaveProblem(code)];
}
