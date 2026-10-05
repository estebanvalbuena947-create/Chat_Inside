'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

/** Cuantos caracteres exigimos. Ocho es el minimo habitual y no molesta a nadie. */
const MINIMO = 8;

/**
 * Formulario para crear o restablecer la contrasena.
 *
 * Supabase deja a la persona con una sesion iniciada al abrir el enlace, asi que aqui no se pide
 * correo: solo la contrasena nueva. Si no hubiera sesion, el middleware la habria mandado al acceso.
 */
export function PasswordForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length === 0) {
      setErrorMessage('Escribe tu nombre: es el que vera el equipo en la bandeja.');
      return;
    }
    if (password.length < MINIMO) {
      setErrorMessage(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (password !== repetida) {
      setErrorMessage('Las dos contraseñas no coinciden.');
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: nombreLimpio },
      password
    });
    setGuardando(false);

    if (error) {
      setErrorMessage(
        'No fue posible guardar la contraseña. Puede que el enlace haya caducado: pide uno nuevo.'
      );
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="nombre">Tu nombre</label>
      <input
        autoComplete="name"
        id="nombre"
        onChange={(event) => setNombre(event.target.value)}
        placeholder="Como quieres que te llamen"
        type="text"
        value={nombre}
      />

      <label htmlFor="nueva-contrasena">Contraseña</label>
      <input
        autoComplete="new-password"
        id="nueva-contrasena"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />

      <label htmlFor="repetir-contrasena">Repite la contraseña</label>
      <input
        autoComplete="new-password"
        id="repetir-contrasena"
        onChange={(event) => setRepetida(event.target.value)}
        type="password"
        value={repetida}
      />

      {errorMessage ? (
        <p className="login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button disabled={guardando} type="submit">
        {guardando ? 'Guardando…' : 'Guardar y entrar'}
      </button>
    </form>
  );
}
