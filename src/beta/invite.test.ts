import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimInviteFromAddress,
  heldInvite,
  holdInvite,
  inviteLink,
  tokenFromPaste,
} from './invite'

const TOKEN = '3f0a2b1c-9d4e-4f6a-8b2c-7e1d5a0c3b99'

describe('reading the code out of whatever was pasted', () => {
  it('takes the code on its own', () => {
    expect(tokenFromPaste(TOKEN)).toBe(TOKEN)
    expect(tokenFromPaste(`  ${TOKEN}  `)).toBe(TOKEN)
  })

  it('takes it out of the link the beta hands out', () => {
    expect(tokenFromPaste(`https://remeeesa.app/#/unirme/${TOKEN}`)).toBe(TOKEN)
  })

  it('takes it out of the v1’s link too, which is what people still have', () => {
    expect(tokenFromPaste(`https://remeeesa.app/join/${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromPaste(`https://remeeesa.app/join/${TOKEN}/`)).toBe(TOKEN)
  })

  it('leaves the dashes alone, because the code is a uuid', () => {
    expect(tokenFromPaste(TOKEN)).toContain('-')
  })

  it('says nothing when nothing was pasted', () => {
    expect(tokenFromPaste('')).toBe('')
    expect(tokenFromPaste('   ')).toBe('')
  })

  it('writes the link the way the entry point reads it back', () => {
    const link = inviteLink({ origin: 'https://remeeesa.app', token: TOKEN })
    expect(link).toBe(`https://remeeesa.app/#/unirme/${TOKEN}`)
    expect(tokenFromPaste(link)).toBe(TOKEN)
  })
})

describe('holding the code until there is somebody to join as', () => {
  beforeEach(() => {
    holdInvite(null)
  })

  it('keeps it and gives it back', () => {
    expect(heldInvite()).toBeNull()
    holdInvite(TOKEN)
    expect(heldInvite()).toBe(TOKEN)
    holdInvite(null)
    expect(heldInvite()).toBeNull()
  })

  it('takes a code out of the address and puts it away before anything renders', () => {
    const kept = claimInviteFromAddress({
      hash: `#/unirme/${TOKEN}`,
      pathname: '/',
    })

    expect(kept).toBe(TOKEN)
    expect(heldInvite()).toBe(TOKEN)
    // And out of the address, so a reload does not spend it again.
    expect(window.location.hash).not.toContain(TOKEN)
  })

  it('leaves an ordinary address alone', () => {
    expect(
      claimInviteFromAddress({ hash: '#/gastos', pathname: '/' }),
    ).toBeNull()
    expect(heldInvite()).toBeNull()
  })
})
