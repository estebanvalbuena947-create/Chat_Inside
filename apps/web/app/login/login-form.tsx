'use client';

import { type FormEvent, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

export function LoginForm(): React.ReactNode {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    try {
      const supabase = createClient();
      if (isRecovery) {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/invite`
        });
        // No revela si el correo tiene cuenta ni el detalle del proveedor.
        setNotice(
          'Si ese correo tiene una cuenta, recibirás un enlace para restablecer la contraseña.'
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage('No fue posible iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
        return;
      }

      window.location.assign('/');
    } catch {
      setErrorMessage('La autenticación no está disponible en este entorno.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        Correo electrónico
        <input autoComplete="email" name="email" required type="email" />
      </label>
      {!isRecovery ? (
        <label>
          Contraseña
          <input autoComplete="current-password" name="password" required type="password" />
        </label>
      ) : null}
      {notice ? <p className="login-copy">{notice}</p> : null}
      {errorMessage ? (
        <p className="login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Verificando…' : isRecovery ? 'Enviar enlace' : 'Iniciar sesión'}
      </button>
      <button
        className="login-link"
        onClick={() => {
          setErrorMessage(null);
          setNotice(null);
          setIsRecovery((current) => !current);
        }}
        type="button"
      >
        {isRecovery ? 'Volver al acceso' : '¿Olvidaste tu contraseña?'}
      </button>
    </form>
  );
}
