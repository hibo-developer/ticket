import { describe, expect, it } from 'vitest'

import { resolveAuthRedirectUrl } from '@/core/auth/redirect'

describe('resolveAuthRedirectUrl', () => {
  it('usa la variable configurada cuando existe', () => {
    expect(
      resolveAuthRedirectUrl({
        configuredUrl: 'https://ticket-cotepa.netlify.app/welcome?token=demo',
        runtimeOrigin: 'http://localhost:5173',
        isProduction: true,
      }),
    ).toBe('https://ticket-cotepa.netlify.app')
  })

  it('usa el origen en tiempo real cuando no hay variable configurada', () => {
    expect(
      resolveAuthRedirectUrl({
        runtimeOrigin: 'https://ticket-cotepa.netlify.app',
        isProduction: true,
      }),
    ).toBe('https://ticket-cotepa.netlify.app')
  })

  it('cae en localhost solo en desarrollo', () => {
    expect(resolveAuthRedirectUrl({ isProduction: false })).toBe('http://localhost:5173')
  })

  it('cae en Netlify en producción cuando no hay origen disponible', () => {
    expect(resolveAuthRedirectUrl({ isProduction: true })).toBe('https://ticket-cotepa.netlify.app')
  })

  it('ignora URLs mal formadas', () => {
    expect(
      resolveAuthRedirectUrl({
        configuredUrl: 'no-es-una-url',
        runtimeOrigin: 'https://ticket-cotepa.netlify.app/reset',
        isProduction: true,
      }),
    ).toBe('https://ticket-cotepa.netlify.app')
  })
})
