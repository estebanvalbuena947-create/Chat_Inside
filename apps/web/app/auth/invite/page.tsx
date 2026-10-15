'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  invitationDestination,
  invitationLoginPath,
  invitationProblemFromProviderCode,
  readInvitationConfirmation
} from '../../../lib/auth/invitation-callback';
import { createClient } from '../../../lib/supabase/client';

/**
 * Pagina de paso, sin confirmacion manual: el secreto viaja en el fragmento URL, que no llega al
 * servidor, asi que una previsualizacion o un escaner de enlaces no puede canjearlo. En cuanto el
 * navegador la abre, valida el enlace y lleva a la persona directo a su destino.
 */
export default function InvitationConfirmationPage(): React.ReactNode {
  const router = useRouter();
  const [message, setMessage] = useState('Verificando tu enlace…');

  useEffect(() => {
    async function verifyInvitation(): Promise<void> {
      const invitation = readInvitationConfirmation(window.location.hash);
      if (invitation.kind === 'problem') {
        router.replace(invitationLoginPath(invitation.problem));
        return;
      }

      // Una vez que el navegador tiene el secreto en memoria, quitarlo del historial antes de canjearlo.
      window.history.replaceState(null, '', window.location.pathname);

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.verifyOtp({
          token_hash: invitation.tokenHash,
          type: invitation.verificationType
        });
        if (error) {
          router.replace(invitationLoginPath(invitationProblemFromProviderCode(error.code)));
          return;
        }

        // Una invitacion nueva crea contrasena; una cuenta existente entra; una recuperacion
        // restablece la contrasena. Todo sin pedir una confirmacion intermedia.
        window.location.replace(invitationDestination(invitation.verificationType));
      } catch {
        setMessage('No pudimos validar tu enlace.');
        router.replace(invitationLoginPath('sesion-no-establecida'));
      }
    }

    void verifyInvitation();
  }, [router]);

  return (
    <main className="login-page">
      <section className="login-card" aria-live="polite">
        <p className="login-brand">INSIDE SPA · CHAT</p>
        <h1>{message}</h1>
        <p className="login-copy">Preparando tu acceso. Un momento, por favor.</p>
      </section>
    </main>
  );
}
