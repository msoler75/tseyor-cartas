# Manual Checklist — Cartas Tseyor (Slices 1–3)

Manual checklist for Slices 1, 2 and 3 (PRs 1, 2 and 3): shell, deck, home,
carousel, reveal/detail/draw-loop, and the review/reset/a11y polish. Each row
maps to a spec scenario; the coverage map at the end ties every requirement
(DECK-1..4, DRAW-1..8, REVIEW-1..6) to its rows.

## How to run

1. Open `index.html` directly over `file://` (double-click the file) — no server, no install.
2. Test on a real phone (390px portrait) and a desktop browser (1440px) for the responsive rows.
3. Record `PASS` / `FAIL` in the last column; note any observation next to the failure.

## Slice 1

| # | Scenario (spec) | Steps | Expected | Result |
|---|-----------------|-------|----------|--------|
| C1 | DECK-2 — starter deck loads | Open the app on home | Header "Cartas Tseyor" and the home intro render; no console errors | |
| C2 | DECK-2 — 12 unique cards | Open the carousel (activate "Sacar carta") | Exactly 12 face-down cards, each with a different jitter angle (fan look); all show the same deck-back motif | |
| C3 | DECK-2 — placeholder face | Inspect a card in the carousel (devtools) | The front face holds a `<span class="face-num">` with a Roman numeral (I–XII, order = deck position); no image requests fired | |
| C4 | DECK-1 — documented format | Read the comment header of `deck.js` | Header explains fields (id/title/keywords/meaning/description/image) and positions in plain Spanish a non-developer can follow | |
| C5 | DECK-3 — position labels | Read `deck.js` | `positions` = ["Situación actual", "Desafío", "Consejo"] (exactly 3, in order) | |
| C6 | DRAW-1 — happy path | Open app → activate "Sacar carta" | Home switches to the carousel with all 12 face-down cards; no page reload | |
| C7 | DRAW-1 — reload → home | On any phase, reload the page (F5 / re-open) | App always returns to home with an empty tirada (no persistence: no localStorage/sessionStorage writes) | |
| C8 | DRAW-2 — swipe | On a phone, swipe the carousel left/right | The strip scrolls and snaps a card to the center; vertical page scroll still works (touch-action pan-x pan-y, R4-W1) | |
| C9 | DRAW-2 — arrow keys | Focus a card (Tab), press → then ← | Focus moves to the next/previous card and the strip scrolls to keep it centered; Home/End jump to the ends of the fan | |
| C10 | DRAW-2 — focus lands in carousel | Open the carousel with a keyboard | Focus lands on the first card of the fan (visible focus outline) | |
| C11 | DRAW-8 — mobile portrait | Phone at 390px, carousel phase | Cards are swipeable with ≥44px touch targets; content respects safe-area insets (no clipping under notch/home bar); no horizontal page scroll beyond the strip | |
| C12 | DRAW-8 — desktop wide | Desktop at 1440px, carousel phase | The strip is centered with a capped width (~min(92vw, 1100px)); cards scale up (≥190px) with comfortable spacing; all 12 cards reachable by scroll/snap | |
| C13 | DRAW-4 — max-3 UI scaffold | On home, inspect "Ver tirada" | "Ver tirada" button is rendered but `disabled` (drawn = 0); "Sacar carta" is the only active control | |
| C14 | DRAW-3 — motion ownership | Inspect `styles.css` / `app.js` (devtools) | All transition/animation rules are in CSS (transform/opacity only); JS writes only `--rz`/`--rx`/`--tilt` variables and state classes | |
| C15 | General — Spanish UI | Open the app | All visible copy is neutral/professional Spanish (`<html lang="es">`); no untranslated strings, no icons | |

## Slice 2

