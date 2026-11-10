---
status: accepted
---

# The redesign becomes the app, and the old one stays at /v1/

ADR 0007 shipped the redesign as a second entry point on the same branch, published by its own
Vercel project at its own URL, so that it could be built against the household's real data
without anybody's daily app changing underneath them. That is finished: the screens are in use,
the three test suites cover them, and the figures were audited line by line against the live
database. Keeping two front doors now costs more than it protects — every change has to be
argued twice, and whoever opens the app has to know which URL is the real one.

So the entries swap. `index.html` loads `src/beta/main.tsx` and is what the domain serves;
the old tree moves to `v1/index.html` and is still built, so it answers at `/v1/` (and at
`/v1/index.html`, which is the same file by its own name if a host ever declines to serve a
directory index). It routes on real paths, so it is given `basename="/v1"` — without it
react-router matches `/v1/` against its routes, finds nothing, and renders an empty page.

**Why the old one is still built, rather than only kept in git.** It is the way back. Both
trees read and write the same Firestore household through the same adapter, so `/v1/` is a
working app on the same data, not an archive — if something in the new screens turns out to be
wrong in a way that matters on a Tuesday night, there is somewhere to go while it is fixed. It
costs one more bundle in `dist/` and nothing else. The last commit before the swap is also
tagged `v1-final`, and Vercel can promote any earlier deployment back to production in two
clicks; the built entry is the cheapest of the three to actually use.

**What the old entry does not get.** Nothing new is built on it, and its deep links are the
one thing that does not survive: the old tree routes on real paths, and `vercel.json` rewrites
any path with no file behind it to `index.html`, which is now the new app. Opening `/v1/`
works, and so does moving around inside it; reloading at `/v1/gastos` lands on the new app. That is the right way round
— a reload should land somewhere that works, and that is the app.

**Links sent before the swap keep working.** An invite was `…/beta.html#/unirme/<code>`; there
is no `beta.html` any more, so the same rewrite sends it to `index.html`, and the code is read
out of the hash exactly as before. New invites are `…/#/unirme/<code>`.

The consequence to be honest about: `/` and `/v1/` write to the same household with the
same rules, so the old app is not a sandbox. It is the old app, still live, on purpose.
