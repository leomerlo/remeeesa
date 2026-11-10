import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Every screen opens at its top.
//
// The browser keeps the scroll position across a route change, so going
// from the foot of a long Inicio to Proyección landed halfway down a
// screen you had never seen -- with its title above the fold, which is
// the one thing that says where you are. Per direct feedback.
//
// Keyed on pathname alone: paging the month or switching a tab writes the
// search string, and those are the same screen answering, not a new one.
export function ScrollToTop(): null {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
