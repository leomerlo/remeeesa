import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export type CarouselControls = {
  readonly canScrollBack: boolean
  readonly canScrollForward: boolean
  readonly scrollBack: () => void
  readonly scrollForward: () => void
  readonly onScroll: () => void
}

// Shared by every horizontally-scrolling strip in the app. A swipe is the
// whole interaction on a phone, but with a mouse a strip that scrolls with
// its scrollbar hidden has no affordance at all -- nothing on screen says
// there is more to the right. Per direct feedback: anything that is a
// carousel gets arrows.
//
// Scrolls by one full view rather than one card: paging is what the arrows
// are for, and combined with the snap-mandatory tracks these drive, a page
// always lands on a card boundary.
// Takes the track's ref rather than owning it: the caller passes the same
// ref straight to its <ul>, so nothing has to read a ref off an object
// during render.
export function useCarouselControls(
  ref: RefObject<HTMLUListElement | null>,
): CarouselControls {
  const [canScrollBack, setCanScrollBack] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)

  const measure = useCallback(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    // 1px of slack: sub-pixel layout means scrollLeft + clientWidth can land
    // a fraction short of scrollWidth at the very end of a track, which
    // would leave the forward arrow enabled with nowhere to go.
    setCanScrollBack(element.scrollLeft > 1)
    setCanScrollForward(
      element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    )
  }, [ref])

  // After every render, with no dependency list on purpose. The track's own
  // box does not change when its contents arrive -- it is full-width either
  // way -- so a ResizeObserver never fires for the one transition that
  // matters most: the skeleton resolving into real cards, which is what
  // gives the track something to scroll. Re-reading three numbers per
  // render is cheap, and setState bails out when they are unchanged.
  useLayoutEffect(measure)

  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver === 'undefined') {
      return
    }
    // A window resize does not re-render React, so the effect above will
    // not run for it; the number of cards that fit changes at `lg`, so the
    // ends still have to be re-measured when the box does change.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [measure, ref])

  const scrollByView = useCallback(
    (direction: 1 | -1) => {
      const element = ref.current
      if (element === null) {
        return
      }
      element.scrollBy({
        left: element.clientWidth * direction,
        behavior: 'smooth',
      })
    },
    [ref],
  )

  return {
    canScrollBack,
    canScrollForward,
    scrollBack: () => {
      scrollByView(-1)
    },
    scrollForward: () => {
      scrollByView(1)
    },
    onScroll: measure,
  }
}

export type CarouselArrowsProps = {
  readonly controls: CarouselControls
  // Named for a screen reader: several strips can sit on one page, so
  // "Anterior" alone would not say anterior of what.
  readonly label: string
  readonly className?: string
}

export function CarouselArrows({
  controls,
  label,
  className,
}: CarouselArrowsProps): ReactElement | null {
  // Nothing to page through -- every card already fits -- so there is
  // nothing for these to do. Two permanently-dead buttons next to a section
  // title are worse than no buttons at all. Per direct feedback. The
  // measurement runs in a layout effect, so this is settled before the
  // browser paints and the arrows never flash in and out.
  if (!controls.canScrollBack && !controls.canScrollForward) {
    return null
  }

  return (
    // Visibility is the caller's call: a strip whose arrows sit on their own
    // line under it can show them at every width; one sharing a line with a
    // section title cannot.
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {/* The app's own secondary button, not a bespoke icon button: a
          carousel's arrows are ordinary pressable controls and should look
          like every other one. Per direct feedback. */}
      <Button
        type="button"
        variant="outline"
        size="icon-mini"
        aria-label={`${label}: anterior`}
        disabled={!controls.canScrollBack}
        onClick={controls.scrollBack}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-mini"
        aria-label={`${label}: siguiente`}
        disabled={!controls.canScrollForward}
        onClick={controls.scrollForward}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )
}
