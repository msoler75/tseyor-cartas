# card-draw Specification

## Purpose

Core draw ritual: home → carousel → reveal, draw loop, max-3 guard, keyboard/reduced-motion. Spanish UI.

## Requirements

### Requirement: DRAW-1 — Phase state machine

The flow MUST sequence phases `home` (instructions + "Sacar carta"), `carousel` (face-down, per-draw jitter), `reveal` (flip-elevate, detail below). Selecting commits the card to `drawn` BEFORE animation; animation MUST be non-blocking, no rollback on interruption.

#### Scenario: Happy path

- GIVEN home phase with `drawn.length = 0`
- WHEN the user activates "Sacar carta"
- THEN carousel opens: jittered face-down fan of all deck cards

#### Scenario: Commit-before-animation

- GIVEN the user activates a carousel card
- WHEN the flip animation starts
- THEN `drawn` already contains the card id even if the animation is interrupted

### Requirement: DRAW-2 — Carousel browsing and selection

Carousel MUST support swipe (touch-action pan-x, scroll-snap) and ←/→ keys; Enter/Space MUST select the focused card; focus-visible MUST land on the carousel when it opens. Touch targets MUST be ≥ 44px; layout MUST respect safe-area insets and use 100dvh with a 100vh fallback. Activating an already-committed card MUST NOT draw it twice.

#### Scenario: Keyboard selection

- GIVEN the carousel is open, card focused
- WHEN → is pressed, then Enter
- THEN the card commits to `drawn`, reveal begins

#### Scenario: Double activation

- GIVEN a card is committed, reveal animating
- WHEN activated again
- THEN `drawn` gains no duplicate, no new animation starts

#### Scenario: Last-card pool

- GIVEN `drawn.length = 2`
- WHEN the carousel opens
- THEN it renders exactly 1 face-down card, selectable to finish the tirada

### Requirement: DRAW-3 — Selection motion contract

CSS MUST own all motion (3D flip-elevate, staggered sink, snap); JS MUST own jitter generation, state transitions, passive scroll→tilt binding. Sunk cards MUST be removed from DOM when their sink transition ends.

#### Scenario: Sink and cleanup

- GIVEN a card is selected
- WHEN the other cards' sink transition ends
- THEN those cards are removed from the DOM, no longer interactive

#### Scenario: Reduced motion

- GIVEN `prefers-reduced-motion: reduce`
- WHEN a card is selected
- THEN state advances to reveal instantly, no animation, detail still reachable

### Requirement: DRAW-4 — Max-3 guard

`drawn.length` MUST never exceed 3. When `drawn.length = 3`, draw controls MUST NOT render and the hint "Tirada completa 3/3" MUST render instead. Draw controls MUST be text-only buttons (no icons).

#### Scenario: Fourth draw blocked

- GIVEN `drawn.length = 3`
- WHEN the reveal phase ends
- THEN no draw control is offered; "Tirada completa 3/3" and "Ver tirada" are available

### Requirement: DRAW-5 — Reveal detail panel

In reveal, the chosen card MUST enlarge (CSS 3D); scrolling MUST reveal the meaning panel below (IntersectionObserver) with position label, title, keywords, meaning, description. Scroll listeners MUST be passive.

#### Scenario: Scroll reveal

- GIVEN the reveal phase is active
- WHEN the detail panel enters the viewport by scrolling
- THEN the panel's revealed state activates

### Requirement: DRAW-6 — "Sacar otra carta" loop

After a reveal, "Sacar otra carta" MUST open the next carousel with pool excluding `drawn` (no home pass). The control MUST be hidden when `drawn.length = 3`.

#### Scenario: Next draw

- GIVEN a reveal with `drawn.length = 1`
- WHEN the user activates "Sacar otra carta"
- THEN the carousel reopens with pool minus drawn (11 cards for a 12-card deck)

### Requirement: DRAW-8 — Responsive draw layout (mobile + desktop)

The draw flow MUST be fully usable and visually correct on both mobile and desktop. On mobile, the carousel is a swipeable snapped strip with ≥44px targets and safe-area breathing room; on desktop (≥ ~768px wide), cards MUST scale up (min()/clamp() sizing), the carousel centers with comfortable spacing, the enlarged card caps at a readable size, and the detail panel uses a max reading width (~65ch) so lines do not stretch across wide screens. No content MAY be clipped or unreachable in either range; the layout MUST not depend on orientation to function.

#### Scenario: Mobile portrait

- GIVEN a 390px-wide viewport in the carousel phase
- WHEN the user swipes and selects a card
- THEN the reveal enlarges the card within the viewport, the detail panel scrolls into view below with readable line lengths, and no control is off-screen

#### Scenario: Desktop wide

- GIVEN a 1440px-wide viewport in the reveal phase
- WHEN the detail panel is revealed by scrolling
- THEN the card is centered at a capped size, the panel is centered at ≤ ~65ch, and controls ("Sacar otra carta", "Ver tirada", "Nueva tirada") are visible without horizontal scrolling

### Requirement: DRAW-7 — Draw-flow accessibility

In carousel, ←/→ MUST scroll, Enter/Space MUST select. Escape in draw phases MUST be a no-op; a live region MUST announce each reveal (title + position) and "Tirada completa 3/3" with appropriate politeness.

#### Scenario: Arrow browsing

- GIVEN the carousel is open
- WHEN the user presses → then ←
- THEN focus moves along the fan accordingly

#### Scenario: Reveal announced

- GIVEN a card is revealed
- THEN its title and position are announced via aria-live