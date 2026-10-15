'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  passwordMeetsRequirements,
  passwordSaveMessage,
  PASSWORD_REQUIREMENTS_HINT
} from '../../../lib/auth/password-save';
import { createClient } from '../../../lib/supabase/client';

/** Icono del boton: ojo abierto cuando esta oculta y ojo tachado cuando ya se ve. */
function EyeIcon({ visible }: { visible: boolean }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M2.5 12S6 5.75 12 5.75 21.5 12 21.5 12 18 18.25 12 18.25 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.25" />
      {visible ? <path d="M4.5 19.5 19.5 4.5" /> : null}
    </svg>
  );
}

/**
 * Campo de contrasena con boton para ver lo escrito.
 *
 * El boton no envia el formulario y anuncia su estado, para que funcione tambien con teclado y
 * lectores de pantalla.
 */
function PasswordField({
  id,
  label,
  onChange,
  onToggle,
  value,
  visible
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  value: string;
  visible: boolean;
}): React.ReactNode {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="login-password">
        <input
          autoComplete="new-password"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          aria-pressed={visible}
          className="login-password-toggle"
          onClick={onToggle}
          type="button"
        >
          <EyeIcon visible={visible} />
        </button>
      </span>
    </>
  );
}

/**
 * Formulario para crear o restablecer la contrasena.
 *
 * Supabase deja a la persona con una sesion iniciada al abrir el enlace, asi que aqui no se pide
 * correo: solo la contrasena nueva. Si no hubiera sesion, el middleware la habria mandado al acceso.
 */
export function PasswordForm({ requiresName = true }: { requiresName?: boolean }) {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const nombreLimpio = nombre.trim();
    if (requiresName && nombreLimpio.length === 0) {
      setErrorMessage('Escribe tu nombre: es el que vera el equipo en la bandeja.');
      return;
    }
    if (!passwordMeetsRequirements(password)) {
      setErrorMessage(PASSWORD_REQUIREMENTS_HINT);
      return;
    }
    if (password !== repetida) {
      setErrorMessage('Las dos contraseñas no coinciden.');
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { data: session, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !session.user) {
      setGuardando(false);
      setErrorMessage('El enlace no es válido o ya caducó. Pide al administrador uno nuevo.');
      return;
    }
    const { error } = await supabase.auth.updateUser(
      requiresName ? { data: { display_name: nombreLimpio }, password } : { password }
    );
    setGuardando(false);

    if (error) {
      setErrorMessage(passwordSaveMessage(error.code));
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
      {requiresName ? (
        <>
          <label htmlFor="nombre">Tu nombre</label>
          <input
            autoComplete="name"
            id="nombre"
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Como quieres que te llamen"
            type="text"
            value={nombre}
          />
        </>
      ) : null}

      <PasswordField
        id="nueva-contrasena"
        label="Contraseña"
        onChange={setPassword}
        onToggle={() => setVerPassword((current) => !current)}
        value={password}
        visible={verPassword}
      />
      <p className="login-hint">{PASSWORD_REQUIREMENTS_HINT}</p>

      <PasswordField
        id="repetir-contrasena"
        label="Repite la contraseña"
        onChange={setRepetida}
        onToggle={() => setVerPassword((current) => !current)}
        value={repetida}
        visible={verPassword}
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
