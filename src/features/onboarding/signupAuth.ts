import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import type { Auth } from 'firebase/auth'

export type SignupAuth = {
  signUpWithEmail(input: {
    readonly email: string
    readonly password: string
  }): Promise<{ readonly userId: string }>
  signUpWithGoogle(): Promise<{ readonly userId: string }>
}

export function createFirebaseSignupAuth(auth: Auth): SignupAuth {
  return {
    async signUpWithEmail(input) {
      const credential = await createUserWithEmailAndPassword(
        auth,
        input.email,
        input.password,
      )
      return { userId: credential.user.uid }
    },
    async signUpWithGoogle() {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider())
      return { userId: credential.user.uid }
    },
  }
}
