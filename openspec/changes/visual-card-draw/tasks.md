# Tasks: Visual Card Draw (Cartas Tseyor)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,150–1,650 total (index.html ~150–200, styles.css ~400–600, app.js ~300–450, deck.js ~120–180 + verify tooling) |
| Per-slice | Slice 1 ~520–730; Slice 2 ~330–460; Slice 3 ~300–460 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|----|-------|
| 1 | Shell + deck + home + carousel | PR 1, base `main` | ships deck.js + smoke + checklist |
| 2 | Reveal + detail + draw loop | PR 2, base `main` | extends same smoke |
| 3 | Review + reset + a11y polish | PR 3, base `main` | full T1–T13 smoke + checklist |

## Slice 1 — Shell + Deck + Home + Carousel (PR 1)

Independent + verifiable; no dependency on Slices 2–3.

- [x] 1.1 `deck.js`: 12 cards, unique ids (`sol, luna, estrella, camino, montana, rio, bosque, semilla, mago, llave, espejo, vuelo`), Spanish content, editable-format doc header, reserved `image`, 3 `positions` (DECK-1/2/3)
- [x] 1.2 `verify/smoke.mjs` (window shim) + 2-card fixture `verify/mini-deck.mjs`; invariants — ≥1 card, unique ids, 3 positions, required fields — on both decks (DECK-1/2)
- [x] 1.3 `app.js` (D1–D3): state, pure `transition()` T1 RELOAD + T2 "Sacar carta", `render()` home/carousel, jitter `--rz/--rx` (D8), tilt rAF (D9), arrows + focus-first (DRAW-2), disabled "Ver tirada" + max-3 UI (DRAW-4)
- [x] 1.4 Smoke T1/T2; `node verify/smoke.mjs` green (DRAW-1, DECK-1)
- [x] 1.5 `index.html` (D1): `lang="es"`, viewport, `#app`, `aria-live` div, link `styles.css`, scripts `deck.js` + `app.js`
- [x] 1.6 `styles.css` base: tokens, `100dvh`/`100vh` shell + safe-area, carousel strip (`overflow-x:auto`, `touch-action:pan-x`, scroll-snap), ≥44px, desktop centering (DRAW-8)
- [x] 1.7 `verify/checklist.md`: swipe/arrows, jitter fan, reload→home, 12 unique cards (DRAW-2, DECK-2)

Commits (PR 1, base `main`):
1. `feat(deck): documented 12-card deck, positions, format tests` — 1.1–1.2
2. `feat(cartas): home/carousel state core with T1/T2` — 1.3–1.4
3. `feat(cartas): Spanish shell + base carousel styles` — 1.5–1.7

## Slice 2 — Reveal + Detail + Draw Loop (PR 2)

Independent + verifiable; extends Slice-1 files only.

- [x] 2.1 `transition()`: T3 SELECT (commit-before-animation, D5), T4 FLIP_END, T5 no-op, T6 SINK_END, T7 "Sacar otra carta" (`canDraw`; no-repeat pool DECK-4; both "Tirada completa" copies DECK-2)
- [x] 2.2 Smoke: commit-before-animation, double-activation no-op, max-3, pool excludes drawn, 2-card pool-exhaustion hint (DRAW-1/2/4, DECK-2/4)
- [x] 2.3 `styles.css` motion (D4/D7): `.card-inner` 3D flip, `.is-flipped` raise ~600ms, `.is-sunk` stagger `--i` 45ms, `.reveal-card` `min(72vw,340px)`, detail `max-width:65ch`, reduced-motion collapse (DRAW-3/5/8)
- [x] 2.4 `app.js` wiring (D6/D7/D11): imperative `.is-flipped`/`.is-sunk`, `transitionend` + timeout backstops + sunk removal, reveal render + focus h2, IO `.is-visible` (DRAW-5), draw loop (DRAW-6), reduced-motion shortcut
- [x] 2.5 `verify/checklist.md`: flip/sink visuals, scroll reveal, loop to 3/3, reduced-motion (DRAW-3/5/6)

Commits (PR 2, base `main`):
1. `feat(cartas): reveal/draw-loop transitions, no-repeat pool, tests` — 2.1–2.2
2. `feat(cartas): flip-elevate, sink, reveal/detail styles` — 2.3
3. `feat(cartas): reveal flow, scroll detail, draw loop wiring` — 2.4–2.5

## Slice 3 — Review + Reset + A11y Polish (PR 3)

Independent + verifiable; completes the app.

- [x] 3.1 Review UI: `#dialog-root` sibling overlay; T8 "Ver tirada" (drawn ≥1, REVIEW-1) + T9 dialog; shared `renderDetail()` (D10); `styles.css` spread (mobile stack, desktop ≥1024 row) + dialog `min(92vw,640px)`, `max-height:min(85dvh,85vh)`, `overflow-y:auto` (REVIEW-1/2/6)
- [x] 3.2 Smoke: T8/T9, empty-spread safe render (REVIEW-1), REVIEW-4 round-trip unchanged
- [x] 3.3 Trap + reset: T10 Escape/"Cerrar" restore focus, T11 back → resume (REVIEW-4), T12 "Nueva tirada" incl. dialog footer (REVIEW-5), T13 Escape no-op (DRAW-7); focus trap + `#app.inert` (REVIEW-3); full T1–T13 green
- [ ] 3.4 A11y + polish: aria-live (title+position, tirada completa — DRAW-7), `:focus-visible`, reduced-motion spread/dialog, 1440px desktop pass (DRAW-8, REVIEW-6), Spanish copy, frontend-design aesthetic
- [ ] 3.5 Finalize `verify/checklist.md` (DECK-1..4, DRAW-1..8, REVIEW-1..6); smoke + 390/1440px device pass

Commits (PR 3, base `main`):
1. `feat(cartas): review spread + shared detail dialog` — 3.1–3.2
2. `feat(cartas): dialog trap, return-to-draw, instant reset` — 3.3
3. `feat(cartas): a11y announcements, focus-visible, responsive polish` — 3.4
4. `test(cartas): complete manual checklist per spec scenarios` — 3.5