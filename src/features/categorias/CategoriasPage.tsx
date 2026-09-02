import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Illustration } from '@/components/Illustration'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'

// Placeholder until the real Categorías feature (breakdown + management,
// story docs/stories/categorias-desglose-y-gestion.md) is built -- gets the
// same page chrome and empty-state illustration as the rest of the app
// instead of a bare, unstyled heading, without inventing functionality that
// isn't there yet.
export function CategoriasPage(): ReactElement {
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <PageHeader title="Categorías" />
      {/* The mascot with a calculator, rather than the shared empty-notes
          one: this screen is about totals and breakdowns, not about a missing
          first entry. */}
      <Illustration src={categoriesCalc} className="mx-auto h-32 w-40" />
      <p role="status" className="text-sm font-medium">
        Próximamente
      </p>
    </div>
  )
}
