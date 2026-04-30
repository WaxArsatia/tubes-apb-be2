export function iso(value: Date | string | null) {
  if (!value) return null
  return new Date(value).toISOString()
}

export function restoreExpiresAt() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString()
}

export function isExpired(value: Date | string | null) {
  return !value || new Date(value).getTime() < Date.now()
}
