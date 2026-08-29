import { afterEach, describe, expect, it } from 'vitest'
import { hasReturningUser, markReturningUser } from './returningUserStorage'

describe('returningUserStorage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('starts false when nothing is stored', () => {
    expect(hasReturningUser()).toBe(false)
  })

  it('returns true after markReturningUser', () => {
    markReturningUser()

    expect(hasReturningUser()).toBe(true)
  })
})
