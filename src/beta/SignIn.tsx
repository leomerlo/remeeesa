import { Globe, LogIn, UserPlus } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import logo from '@/assets/logo.png'
import { useFirebase } from '@/lib/firebaseContext'
import { createBetaAuth, sayingAuth } from './auth'
import { Problem } from './fields'
import { UnirmeSheet } from './sheets/UnirmeSheet'

// The two ways in that the v1 already has -- Google, and a mail with a
// password. What changes here is only how they are laid out, and that the
// way in for somebody who was invited is on the same screen instead of a
// link in a mail.
export function SignIn({
  onCode,
}: {
  // A code pasted here is not used yet: there is nobody to join as until
  // the account exists. It is handed up, kept, and spent the moment this
  // screen gives way to a signed-in one with no household.
  readonly onCode: (token: string) => void
}): ReactElement {
  const firebase = useFirebase()
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const creating = mode === 'crear'

  const run = (what: () => Promise<void>): void => {
    setWorking(true)
    setFailed(null)
    void what()
      .catch((error: unknown) => {
        setFailed(sayingAuth(error))
      })
      .finally(() => {
        setWorking(false)
      })
  }

  const auth = createBetaAuth(firebase.auth)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    run(() =>
      creating
        ? auth.signUpWithEmail({ email, password })
        : auth.signInWithEmail({ email, password }),
    )
  }

  return (
    <div className="auth-box">
      <img src={logo} alt="reméeesa" />
      <form className="auth-card" onSubmit={submit}>
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
        <div className="field">
          <label htmlFor="a-m">Correo</label>
          <input
            id="a-m"
            type="email"
            autoComplete="email"
            placeholder="vos@correo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="a-p">Contraseña</label>
          <input
            id="a-p"
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {failed === null ? null : <Problem>{failed}</Problem>}
        <button className="btn btn-primary" type="submit" disabled={working}>
          {creating ? <UserPlus /> : <LogIn />}
          {working ? 'Un segundo…' : creating ? 'Crear mi cuenta' : 'Entrar'}
        </button>
        <div className="auth-alt">
          <span>O</span>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={working}
          onClick={() => run(() => auth.withGoogle())}
        >
          <Globe />
          Seguir con Google
        </button>
      </form>
      <p className="auth-foot">
        ¿Te invitaron a un hogar?{' '}
        <button type="button" onClick={() => setJoining(true)}>
          Entrá con el código
        </button>
      </p>
      <UnirmeSheet
        open={joining}
        onClose={() => setJoining(false)}
        onKeep={(token) => {
          setJoining(false)
          setMode('crear')
          onCode(token)
        }}
      />
    </div>
  )
}
