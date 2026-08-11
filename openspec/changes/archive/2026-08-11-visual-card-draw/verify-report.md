# Verification Report — Visual Card Draw (Cartas Tseyor)

**Change**: `visual-card-draw`
**Version**: design.md v2; specs DECK-1..4 / DRAW-1..8 / REVIEW-1..6
**Mode**: Standard (STRICT TDD not active — verification = automated smoke + manual checklist)
**Date**: 2026-08-11
**HEAD**: `c60ec5a` (branch `main`, 13 commits, 3 slices complete)

## Verdict

**PASS WITH WARNINGS**

- 15/15 tasks complete, smoke suite 89/89 green, no CRITICAL findings.
- One WARNING: the scripted manual checklist (verify/checklist.md) was authored and mapped 1:1 to every spec scenario, but **no row has a recorded PASS/FAIL** and no browser/device exists in this environment — the device pass (390px, 1440px, reduced-motion, touch, screen reader, dialog trap) is pending execution evidence.
- Archive-ready from the automated + static standpoint; record the device pass before final archive sign-off.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: ✅ N/A — static site, no build step (`node --check` on app.js/deck.js passes)

```text
$ node --check app.js  → ok
$ node --check deck.js → ok
```

**Tests**: ✅ 89/89 passed, exit code 0

```text
$ node verify/smoke.mjs
  ok    shipped deck exposes window.Cartas.deck
  ...   (Sections A–D)
89/89 checks passed.
Smoke suite green.
EXIT_CODE=0
```

**Coverage**: ➖ Not applicable (no coverage tooling for a no-build static site; smoke + manual checklist is the agreed strategy in design.md §Testing Strategy).

## Spec Compliance Matrix (33 scenarios)

