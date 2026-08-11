# Manual Checklist — Cartas Tseyor (Slices 1–2)

Manual checklist for Slices 1 and 2 (PRs 1 and 2): shell, deck, home,
carousel, and the reveal/detail/draw-loop flow. Each row maps to a spec
scenario. Slice 3 rows (review/reset, a11y polish) are appended by that slice.

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

## Notes / observations

<!-- Append failures here with repro steps, e.g.:
- C9 FAIL on Firefox macOS: → moves focus but strip does not scroll (build 123). -->