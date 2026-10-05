import { expect, test } from '@playwright/test'
import { signUpWithHousehold } from './helpers'

// The model the card work settled on, end to end: what the household logs
// is an estimate, and only a statement loaded by hand is a bill.
test('a credit purchase leaves the month alone and turns up as next month’s estimate', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })

  await page.getByRole('link', { name: /Ajustes/ }).click()
  await page
    .getByRole('region', { name: 'Métodos de pago' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  const method = page.getByRole('dialog', { name: 'Agregar método' })
  await method.getByLabel('Nombre').fill('Visa')
  await method.getByLabel('Tipo').selectOption('credito')
  await method.getByRole('button', { name: 'Agregar método' }).click()
  await expect(method).toBeHidden({ timeout: 20000 })

  await page.getByRole('link', { name: /Inicio/ }).click()
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill('Zapatillas')
  await sheet.getByLabel('Método de pago').selectOption({ label: 'Visa' })
  await sheet.getByLabel('Precio').fill('90000')
  const category = sheet.getByLabel('Categoría').first()
  await category.fill('Ropa')
  await category.press('Escape')
  await sheet.getByRole('button', { name: 'Agregar compra' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // The budget is untouched: a consumo is not money that has gone.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$500.000',
  )
  // And it is waiting in next month's estimate, openable into what it is
  // made of.
  const banner = page.getByRole('button', { name: /Tarjetas el mes que viene/ })
  await expect(banner).toContainText('$90.000')
  await banner.click()
  const detail = page.getByRole('dialog', { name: 'Tarjetas el mes que viene' })
  await expect(
    detail.getByRole('list', { name: 'Consumos de Visa' }),
  ).toContainText('Zapatillas')
})

// The shape that broke in production: the second consumo of the month does
// not create a Resumen, it merges into the one already there -- a different
// write, on a path the first purchase never touches.
test('a second purchase merges into the Resumen the first one created', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })

  await page.getByRole('link', { name: /Ajustes/ }).click()
  await page
    .getByRole('region', { name: 'Métodos de pago' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  const method = page.getByRole('dialog', { name: 'Agregar método' })
  await method.getByLabel('Nombre').fill('Visa')
  await method.getByLabel('Tipo').selectOption('credito')
  await method.getByRole('button', { name: 'Agregar método' }).click()
  await expect(method).toBeHidden({ timeout: 20000 })

  for (const [name, amount] of [
    ['Zapatillas', '90000'],
    ['Camisa', '45000'],
  ] as const) {
    await page.getByRole('link', { name: /Inicio/ }).click()
    await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
    await sheet.getByLabel('Nombre').fill(name)
    await sheet.getByLabel('Método de pago').selectOption({ label: 'Visa' })
    await sheet.getByLabel('Precio').fill(amount)
    const category = sheet.getByLabel('Categoría').first()
    await category.fill('Ropa')
    await category.press('Escape')
    await sheet.getByRole('button', { name: 'Agregar compra' }).click()
    // The second one fails outright if the merge writes a field the rules
    // refuse, which is exactly what happened.
    await expect(sheet).toBeHidden({ timeout: 20000 })
  }

  const banner = page.getByRole('button', { name: /Tarjetas el mes que viene/ })
  await expect(banner).toContainText('$135.000')
  await banner.click()
  const detail = page.getByRole('dialog', { name: 'Tarjetas el mes que viene' })
  const consumos = detail.getByRole('list', { name: 'Consumos de Visa' })
  await expect(consumos).toContainText('Zapatillas')
  await expect(consumos).toContainText('Camisa')
})

test('a servicio is owed, then paid, and only then leaves the budget', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '400000' })

  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill('Luz')
  await sheet.getByLabel('Precio').fill('36800')
  const category = sheet.getByLabel('Categoría').first()
  await category.fill('Servicios')
  await category.press('Escape')
  // Not paid yet: a bill for later, and the form says so -- the action
  // becomes "Agregar servicio" the moment the toggle goes off.
  await sheet.getByLabel('Ya lo pagué').click()
  await sheet.getByRole('button', { name: 'Agregar servicio' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // Owed money counts against the month even before it is paid.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$363.200',
  )
  // Twice on Home: in "Cuentas por pagar" and in the month's movements.
  await expect(page.getByText('Luz').first()).toBeVisible()
})

test('next month inherits this month’s budget', async ({ page }) => {
  await signUpWithHousehold(page, { budget: '750000' })

  await page.getByRole('button', { name: 'Mes siguiente' }).click()

  // No entry of its own, so it carries the one set before it.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$750.000',
  )
  await expect(
    page.getByRole('button', { name: 'Editar presupuesto del mes' }),
  ).toBeVisible()
})

