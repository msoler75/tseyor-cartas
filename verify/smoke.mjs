#!/usr/bin/env node
/**
 * Smoke suite — Cartas Tseyor (Slice 1)
 * =====================================
 * Runs in plain Node with a `window` shim; no browser, no dependencies.
 *
 *   node verify/smoke.mjs
 *
 * Sections (grow per slice; each commit keeps the suite green):
 *   A. Deck-format invariants (DECK-1/2/3) — shipped 12-card deck + mini
 *      fixture: >=1 card, unique ids, exactly 3 position labels, required
 *      fields present.
 *   B. Pure transition() core (DRAW-1, DECK-1) — T1 RELOAD, T2 "Sacar carta",
 *      guards, no-op fallback, no-repeat pool helper (DECK-4).
 *      (Added together with app.js.)
 *   C. Draw-loop transitions T3–T7 + getDrawGuard (Slice 2) — commit-
 *      before-animation, double-activation no-op, FLIP_END, SINK_END,
 *      "Sacar otra carta" loop, max-3, no-repeat pool, and both "Tirada
 *      completa" hint copies incl. the 2-card pool-exhaustion case (DECK-2).
 *      (Added together with app.js Slice 2 core.)
 *   D. Review transitions T8–T13 + ESCAPE + REVIEW-1..5 (Slice 3) —
 *      "Ver tirada" opens review/spread only with drawn >= 1, tap opens
 *      the detail (dialog state), close/back round-trip resumes at the
 *      last reveal with drawn unchanged, Escape is context-dependent
 *      (close dialog / back / no-op in draw), empty review is unreachable
 *      at the machine level, and "Nueva tirada" resets instantly from
 *      review or reveal with no confirmation (dialog included).
 *
 * Exit code 0 = green, 1 = failures.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { miniDeck } from "./mini-deck.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let failures = 0;
let checks = 0;

function check(label, ok, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function loadScript(file) {
  return runInThisContext(readFileSync(join(ROOT, file), "utf8"), { filename: file });
}

/* ------------------------------------------------------------------ */
/* A. Deck-format invariants                                           */
/* ------------------------------------------------------------------ */

/**
 * Validate one deck object against the deck-config contract.
 * @param {{positions: string[], cards: Array}} deck
 * @param {string} label human-readable name for failure messages
 */
function checkDeck(deck, label) {
  console.log(`\nDeck invariants — ${label}`);

  check(
    `${label}: exposes cards and positions arrays`,
    deck && Array.isArray(deck.cards) && Array.isArray(deck.positions),
    "deck.cards / deck.positions must be arrays"
  );
  if (!deck || !Array.isArray(deck.cards)) return;

  check(`${label}: at least 1 card`, deck.cards.length >= 1, `got ${deck.cards.length}`);

  check(
    `${label}: exactly 3 position labels`,
    deck.positions.length === 3,
    `got ${deck.positions.length}`
  );
  check(
    `${label}: position labels match DECK-3`,
    JSON.stringify(deck.positions) ===
      JSON.stringify(["Situación actual", "Desafío", "Consejo"]),
    `got ${JSON.stringify(deck.positions)}`
  );

  const ids = deck.cards.map((c) => c.id);
  check(
    `${label}: ids are unique`,
    new Set(ids).size === ids.length,
    "duplicate ids found"
  );

  const REQUIRED = ["id", "title", "keywords", "meaning", "description"];
  for (const field of REQUIRED) {
    const bad = deck.cards.filter(
      (c) => typeof c[field] !== "string" || c[field].trim().length === 0
    );
    check(
      `${label}: every card has non-empty "${field}"`,
      bad.length === 0,
      bad.length ? `missing on ${bad.map((c) => c.id || "?").join(", ")}` : ""
    );
  }

  const badImage = deck.cards.filter(
    (c) => c.image !== undefined && typeof c.image !== "string"
  );
  check(
    `${label}: image field, when present, is a string (reserved)`,
    badImage.length === 0,
    badImage.length ? `non-string image on ${badImage.map((c) => c.id).join(", ")}` : ""
  );
}

/* Load the shipped deck through the window shim (plain script, no ES module). */
global.window = {};

