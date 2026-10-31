---
status: accepted
---

# The beta is the next version of remeeesa, shipped as a second entry point on the same branch

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
differs in that it *is* built and published, to its own project.

What this does **not** inherit is the visual layer. The beta's interface is designed from zero —
the control sizing, the palette, the type scale and the modal bands recorded for v1 are history,
not constraints. See `docs/beta-design.md`.
