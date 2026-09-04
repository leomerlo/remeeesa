import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

// Trimmed from the shadcn output. Variants map onto the reference:
// `outline` is the idle pill, `default` is the inverted active pill, `ghost` is
// the borderless label beside a selected chip. `secondary` and `link` have no
// counterpart, and `destructive` is red, which would break the monochrome rule
// through a component the design system shipped. Emphasis comes from weight and
// inversion instead: a delete action is a solid black pill behind a confirmation.
//
// The per-size `rounded-[min(var(--radius-md), 10px)]` caps are also gone. They
// hard-cap the radius in pixels, which would leave the small sizes as rounded
// rectangles while everything else is a stadium.
//
// Pill is `rounded-full`, a literal Tailwind utility, not a derived token: the
// token system's radius scale (`--radius-2xl`/`--radius-3xl`) covers the
// moderate container track only, since a stadium shape has no "amount" to
// tune per step — `rounded-full` already resolves to the largest radius
// Tailwind's border-radius scale supports for any box.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
      },
      size: {
        default:
          'h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-11 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 gap-1 px-2.5 text-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-11',
        'icon-xs': "size-11 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-11',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