Status legend: ✅ COMPLIANT (covering test passed / smoke) · ⚠️ PARTIAL (logic covered by smoke or static inspection; runtime DOM/device evidence pending manual row) · ❌ FAILING/UNTESTED (none).

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| DECK-1 — Documented deck format | Edit without touching app code | smoke §A (format invariants on shipped+mini); `deck.js` pure data, `app.js` reads `deck()` at render time (app.js:30, 487, 580); checklist C4 | ✅ COMPLIANT |
| DECK-1 | Reserved image field | smoke §A "image field … is a string"; faces render `face-num` span only (app.js:442, 508, 596); no `<img>` anywhere; checklist C3 | ✅ COMPLIANT |
| DECK-2 — Starter deck + placeholder faces | Starter deck loads | smoke §A: 12 cards, unique ids, all required fields non-empty (deck.js:38-163); checklist C1, C2 | ✅ COMPLIANT |
| DECK-2 | Undersized deck | smoke §C: T2/T7 refused with empty pool (mini 2-card fixture) + guard hint copy (smoke.mjs:344-369, 395-417); `getDrawGuard` (app.js:73-83); checklist C22 | ✅ COMPLIANT |
| DECK-3 — Spread positions | Label derives from index | smoke §A exact `positions` match (deck.js:39); label by drawn index (app.js:494-495, 582); checklist C5, C26 | ✅ COMPLIANT |
| DECK-3 | Position bound | drawn ≤ 3 enforced at machine level (app.js:145, SELECT guard; smoke "SELECT refused at drawn.length 3"), so index ≤ 2 | ✅ COMPLIANT |
| DECK-4 — No-repeat pool | Pool excludes drawn ids | smoke §B "poolFor excludes drawn ids", §C "T7 new pool excludes drawn ids (11)"; `poolFor` (app.js:57-60); T3 refuses drawn id (app.js:148) | ✅ COMPLIANT |
| DECK-4 | Single-remaining pool | filter mechanism proven (12→11→10); no dedicated assert for the exact length-1 pool → see SUGGESTION-1; manual C20 | ⚠️ PARTIAL |
| DRAW-1 — Phase state machine | Happy path | smoke §B T2 DRAW_START → draw/carousel with 12-card pool (smoke.mjs:175-187) | ✅ COMPLIANT |
| DRAW-1 | Commit-before-animation | smoke §C T3: drawn+selectedId committed before any DOM class (app.js:676-695); interruption cannot roll back (T5 no-op) | ✅ COMPLIANT |
| DRAW-2 — Carousel browsing | Keyboard selection | smoke T3 state effect; `bindCarouselKeys` ←/→/Home/End + native Enter/Space (app.js:324-342); DOM behavior manual C9, C10 | ⚠️ PARTIAL |
| DRAW-2 | Double activation | smoke §C T5: SELECT while revealing or same card = same reference no-op | ✅ COMPLIANT |
| DRAW-2 | Last-card pool | mechanism covered via `poolFor` filter (see DECK-4 single-remaining); manual C2 | ⚠️ PARTIAL |
| DRAW-3 — Motion contract | Sink and cleanup | smoke §C T6 (state no-op); `bindSinkRemoval` transitionend + backstop (app.js:744-760); DOM removal manual C18; CSS transform/opacity only (styles.css:372-381) | ⚠️ PARTIAL |
| DRAW-3 | Reduced motion | CSS `prefers-reduced-motion: reduce` collapse (styles.css:777-801); JS matchMedia shortcut (app.js:683-687, 551-555); device pass manual C23 | ⚠️ PARTIAL |
| DRAW-4 — Max-3 guard | Fourth draw blocked | smoke §C: T7 NEXT_DRAW refused at drawn 3; guard hint "Tirada completa 3/3" (app.js:78); draw controls hidden by `canDraw` (app.js:516-524); text-only buttons (no icons anywhere) | ✅ COMPLIANT |
| DRAW-5 — Reveal detail panel | Scroll reveal | static: IntersectionObserver threshold 0.2, disconnect-once (app.js:627-644); passive scroll (app.js:315); `65ch` + `min(72vw,340px)` (styles.css:423, 442); manual C19 | ⚠️ PARTIAL |
| DRAW-6 — "Sacar otra carta" loop | Next draw | smoke §C T7: → draw/carousel, pool 11, sol absent; no home pass (app.js:167-173) | ✅ COMPLIANT |
| DRAW-7 — Draw-flow a11y | Arrow browsing | `bindCarouselKeys` + `scrollIntoView(inline:center)` (app.js:340); Escape no-op T13 (app.js:977-986; smoke "ESCAPE in draw phases no-op"); manual C9, C40 | ⚠️ PARTIAL |
| DRAW-7 | Reveal announced | `announce(title — position)` on every reveal + hint announcement (app.js:541-544, 646-656); live region `aria-live="polite"` (index.html:28); screen-reader pass manual C41, C42 | ⚠️ PARTIAL |
| DRAW-8 — Responsive draw layout | Mobile portrait | static: 100dvh/100vh + safe-area (styles.css:61-75), carousel snap + touch-action pan-x pan-y (styles.css:234-254), ≥44px (styles.css:157-169); device pass manual C11, C24 — **unexecuted** | ⚠️ PARTIAL |
| DRAW-8 | Desktop wide | static: ≥768px cards `clamp(190px, min(22vw,30vh), 260px)`, strip `max-width: min(92vw,1100px)` (styles.css:721-729), `min(72vw,340px)` + 65ch; device pass manual C12, C25, C43 — **unexecuted** | ⚠️ PARTIAL |
| REVIEW-1 — Review spread | Spread renders | smoke §D T8: drawn preserved in order sol,luna → spread; `renderSpread` iterates drawn in order with position labels (app.js:579-604); manual C26 | ✅ COMPLIANT |
| REVIEW-1 | Empty guard | smoke §D T8 refused at drawn 0; defensive empty render "Aún no has sacado cartas" (app.js:570-573); "Ver tirada" disabled at 0 (app.js:394, 528); manual C27, C28 | ✅ COMPLIANT |
| REVIEW-2 — Detail dialog | Open and close | smoke §D T9/T10; `role="dialog"` `aria-modal` `aria-labelledby` (app.js:892-894); shared `renderDetail` D10 (app.js:469-477); focus moves in (app.js:918), returns to activating card (app.js:947-948); `#app.inert` (app.js:800-810); manual C29-C31 | ⚠️ PARTIAL |
| REVIEW-3 — Dialog focus trap | Tab cycle | static: `trapKeydown` cycles first/last (app.js:828-851), `trapFocusIn` recaptures escapes (app.js:853-860), background inert; browser pass manual C32 — **unexecuted** | ⚠️ PARTIAL |
| REVIEW-4 — Return to draw flow | Resume at last reveal | smoke §D T11: → draw/reveal, selectedId = last drawn, `drawn` unchanged; back from 3-card review keeps hint + no draw control (smoke.mjs:644-662) | ✅ COMPLIANT |
| REVIEW-4 | Complete tirada return | smoke §D REVIEW-4 block: guard.canDraw false, hint "Tirada completa 3/3", drawn 3 preserved | ✅ COMPLIANT |
| REVIEW-5 — Instant reset | Reset from review | smoke §D T12: → draw/home drawn [] no confirmation; RESET unconditional (app.js:219-222) | ✅ COMPLIANT |
| REVIEW-5 | Reset with dialog open | smoke §D T12 from dialog-open state; dispatch closes dialog + clears inert (app.js:1009-1013, 933-950); "Nueva tirada" reachable in dialog footer (app.js:906-908) | ✅ COMPLIANT |
| REVIEW-5 | Reload | smoke §B T1 RELOAD → fresh home; `init()` on load (app.js:1030-1036); **no localStorage/sessionStorage/indexedDB/fetch anywhere** (grep clean) | ✅ COMPLIANT |
| REVIEW-6 — Responsive review | Mobile review | static: spread stacks vertically (styles.css:511-521), dialog `min(92vw,640px)` `max-height:min(85dvh,85vh)` `overflow-y:auto` (styles.css:654-656), safe-area padding (styles.css:624-628); device pass manual C38 — **unexecuted** | ⚠️ PARTIAL |
| REVIEW-6 | Desktop review | static: spread row ≥1024px (styles.css:751-757), centered dialog capped; device pass manual C39 — **unexecuted** | ⚠️ PARTIAL |