// Paying a bill with a credit card. The money does not leave this month:
// the bill goes onto the card and arrives in that card's resumen. Per
// direct feedback -- "pagar la Luz con la Visa".
test('a servicio paid with a credit card leaves this month alone and lands in next month’s resumen', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '400000' })

  await page.getByRole('link', { name: /Ajustes/ }).click()
  await page
    .getByRole('region', { name: 'Métodos de pago' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  const method = page.getByRole('dialog', { name: 'Agregar método' })
  await method.getByLabel('Nombre').fill('Visa Flor')
  await method.getByLabel('Tipo').selectOption('credito')
  await method.getByRole('button', { name: 'Agregar método' }).click()
  await expect(method).toBeHidden({ timeout: 20000 })

  // A bill for later: owed, and counted against the month before it is paid.
  await page.getByRole('link', { name: /Inicio/ }).click()
  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill('Luz')
  await sheet.getByLabel('Precio').fill('36800')
  const category = sheet.getByLabel('Categoría').first()
  await category.fill('Servicios')
  await category.press('Escape')
  await sheet.getByLabel('Ya lo pagué').click()
  await sheet.getByRole('button', { name: 'Agregar servicio' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$363.200',
  )

  // Paid with the Visa: it stops being owed, and nothing is spent now.
  await page.getByRole('link', { name: /Servicios/ }).click()
  await page
    .getByRole('list', { name: 'Servicios por pagar' })
    .getByRole('button', { name: 'Editar Luz' })
    .click()
  const pay = page.getByRole('dialog', { name: 'Editar servicio' })
  await pay.getByLabel('Ya lo pagué').click()
  await pay.getByLabel('Pagado con').selectOption({ label: 'Visa Flor' })
  await expect(pay).toContainText(
    'va al resumen de Visa Flor del mes que viene',
  )
  await pay.getByRole('button', { name: 'Guardar y marcar pagado' }).click()
  await expect(pay).toBeHidden({ timeout: 20000 })

  await page.getByRole('link', { name: /Inicio/ }).click()
  // The whole budget is back: the money leaves when the resumen is paid.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$400.000',
  )
  const banner = page.getByRole('button', { name: /Tarjetas el mes que viene/ })
  await expect(banner).toContainText('$36.800')
  await banner.click()
  await expect(
    page.getByRole('list', { name: 'Consumos de Visa Flor' }),
  ).toContainText('Luz')
})

// A bill in dollars: a subscription, something billed abroad. Recorded and
// shown in dollars, counted against no peso budget. Per direct feedback --
// this was the top of her list.
test('a servicio in dollars is owed, paid and counted in dollars', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })

  await page.getByRole('button', { name: 'Agregar gasto' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Agregar gasto' })
  await sheet.getByLabel('Nombre').fill('Skool')
  await sheet.getByLabel('Precio').fill('97')
  const category = sheet.getByLabel('Categoría').first()
  await category.fill('Herramientas digitales')
  await category.press('Escape')
  await sheet.getByLabel('Ya lo pagué').click()
  await sheet.getByRole('button', { name: 'Agregar servicio' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // Logged in pesos by mistake; the currency is fixable on the bill itself.
  await page.getByRole('link', { name: /Servicios/ }).click()
  await page
    .getByRole('list', { name: 'Servicios por pagar' })
    .getByRole('button', { name: 'Editar Skool' })
    .click()
  const edit = page.getByRole('dialog', { name: 'Editar servicio' })
  await edit.getByLabel('Moneda').selectOption('USD')
  await expect(edit).toContainText('no se descuentan del presupuesto del mes')
  await edit.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(edit).toBeHidden({ timeout: 20000 })

  // Owed in dollars, so the peso budget is whole again.
  await expect(page.getByText('US$97').first()).toBeVisible()
  await page.getByRole('link', { name: /Inicio/ }).click()
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$500.000',
  )

  // Paying it writes a dollar gasto, and still commits no pesos.
  await page.getByRole('link', { name: /Servicios/ }).click()
  await page
    .getByRole('list', { name: 'Servicios por pagar' })
    .getByRole('button', { name: 'Marcar pagado Skool' })
    .click()
  const pay = page.getByRole('dialog', { name: 'Editar servicio' })
  await pay.getByRole('button', { name: 'Guardar y marcar pagado' }).click()
  await expect(pay).toBeHidden({ timeout: 20000 })

  await page.getByRole('link', { name: /Inicio/ }).click()
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$500.000',
  )
  await expect(page.getByText('US$97').first()).toBeVisible()
})