console.log("\n== Section A: deck-format invariants ==");
loadScript("deck.js");
check("shipped deck exposes window.Cartas.deck", Boolean(global.window.Cartas.deck));
if (global.window.Cartas.deck) {
  checkDeck(global.window.Cartas.deck, "shipped (12 cards)");
  check(
    "shipped deck has 12 cards (DECK-2 starter target)",
    global.window.Cartas.deck.cards.length === 12,
    `got ${global.window.Cartas.deck.cards.length}`
  );
}
checkDeck(miniDeck, "mini fixture (2 cards)");

/* ------------------------------------------------------------------ */
/* B. Pure transition() core — T1 RELOAD, T2 DRAW_START                */
/* ------------------------------------------------------------------ */

console.log("\n== Section B: transition core (T1/T2) ==");

/* app.js runs in the same shimmed global: window.Cartas gets transition. */
loadScript("app.js");
const { transition, createInitialState, poolFor } = global.window.Cartas;
check("app.js exposes pure transition()/createInitialState()/poolFor()",
  typeof transition === "function" &&
    typeof createInitialState === "function" &&
    typeof poolFor === "function");

const initial = createInitialState();
check(
  "createInitialState: draw/home, drawn [], selectedId null",
  initial.mode === "draw" &&
    initial.phase === "home" &&
    Array.isArray(initial.drawn) &&
    initial.drawn.length === 0 &&
    initial.selectedId === null,
  JSON.stringify(initial)
);

/* T1 — RELOAD resets to home from any state (DRAW-1: reload → home). */
{
  const messy = { mode: "draw", phase: "carousel", drawn: [{ cardId: "sol" }], selectedId: "sol" };
  const reloaded = transition(messy, { type: "RELOAD" });
  check(
    "T1 RELOAD → draw/home with empty drawn (reload → home)",
    reloaded.mode === "draw" &&
      reloaded.phase === "home" &&
      reloaded.drawn.length === 0 &&
      reloaded.selectedId === null,
    JSON.stringify(reloaded)
  );
  check("T1 returns a fresh state object (immutable)", reloaded !== messy);
}

/* T2 — "Sacar carta" opens the carousel from draw/home (DRAW-1 happy path). */
{
  const carousel = transition(initial, { type: "DRAW_START" });
  check(
    "T2 DRAW_START → draw/carousel, drawn unchanged",
    carousel.mode === "draw" &&
      carousel.phase === "carousel" &&
      carousel.drawn.length === 0 &&
      carousel.selectedId === null,
    JSON.stringify(carousel)
  );
  check("T2 keeps the pool at the full deck size (12)", poolFor(carousel).length === 12);
}

/* Guards — T2 only valid from draw/home; unknown actions are no-ops. */
{
  const s = { ...initial, phase: "carousel" };
  check(
    "guard: DRAW_START from draw/carousel is a no-op (same reference)",
    transition(s, { type: "DRAW_START" }) === s && s.phase === "carousel" && s.drawn.length === 0
  );
  check(
    "guard: unknown action returns the same state reference",
    transition(initial, { type: "SACAR_OTRA" }) === initial
  );
  check("guard: null action returns the same state reference", transition(initial, null) === initial);
}

/* poolFor — no-repeat pool excludes drawn ids (DECK-4). */
{
  const withDrawn = { ...initial, drawn: [{ cardId: "sol" }, { cardId: "luna" }] };
  const pool = poolFor(withDrawn);
  const ids = pool.map((c) => c.id);
  check(
    "poolFor excludes drawn ids (sol, luna absent), DECK-4",
    ids.length === 10 && !ids.includes("sol") && !ids.includes("luna"),
    ids.join(",")
  );
}

/* ------------------------------------------------------------------ */
/* C. Draw-loop transitions T3–T7 + getDrawGuard (Slice 2)             */
/*    T3 commit-before-animation, T5 double-activation no-op, T4       */
/*    FLIP_END, T6 SINK_END (DOM-only), T7 "Sacar otra carta", max-3,  */
/*    no-repeat pool (DECK-4) and both "Tirada completa" copies        */
/*    (DECK-2) — 12-card deck AND 2-card mini fixture.                 */
/* ------------------------------------------------------------------ */

console.log("\n== Section C: draw-loop transitions (T3–T7) + guard ==");

/* Helper: estado draw/carousel fresco (T2). */
const carouselState = () => transition(initial, { type: "DRAW_START" });