**Compliance summary**: 19/33 scenarios fully COMPLIANT (smoke-passed) · 14/33 PARTIAL (state/logic covered by smoke or static inspection; runtime DOM/device evidence assigned to a scripted manual row) · 0 FAILING · 0 UNTESTED. Every scenario has at least one covering test (smoke) or a 1:1 scripted manual row (checklist coverage map, lines 75-98).

## Correctness — Cross-cutting Hard Constraints

| Constraint | Status | Evidence |
|------------|--------|----------|
| NO persistence | ✅ | grep for localStorage/sessionStorage/indexedDB/fetch/XHR/cookies in index.html, styles.css, app.js, deck.js → zero hits (matches only in checklist.md prose) |
| Spanish UI | ✅ | `<html lang="es">` (index.html:2); all copy neutral Spanish; no untranslated strings, no icons |
| Plain scripts, no ES modules | ✅ | no `import`/`export` in app code; `<script src="deck.js">` then `app.js` (index.html:31-32) — file:// safe |
| `window.Cartas` namespace | ✅ | deck.js:36, app.js:29; API surface matches design §Interfaces (transition, render, state, poolFor, getDrawGuard, createInitialState) |
| CSS owns motion (JS rAF only for tilt) | ✅ | CSS animates only transform/opacity (styles.css:168, 359, 372-381, 448, 528, 553, 670); JS writes only `--rz/--rx/--tilt` vars + state classes; the single rAF loop is the documented tilt exception (app.js:288-317) |
| Responsive: 65ch detail | ✅ | styles.css:442 `.reveal-detail { max-width: 65ch }` |
| Responsive: `min(72vw, 340px)` reveal card | ✅ | styles.css:423 |
| Responsive: spread row ≥1024px | ✅ | styles.css:751 `@media (min-width: 1024px) .spread-list { flex-direction: row }` |
| Responsive: dialog sizing | ✅ | styles.css:654-656 `min(92vw, 640px)` / `max-height: min(85dvh, 85vh)` / `overflow-y: auto` |
| `prefers-reduced-motion` works | ✅ | CSS collapse (styles.css:777-801) + JS matchMedia shortcuts (app.js:233-239, 551, 683) + tilt listener skipped |
| Commit-before-animation | ✅ | T3 commits drawn+selectedId (app.js:139-154) before any DOM class (app.js:676-695) |
| No-repeat pool | ✅ | `poolFor` deck − drawn (app.js:57-60); T3 refuses duplicates; smoke-covered |
| Max-3 + pool-empty guard | ✅ | `getDrawGuard` (app.js:73-83); T2/T7 refuse at 3 or empty pool; no empty carousel ever opens (smoke-covered) |
| Both "Tirada completa" hint copies | ✅ | "Tirada completa 3/3" (app.js:78) and "Tirada completa — no quedan más cartas" (app.js:80) — exact copies per design |
| Load order + shell nodes | ✅ | styles.css in head; deck.js before app.js at end of body; `#app` (19), `#dialog-root` (25), `#live` (28) present; `node --check` passes |

## State Machine (T1–T13)

All 13 transitions exist and match design.md §State Machine:

| # | Trigger | Location | Smoke |
|---|---------|----------|-------|
| T1 | RELOAD | app.js:128-129 | ✅ |
| T2 | DRAW_START | app.js:131-137 | ✅ |
| T3/T5 | SELECT | app.js:139-154 | ✅ |
| T4 | FLIP_END | app.js:156-161 | ✅ |
| T6 | SINK_END | app.js:163-165 | ✅ |
| T7 | NEXT_DRAW | app.js:167-173 | ✅ |
| T8 | REVIEW_OPEN | app.js:175-183 | ✅ |
| T9 | REVIEW_TAP | app.js:185-194 | ✅ |
| T10 | REVIEW_CLOSE | app.js:196-202 | ✅ |
| T11 | REVIEW_BACK | app.js:204-209 | ✅ |
| T12 | RESET | app.js:219-222 | ✅ |
| T13 | ESCAPE no-op in draw | app.js:211-217, 977-986 | ✅ |

