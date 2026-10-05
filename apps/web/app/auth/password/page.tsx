import { PasswordForm } from './password-form';

/**
 * Pantalla para crear o restablecer la contrasena.
 *
 * Sirve para los dos casos a proposito: quien acepta una invitacion y quien ha pedido recuperar su
 * contrasena llegan aqui con una sesion ya iniciada por Supabase, y en ambos casos lo unico que
 * falta es poner una contrasena. Una pantalla, dos caminos.
 */
export default function PasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="login-brand">INSIDE SPA · CHAT</p>
        <h1>Crea tu contraseña</h1>
        <p className="login-hint">
          Elige una contraseña para poder entrar cuando quieras. Podrás cambiarla más adelante.
        </p>
        <PasswordForm />
      </section>
    </main>
  );
}
