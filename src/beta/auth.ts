import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import type { Auth } from 'firebase/auth'

// The two ways in the v1 already has -- Google, and a mail with a password.
// Written again here rather than imported because the beta is a separate
// entry and may not reach into @/features (see entryIsolation.test.ts); it is
// four calls, and keeping them here is cheaper than a shared module nobody
// else asked for.

export type BetaAuth = {
  signUpWithEmail(input: {
    readonly email: string
    readonly password: string
  }): Promise<void>
  signInWithEmail(input: {
    readonly email: string
    readonly password: string
  }): Promise<void>
  withGoogle(): Promise<void>
}

export function createBetaAuth(auth: Auth): BetaAuth {
  return {
    async signUpWithEmail({ email, password }) {
      await createUserWithEmailAndPassword(auth, email, password)
    },
    async signInWithEmail({ email, password }) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async withGoogle() {
      await signInWithPopup(auth, new GoogleAuthProvider())
    },
  }
}

// Firebase says "auth/invalid-credential"; a person needs to be told what to
// do about it. Anything unrecognised gets one honest sentence rather than a
// code: a code on screen only tells somebody they cannot fix it themselves.
const SAYINGS: Readonly<Record<string, string>> = {
  'auth/invalid-email': 'Ese correo no parece un correo. Revisalo.',
  'auth/missing-password': 'Te falta la contraseña.',
  'auth/weak-password': 'La contraseña es muy corta: poné al menos 6 letras.',
  'auth/email-already-in-use':
    'Ya hay una cuenta con ese correo. Entrá con tu contraseña.',
  'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
  'auth/wrong-password': 'El correo o la contraseña no coinciden.',
  'auth/user-not-found':
    'No hay ninguna cuenta con ese correo. Creá una cuenta.',
  'auth/too-many-requests': 'Probaste muchas veces. Esperá un rato.',
  'auth/network-request-failed': 'No hay internet, o se cortó. Probá de nuevo.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Probá de nuevo.',
  'auth/cancelled-popup-request':
    'Se cerró la ventana de Google. Probá de nuevo.',
  'auth/popup-blocked':
    'El navegador bloqueó la ventana de Google. Permitila y probá de nuevo.',
  'auth/operation-not-allowed':
    'Esa forma de entrar está apagada en el proyecto de Firebase.',
}

export function sayingAuth(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  return SAYINGS[code] ?? 'No se pudo entrar. Probá de nuevo.'
}
