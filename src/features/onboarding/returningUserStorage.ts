const RETURNING_USER_STORAGE_KEY = 'remeeesa.returning_user'

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

export function hasReturningUser(): boolean {
  if (!canUseLocalStorage()) {
    return false
  }
  return localStorage.getItem(RETURNING_USER_STORAGE_KEY) === '1'
}

export function markReturningUser(): void {
  if (!canUseLocalStorage()) {
    return
  }
  localStorage.setItem(RETURNING_USER_STORAGE_KEY, '1')
}
