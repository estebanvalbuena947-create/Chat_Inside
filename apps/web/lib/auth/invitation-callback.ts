/**
 * Lectura del resultado que Auth entrega al volver de un enlace de invitacion.
 *
 * La regla vive aqui, fuera de la pantalla, porque es una decision y no un detalle visual: Auth
 * devuelve una sesion (tokens implicitos o un codigo de canje) o un error con su codigo; cualquier
 * otra cosa es un enlace que llego incompleto. La pantalla solo presenta el resultado.
 *
 * El fragmento nunca llega al servidor y el secreto no se registra en ningun sitio: solo se entrega
 * al cliente de Supabase. Lo unico que viaja a la direccion del acceso es el motivo, que no es un
 * secreto, y se traduce a un texto propio: el valor recibido nunca se pinta tal cual.
 */

/** Motivos por los que un enlace de invitacion no concede sesion. */
export type InvitationProblem =
  | 'enlace-usado'
  | 'enlace-rechazado'
  | 'enlace-incompleto'
  | 'sesion-no-establecida';

export type InvitationCallbackResult =
  | { readonly kind: 'session'; readonly accessToken: string; readonly refreshToken: string }
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'problem'; readonly problem: InvitationProblem };

/** Tipos que Auth admite para los enlaces que este producto emite. */
export type InvitationVerificationType = 'invite' | 'magiclink';

export type InvitationConfirmation =
  | {
      readonly kind: 'verify';
      readonly tokenHash: string;
      readonly verificationType: InvitationVerificationType;
    }
  | { readonly kind: 'problem'; readonly problem: 'enlace-incompleto' };

/**
 * Traduccion de los codigos de Auth que significan que el enlace ya no sirve. Un codigo que no este
 * aqui se presenta como rechazo generico, sin inventarle una causa.
 */
const PROBLEM_BY_PROVIDER_CODE: Record<string, InvitationProblem> = {
  otp_expired: 'enlace-usado'
};

/** Un error del proveedor nunca se muestra tal cual: se reduce a un motivo propio y seguro. */
export function invitationProblemFromProviderCode(
  code: string | null | undefined
): InvitationProblem {
  return (code ? PROBLEM_BY_PROVIDER_CODE[code] : undefined) ?? 'enlace-rechazado';
}

export const INVITATION_MESSAGES: Record<InvitationProblem, string> = {
  'enlace-usado':
    'Ese enlace ya se usó o caducó: cada invitación sirve una sola vez. Pide a quien te invitó que genere una nueva.',
  'enlace-rechazado':
    'No pudimos verificar la invitación. Pide a quien te invitó que genere un enlace nuevo.',
  'enlace-incompleto':
    'El enlace llegó incompleto. Ábrelo otra vez desde el mismo mensaje, sin cortarlo; si vuelve a pasar, pide uno nuevo.',
  'sesion-no-establecida':
    'Verificamos el enlace, pero no pudimos abrir tu sesión. Pide un enlace nuevo e inténtalo en este mismo navegador.'
};

const FALLBACK_MESSAGE =
  'La invitación no sirvió. Pide a quien te invitó que genere un enlace nuevo.';

/**
 * Parametros que Auth agrego a la direccion. El fragmento manda, porque es donde los pone hoy, y la
 * consulta se conserva para los flujos que devuelven un codigo de canje.
 */
function readAuthParameters(url: string): URLSearchParams {
  const parsed = new URL(url);
  const parameters = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, '')).forEach((value, key) => {
    parameters.set(key, value);
  });
  return parameters;
}

function readText(parameters: URLSearchParams, key: string): string | null {
  const value = parameters.get(key);
  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Resultado del retorno de un enlace: sesion lista para guardar, codigo que hay que canjear, o el
 * motivo por el que no se puede continuar. El veredicto del proveedor manda sobre el resto: si Auth
 * informa un error, el fragmento no se usa aunque traiga tokens.
 */
export function readInvitationCallback(url: string): InvitationCallbackResult {
  const parameters = readAuthParameters(url);

  if (readText(parameters, 'error')) {
    return {
      kind: 'problem',
      problem: invitationProblemFromProviderCode(readText(parameters, 'error_code'))
    };
  }

  const accessToken = readText(parameters, 'access_token');
  const refreshToken = readText(parameters, 'refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken };
  }

  const code = readText(parameters, 'code');
  if (code) {
    return { kind: 'code', code };
  }

  return { kind: 'problem', problem: 'enlace-incompleto' };
}

/**
 * Fragmento del enlace resistente a previsualizaciones. Se recibe por separado porque los fragmentos
 * no llegan al servidor: una carga o una vista previa nunca puede canjearlo por accidente.
 */
export function readInvitationConfirmation(fragment: string): InvitationConfirmation {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ''));
  const tokenHash = readText(parameters, 'token_hash');
  const type = readText(parameters, 'type');

  if (!tokenHash || (type !== 'invite' && type !== 'magiclink')) {
    return { kind: 'problem', problem: 'enlace-incompleto' };
  }

  return { kind: 'verify', tokenHash, verificationType: type };
}

/** El destino no se toma de la URL: se deriva del tipo que Auth tambien verifica. */
export function invitationDestination(
  verificationType: InvitationVerificationType
): '/' | '/auth/password' {
  return verificationType === 'invite' ? '/auth/password' : '/';
}

/**
 * Texto para el motivo que viaja en la direccion del acceso. Un motivo ausente o desconocido no deja
 * a la persona sin explicacion: usa el texto general. El motivo llega por la direccion, asi que se
 * comprueba contra las claves propias y nunca se interpreta como una propiedad heredada.
 */
export function invitationMessage(reason: string | null | undefined): string {
  if (!reason) return FALLBACK_MESSAGE;
  if (!Object.prototype.hasOwnProperty.call(INVITATION_MESSAGES, reason)) return FALLBACK_MESSAGE;
  return INVITATION_MESSAGES[reason as InvitationProblem];
}

/**
 * Direccion del acceso para un enlace que no concedio sesion. La forma vive aqui, en un solo sitio,
 * para que ningun camino lleve al acceso un motivo distinto ni, menos aun, el secreto.
 */
export function invitationLoginPath(problem: InvitationProblem): string {
  return `/login?error=invite&motivo=${problem}`;
}
