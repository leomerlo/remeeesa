import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'

export function App(): ReactElement {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-8 px-6">
      <h1 className="font-display text-2xl tracking-tight">remeeesa</h1>

      <div className="flex items-center gap-1">
        <Button variant="outline">this month</Button>
        <Button variant="ghost">all time</Button>
      </div>

      <p className="font-display text-5xl tracking-tight">$301.95</p>

      <div className="flex items-center gap-2">
        <Button>Add expense</Button>
        <Button variant="outline">Cancel</Button>
      </div>
    </main>
  )
}
