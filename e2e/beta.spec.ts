import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { freshEmail } from './helpers'

// The beta, end to end: a real browser, the real Firestore adapter and the
// real rules. The other specs in here drive the v1 through `/`; the beta is
// a second entry point on the same branch (ADR 0007) and had no
// browser-level coverage at all, so the only thing standing between a
// broken journey and the household was somebody opening the app and
// noticing.
//
// That matters more here than the count of tests suggests. The arithmetic
// is audited in src/beta/figures.test.ts, but an audit of figures.ts proves
// nothing about what a screen renders -- this branch already produced that
// exact failure once, with the audited projection and the on-screen one
// having quietly drifted apart. These three journeys are the part no unit
// test can reach: the screens, the adapter and the rules running together.

const PASSWORD = 'remeeesa-e2e'

// Sign up and walk the beta's own onboarding, the way somebody opening it
// for the first time does. Its four steps are where the v1's suite found
// its one real bug -- a brand-new household had no navigation until the
// page was reloaded -- so the journey starts at the sign-up screen rather
// than at a household somebody else made.
async function signUpBeta(
  page: Page,
  options: {
    readonly name?: string
    readonly budget?: string
    // A credit card named here is created in step 1, which is the only
    // place a household says it has one before it starts spending.
    readonly creditCard?: string
  } = {},
): Promise<void> {
  await page.goto('/beta.html')

  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await page.getByLabel('Correo').fill(freshEmail())
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click()

  await page
    .getByLabel('Nombre del hogar')
    .fill(options.name ?? 'Casa Beta', { timeout: 20000 })
  await page.getByRole('button', { name: 'Continuar' }).click()

  if (options.creditCard !== undefined) {
    await page.getByRole('checkbox', { name: /^Crédito/ }).click()
    await page
      .getByLabel('¿Qué tarjeta de crédito tenés?')
      .fill(options.creditCard)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()
    // The card is a chip once it is named: it is only written to Firestore
    // when the budget step saves, so the chip is the only sign it took.
    await expect(page.getByText(options.creditCard)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Continuar' }).click()

  await page.getByLabel('Presupuesto mensual').fill(options.budget ?? '1000000')
  await page.getByRole('button', { name: 'Guardar el presupuesto' }).click()
  await page
    .getByRole('button', { name: 'Ir a mi hogar' })
    .click({ timeout: 20000 })

  // The household is usable once the nav is there -- not once the first
  // figure is. They arrive on separate reads, and the v1's bug lived in
  // exactly that gap.
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Servicios' }),
  ).toBeVisible({ timeout: 20000 })
}

// Agregar un servicio, from the screen that owns it.
async function addServicio(
  page: Page,
  servicio: {
    readonly name: string
    readonly amount: string
    // The name of the method as the dropdown lists it. Left out, the bill
    // is paid in cash, which is what a household has without creating it.
    readonly method?: string
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Agregar un servicio' }).click()
  const sheet = page.getByRole('dialog', { name: 'Agregar un servicio' })
  await sheet.getByLabel('¿Qué servicio es?').fill(servicio.name)
  if (servicio.method !== undefined) {
    // The method is a listbox that opens into the form rather than over
    // it: the sheet's body is what scrolls, and anything floating inside
    // a scrolling box gets cut off by it.
    await sheet.getByRole('button', { name: /¿Con qué se paga\?/ }).click()
    await sheet
      .getByRole('option', { name: new RegExp(`^${servicio.method}`) })
      .click()
  }
  await sheet.getByLabel('Cuánto').fill(servicio.amount)
  await sheet.getByRole('button', { name: 'Agregar' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })
}

test('a new household signs up, sets a budget and anota su primer gasto', async ({
  page,
}) => {
  await signUpBeta(page, { name: 'Casa Beta', budget: '1000000' })

  // Its own figure, read back out of Firestore rather than out of the form
  // that set it.
  await expect(page.getByText('Le queda al hogar este mes')).toBeVisible()
  // .first(): with nothing spent yet, what is left and the budget itself
  // are the same figure, and the hero prints both.
  await expect(page.getByText('$1.000.000').first()).toBeVisible({
    timeout: 20000,
  })

  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotar un gasto' })
  await sheet.getByLabel('¿Qué fue?').fill('Verdulería')
  await sheet.getByLabel('Cuánto').fill('12500')
  // Every household starts with the same six categories, seeded when it is
  // created -- so this is a choice, not a new category.
  await sheet.getByLabel('Categoría').selectOption({ label: 'Comida' })
  await sheet.getByRole('button', { name: 'Anotar' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  await expect(page.getByText('Verdulería')).toBeVisible()
  // And the month is smaller by exactly what was spent, which is the whole
  // point of the screen.
  await expect(page.getByText('$987.500')).toBeVisible({ timeout: 20000 })
})

test('a servicio is created, paid, and arrives among the month gastos', async ({
  page,
}) => {
  await signUpBeta(page, { budget: '1000000' })
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Servicios' })
    .click()

  await expect(
    page.getByRole('heading', { name: /No hubo servicios/ }),
  ).toBeVisible()
  await addServicio(page, { name: 'Luz', amount: '36800' })

  // Owed, and counted as owed.
  await expect(page.getByText('Falta pagar')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('1 servicio sin pagar')).toBeVisible()
  await expect(page.getByText('$36.800').first()).toBeVisible()

  await page.getByRole('button', { name: 'Ya lo pagué' }).click()
  const paying = page.getByRole('dialog', { name: 'Pagar Luz' })
  await paying.getByRole('button', { name: 'Marcar como pagado' }).click()
  await expect(paying).toBeHidden({ timeout: 20000 })

  // Nothing left owed, and the bill has moved to the settled half of the
  // screen.
  await expect(page.getByText(/^Pagaron todo en/)).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByRole('heading', { name: 'Ya pagados' })).toBeVisible()

  // Paying a servicio writes a gasto -- that is how the money leaves the
  // month -- so it is in Gastos, under the name of the bill.
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Gastos' })
    .click()
  await expect(page.getByText('Luz')).toBeVisible({ timeout: 20000 })
})

// Her own case: Edenor on débito automático with the Visa. The money is
// never going to leave this month -- the bank puts it on the card and it
// arrives in the card's resumen -- so the month's side of Servicios has no
// business listing it.
//
// This is also the only test anywhere that exercises a bill's
// payment_method_id against the real rules. The field is new, the rules
// that admit it were published by hand, and a rule that forbids what the
// app writes passes every suite that does not run them.
test('a servicio a credit card pays lands on Con tarjeta, not on the month', async ({
  page,
}) => {
  await signUpBeta(page, { budget: '1000000', creditCard: 'Visa Galicia' })
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Servicios' })
    .click()

  await addServicio(page, {
    name: 'Edenor',
    amount: '42000',
    method: 'Visa Galicia',
  })

  // Not on the month: not in its list, and not in its figure. The month
  // has nothing in it at all, which is what the empty state says.
  await expect(
    page.getByRole('heading', { name: /No hubo servicios/ }),
  ).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText('Edenor')).toBeHidden()

  await page.getByRole('button', { name: 'Con tarjeta' }).click()

  await expect(page.getByText('Edenor')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/que paga la tarjeta$/)).toBeVisible()
  // Twice over: the tab's own figure, and the row's.
  await expect(page.getByText('$42.000')).toHaveCount(2)
})
