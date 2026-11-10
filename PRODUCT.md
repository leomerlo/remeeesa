# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Flor and Leo, a two-person household.** In late October 2026 this looked like it was
about to change: the beta was going to open the app to other people, starting with Flor's
father-in-law. **It did not.** On 7 November 2026 Flor said so plainly — *"no lo va a ver mi
suegro, esto es la actualizacion de la v1 en una v2 para mi"*. The beta (see `docs/adr/0007`
and `docs/beta-design.md`) is the **v2 of this household's own app**, not a product for
outside users.

What the detour left behind is worth keeping anyway, because it is good practice rather than
a concession to a stranger: **nothing may rely on having been there while it was built.** A
screen that only reads correctly if you remember the fix it came from is a defect, and the
onboarding exists because a house that starts empty should still make sense. A household of
one stays a first-class case — it costs nothing and it is one branch of the same code.

Flor and Leo keep the v1 interface until the beta replaces it.

Primary usage is mobile, in short, frequent sessions: logging a purchase on the spot (a coffee, a
bag of cat litter), checking whether a bill is due, glancing at what's left in the month's
budget. The core action — logging an expense — happens multiple times a day and must be fast and
comfortably reachable one-handed on a phone.

## Product Purpose

A household accountant in app form: track every expense against one shared monthly budget, track
upcoming bills before they're paid (due date, expected amount, pending/paid status — separate
from the record of money already spent), and show where the money actually goes — by category and
by person. Success means the household is confidently up to date on what it owes and what it's
already spent, at a glance, without manual reconciliation.

Not a product being built to sell or acquire users — built specifically for this one household's
real life.

## Positioning

Purpose-built for this household's actual categories and bills (auto: seguro/patente/nafta/ACA;
casa: luz/gas/agua/internet/alarma; shared plans: obra social, gimnasio; personal spending buckets
per person; mascotas: comida/piedritas/veterinario) rather than generic budgeting categories a
neighboring consumer app would ship with. A generic multi-tenant budgeting app could not
truthfully claim this level of fit to one specific household's real bills without becoming this
household's own tool.

## Operating Context

- Multiple quick expense-logging sessions per day, often immediately after a purchase.
- Monthly review of recurring bills (Pendientes), where the amount is frequently unknown until the
  bill arrives and varies month to month (inflation-driven — recurring never means "same amount
  auto-charged").
- Periodic review of remaining budget and category/person spending breakdown.
- Real production data already exists in the connected Firebase project (household, categories,
  expenses) predating this redesign — this is not a demo or empty dataset; future work (schema
  changes, parsing, migrations) must handle pre-existing documents gracefully rather than assume
  a fresh project.

## Capabilities and Constraints

- Stack: React + Vite + TypeScript (strict) + Firebase (Auth + Firestore) + TanStack Query +
  Tailwind CSS.
- Domain: `Household` (one shared monthly budget, equal-permission `Member`s, no owner/admin
  role), `Category` (per-household, carries a color), `Expense` (money already spent, counts
  against the current month's budget), `Pendiente` (a bill — an obligation to pay, tracked before
  payment with a due date and optional expected amount, distinct from `Expense`; see CONTEXT.md).
- No multi-currency handling (implicit local currency, Argentina). No income tracking — expense
  and bill tracking only.
- A household belongs to one budget; a member belongs to at most one household at a time.

## Brand Commitments

Product name: "remeeesa" (stylized lowercase, no formal wordmark). No pre-existing logo or brand
identity beyond the name — the current favicon is Vite's unmodified scaffold default, not a
deliberate brand asset, and should not be treated as binding visual evidence. Tone: fun, young,
jovial — established during this redesign (see docs/adr/0003-wallet-style-color-palette-replaces-monochrome.md)
as a deliberate departure from the product's original "minimal, confident" monochrome direction.

## Evidence on Hand

Real household data (household, categories, expenses) already lives in the connected Firebase
project from before this redesign began. No other content, testimonials, or marketing assets
exist or should be fabricated — this is a private tool, not a marketed product.

## Product Principles

- **Correctness over polish.** This tracks real household money; the numbers must always be
  right, even as the interface becomes more expressive.
- **Two real people, not a generic audience.** Categories, defaults, and flows are tailored to
  this household's actual life rather than kept generic for a hypothetical broader audience.
- **Low-friction, thumb-first daily logging.** The core action happens many times a day, often on
  the spot — it must be fast and reachable one-handed on a phone, not a chore.
- **Deliberate interaction patterns.** How something opens, how you navigate it, and how you
  close it (a modal, a sheet, a nav transition) is a considered decision, not an accident of
  whatever markup was easiest to write.

## Accessibility & Inclusion

Mobile-first. Interactive elements must be comfortably tappable by finger, not merely visually
present. Standard web accessibility practice (accessible roles/labels, keyboard operability) is
used throughout the codebase and must continue.

**For the beta, accessibility is a requirement rather than a floor, and the owner's words are
the brief:**

> Nada chiquito, nada clarito. Alto contraste, tamaños grandes. Simplificación, patrones que
> se entiendan y claridad. Dentro de toda la complejidad de la herramienta, llevarlo al
> usuario de forma sencilla.

"Nada clarito" is literal: washed-out greys and low-contrast text are banned, not discouraged.
The v1's own sizing trades — a 24×24 floor, 44×44 for icon-only controls, text buttons sized by
padding, and later a flat 46px for everything — were made for and with Flor on her own phone.
**They do not carry over.** The beta sets its own, larger, from the first screen.
