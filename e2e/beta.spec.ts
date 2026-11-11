import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { freshEmail } from './helpers'

// The app, end to end: a real browser, the real Firestore adapter and the
// real rules. These three journeys walk the screens people actually use;
// the other specs in here drive the old app, which is still built at
// /v1/ as the way back (ADR 0008).
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
  await page.goto('/')

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

// A servicio is born in "anotar un gasto" with "todos los meses" on,
// the way the v1 does it -- Servicios has no add button of its own any
// more, by her decision.
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
  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotar un gasto' })
  await sheet.getByLabel('¿Qué fue?').fill(servicio.name)
  if (servicio.method !== undefined) {
    // The method is a listbox that opens into the form rather than over
    // it: the sheet's body is what scrolls, and anything floating inside
    // a scrolling box gets cut off by it.
    await sheet.getByRole('button', { name: /¿Con qué lo pagaron\?/ }).click()
    await sheet
      .getByRole('option', { name: new RegExp(`^${servicio.method}`) })
      .click()
  }
  await sheet.getByLabel('Cuánto').fill(servicio.amount)
  // What makes it a servicio rather than a one-off: it comes back every
  // month, and it has not been paid yet.
  await sheet.getByRole('switch', { name: /Ya lo pagué/ }).click()
  await sheet.getByRole('switch', { name: /Todos los meses/ }).click()
  await sheet.getByRole('button', { name: 'Anotar' }).click()
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
  await expect(page.getByText('$ 1.000.000').first()).toBeVisible({
    timeout: 20000,
  })

  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotar un gasto' })
  await sheet.getByLabel('¿Qué fue?').fill('Verdulería')
  await sheet.getByLabel('Cuánto').fill('12500')
  // Every household starts with the same six categories, seeded when it is
  // created -- so this is a choice, not a new category. The field is a
  // list with a box over it: the box narrows what the household has, and
  // when nothing matches it is where a new name is typed.
  await sheet.getByLabel('Categoría').fill('Comida')
  await sheet.getByRole('option', { name: 'Comida' }).click()
  await sheet.getByRole('button', { name: 'Anotar' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  await expect(page.getByText('Verdulería')).toBeVisible()
  // And the month is smaller by exactly what was spent, which is the whole
  // point of the screen.
  await expect(page.getByText('$ 987.500')).toBeVisible({ timeout: 20000 })
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
  await expect(page.getByText('Servicios que faltan pagar')).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText('1 servicio sin pagar')).toBeVisible()
  await expect(page.getByText('$ 36.800').first()).toBeVisible()

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

// Going to pay a bill without the whole figure in hand. Three layers have
// to agree for this to work at all -- the form, the transaction that
// writes the gasto and moves the bill's running total, and the rule that
// ties the two together with getAfter -- and this is the only place they
// run at once. The rules are published by hand, so a rule that forbids
// what the app writes passes every other suite in the repo.
test('a servicio is part-paid, and the month only counts what is left', async ({
  page,
}) => {
  await signUpBeta(page, { budget: '1000000' })
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Servicios' })
    .click()
  await addServicio(page, { name: 'Expensas', amount: '88000' })

  await expect(page.getByText('Servicios que faltan pagar')).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText('$ 88.000').first()).toBeVisible()

  // Pay $50.000 of it, saying out loud that it is only a part.
  await page.getByRole('button', { name: 'Ya lo pagué' }).click()
  const paying = page.getByRole('dialog', { name: 'Pagar Expensas' })
  await paying.getByLabel('Cuánto pagaron').fill('50000')
  await paying.getByRole('switch', { name: /Pagué solo una parte/ }).click()
  await paying.getByRole('button', { name: 'Guardar lo que pagué' }).click()
  await expect(paying).toBeHidden({ timeout: 20000 })

  // Still open, now asking for the rest and saying how much of how much
  // is in.
  await expect(page.getByText('Ya van $ 50.000 de $ 88.000')).toBeVisible({
    timeout: 20000,
  })
  await expect(page.getByText('$ 38.000').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Pagar lo que falta' }),
  ).toBeVisible()

  // The money that left is a gasto of its own...
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Gastos' })
    .click()
  await expect(page.getByText('Expensas')).toBeVisible({ timeout: 20000 })

  // ...and the month counts it once: $50.000 gone and $38.000 still owed
  // out of a million, not $88.000 owed on top of the $50.000 spent.
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Inicio' })
    .click()
  await expect(page.getByText('$ 912.000')).toBeVisible({ timeout: 20000 })
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

  // In two steps, because that is the only way there is: "anotar un
  // gasto" with a credit card chosen writes a consumo, not a servicio --
  // the form stops asking about months the moment the card is picked. So
  // the servicio is born without a method and told afterwards what pays
  // it, which is exactly the path the household walks.
  await addServicio(page, { name: 'Edenor', amount: '42000' })
  await page.getByRole('button', { name: 'Editar Edenor' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar el servicio' })
  await edit.getByRole('button', { name: /¿Con qué se paga\?/ }).click()
  await edit.getByRole('option', { name: /^Visa Galicia/ }).click()
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit).toBeHidden({ timeout: 20000 })

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
  // The card's own figure, on the panel over both tabs.
  await expect(
    page.getByText('Servicios que pagaste con tarjeta de crédito'),
  ).toBeVisible()
  // Twice over: that figure, and the row's.
  await expect(page.getByText('$ 42.000')).toHaveCount(2)
})

// Naming a category that does not exist yet, from the form that needed
// it. The v1 did this with a native datalist and the redesign dropped
// it, so this is the journey that says it is back -- and the only place
// the new control runs against the real rules, which have to admit a
// category created in the same breath as the gasto filed under it.
test('a category nobody has yet is named while anotando a gasto', async ({
  page,
}) => {
  await signUpBeta(page, { budget: '1000000' })

  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Anotar un gasto' })
  await sheet.getByLabel('¿Qué fue?').fill('Facturas')
  await sheet.getByLabel('Cuánto').fill('6800')
  await sheet.getByLabel('Categoría').fill('Panadería')
  await sheet.getByRole('option', { name: /Crear «Panadería»/ }).click()
  await sheet.getByRole('button', { name: 'Anotar' }).click()
  await expect(sheet).toBeHidden({ timeout: 20000 })

  // The gasto is filed under a category that did not exist a moment ago.
  await expect(page.getByText('Facturas')).toBeVisible({ timeout: 20000 })
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Categorías' })
    .click()
  // .first(): the category is on the screen twice, as its own row and as
  // the badge on the gasto filed under it.
  await expect(page.getByText('Panadería').first()).toBeVisible({
    timeout: 20000,
  })
})
