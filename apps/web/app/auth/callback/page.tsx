'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { invitationLoginPath, readInvitationCallback } from '../../../lib/auth/invitation-callback';
import { createClient } from '../../../lib/supabase/client';

/**
 * Auth entrega las invitaciones generadas por administracion con tokens en el fragmento URL.
 * Ese fragmento nunca llega al servidor, asi que el navegador guarda la sesion antes de borrar
 * los secretos de la barra de direcciones y mostrar el formulario de contrasena.
 *
 * Cuando el enlace no concede sesion, el motivo viaja al acceso: sin el, la persona ve un formulario
 * indistinguible de un error de credenciales y nadie puede saber que paso con la invitacion.
 */
export default function AuthCallbackPage(): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    async function establishInvitationSession(): Promise<void> {
      const result = readInvitationCallback(window.location.href);
      if (result.kind === 'problem') {
        router.replace(invitationLoginPath(result.problem));
        return;
      }

      const supabase = createClient();
      const { error } =
        result.kind === 'code'
          ? await supabase.auth.exchangeCodeForSession(result.code)
          : await supabase.auth.setSession({
              access_token: result.accessToken,
              refresh_token: result.refreshToken
            });
      if (error) {
        router.replace(invitationLoginPath('sesion-no-establecida'));
        return;
      }

      // Reemplazar, y no solo navegar, para que los tokens no permanezcan en el historial.
      window.location.replace('/auth/password');
    }

    void establishInvitationSession().catch(() => {
      router.replace(invitationLoginPath('sesion-no-establecida'));
    });
  }, [router]);

  return (
    <main className="login-page">
      <section className="login-card" aria-live="polite">
        <p className="login-brand">INSIDE SPA · CHAT</p>
        <p className="login-hint">Verificando tu invitación…</p>
      </section>
    </main>
  );
}
