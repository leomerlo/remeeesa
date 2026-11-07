import type { ReactElement } from 'react'
import { cssVars } from '@/lib/cssVars'
import { Shell } from './Shell'

// A placeholder shaped like the thing that is coming. The point is that
// nothing moves when the data lands: a grey box of the wrong size is worse
// than nothing, because the screen jumps once it is replaced.
//
// One `aria-busy` region per screen, labelled once, with everything inside
// it hidden from the reader -- twenty announced grey boxes is not a loading
// state, it is noise.
export function Skel({
  w = '100%',
  h = 16,
  r = 8,
}: {
  readonly w?: string | number
  readonly h?: string | number
  readonly r?: number
}): ReactElement {
  return (
    <span
      className="skel"
      style={cssVars({
        '--sw': typeof w === 'number' ? `${String(w)}px` : w,
        '--sh': typeof h === 'number' ? `${String(h)}px` : h,
        '--sr': `${String(r)}px`,
      })}
    />
  )
}

export function Loading({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
}): ReactElement {
  return (
    <div className="loading" role="status" aria-busy="true" aria-label={label}>
      <div aria-hidden="true" className="loading-in">
        {children}
      </div>
    </div>
  )
}

function HeadSkel(): ReactElement {
  return (
    <header className="head">
      <div className="hello">
        <Skel w={200} h={24} />
        <span>
          <Skel w="70%" h={15} />
        </span>
      </div>
    </header>
  )
}

function RowSkel(): ReactElement {
  return (
    <div className="card row">
      <Skel w={44} h={44} r={14} />
      <span className="nm">
        <Skel w="55%" h={17} />
      </span>
      <span className="amt">
        <Skel w={90} h={17} />
      </span>
      <span className="meta">
        <Skel w="35%" h={13} />
      </span>
    </div>
  )
}

function SectionSkel({ rows = 3 }: { readonly rows?: number }): ReactElement {
  return (
    <section className="sec">
      <h2>
        <Skel w={150} h={19} />
      </h2>
      {Array.from({ length: rows }, (_, index) => (
        <RowSkel key={index} />
      ))}
    </section>
  )
}

export function HomeSkeleton(): ReactElement {
  return (
    <Loading label="Cargando el mes">
      <div className="band">
        <div className="card hero">
          <Skel w={180} h={15} />
          <Skel w={260} h={46} r={12} />
          <Skel h={12} r={999} />
          <Skel w="80%" h={14} />
        </div>
        <div className="trio">
          {[0, 1, 2].map((index) => (
            <div className="card" key={index}>
              <Skel w={90} h={13} />
              <Skel w={130} h={28} r={10} />
              <Skel w="85%" h={13} />
            </div>
          ))}
        </div>
      </div>
      <div className="cols">
        <div className="col">
          <SectionSkel />
        </div>
        <div className="col">
          <SectionSkel rows={2} />
        </div>
      </div>
    </Loading>
  )
}

// The data part of a list screen. The title, the month pager and the
// segmented control are real from the first frame -- they are chrome, not
// data -- so only what is below them is standing in for something.
export function ListSkeleton({
  label,
  rows = 6,
  hero = true,
}: {
  readonly label: string
  readonly rows?: number
  readonly hero?: boolean
}): ReactElement {
  return (
    <Loading label={label}>
      {hero ? (
        <div className="hood solo">
          <div className="card hero">
            <Skel w={150} h={15} />
            <Skel w={240} h={42} r={12} />
          </div>
        </div>
      ) : null}
      <section className="sec">
        {Array.from({ length: rows }, (_, index) => (
          <RowSkel key={index} />
        ))}
      </section>
    </Loading>
  )
}

// The search field is real on the loaded screen and has to hold its
// place: without it the whole list jumped down once the data arrived.
export function SearchSkel(): ReactElement {
  return (
    <div className="search" aria-hidden="true">
      <Skel h={46} r={14} />
    </div>
  )
}

// The household's name beside a page title, which is the one piece of a
// screen's header that has to be fetched.
export function NameSkel(): ReactElement {
  return <Skel w={96} h={15} />
}

export function ProfileSkeleton(): ReactElement {
  return (
    <Loading label="Cargando el perfil">
      <header className="head">
        <Skel w={120} h={30} />
      </header>
      <div className="card">
        <div className="plist">
          {[0, 1, 2, 3].map((index) => (
            <div className="pitem" key={index}>
              <Skel w={40} h={40} r={12} />
              <span className="k">
                <Skel w={160} h={17} />
              </span>
              <span className="v">
                <Skel w={110} h={14} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </Loading>
  )
}

// The whole app before it knows whether anyone is signed in. The rail and
// the bar hold no data, so they are the real ones from the first frame --
// a navigation that appears a moment after the page is the one jump a
// loading state is supposed to prevent.
export function BootSkeleton(): ReactElement {
  return (
    <Shell>
      <HeadSkel />
      <HomeSkeleton />
    </Shell>
  )
}
