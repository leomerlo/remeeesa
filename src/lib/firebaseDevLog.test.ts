import { afterEach, describe, expect, it, vi } from 'vitest'
import { logFirebaseError } from './firebaseDevLog'

describe('logFirebaseError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs structured Firebase error details in dev', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    logFirebaseError(
      {
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
        name: 'FirebaseError',
      },
      'updateExpense',
      { expenseId: 'e1' },
    )

    if (import.meta.env.DEV) {
      expect(consoleError).toHaveBeenCalledWith(
        '[remeeesa:firebase] updateExpense failed',
        {
          code: 'permission-denied',
          message: 'Missing or insufficient permissions.',
          name: 'FirebaseError',
          customData: undefined,
          stack: undefined,
        },
        { expenseId: 'e1' },
      )
    } else {
      expect(consoleError).not.toHaveBeenCalled()
    }
  })
})