/* T3 — SELECT commits BEFORE any animation (DRAW-1 commit-before-animation). */
{
  const s = carouselState();
  const next = transition(s, { type: "SELECT", cardId: "sol" });
  check(
    "T3 SELECT commits: drawn=[sol], selectedId=sol, phase stays carousel (revealing)",
    next.drawn.length === 1 &&
      next.drawn[0].cardId === "sol" &&
      next.selectedId === "sol" &&
      next.phase === "carousel",
    JSON.stringify(next)
  );
  check("T3 returns a fresh state (immutable)", next !== s);
  check("T3 pool immediately excludes the committed card (11)", poolFor(next).length === 11);
}

/* T3 guard — an already-drawn id can never be selected twice (no-repeat). */
{
  const s = { ...carouselState(), drawn: [{ cardId: "sol" }] };
  const next = transition(s, { type: "SELECT", cardId: "sol" });
  check(
    "T3 refuses an already-drawn id (same reference, no duplicate)",
    next === s && next.drawn.length === 1
  );
}

/* T5 — double activation while revealing is a no-op (DRAW-2). */
{
  const s = { ...carouselState(), drawn: [{ cardId: "sol" }], selectedId: "sol" };
  check(
    "T5 SELECT while revealing is a no-op (same reference)",
    transition(s, { type: "SELECT", cardId: "luna" }) === s && s.drawn.length === 1
  );
  check(
    "T5 re-activating the same committed card is a no-op",
    transition(s, { type: "SELECT", cardId: "sol" }) === s
  );
}

/* T4 — FLIP_END advances to reveal, preserving drawn/selectedId. */
{
  const revealing = { ...carouselState(), drawn: [{ cardId: "sol" }], selectedId: "sol" };
  const reveal = transition(revealing, { type: "FLIP_END" });
  check(
    "T4 FLIP_END → draw/reveal, drawn & selectedId preserved",
    reveal.mode === "draw" &&
      reveal.phase === "reveal" &&
      reveal.drawn.length === 1 &&
      reveal.selectedId === "sol",
    JSON.stringify(reveal)
  );
  const idle = carouselState();
  check(
    "T4 FLIP_END without a pending selection is a no-op (same reference)",
    transition(idle, { type: "FLIP_END" }) === idle
  );
  check(
    "T4 repeated FLIP_END in reveal is a no-op (same reference)",
    transition(reveal, { type: "FLIP_END" }) === reveal
  );
}

/* T6 — SINK_END is DOM-only; state never changes. */
{
  const s = { ...carouselState(), drawn: [{ cardId: "sol" }], selectedId: "sol" };
  check("T6 SINK_END keeps the same state reference (DOM-only)", transition(s, { type: "SINK_END" }) === s);
}

/* T7 — "Sacar otra carta" opens the next carousel; pool excludes drawn (DRAW-6/DECK-4). */
{
  const reveal1 = transition(
    { ...carouselState(), drawn: [{ cardId: "sol" }], selectedId: "sol" },
    { type: "FLIP_END" }
  );
  const next2 = transition(reveal1, { type: "NEXT_DRAW" });
  check(
    "T7 NEXT_DRAW → draw/carousel, selectedId null, drawn preserved",
    next2.mode === "draw" &&
      next2.phase === "carousel" &&
      next2.selectedId === null &&
      next2.drawn.length === 1,
    JSON.stringify(next2)
  );
  const pool2 = poolFor(next2);
  check(
    "T7 new pool excludes drawn ids (DECK-4): 11 cards, sol absent",
    pool2.length === 11 && !pool2.some((c) => c.id === "sol"),
    pool2.map((c) => c.id).join(",")
  );
}

/* T7/T2 state-level guards (R3-W2): never a 4th draw, never an empty carousel. */
{
  const reveal3 = {
    mode: "draw",
    phase: "reveal",
    drawn: [{ cardId: "a" }, { cardId: "b" }, { cardId: "c" }],
    selectedId: "c"
  };
  check(
    "T7 NEXT_DRAW refused at drawn.length 3 (same reference, max-3)",
    transition(reveal3, { type: "NEXT_DRAW" }) === reveal3 && reveal3.drawn.length === 3
  );

  const homeDrawn3 = {
    mode: "draw",
    phase: "home",
    drawn: [{ cardId: "a" }, { cardId: "b" }, { cardId: "c" }],
    selectedId: null
  };
  check(
    "T2 DRAW_START refused when drawn.length >= 3 (same reference, defensive)",
    transition(homeDrawn3, { type: "DRAW_START" }) === homeDrawn3
  );

  /* Mini deck (2 cards): pool exhausted after 2 draws → machine refuses. */
  const shippedDeck = global.window.Cartas.deck;
  global.window.Cartas.deck = miniDeck;
  try {
    const homeEmpty = {
      mode: "draw",
      phase: "home",
      drawn: [{ cardId: "sol" }, { cardId: "luna" }],
      selectedId: null
    };
    check(
      "T2 DRAW_START refused with empty pool (undersized deck, same reference)",
      transition(homeEmpty, { type: "DRAW_START" }) === homeEmpty
    );
    const revealMini = {
      mode: "draw",
      phase: "reveal",
      drawn: [{ cardId: "sol" }, { cardId: "luna" }],
      selectedId: "luna"
    };
    check(
      "T7 NEXT_DRAW refused with empty pool (undersized deck, same reference)",
      transition(revealMini, { type: "NEXT_DRAW" }) === revealMini
    );
  } finally {
    global.window.Cartas.deck = shippedDeck;
  }
}