| # | Scenario (spec) | Steps | Expected | Result |
|---|-----------------|-------|----------|--------|
| C16 | DRAW-1 — commit-before-animation | Open the carousel, click a card | Immediately on click, `Cartas.state.drawn` already contains the card id (devtools) and the flip/sink animation starts; interrupting it never rolls the draw back | |
| C17 | DRAW-3 — flip-elevate | Select a card | The chosen card rises and flips in ~600ms (ease-in-out), back face rotating to the front; the rest sink with staggered delay (45ms per index) | |
| C18 | DRAW-3 — sink cleanup | After selecting, wait ~1s | Sunk cards are removed from the DOM (devtools: no `.is-sunk` nodes remain); they cannot be focused or clicked anymore | |
| C19 | DRAW-5 — reveal detail | After the flip completes | Reveal phase: enlarged card centered at `min(72vw, 340px)`; scrolling down fades the detail panel in (position label, title, keywords, meaning, description) with `max-width: 65ch`; IntersectionObserver fires once (passive scroll) | |
| C20 | DRAW-6 — draw loop | In reveal, activate "Sacar otra carta" | Carousel reopens with the pool minus drawn (11 cards for the 12-deck) — no home pass, no repeated ids; focus lands on the first card of the new fan (R2-W1) | |
| C21 | DRAW-4 — max-3 | Draw until 3/3 | After the third reveal, no draw control is rendered; the hint "Tirada completa 3/3" shows instead ("Ver tirada" wiring lands in Slice 3) | |
| C22 | DECK-2 — pool-exhausted hint | In the console, set `Cartas.deck` to a 2-card deck (e.g. `{...Cartas.deck, cards: Cartas.deck.cards.slice(0,2)}`), then draw two cards; restore the deck afterwards | The second reveal shows "Tirada completa — no quedan más cartas" (no hard-coded 3/3); no empty carousel ever opens | |
| C23 | DRAW-3 — reduced motion | Enable `prefers-reduced-motion: reduce` (OS setting or devtools emulation), select a card | Reveal happens instantly — no flip/sink animation; the detail panel is visible and reachable immediately | |
| C24 | DRAW-2/DRAW-5 — touch interplay (R4-W1) | On a phone: swipe the carousel horizontally; then, in reveal, swipe vertically | Horizontal swipes scroll the strip; vertical swipes scroll the page to the detail panel; the two gestures coexist (touch-action pan-x pan-y + overscroll-behavior-contain) | |
| C25 | DRAW-8 — reveal desktop | Desktop at 1440px, reveal phase | Card centered and capped (340px); detail panel centered at ≤65ch; controls visible without horizontal scrolling | |

## Slice 3

