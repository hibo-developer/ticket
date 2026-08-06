const bus = new EventTarget()

const EVENT_NAME = 'permissions:invalidated'

export function invalidatePermissions() {
  bus.dispatchEvent(new Event(EVENT_NAME))
}

export function onPermissionsInvalidated(cb: () => void): () => void {
  const handler = () => cb()
  bus.addEventListener(EVENT_NAME, handler)
  return () => bus.removeEventListener(EVENT_NAME, handler)
}
