import { expect, test } from '@playwright/test'
import { addGasto, signUpWithHousehold } from './helpers'

// Editing a gasto, against the real rules. This is the half the other
// suites cannot reach: every rule these exercise is one that let the write
// through in the in-memory adapter and refused it in production.

test('the method a gasto was paid with can be corrected afterwards', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })

  await page.getByRole('link', { name: /Ajustes/ }).click()
  await page
    .getByRole('region', { name: 'Métodos de pago' })
    .getByRole('button', { name: 'Agregar', exact: true })
    .click()
  const method = page.getByRole('dialog', { name: 'Agregar método' })
  await method.getByLabel('Nombre').fill('Débito Galicia')
  await method.getByLabel('Tipo').selectOption('debito')
  await method.getByRole('button', { name: 'Agregar método' }).click()
  await expect(method).toBeHidden({ timeout: 20000 })

  // Logged as cash, which is the default and therefore the easy mistake.
  await page.getByRole('link', { name: /Inicio/ }).click()
  await addGasto(page, { name: 'Nafta', amount: '54000', category: 'Auto' })

  await page.getByRole('button', { name: 'Editar Nafta' }).click()
  const sheet = page.getByRole('dialog', { name: 'Editar gasto' })
  await expect(sheet.getByLabel('Método de pago')).toHaveValue('')
  await sheet
    .getByLabel('Método de pago')
    .selectOption({ label: 'Débito Galicia' })
  await sheet.getByRole('button', { name: 'Guardar cambios' }).click()
  // Firestore accepted it -- an update the rules refused would leave the
  // sheet open with the refusal on it.
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // Still one gasto, still the same money: a debit method settles now.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$446.000',
  )
  await page.getByRole('button', { name: 'Editar Nafta' }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Editar gasto' })
      .getByLabel('Método de pago'),
  ).toHaveValue(/.+/)
})

test('a gasto switched to Recurrente becomes a real servicio, spent once', async ({
  page,
}) => {
  await signUpWithHousehold(page, { budget: '500000' })
  await addGasto(page, { name: 'Gimnasio', amount: '30000', category: 'Salud' })
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$470.000',
  )

  await page.getByRole('button', { name: 'Editar Gimnasio' }).click()
  const sheet = page.getByRole('dialog', { name: 'Editar gasto' })
  await sheet.getByLabel('Recurrente').click()
  await sheet.getByRole('button', { name: 'Guardar como servicio' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // The money went out exactly once: it is now a paid servicio rather than
  // a plain gasto, and the budget has not moved.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$470.000',
  )
  await page.getByRole('link', { name: /Servicios/ }).click()
  await expect(page.getByText('Gimnasio')).toBeVisible()

  // And its recurrence is on the Pendiente, where "Traer del mes pasado"
  // can find it -- which is the whole point of the switch.
  await page.getByRole('button', { name: 'Editar Gimnasio' }).click()
  await expect(page.getByRole('dialog').getByLabel('Recurrente')).toBeChecked()
})

test('a gasto marked unpaid goes back to being owed', async ({ page }) => {
  await signUpWithHousehold(page, { budget: '500000' })
  await addGasto(page, { name: 'Luz', amount: '36800', category: 'Servicios' })
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$463.200',
  )

  await page.getByRole('button', { name: 'Editar Luz' }).click()
  const sheet = page.getByRole('dialog', { name: 'Editar gasto' })
  await sheet.getByLabel('Ya lo pagué').click()
  await sheet.getByRole('button', { name: 'Guardar y marcar impago' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // Still budgeted for -- a bill you owe counts against the month exactly
  // like one you paid -- but now it is owed, and it can be paid.
  await expect(page.getByRole('status', { name: /^Te quedan/ })).toContainText(
    '$463.200',
  )
  await page.getByRole('link', { name: /Servicios/ }).click()
  await expect(
    page
      .getByRole('list', { name: 'Servicios por pagar' })
      .getByRole('button', { name: 'Marcar pagado Luz' }),
  ).toBeVisible()
})