/* getDrawGuard — pure guard + exact hint copies (R3-W1, DECK-2/DRAW-4). */
{
  const { getDrawGuard } = global.window.Cartas;
  check("app.js exposes pure getDrawGuard()", typeof getDrawGuard === "function");

  const g0 = getDrawGuard(initial, poolFor(initial));
  check(
    "guard: 12-card deck, drawn 0 → canDraw true, no hint",
    g0.canDraw === true && g0.hint === "",
    JSON.stringify(g0)
  );

  const g3 = getDrawGuard(
    { ...initial, drawn: [{ cardId: "a" }, { cardId: "b" }, { cardId: "c" }] },
    poolFor(initial)
  );
  check(
    "guard: drawn 3 → canDraw false, hint 'Tirada completa 3/3' (DRAW-4)",
    g3.canDraw === false && g3.hint === "Tirada completa 3/3",
    JSON.stringify(g3)
  );

  /* Mini deck: both cards drawn, pool empty → pool-exhaustion copy, no 3/3. */
  const shippedDeck = global.window.Cartas.deck;
  global.window.Cartas.deck = miniDeck;
  try {
    const exhausted = {
      ...initial,
      drawn: [{ cardId: "sol" }, { cardId: "luna" }]
    };
    const ga = getDrawGuard(exhausted, poolFor(exhausted));
    check(
      "guard: 2-card deck exhausted → canDraw false, hint 'Tirada completa — no quedan más cartas' (DECK-2)",
      ga.canDraw === false && ga.hint === "Tirada completa — no quedan más cartas",
      JSON.stringify(ga)
    );
    const gb = getDrawGuard(initial, poolFor(initial));
    check(
      "guard: 2-card deck, drawn 0 → canDraw true, no hint",
      gb.canDraw === true && gb.hint === "",
      JSON.stringify(gb)
    );
  } finally {
    global.window.Cartas.deck = shippedDeck;
  }
}

/* ------------------------------------------------------------------ */
/* D. Review transitions T8–T11 + ESCAPE (Slice 3, PR 3 commit 1)      */
/*    T8 "Ver tirada", T9 tap → dialog, T10 close, T11 back/resume,    */
/*    ESCAPE context (T10/T11/T13), REVIEW-1 empty guard, REVIEW-4     */
/*    round-trip unchanged.                                            */
/* ------------------------------------------------------------------ */

console.log("\n== Section D: review transitions (T8–T11) + ESCAPE ==");

/* Helper: estado draw/reveal con 2 cartas sacadas (para T8/T9/T11). */
const reveal2 = {
  mode: "draw",
  phase: "reveal",
  drawn: [{ cardId: "sol" }, { cardId: "luna" }],
  selectedId: "luna"
};

/* T8 — "Ver tirada" abre review/spread solo con drawn >= 1 (REVIEW-1). */
{
  const review = transition(reveal2, { type: "REVIEW_OPEN" });
  check(
    "T8 REVIEW_OPEN → review/spread, selectedId null, drawn preserved",
    review.mode === "review" &&
      review.phase === "spread" &&
      review.selectedId === null &&
      review.drawn.length === 2 &&
      review.drawn[0].cardId === "sol" &&
      review.drawn[1].cardId === "luna",
    JSON.stringify(review)
  );
  check("T8 returns a fresh state (immutable)", review !== reveal2);

  const revealEmpty = { ...reveal2, drawn: [], selectedId: null };
  check(
    "T8 refused with drawn.length 0 (same reference, REVIEW-1 empty guard)",
    transition(revealEmpty, { type: "REVIEW_OPEN" }) === revealEmpty
  );
  check(
    "T8 refused from draw/carousel (same reference)",
    (() => {
      const s = carouselState();
      return transition(s, { type: "REVIEW_OPEN" }) === s;
    })()
  );
  check(
    "T8 refused from draw/home with drawn 0 (same reference)",
    transition(initial, { type: "REVIEW_OPEN" }) === initial
  );
  check(
    "T8 accepted from draw/home when drawn >= 1 (home renders the button)",
    transition({ ...initial, drawn: [{ cardId: "sol" }] }, { type: "REVIEW_OPEN" })
      .phase === "spread"
  );
}

