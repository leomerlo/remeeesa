import type { ReactElement } from 'react'
import { DEMO_SCENARIOS } from './seed'
import type { DemoScenario } from './seed'

export type DemoBannerProps = {
  readonly scenario: DemoScenario
}

const SCENARIOS = Object.entries(DEMO_SCENARIOS) as readonly (readonly [
  DemoScenario,
  { readonly label: string },
])[]

// Unmissable on purpose: this page looks exactly like the real app, and
// nothing typed into it is saved anywhere. It also carries every other
// scenario, so there is no URL to remember -- the budget states in
// particular are only worth anything side by side.
export function DemoBanner({ scenario }: DemoBannerProps): ReactElement {
  return (
    <div className="bg-primary text-primary-foreground flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
      <span className="font-medium">
        Demo
        <span className="font-normal opacity-70"> · nada se guarda</span>
      </span>
      {SCENARIOS.map(([name, { label }]) => (
        <a
          key={name}
          href={`/demo.html?seed=${name}`}
          aria-current={name === scenario ? 'page' : undefined}
          className={
            name === scenario
              ? 'rounded-full bg-white/20 px-2 py-0.5 font-semibold'
              : 'px-2 py-0.5 underline underline-offset-2 opacity-80 hover:opacity-100'
          }
        >
          {label}
        </a>
      ))}
    </div>
  )
}
