---
status: superseded by 0008
---

# The beta is the next version of remeeesa, shipped as a second entry point on the same branch

> Superseded by [0008](0008-the-redesign-becomes-the-app.md): in November 2026 the second
> entry became the app and the old one moved to `/v1/`. Everything below is why it was built
> this way, which is still why the code looks like it does.

Remeeesa grew as a run of fixes for one household — Flor and Leo — and the functionality is
right, but the interface is the accumulated shape of those fixes rather than something designed
for a person meeting the app for the first time. The first outside user is Flor's
father-in-law, who asked for help following his spending and said the card-versus-cash
distinction is what confuses him. That turns remeeesa from "the app for this house" into a
personal or household finance app, which is a different product even though it is the same
software underneath.

We considered three ways to carry that:

**A separate product in its own repo**, free to break anything. Rejected: the domain — the
model, the Firestore rules, the adapters, ~1400 tests — is the expensive, correct part, and it
is already clean (of 64 files under `src/lib`, three touch React). Forking it means fixing every
domain bug twice and watching the two copies drift.

**A long-lived `beta` branch with its own Vercel project.** Rejected: better isolation, but
every domain fix has to be merged between branches forever, and the conflicts grow with the
divergence — for two codebases that are supposed to end up as one.

Decision: **the beta is the next version of the same product**. Same repo, same domain code,
same Firebase project, a new interface layer on top. The two live side by side as **two entry
points on one branch** — `index.html` for v1 and a second entry for the beta — each published by
its own Vercel project, so the beta has its own URL. No merging: the domain is literally the same
file for both. When the beta wins, v1's entry is removed and the beta's is renamed; the switch is
a build-config change, not a migration.

Sharing the Firebase project is part of the decision, not an accident. The rules already isolate
by household, so a new user's data is invisible to Flor's, and when Flor and Leo move across,
their data is already there — there is no migration to write.

The repo already has the shape this needs: `demo.html` plus `src/demo/` is a second entry today,
kept out of the production build and guarded by `src/demo/productionIsolation.test.ts`. The beta
differs in that it _is_ built and published, to its own project.

## Update, 7 November 2026

The premise in the first paragraph turned out to be wrong, and this is recorded rather than
edited away. **The father-in-law is not going to use it.** Flor's words: _"no lo va a ver mi
suegro, esto es la actualizacion de la v1 en una v2 para mi"_. The beta is the v2 of this
household's app.

The decision below is unaffected. Every reason for it — the domain is the expensive, correct
part; forking it means fixing each bug twice; one branch keeps the two entries honest about
sharing that code — was about the code, not about who was going to open the URL. What loses
its justification is narrower and noted where it lives: invite-only sign-up was partly about
API spend (`docs/beta-design.md`), and there is no API now.

What this does **not** inherit is the visual layer. The beta's interface is designed from zero —
the control sizing, the palette, the type scale and the modal bands recorded for v1 are history,
not constraints. See `docs/beta-design.md`.
