import Image from 'next/image';
import { LoginForm } from './login-form';

export default function LoginPage(): React.ReactNode {
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
        <LoginForm />
      </section>
    </main>
  );
}
