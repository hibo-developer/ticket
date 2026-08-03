import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) {
  ;(globalThis as any).crypto = webcrypto as any
}

if (!(globalThis.crypto as any).randomUUID) {
  ;(globalThis.crypto as any).randomUUID = () => '00000000-0000-0000-0000-000000000000'
}
