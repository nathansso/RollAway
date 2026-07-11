/** Stable per-device session id, persisted in localStorage. */

const KEY = 'rollaway.session_id'

export function getSessionId(): string {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
