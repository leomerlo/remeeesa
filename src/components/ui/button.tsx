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
  // border-2 on every variant, transparent where it is not drawn: a button
  // is as tall as its border makes it, so an outlined one and a filled one
  // with the same padding were two different heights until both carried the
  // same box. Height itself is never set -- it is the padding, so a button
  // with an icon and one without come out the same.
  //
  // No bg-clip-padding, which is the subtler half of the same problem: it
  // clips the fill to the padding box, so a filled button painted 4px
  // shorter than an outlined one that measured exactly the same, because
  // the outlined one draws its border and the filled one leaves its
  // transparent. Clipped to the border box both paint the full height. Per
  // direct feedback.
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Every variant carries the four states: rest, hover, active and
        // the focus ring from the base above. Disabled is the base's
        // opacity, one treatment for all of them.
        default:
          'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75',
        // The secondary button: a 2px neutral outline and a label in the
        // ordinary text colour, over *nothing*. It used to fill itself with
        // --background, which meant a grey chip on a white card and a white
        // one on the grey page -- it has no business deciding what is
        // behind it. Transparent, it is whatever it is sitting on. The
        // outline's weight is what tells it apart from a disabled control;
        // at 1px it read as one. Per direct feedback.
        outline:
          'border-border bg-transparent text-foreground hover:border-foreground hover:bg-foreground/5 active:bg-foreground/10 aria-expanded:bg-foreground/5',
        ghost:
          'bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/10 aria-expanded:bg-foreground/5',
        // Destroying something gets its own pair. `destructive` is the one
        // that actually does it -- solid red, white label, as prominent as
        // the primary it replaces in that moment. `destructive-outline` is
        // its secondary: a red outline and a red label, transparent like
        // every other secondary, tinting red only on hover. Neither is grey
        // text on a grey border, which is what "Eliminar gasto" used to be
        // and read as an afterthought. Per direct feedback.
        destructive:
          'bg-error-strong text-on-error hover:bg-error-strong-hover active:bg-error-strong-hover',
        'destructive-outline':
          'border-error bg-transparent text-error hover:bg-error-surface active:bg-error-surface-hover',
      },
      // Every size drops one step at `lg`. 44px is the size a thumb needs;
      // a pointer does not, and at that height a row of buttons on a
      // monitor reads as enormous next to everything around it. Per direct
      // feedback -- the phone gets 46px, the desktop 36px, both clear of
      // WCAG 2.2's 24px target minimum.
      size: {
        // px-4.5 is 18px, the same on every size and every variant, with an
        // icon or without: the icon-adjusted paddings this replaced left a
        // button with an icon visibly tighter than its neighbour without
        // one. Per direct feedback.
        //
        // 46px tall on a phone, every size and every shape -- round, with
        // a label, with an icon. Per direct feedback. It is a floor, not a
        // height: padding still decides, and a button whose content needs
        // more than 46px simply gets taller. 36px from `lg`, where a
        // pointer does not need the reach and a row of 46px buttons reads
        // as enormous next to everything around it.
        //
        // py-1.5 over a 20px line and a 2px border is the 36px the desktop
        // gets; the floor is what lifts the phone off it.
        default: 'min-h-[46px] gap-2 px-4.5 py-1.5 lg:min-h-0',
        xs: "min-h-[46px] gap-2 px-4.5 py-1.5 text-xs lg:min-h-0 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-[46px] gap-2 px-4.5 py-1.5 text-sm lg:min-h-0 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'min-h-[46px] gap-2 px-4.5 py-2.5 lg:min-h-0 lg:py-2',
        // Square, so the padding that makes the others their height would
        // make these oblong: these set a size and drop the padding instead.
        icon: 'size-[46px] p-0 lg:size-9',
        // The icon buttons that are only ever chrome: a carousel's arrows, a
        // month pager's. 36px at every width, phone included -- these sit
        // beside a line of text rather than in a row of actions, and at
        // full size they dwarfed it.
        'icon-mini': "size-9 p-0 [&_svg:not([class*='size-'])]:size-4",
        'icon-xs':
          "size-[46px] p-0 lg:size-9 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-[46px] p-0 lg:size-9',
        'icon-lg': 'size-[46px] p-0 lg:size-10',
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
