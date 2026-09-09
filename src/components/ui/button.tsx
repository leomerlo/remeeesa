import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

// Trimmed from the shadcn output. Variants map onto the reference:
// `outline` is the idle pill, `default` is the inverted active pill, `ghost` is
// the borderless label beside a selected chip. `secondary` and `link` have no
// counterpart. The destructive pair was dropped originally, when the system was
// monochrome and a delete action was a solid black pill; it is back now that
// red is one of the app's meaningful colours -- see the variants below.
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
        // The secondary button: a 2px neutral outline, label in the ordinary
        // text colour. The weight is what tells it apart from a disabled
        // control -- at 1px it read as one -- and the colour stays grey so
        // it does not compete with the primary. Per direct feedback.
        outline:
          'border-2 border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        // Destroying something gets its own pair. `destructive` is the one
        // that actually does it -- solid red, white label, as prominent as
        // the primary it replaces in that moment. `destructive-outline` is
        // its secondary: a pale red chip with a red outline and a red
        // label, for the button that *offers* the deletion and for backing
        // out of one. Neither is grey text on a grey border, which is what
        // "Eliminar gasto" used to be and read as an afterthought. Per
        // direct feedback.
        destructive:
          'bg-error-strong text-on-error hover:bg-error-strong-hover',
        'destructive-outline':
          'border-2 border-error bg-error-surface text-error hover:bg-error-surface-hover',
      },
      // Every size drops one step at `lg`. 44px is the size a thumb needs;
      // a pointer does not, and at that height a row of buttons on a
      // monitor reads as enormous next to everything around it. Per direct
      // feedback -- the phone keeps the touch size, the desktop gets 36px,
      // still well clear of WCAG 2.2's 24px target minimum.
      size: {
        default:
          'h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 lg:h-9',
        xs: "h-11 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 lg:h-8 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 gap-1 px-2.5 text-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 lg:h-9 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 lg:h-10',
        icon: 'size-11 lg:size-9',
        // The icon buttons that are only ever chrome: a carousel's arrows, a
        // month pager's. 36px at every width, phone included -- these sit
        // beside a line of text rather than in a row of actions, and at
        // 44px they dwarfed it.
        'icon-mini': "size-9 [&_svg:not([class*='size-'])]:size-4",
        'icon-xs': "size-11 lg:size-9 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-11 lg:size-9',
        'icon-lg': 'size-12 lg:size-10',
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
