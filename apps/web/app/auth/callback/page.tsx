'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

/**
 * Auth entrega las invitaciones generadas por administracion con tokens en el fragmento URL.
 * Ese fragmento nunca llega al servidor, asi que el navegador guarda la sesion antes de borrar
 * los secretos de la barra de direcciones y mostrar el formulario de contrasena.
 */
export default function AuthCallbackPage(): React.ReactNode {
  const router = useRouter();
  const [message, setMessage] = useState('Verificando tu invitación…');

  useEffect(() => {
    async function establishInvitationSession(): Promise<void> {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = parameters.get('access_token');
      const refreshToken = parameters.get('refresh_token');

      if (!accessToken || !refreshToken) {
        router.replace('/login?error=invite');
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        router.replace('/login?error=invite');
        return;
      }

      // Reemplazar, y no solo navegar, para que los tokens no permanezcan en el historial.
      window.location.replace('/auth/password');
    }

    void establishInvitationSession().catch(() => {
      setMessage('No fue posible verificar la invitación. Pide al administrador un enlace nuevo.');
    });
  }, [router]);

  return (
    <main className="login-page">
      <section className="login-card" aria-live="polite">
        <p className="login-brand">INSIDE SPA · CHAT</p>
        <p className="login-hint">{message}</p>
      </section>
    </main>
  );
}
