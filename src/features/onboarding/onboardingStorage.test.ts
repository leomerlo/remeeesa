import { afterEach, describe, expect, it } from 'vitest'
import {
  hasFinishedOnboarding,
  markOnboardingFinished,
} from './onboardingStorage'

describe('onboardingStorage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('starts false when nothing is stored', () => {
    expect(hasFinishedOnboarding()).toBe(false)
  })

  it('returns true after markOnboardingFinished', () => {
    markOnboardingFinished()

    expect(hasFinishedOnboarding()).toBe(true)
  })

  it('does not collide with the returning-user flag', () => {
    localStorage.setItem('remeeesa.returning_user', '1')

    expect(hasFinishedOnboarding()).toBe(false)
  })
})
