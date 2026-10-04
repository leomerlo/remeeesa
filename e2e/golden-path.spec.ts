import { expect, test } from '@playwright/test'
import { addGasto, signUpWithHousehold } from './helpers'

// The journeys a household actually makes, end to end: a real browser, the
// real Firestore adapter and the real rules. Everything else in this
// project stops short of one of those three.

test('a new household signs up, sets a budget and logs its first gasto', async ({
  page,
}) => {
  await signUpWithHousehold(page, { name: 'Casa Verde', budget: '1000000' })

  // Its own figure, straight from Firestore.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$1.000.000',
  )
  // A household of one with nothing logged is asked whether anyone else
  // lives there.
  await expect(
    page.getByRole('heading', { name: '¿Son dos o más en la casa?' }),
  ).toBeVisible()

  await addGasto(page, {
    name: 'Verdulería',
    amount: '12500',
    category: 'Comida',
  })

  await expect(page.getByText('Verdulería')).toBeVisible()
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$987.500',
  )
})

test('a gasto reaches Histórico and Categorías, counted once', async ({
  page,
}) => {
  await signUpWithHousehold(page)
  await addGasto(page, { name: 'Farmacia', amount: '30000', category: 'Salud' })

  await page.getByRole('link', { name: /Histórico/ }).click()
  await expect(page.getByText('Farmacia')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Total del mes' }),
  ).toBeVisible()

  await page.getByRole('link', { name: /Categorías/ }).click()
  const breakdown = page.getByRole('list', { name: 'Gastos por categoría' })
  await expect(breakdown).toContainText('Salud')
  await expect(breakdown).toContainText('$30.000')
})

test('a dollar gasto is recorded, shown in dollars and left out of the budget', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })

  // Cash is pesos, so dollars need a method of their own -- which is the
  // shape the payment-method work settled on.
  await page.getByRole('link', { name: /Ajustes/ }).click()
  await page
    .getByRole('region', { name: 'Métodos de pago' })
    // Exactly "Agregar": the empty state offers "Agregar método" too.
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  const method = page.getByRole('dialog', { name: 'Agregar método' })
  await method.getByLabel('Nombre').fill('Efectivo USD')
  await method.getByLabel('Tipo').selectOption('efectivo')
  await method.getByLabel('Moneda').selectOption('USD')
  await method.getByRole('button', { name: 'Agregar método' }).click()
  await expect(method).toBeHidden({ timeout: 20000 })

  await page.getByRole('link', { name: /Inicio/ }).click()
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill('Hosting')
  await sheet
    .getByLabel('Método de pago')
    .selectOption({ label: 'Efectivo USD' })
  await sheet.getByLabel('Precio').fill('45')
  const category = sheet.getByLabel('Categoría').first()
  await category.fill('Servicios')
  await category.press('Escape')
  await sheet.getByRole('button', { name: 'Agregar gasto' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // Recorded in its own currency -- on its row and in the month's own
  // dollar line -- and counted in no peso total.
  await expect(page.getByText('US$45').first()).toBeVisible()
  await expect(page.getByText('y US$45')).toBeVisible()
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$500.000',
  )
})
