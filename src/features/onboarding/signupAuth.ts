import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import type { Auth } from 'firebase/auth'

export type SignupAuth = {
  signUpWithEmail(input: {
    readonly email: string
    readonly password: string
  }): Promise<{ readonly userId: string }>
  signUpWithGoogle(): Promise<{ readonly userId: string }>
  signInWithEmail(input: {
    readonly email: string
    readonly password: string
  }): Promise<{ readonly userId: string }>
  signInWithGoogle(): Promise<{ readonly userId: string }>
}

export function createFirebaseSignupAuth(auth: Auth): SignupAuth {
  async function signInWithGoogle() {
    const credential = await signInWithPopup(auth, new GoogleAuthProvider())
    return { userId: credential.user.uid }
  }

  return {
    async signUpWithEmail(input) {
      const credential = await createUserWithEmailAndPassword(
        auth,
        input.email,
        input.password,
      )
      return { userId: credential.user.uid }
    },
    signUpWithGoogle: signInWithGoogle,
    async signInWithEmail(input) {
      const credential = await signInWithEmailAndPassword(
        auth,
        input.email,
        input.password,
      )
      return { userId: credential.user.uid }
    },
    signInWithGoogle: signInWithGoogle,
  }
}
