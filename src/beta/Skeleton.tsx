import type { ReactElement } from 'react'
import { cssVars } from '@/lib/cssVars'

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
      <HeadSkel />
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

export function ListSkeleton({
  label,
  rows = 6,
}: {
  readonly label: string
  readonly rows?: number
}): ReactElement {
  return (
    <Loading label={label}>
      <header className="head">
        <Skel w={140} h={30} />
      </header>
      <div className="card hero">
        <Skel w={150} h={15} />
        <Skel w={240} h={42} r={12} />
      </div>
      <section className="sec">
        {Array.from({ length: rows }, (_, index) => (
          <RowSkel key={index} />
        ))}
      </section>
    </Loading>
  )
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
// the bar are already real, so only the page inside them is waiting.
export function BootSkeleton(): ReactElement {
  return (
    <div className="shell">
      <main className="app">
        <HomeSkeleton />
      </main>
    </div>
  )
}
