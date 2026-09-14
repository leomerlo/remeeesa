const ONBOARDING_STORAGE_KEY = 'remeeesa.onboarding_finished'

function canUseLocalStorage(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      typeof localStorage.getItem === 'function' &&
      typeof localStorage.setItem === 'function'
    )
  } catch {
    return false
  }
}

// Remembered per device, the same way hasReturningUser is. The checklist's
// three steps are derived from the household's own data, so this flag is
// only a shortcut: once they have all been done, the card stops asking the
// database about them on every visit to Home. A second device works out the
// same answer once and then records it too.
export function hasFinishedOnboarding(): boolean {
  if (!canUseLocalStorage()) {
    return false
  }
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
}

export function markOnboardingFinished(): void {
  if (!canUseLocalStorage()) {
    return
  }
  localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
}