/* T9 — tap en una carta del spread abre el detalle (selectedId). */
{
  const spread = transition(reveal2, { type: "REVIEW_OPEN" });
  const tapped = transition(spread, { type: "REVIEW_TAP", cardId: "sol" });
  check(
    "T9 REVIEW_TAP → selectedId sol, mode/phase intactos (dialog open)",
    tapped.mode === "review" &&
      tapped.phase === "spread" &&
      tapped.selectedId === "sol",
    JSON.stringify(tapped)
  );
  check(
    "T9 refuses a card not in drawn (same reference)",
    transition(spread, { type: "REVIEW_TAP", cardId: "vuelo" }) === spread
  );
  check(
    "T9 refuses a second tap while the dialog is open (no-op)",
    transition(tapped, { type: "REVIEW_TAP", cardId: "luna" }) === tapped
  );
  check(
    "T9 refuses tap outside review/spread (same reference)",
    transition(reveal2, { type: "REVIEW_TAP", cardId: "sol" }) === reveal2
  );
}

/* T10 — "Cerrar" cierra el diálogo; sin diálogo es no-op. */
{
  const spread = transition(reveal2, { type: "REVIEW_OPEN" });
  const open = transition(spread, { type: "REVIEW_TAP", cardId: "luna" });
  const closed = transition(open, { type: "REVIEW_CLOSE" });
  check(
    "T10 REVIEW_CLOSE → selectedId null, spread y drawn intactos",
    closed.mode === "review" &&
      closed.phase === "spread" &&
      closed.selectedId === null &&
      closed.drawn.length === 2,
    JSON.stringify(closed)
  );
  check(
    "T10 REVIEW_CLOSE without an open dialog is a no-op (same reference)",
    transition(spread, { type: "REVIEW_CLOSE" }) === spread
  );
}

/* T11 — "Volver" sin diálogo reanuda en el ÚLTIMO reveal (REVIEW-4). */
{
  const spread = transition(reveal2, { type: "REVIEW_OPEN" });
  const back = transition(spread, { type: "REVIEW_BACK" });
  check(
    "T11 REVIEW_BACK → draw/reveal, selectedId = last drawn card (luna)",
    back.mode === "draw" &&
      back.phase === "reveal" &&
      back.selectedId === "luna" &&
      back.drawn.length === 2,
    JSON.stringify(back)
  );
  check(
    "T11 round-trip leaves drawn unchanged (REVIEW-4)",
    JSON.stringify(back.drawn) === JSON.stringify(reveal2.drawn) &&
      back.drawn[0].cardId === "sol" &&
      back.drawn[1].cardId === "luna"
  );
  check(
    "T11 REVIEW_BACK with the dialog open is a no-op (close first)",
    transition(
      transition(spread, { type: "REVIEW_TAP", cardId: "sol" }),
      { type: "REVIEW_BACK" }
    ).selectedId === "sol"
  );

  const spreadEmpty = { mode: "review", phase: "spread", drawn: [], selectedId: null };
  check(
    "T11 REVIEW_BACK with empty drawn is a no-op (defensive, same reference)",
    transition(spreadEmpty, { type: "REVIEW_BACK" }) === spreadEmpty
  );

  const reveal3 = {
    mode: "draw",
    phase: "reveal",
    drawn: [{ cardId: "a" }, { cardId: "b" }, { cardId: "c" }],
    selectedId: "c"
  };
  const spread3 = transition(reveal3, { type: "REVIEW_OPEN" });
  const back3 = transition(spread3, { type: "REVIEW_BACK" });
  check(
    "T11 back from a complete tirada resumes at the 3rd reveal with drawn 3",
    back3.phase === "reveal" && back3.selectedId === "c" && back3.drawn.length === 3
  );
}

