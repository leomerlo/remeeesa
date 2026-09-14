import type { ReactElement } from 'react'
import type { DemoScenario } from './seed'

export type DemoBannerProps = {
  readonly scenario: DemoScenario
}

// Unmissable on purpose: this page looks exactly like the real app, and
// nothing typed into it is saved anywhere. It also carries the link to the
// other scenario, so there is no URL to remember.
export function DemoBanner({ scenario }: DemoBannerProps): ReactElement {
  const other: DemoScenario = scenario === 'nueva' ? 'completa' : 'nueva'
  return (
    <div className="bg-primary text-primary-foreground flex w-full flex-wrap items-center justify-center gap-x-3 px-4 py-2 text-xs">
      <span className="font-medium">
        Demo · {scenario === 'nueva' ? 'cuenta nueva' : 'casa con datos'}
        <span className="font-normal opacity-70"> · nada se guarda</span>
      </span>
      <a
        href={`/demo.html?seed=${other}`}
        className="font-medium underline underline-offset-2"
      >
        Ver {other === 'nueva' ? 'cuenta nueva' : 'casa con datos'}
      </a>
    </div>
  )
}
