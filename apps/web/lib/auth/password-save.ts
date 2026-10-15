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

/** Cada exigencia de la politica, por separado, para poder decir cual falta. */
export type PasswordRequirement = 'longitud' | 'minuscula' | 'mayuscula' | 'numero' | 'simbolo';

interface RequirementDefinition {
  /** Etiqueta en positivo, para la lista que se marca al escribir. */
  readonly label: string;
  /** Como se nombra cuando falta, para el aviso concreto. */
  readonly missing: string;
}

const REQUIREMENTS: ReadonlyArray<readonly [PasswordRequirement, RequirementDefinition]> = [
  ['longitud', { label: 'Al menos 8 caracteres', missing: 'alcanzar los 8 caracteres' }],
  ['minuscula', { label: 'Una minúscula', missing: 'una minúscula' }],
  ['mayuscula', { label: 'Una mayúscula', missing: 'una mayúscula' }],
  ['numero', { label: 'Un número', missing: 'un número' }],
  ['simbolo', { label: 'Un símbolo', missing: 'un símbolo' }]
];

/** El espacio no cuenta como simbolo: se exige un caracter que no sea letra, numero ni espacio. */
const MEETS: Record<PasswordRequirement, (value: string) => boolean> = {
  longitud: (value) => value.length >= 8,
  minuscula: (value) => /[a-z]/.test(value),
  mayuscula: (value) => /[A-Z]/.test(value),
  numero: (value) => /[0-9]/.test(value),
  simbolo: (value) => /[^A-Za-z0-9\s]/.test(value)
};

/** Requisitos que la contrasena todavia no cumple, en el orden en que se explican. */
export function missingPasswordRequirements(value: string): PasswordRequirement[] {
  return REQUIREMENTS.filter(([id]) => !MEETS[id](value)).map(([id]) => id);
}

/** Estado de cada requisito, para la lista que la persona ve mientras escribe. */
export function passwordRequirementsChecklist(
  value: string
): Array<{ id: PasswordRequirement; label: string; met: boolean }> {
  return REQUIREMENTS.map(([id, definition]) => ({
    id,
    label: definition.label,
    met: MEETS[id](value)
  }));
}

export function passwordMeetsRequirements(value: string): boolean {
  return missingPasswordRequirements(value).length === 0;
}

function joinInSpanish(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Aviso concreto de lo que falta. Nombra solo los requisitos incumplidos, para que la persona sepa
 * si le falta un numero, un simbolo o cualquier otra cosa, en lugar de repetirle la lista entera.
 * Devuelve cadena vacia cuando la contrasena ya cumple todo.
 */
export function passwordRequirementsMessage(value: string): string {
  const missing = missingPasswordRequirements(value);
  if (missing.length === 0) return '';

  const names = missing.map(
    (id) => REQUIREMENTS.find(([requirementId]) => requirementId === id)![1].missing
  );
  return `Todavía ${names.length > 1 ? 'faltan' : 'falta'} ${joinInSpanish(names)}.`;
}

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
