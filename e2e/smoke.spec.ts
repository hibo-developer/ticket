import { expect, test } from '@playwright/test'

test('carga la pantalla de login', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Iniciar sesión')).toBeVisible()
})

