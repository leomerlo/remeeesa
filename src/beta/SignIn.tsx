import { Globe, LogIn, UserPlus } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import logo from '@/assets/logo.png'

// The two ways in that the v1 already has -- Google, and a mail with a
// password. What changes here is only how they are laid out.
export function SignIn({
  onGoogle,
}: {
  readonly onGoogle: () => void
}): ReactElement {
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar')
  const creating = mode === 'crear'

  return (
    <div className="auth-box">
      <img src={logo} alt="reméeesa" />
      <div className="auth-card">
        <h1>{creating ? 'Creá tu hogar' : 'Entrá a tu hogar'}</h1>
        <div className="segment">
          <button
            type="button"
            aria-pressed={!creating}
            onClick={() => setMode('entrar')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            aria-pressed={creating}
            onClick={() => setMode('crear')}
          >
            Crear cuenta
          </button>
        </div>
        {creating ? (
          <div className="field">
            <label htmlFor="a-n">Tu nombre</label>
            <input id="a-n" autoComplete="name" placeholder="Flor" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="a-m">Correo</label>
          <input
            id="a-m"
            type="email"
            autoComplete="email"
            placeholder="vos@correo.com"
          />
        </div>
        <div className="field">
          <label htmlFor="a-p">Contraseña</label>
          <input
            id="a-p"
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            placeholder="••••••••"
          />
        </div>
        <button className="btn btn-primary" type="button" onClick={onGoogle}>
          {creating ? <UserPlus /> : <LogIn />}
          {creating ? 'Crear mi cuenta' : 'Entrar'}
        </button>
        <div className="auth-alt">
          <span>O</span>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onGoogle}>
          <Globe />
          Seguir con Google
        </button>
      </div>
    </div>
  )
}