| # | Scenario (spec) | Steps | Expected | Result |
|---|-----------------|-------|----------|--------|
| C26 | REVIEW-1 — spread renders | Draw 2 cards, activate "Ver tirada" | Review shows both cards in drawn order, labeled "Situación actual" and "Desafío" | |
| C27 | REVIEW-1 — empty guard | In the console: `Cartas.state = { mode: "review", phase: "spread", drawn: [], selectedId: null }; Cartas.render()` | Renders "Aún no has sacado cartas" — no spread, no dialog, no crash | |
| C28 | REVIEW-1 — button gating | Home with drawn=0; reveal with drawn≥1 | "Ver tirada" is `disabled` at 0 and enabled at ≥1 | |
| C29 | REVIEW-2 — open dialog | Press Enter on a spread card | A `role="dialog"` `aria-modal="true"` opens (aria-labelledby → title) showing title, keywords, meaning, description and position label; focus is inside; background is inert (`#app.inert`) | |
| C30 | REVIEW-2 — close & focus return | Press Escape (or "Cerrar") | Dialog closes; focus returns to the activating card | |
| C31 | REVIEW-2 — shared renderer (D10) | Compare dialog vs reveal detail in devtools | Same structure and classes (kicker, title, keywords, meaning, description) — both built by `renderDetail()` | |
| C32 | REVIEW-3 — focus trap | Dialog open; press Tab and Shift+Tab | Focus cycles within the dialog ("Cerrar" ↔ "Nueva tirada"), never into the background; inert blocks background interaction | |
| C33 | REVIEW-4 — resume at last reveal | Review with 2 drawn cards → "Volver" | Resumes at the reveal of the second card; `drawn` unchanged; "Sacar otra carta" still available | |
| C34 | REVIEW-4 — complete tirada return | Review with 3 drawn cards → "Volver" | Resumes at the third reveal with "Tirada completa 3/3" and "Ver tirada"; no draw control | |
| C35 | REVIEW-5 — reset from review | Review with 3 drawn → "Nueva tirada" | Instant reset to home (drawn 0); no confirmation appears | |
| C36 | REVIEW-5 — reset with dialog open | Dialog open → "Nueva tirada" in the dialog footer | Dialog closes, inert cleared, home renders with an empty tirada | |
| C37 | REVIEW-5 — reload | Any phase → reload the page | Always returns to home empty; devtools show no localStorage/sessionStorage writes | |
| C38 | REVIEW-6 — mobile review (390px) | Phone 390px: spread with 3 cards, then open a detail | Spread stacks vertically; all 3 cards reachable/tappable with ≥44px targets and safe-area breathing room; dialog fits ≤92vw, scrolls internally (`max-height: min(85dvh, 85vh)`), nothing clipped | |
| C39 | REVIEW-6 — desktop review (1440px) | Desktop 1440px: spread with 3 cards, then open a detail | Spread lays out in a centered row (≥1024px) with larger cards; dialog opens centered at `min(92vw, 640px)` × `max-height: min(85dvh, 85vh)` with no clipped content | |
| C40 | DRAW-7 — Escape no-op in draw | In carousel and reveal, press Escape | Nothing happens — no state change, no dialog (no-op) | |
| C41 | DRAW-7 — dialog announced | Open a card detail with a screen reader active | The live region announces the card title and position (e.g. "El Sol — Situación actual") | |
| C42 | DRAW-7 — tirada completa announced | Complete a 3/3 tirada (reduce motion or normal) | The live region announces "Tirada completa 3/3" | |
| C43 | DRAW-8 — desktop reveal controls | Desktop 1440px, reveal with 2 drawn | "Sacar otra carta", "Ver tirada" and "Nueva tirada" are visible without horizontal scrolling | |
| C44 | General — focus-visible | Tab through home, carousel, reveal, spread and dialog | Every focusable shows the 2px accent outline (`outline-offset: 2px`); no `outline: none` anywhere | |
| C45 | General — reduced motion | Enable `prefers-reduced-motion: reduce`; open the spread and a dialog | No motion: spread items appear instantly (no stagger delay), dialog opens/closes instantly | |
| C46 | General — Spanish copy | Audit every screen | All visible copy is neutral/professional Spanish; no untranslated strings, no icons | |

## Coverage map

Every spec requirement has at least one manual row:

| Requirement | Checklist rows |
|-------------|----------------|
| DECK-1 (documented format) | C4 |
| DECK-2 (starter deck, unique, placeholder face) | C1, C2, C3, C22 |
| DECK-3 (3 position labels) | C5 |
| DECK-4 (no-repeat pool) | C20 |
| DRAW-1 (phase machine, commit-before-animation, reload) | C6, C7, C16 |
| DRAW-2 (swipe, arrows, focus, ≥44px, no double draw) | C8, C9, C10 |
| DRAW-3 (motion contract, sink cleanup, reduced motion) | C14, C17, C18, C23 |
| DRAW-4 (max-3, hint, text-only buttons) | C13, C21 |
| DRAW-5 (reveal detail via IO) | C19 |
| DRAW-6 ("Sacar otra carta" loop) | C20 |
| DRAW-7 (Escape no-op, live announcements) | C40, C41, C42 |
| DRAW-8 (mobile + desktop responsive) | C11, C12, C25, C43 |
| REVIEW-1 (spread, gating, empty guard) | C26, C27, C28 |
| REVIEW-2 (dialog, focus in/out, shared renderer) | C29, C30, C31 |
| REVIEW-3 (focus trap, inert) | C32 |
| REVIEW-4 (return to draw flow, unchanged round-trip) | C33, C34 |
| REVIEW-5 (instant reset, no persistence) | C35, C36, C37 |
| REVIEW-6 (responsive review mobile + desktop) | C38, C39 |

## Notes / observations

<!-- Append failures here with repro steps, e.g.:
- C9 FAIL on Firefox macOS: → moves focus but strip does not scroll (build 123). -->