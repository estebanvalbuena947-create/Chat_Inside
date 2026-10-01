'use client';

import { type FormEvent, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

export function LoginForm(): React.ReactNode {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    try {
      const supabase = createClient();
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
      <label>
        Contraseña
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {errorMessage ? (
        <p className="login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button className="login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Verificando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
