'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  invitationDestination,
  invitationLoginPath,
  invitationProblemFromProviderCode,
  readInvitationConfirmation
} from '../../../lib/auth/invitation-callback';
import { createClient } from '../../../lib/supabase/client';

/**
 * Pagina publica y deliberadamente pasiva. El secreto esta en el fragmento URL, que no llega ni al
 * servidor ni a las previsualizaciones. Auth se llama solo despues del clic real de la persona.
 */
export default function InvitationConfirmationPage(): React.ReactNode {
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(false);

  async function confirmInvitation(): Promise<void> {
    const invitation = readInvitationConfirmation(window.location.hash);
    if (invitation.kind === 'problem') {
      router.replace(invitationLoginPath(invitation.problem));
      return;
    }

    setIsVerifying(true);

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

      // Auth valida tambien el tipo: solo una invitacion nueva crea contrasena; una cuenta existente
      // recibe acceso y conserva su contrasena actual.
      window.location.replace(invitationDestination(invitation.verificationType));
    } catch {
      router.replace(invitationLoginPath('sesion-no-establecida'));
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-live="polite">
        <p className="login-brand">INSIDE SPA · CHAT</p>
        <h1>Abre tu invitación</h1>
        <p className="login-copy">
          Para proteger tu acceso, confirma que quieres abrir esta invitación. El enlace no se usa
          hasta que pulses continuar.
        </p>
        <button
          className="login-submit"
          disabled={isVerifying}
          onClick={() => void confirmInvitation()}
          type="button"
        >
          {isVerifying ? 'Verificando…' : 'Continuar con la invitación'}
        </button>
      </section>
    </main>
  );
}
