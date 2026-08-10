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
  check(
    "guard: DRAW_START from draw/carousel is a no-op (same reference)",
    transition({ ...initial, phase: "carousel" }, { type: "DRAW_START" }).phase === "carousel"
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
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("Smoke suite green.");
}