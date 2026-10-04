import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Each spec starts from a household nobody else has touched: the emulator
// is shared across the whole run, so a fixed email would make the second
// spec a login instead of a sign-up.
export function freshEmail(): string {
  return `casa-${String(Date.now())}-${String(Math.floor(Math.random() * 10000))}@example.com`
}

// Sign up and create the household, the way a new user does it: the real
// auth emulator, the real Firestore, the real rules.
export async function signUpWithHousehold(
  page: Page,
  options: { readonly name?: string; readonly budget?: string } = {},
): Promise<void> {
  await page.goto('/')
  // The household comes first and the account second: you say what you are
  // setting up before you are asked who you are.
  await page.getByLabel('Nombre del hogar').fill(options.name ?? 'Casa E2E')
  await page.getByLabel('Presupuesto mensual').fill(options.budget ?? '1000000')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await page.getByLabel('Email').fill(freshEmail())
  await page.getByLabel('Contraseña').fill('remeeesa-e2e')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  // Home is up once the budget card has rendered its figure...
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toBeVisible({
    timeout: 20000,
  })
  // ...and the app is usable once the nav is there too. It arrives on its
  // own read of the membership, a beat after the page's, so a spec that
  // navigates straight away would race it.
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Inicio' }),
  ).toBeVisible({ timeout: 20000 })
}

// The one add form, opened from wherever the screen offers it.
export async function addGasto(
  page: Page,
  gasto: {
    readonly name: string
    readonly amount: string
    readonly category: string
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill(gasto.name)
  await sheet.getByLabel('Precio').fill(gasto.amount)
  // The category is a combobox: typing opens its list, and the list sits
  // over the form. Escape closes it, keeping the typed name -- a category
  // that does not exist yet is created on submit.
  // .first(): the combobox's own listbox is labelled for assistive
  // technology too, so the plain label matches two elements.
  const category = sheet.getByLabel('Categoría').first()
  await category.fill(gasto.category)
  await category.press('Escape')
  await sheet.getByRole('button', { name: 'Agregar gasto' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })
}