## Coherence (Design D1–D11)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Namespace + plain scripts | ✅ | verified load order, no modules |
| D2 Single state record | ✅ | `{mode, phase, drawn, selectedId}` (app.js:48-50) |
| D3 Pure `transition()` | ✅ | DOM-free, same-reference no-op guards, Node-testable |
| D4 CSS owns motion | ✅ | see constraints table; tilt rAF is the documented exception |
| D5 Commit-before-animation | ✅ | T3 commit precedes imperative classes |
| D6 Reveal advancement | ✅ | transitionend + 800ms backstop (app.js:718-734); reduced-motion shortcut |
| D7 Sink cleanup | ✅ | transitionend + backstop sweep (app.js:744-760) |
| D8 Jitter per session | ✅ | `--rz/--rx` fresh per carousel open (app.js:276-281) |
| D9 Tilt vs flip separation | ✅ | jitter/tilt on `.card`, flip on `.card-inner` (styles.css:282, 296-300) |
| D10 Shared detail renderer | ✅ | `renderDetail` used by reveal + dialog (app.js:469-477, 496, 885) |
| D11 Re-render strategy | ✅ | skeleton swap; in-flight motion imperative without re-render (selectCard) |

## Issues Found

**CRITICAL**: None

**WARNING**:
1. **Manual/device verification not executed.** `verify/checklist.md` is complete and maps 1:1 to every spec scenario (coverage map lines 75-98), but the Result column is empty — no PASS/FAIL recorded — and no browser is available in this environment. The 14 PARTIAL scenarios above (responsive 390px/1440px, touch coexistence, reduced-motion on device, dialog focus trap, screen-reader announcements, sink DOM removal, keyboard browsing) lack runtime evidence. Per design.md §Testing Strategy these rows require a real device pass. Recommend: run the checklist on a 390px phone, a 1440px desktop, with `prefers-reduced-motion: reduce`, a screen reader, and keyboard-only, then record results before final archive sign-off.

**SUGGESTION**:
1. **Dedicated smoke assert for the exact-1 pool** (DECK-4 "Single-remaining pool" / DRAW-2 "Last-card pool"): `poolFor` with 2 drawn → expect length 1. Mechanism is already proven (12→11→10 filter), so this is a one-line hardening, not a defect.
2. **Commit the openspec artifacts**: `git ls-files` shows only `tasks.md` tracked; `proposal.md`, `design.md`, and `openspec/specs/` are untracked. Archive moves files on disk regardless, but the git audit trail should include them (commit before/with the archive step).
3. **Minor doc nit**: `verify/smoke.mjs` header still says "Slice 1" while the suite covers Slices 1–3; and checklist row C22 (undersized deck via console mutation) is now redundant with the smoke §C pool-exhaustion coverage — optional trim.

## Manual Checklist Gap Assessment

- **Executable statically / by source inspection** (rows C4, C5, C14, C15, C44 partially, C40 partially, C41/C42 partially): the expected facts are verifiable from code and hold (documented format header in deck.js, exact positions, CSS-only motion, Spanish copy, focus-visible, Escape wiring, announce wiring). Assessed ✅ via source evidence above.
- **Require a device/browser pass (NOT executed)**: C8-C12 (swipe/keys/focus/responsive carousel), C17-C19 (flip/sink visuals, IO scroll reveal), C23-C25 (reduced motion, touch interplay, desktop reveal), C29-C32 (dialog open/close/trap), C38-C39 (responsive review), C41-C42 (screen-reader announcements), C45 (reduced-motion spread/dialog). These need a 390px mobile, a 1440px desktop, OS reduced-motion, and a screen reader; the environment has no browser (no chromium/firefox/playwright), so they cannot be executed here.
- **State-machine rows with smoke equivalents** (C16 commit, C20 pool, C21 max-3, C22 undersized hint, C26-C28, C33-C37): already proven by smoke; the manual rows remain valid as a second human check.

## Recommendation

**Archive-ready with a recorded device pass.** Automated evidence is strong (89/89 smoke, 15/15 tasks, zero spec violations, zero design deviations, all hard constraints hold, T1-T13 complete). The remaining gap is purely the unrecorded manual/device execution (WARNING-1). Options: (a) run the checklist on real devices now and record results, then archive; or (b) archive now with this WARNING tracked in the archive's audit trail and the device pass as an immediate follow-up. Either is defensible; (a) is preferred since the checklist is fully scripted and the change is small.
