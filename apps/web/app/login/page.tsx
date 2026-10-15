import Image from 'next/image';
import { invitationMessage } from '../../lib/auth/invitation-callback';
import { LoginForm } from './login-form';

/**
 * El acceso explica por que se llego aqui cuando el motivo es un enlace de invitacion que no sirvio:
 * sin ese aviso la persona cree que su correo o su contrasena fallan, y quien administra no puede
 * distinguir un enlace gastado de una credencial equivocada.
 */
export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const parameters = await searchParams;
  const reason = Array.isArray(parameters.motivo) ? parameters.motivo[0] : parameters.motivo;
  const notice = parameters.error === 'invite' ? invitationMessage(reason) : null;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-mark">
          <Image
            alt="Inside Spa"
            className="login-brand-logo"
            height={80}
            priority
            src="/logo-inside-spa.png"
            width={80}
          />
        </div>
        <p className="eyebrow">INSIDE SPA · CHAT</p>
        <h1 id="login-title">Accede a la bandeja</h1>
        <p className="login-copy">Usa las credenciales que te proporcionó el administrador.</p>
        {notice ? (
          <p className="login-error" role="alert">
            {notice}
          </p>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