/* ESCAPE — T10 si hay diálogo, T11 si no, T13 no-op en fases de draw. */
{
  const spread = transition(reveal2, { type: "REVIEW_OPEN" });
  const open = transition(spread, { type: "REVIEW_TAP", cardId: "sol" });
  const escClose = transition(open, { type: "ESCAPE" });
  check(
    "ESCAPE with dialog open closes it (T10): selectedId null",
    escClose.mode === "review" && escClose.phase === "spread" && escClose.selectedId === null
  );
  const escBack = transition(spread, { type: "ESCAPE" });
  check(
    "ESCAPE in review without dialog goes back to reveal (T11)",
    escBack.mode === "draw" && escBack.phase === "reveal" && escBack.selectedId === "luna"
  );
  check(
    "T13 ESCAPE in draw/home is a no-op (same reference, DRAW-7)",
    transition(initial, { type: "ESCAPE" }) === initial
  );
  check(
    "T13 ESCAPE in draw/carousel is a no-op (same reference, DRAW-7)",
    (() => {
      const s = carouselState();
      return transition(s, { type: "ESCAPE" }) === s;
    })()
  );
  check(
    "T13 ESCAPE in draw/reveal is a no-op (same reference, DRAW-7)",
    transition(reveal2, { type: "ESCAPE" }) === reveal2
  );
}

/* REVIEW-1 a nivel de máquina: ningún flujo llega a review con drawn 0, y
   las acciones de review sobre un spread vacío son no-op (nunca se cuelga). */
{
  const spreadEmpty = { mode: "review", phase: "spread", drawn: [], selectedId: null };
  check(
    "empty review: REVIEW_TAP is a no-op (same reference)",
    transition(spreadEmpty, { type: "REVIEW_TAP", cardId: "sol" }) === spreadEmpty
  );
  check(
    "empty review: ESCAPE is a no-op (same reference)",
    transition(spreadEmpty, { type: "ESCAPE" }) === spreadEmpty
  );
}

/* T12 — "Nueva tirada": reset instantáneo, sin confirmación (REVIEW-5);
   con el diálogo abierto lo cierra (selectedId null) como parte del reset. */
{
  const spread = transition(reveal2, { type: "REVIEW_OPEN" });
  const open = transition(spread, { type: "REVIEW_TAP", cardId: "sol" });
  const resetFromDialog = transition(open, { type: "RESET" });
  check(
    "T12 RESET from review with dialog open → draw/home, drawn [], selectedId null (REVIEW-5)",
    resetFromDialog.mode === "draw" &&
      resetFromDialog.phase === "home" &&
      resetFromDialog.drawn.length === 0 &&
      resetFromDialog.selectedId === null,
    JSON.stringify(resetFromDialog)
  );
  const resetFromReveal = transition(reveal2, { type: "RESET" });
  check(
    "T12 RESET from draw/reveal → draw/home, drawn [] (REVIEW-5)",
    resetFromReveal.mode === "draw" &&
      resetFromReveal.phase === "home" &&
      resetFromReveal.drawn.length === 0 &&
      resetFromReveal.selectedId === null,
    JSON.stringify(resetFromReveal)
  );
  check("T12 returns a fresh state object (immutable)", resetFromReveal !== reveal2);
  check(
    "T12 RESET is unconditional (any state → home, no confirmation)",
    transition(
      { mode: "review", phase: "spread", drawn: [{ cardId: "x" }], selectedId: "x" },
      { type: "RESET" }
    ).phase === "home"
  );
}

/* REVIEW-4 completo: volver desde una tirada de 3 conserva el hint
   "Tirada completa 3/3" y "Ver tirada"; no hay control de sacar otra. */
{
  const s3 = {
    mode: "draw",
    phase: "reveal",
    drawn: [{ cardId: "a" }, { cardId: "b" }, { cardId: "c" }],
    selectedId: "c"
  };
  const back = transition(transition(s3, { type: "REVIEW_OPEN" }), { type: "REVIEW_BACK" });
  const guard = global.window.Cartas.getDrawGuard(back, global.window.Cartas.poolFor(back));
  check(
    "REVIEW-4: back from a 3-card review resumes with 'Tirada completa 3/3' and no draw control",
    guard.canDraw === false && guard.hint === "Tirada completa 3/3",
    JSON.stringify(guard)
  );
  check(
    "REVIEW-4: 'Ver tirada' remains available after the round-trip (drawn 3)",
    back.drawn.length === 3 && back.mode === "draw" && back.phase === "reveal"
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("Smoke suite green.");
}