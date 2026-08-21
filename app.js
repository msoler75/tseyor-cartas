/* ============================================================================
 * Cartas Tseyor — app.js
 * ============================================================================
 * Núcleo de la aplicación: estado, transiciones y renderizado.
 * Cargar SIEMPRE después de deck.js (usa window.Cartas.deck).
 *
 * Principios (ver design.md):
 *  - JS es dueño del estado; CSS es dueño de TODO el movimiento.
 *  - transition(state, action) es pura y aislada del DOM: se puede probar
 *    en Node con un simple shim de `window` (verify/smoke.mjs).
 *  - render() reemplaza el esqueleto de #app según (mode, phase).
 *
 * Slice 1: T1 (RELOAD) y T2 ("Sacar carta" → carousel), render home/carousel,
 * jitter (--rz/--rx), tilt por scroll (rAF pasivo), teclado ←/→ + foco en la
 * primera carta, "Ver tirada" deshabilitado y scaffolding del tope de 3.
 * Slice 2: T3–T7 (selección con commit-before-animation, flip/sink, reveal,
 * "Sacar otra carta" con pool sin repetición), getDrawGuard (tope 3 y hint de
 * pool agotado), reveal con detalle por scroll y atajo de reduced-motion.
 * Slice 3: T8–T13 — "Ver tirada" (spread con etiquetas de posición), diálogo
 * de detalle compartido (D10, #dialog-root hermano de #app + inert + trampa
 * de foco), "Volver" que reanuda en el último reveal (REVIEW-4), "Nueva
 * tirada" con reset instantáneo (REVIEW-5), Escape según contexto (T13 no-op
 * en draw), anuncios aria-live del diálogo y pulido responsive.
 * ========================================================================== */

(function () {
  "use strict";

  const Cartas = (window.Cartas = window.Cartas || {});
  const deck = () => Cartas.deck || { positions: [], cards: [] };
  const collection = () => Cartas.collection || {};

  /** Obtiene el modo de lectura actual según el índice en el estado */
  function readingMode() {
    const col = collection();
    const modes = col.reading_modes || [];
    const idx = (Cartas.state && Cartas.state.readingMode) || 0;
    return modes[idx] || modes[0] || { name: "", labels: null, num_cards: -1, max_cards: 3 };
  }

  /** Devuelve las etiquetas de posición para el modo actual */
  function positionLabels() {
    const mode = readingMode();
    return mode.labels || deck().positions;
  }

  /** Número máximo de cartas según el modo actual */
  function maxCards() {
    const mode = readingMode();
    if (mode.num_cards > 0) return mode.num_cards;
    return mode.max_cards || 3;
  }

  /**
   * Aplica las variables --pad-top/right/bottom/left a un elemento <img>
   * a partir del image_padding [top, right, bottom, left] del JSON.
   * Los valores se convierten a % del tamaño original de la carta.
   */
  function applyImagePadding(img, col, card) {
    const pad = (card && card.image_padding) || col.image_padding;
    if (!Array.isArray(pad) || pad.length < 4) return;
    const cw = col.width || 764;
    const ch = col.height || 1110;
    img.style.setProperty("--pad-top", `${pad[0] / ch * 100}%`);
    img.style.setProperty("--pad-right", `${pad[1] / cw * 100}%`);
    img.style.setProperty("--pad-bottom", `${pad[2] / ch * 100}%`);
    img.style.setProperty("--pad-left", `${pad[3] / cw * 100}%`);
  }

  /**
   * Aplica las variables --title-pad-top/right/bottom/left a un elemento
   * a partir del title_padding [top, right, bottom, left] del JSON.
   * Los valores se convierten a % del tamaño original de la carta.
   */
  function applyTitlePadding(el, col) {
    const pad = col.title_padding;
    if (!Array.isArray(pad) || pad.length < 4) return;
    const cw = col.width || 764;
    const ch = col.height || 1110;
    el.style.setProperty("--title-pad-top", `${pad[0] / ch * 100}%`);
    el.style.setProperty("--title-pad-right", `${pad[1] / cw * 100}%`);
    el.style.setProperty("--title-pad-bottom", `${pad[2] / ch * 100}%`);
    el.style.setProperty("--title-pad-left", `${pad[3] / cw * 100}%`);
  }

  /**
   * Aplica los estilos CSS de title_style (string "prop: val; prop: val")
   * a un elemento. Primero aplica el default de la colección, luego el
   * particular de la carta (si existe), que lo sobreescribe.
   */
  function applyTitleStyle(el, col, cardStyle) {
    var cw = col.width || 764;
    if (col.title_style) applyInlineStyle(el, col.title_style, cw);
    if (cardStyle) applyInlineStyle(el, cardStyle, cw);
  }

  /**
   * Aplica las variables --cat-pad-top/right/bottom/left a un elemento
   * a partir del category_padding [top, right, bottom, left] del JSON.
   */
  function applyCategoryPadding(el, col) {
    const pad = col.category_padding;
    if (!Array.isArray(pad) || pad.length < 4) return;
    const cw = col.width || 764;
    const ch = col.height || 1110;
    el.style.setProperty("--cat-pad-top", `${pad[0] / ch * 100}%`);
    el.style.setProperty("--cat-pad-right", `${pad[1] / cw * 100}%`);
    el.style.setProperty("--cat-pad-bottom", `${pad[2] / ch * 100}%`);
    el.style.setProperty("--cat-pad-left", `${pad[3] / cw * 100}%`);
  }

  /**
   * Aplica category_style a un elemento. px en font-size se convierte a cqw.
   */
  function applyCategoryStyle(el, col) {
    var cw = col.width || 764;
    if (col.category_style) applyInlineStyle(el, col.category_style, cw);
  }

  /** Parsea un string CSS "prop: val; prop: val" y lo aplica como inline.
   *  Si font-size está en px, lo convierte a cqw para que sea proporcional
   *  al ancho de la carta y no cambie entre estados. */
  function applyInlineStyle(el, cssText, configWidth) {
    var cw = configWidth || 764;
    cssText.split(";").forEach(function (decl) {
      var parts = decl.split(":");
      if (parts.length >= 2) {
        var prop = parts[0].trim();
        var val = parts.slice(1).join(":").trim();
        if (prop && val) {
          if (prop === "font-size" && val.endsWith("px")) {
            val = (parseFloat(val) / cw * 100) + "cqw";
          }
          el.style.setProperty(prop, val);
        }
      }
    });
  }

  /**
   * Formatea el título de una carta según el title_format de la colección.
   * %ID% → id numérico de la carta, %TITLE% → título de la carta.
   * Si no hay title_format, devuelve el título tal cual.
   */
  function formatTitle(cardData, col) {
    const fmt = col.title_format;
    if (!fmt) return cardData.title;
    return fmt
      .replace("%ID%", cardData.id)
      .replace("%TITLE%", cardData.title);
  }

  /* --- Parámetros de diseño (design.md): jitter ±4–10° / ±2–6°, tilt ∝ offset --- */
  const JITTER_RZ_MIN = 4;
  const JITTER_RZ_MAX = 10;
  const JITTER_RX_MIN = 2;
  const JITTER_RX_MAX = 6;
  const TILT_MAX_DEG = 14; // rotateY máximo por distancia al centro

  /* El movimiento entre vistas queda bloqueado durante unos cientos de ms
     para evitar dobles activaciones y árboles DOM solapados. */
  let navigationLocked = false;
  let motionRunId = 0;
  let motionStartedAt = 0;

  // Los logs quedan activos por petición de diagnóstico. Pueden silenciarse
  // desde DevTools con: Cartas.motionDebug = false
  Cartas.motionDebug = Cartas.motionDebug !== false;

  function motionNow() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function compactRect(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Number(rect.x.toFixed(1)),
      y: Number(rect.y.toFixed(1)),
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1))
    };
  }

  function motionLayout() {
    if (typeof document === "undefined") return {};
    const html = document.documentElement;
    const carousel = document.querySelector(".carousel");
    return {
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: html.clientWidth,
        clientHeight: html.clientHeight
      },
      document: {
        scrollWidth: html.scrollWidth,
        scrollHeight: html.scrollHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        overflowsX: html.scrollWidth > html.clientWidth,
        overflowsY: html.scrollHeight > html.clientHeight
      },
      carousel: carousel
        ? {
            rect: compactRect(carousel),
            clientWidth: carousel.clientWidth,
            clientHeight: carousel.clientHeight,
            scrollWidth: carousel.scrollWidth,
            scrollHeight: carousel.scrollHeight,
            overflowX: window.getComputedStyle(carousel).overflowX,
            overflowY: window.getComputedStyle(carousel).overflowY,
            hasHorizontalScrollbar:
              /auto|scroll/.test(window.getComputedStyle(carousel).overflowX) &&
              carousel.scrollWidth > carousel.clientWidth,
            hasVerticalScrollbar:
              /auto|scroll/.test(window.getComputedStyle(carousel).overflowY) &&
              carousel.scrollHeight > carousel.clientHeight
          }
        : null
    };
  }

  function motionLog(phase, details) {
    if (!Cartas.motionDebug || typeof console === "undefined") return;
    const elapsed = motionStartedAt
      ? Number((motionNow() - motionStartedAt).toFixed(1))
      : 0;
    console.info(
      `[Cartas motion #${motionRunId} +${elapsed}ms] ${phase}`,
      { ...(details || {}), layout: motionLayout() }
    );
  }

  /* ========================================================================
   * Núcleo puro (sin DOM) — testeable en Node
   * ====================================================================== */

  /**
   * Estado inicial: home, sin cartas sacadas.
   * Invariantes: drawn.length ≤ 3; reload siempre vuelve aquí (sin
   * persistencia, DRAW-1/REVIEW-5).
   */
  function createInitialState() {
    return { mode: "draw", phase: "home", drawn: [], selectedId: null, readingMode: 0 };
  }

  /**
   * Pool de la próxima tirada = mazo menos los ids ya sacados (DECK-4).
   * @param {{drawn: Array<{cardId: string}>}} state
   * @returns {Array<object>} cartas del mazo no incluidas en drawn
   */
  function poolFor(state) {
    const drawnIds = new Set((state.drawn || []).map((d) => d.cardId));
    const pool = deck().cards.filter((c) => !drawnIds.has(c.id));
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  /**
   * Guard de tirada + hint (DECK-2, DRAW-4) — puro y testeable (R3-W1).
   * `canDraw` = quedan tiradas Y hay cartas en el pool. La copia exacta del
   * hint depende del disparador:
   *  - drawn.length === 3            → "Tirada completa 3/3"
   *  - pool vacío (mazo pequeño)     → "Tirada completa — no quedan más cartas"
   *    (sin 3/3 fijo, DECK-2); no se abre jamás un carousel con pool vacío.
   * @param {{drawn: Array<{cardId: string}>}} state
   * @param {Array<object>} pool pool ya calculado (deck − drawn)
   * @returns {{canDraw: boolean, hint: string}}
   */
  function getDrawGuard(state, pool) {
    const drawnCount = (state.drawn || []).length;
    const max = maxCards();
    const canDraw = drawnCount < max && pool.length > 0;
    let hint = "";
    if (drawnCount >= max) {
      hint = max === 3 ? "Tirada completa 3/3" : `Tirada completa ${drawnCount}/${max}`;
    } else if (pool.length === 0) {
      hint = "Tirada completa — no quedan más cartas";
    }
    return { canDraw, hint };
  }

  /**
   * T11: salida de review hacia el draw — reanuda en el reveal de la ÚLTIMA
   * carta sacada (REVIEW-4). El estado de la tirada no cambia en el viaje de
   * ida y vuelta: solo mode/phase/selectedId; drawn queda intacto.
   * @param {{mode: string, phase: string, drawn: Array<{cardId: string}>}} state
   * @returns {object} mismo estado en draw/reveal, selectedId = última carta
   */
  function resumeFromReview(state) {
    const drawn = state.drawn || [];
    if (drawn.length === 0) return state; // defensivo (REVIEW-1 nunca llega vacío)
    return {
      ...state,
      mode: "draw",
      phase: "reveal",
      selectedId: drawn[drawn.length - 1].cardId
    };
  }

  /**
   * Transición pura de estado (D3). Devuelve SIEMPRE un estado:
   *  - T1  RELOAD     → draw/home fresco (cualquier estado previo)
   *  - T2  DRAW_START → draw/carousel (solo desde draw/home y con canDraw;
   *                      guard de estado R3-W2: nunca un carousel vacío ni
   *                      una 4ª tirada)
   *  - T3  SELECT     → commit-before-animation (D5): drawn += id y
   *                      selectedId = id SIN cambiar de fase; el DOM anima
   *                      de forma imperativa
   *  - T4  FLIP_END   → draw/reveal (solo si hay selección en curso)
   *  - T5  SELECT repetido durante el reveal → no-op (mismo estado)
   *  - T6  SINK_END   → no-op de estado (solo limpieza de DOM)
   *  - T7  NEXT_DRAW  → draw/carousel desde draw/reveal solo con canDraw
   *  - T8  REVIEW_OPEN → review/spread si drawn >= 1 (REVIEW-1)
   *  - T9  REVIEW_TAP  → review/spread + selectedId (abre el diálogo)
   *  - T10 REVIEW_CLOSE → review/spread + selectedId null (cierra el diálogo)
   *  - T11 REVIEW_BACK  → draw/reveal reanudando en la última carta (REVIEW-4)
   *  - ESCAPE → T10 si hay diálogo, T11 si no, no-op en draw (T13, DRAW-7)
   *  - T12 RESET        → draw/home fresco (REVIEW-5, sin confirmación)
   *  - cualquier otra acción o guard fallido → mismo estado (no-op)
   */
  function transition(state, action) {
    if (!action || typeof action.type !== "string") return state;

    switch (action.type) {
      case "RELOAD":
        return createInitialState();

      case "DRAW_START": {
        // T2: solo desde draw/home y con guard (R3-W2): un carousel nunca se
        // abre con pool vacío ni con drawn.length >= 3 (DECK-2, DRAW-4).
        if (state.mode !== "draw" || state.phase !== "home") return state;
        if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
        return { ...state, mode: "draw", phase: "carousel" };
      }

      case "SELECT": {
        // T3/T5: solo en draw/carousel, sin selección en curso y con la
        // carta disponible. Commit-before-animation (D5): drawn y selectedId
        // se actualizan ya; la animación es no bloqueante y sin rollback.
        if (state.mode !== "draw" || state.phase !== "carousel") return state;
        if (state.selectedId !== null) return state; // T5: ya revelando — no-op
        if ((state.drawn || []).length >= maxCards()) return state; // DRAW-4
        const cardId = action.cardId;
        if (typeof cardId !== "string") return state;
        if (state.drawn.some((d) => d.cardId === cardId)) return state; // sin repetir
        return {
          ...state,
          drawn: [...state.drawn, { cardId }],
          selectedId: cardId
        };
      }

      case "FLIP_END": {
        // T4: el flip terminó (transitionend / backstop / atajo reduced-motion).
        if (state.mode !== "draw" || state.phase !== "carousel") return state;
        if (state.selectedId === null) return state;
        return { ...state, phase: "reveal" };
      }

      case "SINK_END":
        // T6: solo limpieza de DOM; el estado no cambia.
        return state;

      case "NEXT_DRAW": {
        // T7: "Sacar otra carta" — desde draw/reveal o review/spread, con canDraw.
        if (state.mode === "review" && state.phase === "spread") {
          if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
          return { ...state, mode: "draw", phase: "carousel", selectedId: null };
        }
        if (state.mode !== "draw" || state.phase !== "reveal") return state;
        if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
        return { ...state, phase: "carousel", selectedId: null };
      }

      case "REVIEW_OPEN": {
        // T8: "Ver tirada" — desde draw (home o reveal, ambos renderizan el
        // botón) con drawn.length >= 1 (REVIEW-1): review nunca se abre con
        // spread vacío.
        if (state.mode !== "draw") return state;
        if (state.phase !== "home" && state.phase !== "reveal") return state;
        if ((state.drawn || []).length < 1) return state;
        return { ...state, mode: "review", phase: "spread", selectedId: null };
      }

      case "FOCUS_CARD": {
        // T9: tocar una carta del spread → draw/reveal (vista de carta ampliada)
        if (state.mode !== "review" || state.phase !== "spread") return state;
        const cardId = action.cardId;
        if (typeof cardId !== "string") return state;
        if (!state.drawn.some((d) => d.cardId === cardId)) return state;
        return {
          ...state,
          mode: "draw",
          phase: "reveal",
          selectedId: cardId
        };
      }

      case "REVIEW_BACK": {
        // T11: "Volver" — reanuda en el último reveal (REVIEW-4).
        if (state.mode !== "review" || state.phase !== "spread") return state;
        return resumeFromReview(state);
      }

      case "ESCAPE": {
        // En review → vuelve al último reveal; en draw → no-op
        if (state.mode !== "review" || state.phase !== "spread") return state;
        return resumeFromReview(state);
      }

      case "RESET":
        // T12: "Nueva tirada" — reset instantáneo sin confirmación (REVIEW-5);
        // cierra el diálogo (selectedId null) como parte del reset.
        return createInitialState();

      default:
        return state;
    }
  }

  /* ========================================================================
   * Utilidades de render (solo navegador — llamadas bajo init())
   * ====================================================================== */

  function prefersReducedMotion() {
    return !!(
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /** Número grande de la carta: numeral romano (placeholder del arte futuro). */
  function roman(n) {
    const table = [
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"]
    ];
    let out = "";
    for (const [value, glyph] of table) {
      while (n >= value) {
        out += glyph;
        n -= value;
      }
    }
    return out;
  }

  /** Crea un elemento; `text` opcional se asigna como textContent. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Jitter por sesión de carousel (D8): valores frescos de --rz/--rx en cada
   * apertura. JS genera, CSS compone (rotateX(--rx) rotateZ(--rz) rotateY(--tilt)).
   */
  function applyJitter(card) {
    const rz = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RZ_MIN, JITTER_RZ_MAX);
    const rx = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RX_MIN, JITTER_RX_MAX);
    card.style.setProperty("--rz", `${rz.toFixed(2)}deg`);
    card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
  }

  /**
   * Scroll → tilt (D9): listener pasivo, throttled por rAF; cada carta obtiene
   * --tilt (rotateY) proporcional a su distancia al centro. Se omite por
   * completo con prefers-reduced-motion: reduce.
   */
  function bindTilt(carousel) {
    if (prefersReducedMotion()) return;
    let ticking = false;

    const compute = () => {
      ticking = false;
      const rect = carousel.getBoundingClientRect();
      if (rect.width === 0) return;
      const center = rect.left + rect.width / 2;
      const half = rect.width / 2;
      for (const item of carousel.querySelectorAll(".carousel-item")) {
        const itemRect = item.getBoundingClientRect();
        const itemCenter = itemRect.left + itemRect.width / 2;
        const ratio = Math.max(-1, Math.min(1, (itemCenter - center) / half));
        const tilt = ratio * TILT_MAX_DEG;
        const card = item.querySelector(".card");
        if (card) card.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);
      }
    };

    carousel.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(compute);
      },
      { passive: true }
    );
  }

  /**
   * Teclado del carousel (DRAW-2): ←/→ mueven el foco y centran la carta;
   * Inicio/Fin saltan a los extremos. Enter/Space activan el botón de forma
   * nativa → click → selectCard (T3, Slice 2).
   */
  function bindCarouselKeys(carousel) {
    carousel.addEventListener("keydown", (event) => {
      const cards = Array.from(carousel.querySelectorAll(".card"));
      if (cards.length === 0) return;
      const index = cards.indexOf(document.activeElement);
      let target = -1;

      if (event.key === "ArrowRight") target = index + 1;
      else if (event.key === "ArrowLeft") target = index - 1;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = cards.length - 1;
      else return; // Enter/Space: comportamiento nativo del <button>

      if (target < 0 || target >= cards.length) return;
      event.preventDefault();
      cards[target].focus();
      cards[target].scrollIntoView({ inline: "center", block: "nearest" });
    });
  }

  /* ========================================================================
   * Render (D11) — esqueleto por (mode, phase) + movimiento imperativo T3
   * ====================================================================== */

  /**
   * Reemplaza el contenido de #app por un esqueleto nuevo. Fallback seguro
   * para navegadores sin Element.replaceChildren (R4-W3): textContent="" +
   * append hacen lo mismo sin hard-crash.
   */
  function setRoot(root, section) {
    if (typeof root.replaceChildren === "function") {
      root.replaceChildren(section);
    } else {
      root.textContent = "";
      root.appendChild(section);
    }
  }

  /** Fase home: instrucciones + selector de modo + "Sacar carta". */
  function renderHome(root) {
    const state = Cartas.state;
    const guard = getDrawGuard(state, poolFor(state));

    const section = el("section", "home");

    const intro = el(
      "p",
      "home-intro",
      "Tómate un momento de calma, formula tu pregunta en silencio y, cuando llegue el momento, saca hasta tres cartas, una a la vez."
    );
    section.appendChild(intro);

    // Selector de modo de lectura (solo al inicio, antes de sacar cartas)
    const col = collection();
    const modes = col.reading_modes || [];
    if (modes.length > 1 && state.drawn.length === 0) {
      const modeWrap = el("div", "reading-modes");
      modes.forEach(function (mode, i) {
        const btn = el("button", "reading-mode-btn");
        btn.type = "button";
        btn.textContent = mode.name;
        if (i === state.readingMode) btn.classList.add("is-active");
        btn.addEventListener("click", function () {
          Cartas.state = { ...Cartas.state, readingMode: i };
          render();
          focusHomePrimary();
        });
        modeWrap.appendChild(btn);
      });
      section.appendChild(modeWrap);
    }

    // Mostrar labels del modo seleccionado
    const mode = readingMode();
    if (mode.labels) {
      const labelsEl = el("p", "home-labels");
      labelsEl.textContent = mode.labels.join(" · ");
      section.appendChild(labelsEl);
    }

    const actions = el("div", "home-actions");

    if (guard.canDraw) {
      const drawBtn = el("button", "btn btn--primary", "Sacar carta");
      drawBtn.type = "button";
      drawBtn.addEventListener("click", () =>
        transitionDispatch({ type: "DRAW_START" }, "forward")
      );
      actions.appendChild(drawBtn);
    } else {
      // Tope alcanzado (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      const hint = el("p", "hint");
      hint.textContent = guard.hint;
      actions.appendChild(hint);
    }

    // T8: "Ver tirada" solo con 2+ cartas sacadas
    if (state.drawn.length >= 2) {
      const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
      reviewBtn.type = "button";
      reviewBtn.addEventListener("click", () => dispatch({ type: "REVIEW_OPEN" }));
      actions.appendChild(reviewBtn);
    }

    section.appendChild(actions);
    setRoot(root, section);
  }

  /**
   * Fase carousel: abanico de cartas boca abajo con jitter fresco por sesión,
   * tira con scroll-snap, teclado y tilt (D8/D9, DRAW-2).
   */
  function renderCarousel(root) {
    const state = Cartas.state;
    const pool = poolFor(state);

    const section = el("section", "carousel-section");
    section.appendChild(el("p", "carousel-caption", "Elige una carta"));

    // Defensivo (DECK-2): el carousel nunca se abre con pool vacío vía T2/T7,
    // pero render vacío no debe romper.
    if (pool.length === 0) {
      section.appendChild(el("p", "hint", "No quedan cartas por sacar."));
      setRoot(root, section);
      return;
    }

    const carousel = el("div", "carousel");
    carousel.setAttribute("role", "group");
    carousel.setAttribute("aria-label", "Cartas disponibles");

    pool.forEach((cardData, i) => {
      const number = deck().cards.indexOf(cardData) + 1; // cara = índice del mazo + 1 (DECK-2)
      const col = collection();
      const imgFolder = col.images_folder || "";

      const item = el("div", "carousel-item");
      item.style.setProperty("--i", String(i)); // para el sink escalonado (Slice 2)

      const card = el("button", "card");
      card.type = "button";
      card.setAttribute("aria-label", `Carta ${number}: ${cardData.title}`);
      card.dataset.cardId = cardData.id; // para el movimiento imperativo T3
      card.addEventListener("click", () => selectCard(cardData.id));

      const inner = el("span", "card-inner");

      // Cara trasera: imagen del reverso de la colección
      const back = el("span", "face face--back");
      back.setAttribute("aria-hidden", "true");
      if (col.back_image) {
        const backImg = el("img", "face-img");
        backImg.src = `${imgFolder}/${col.back_image}`;
        backImg.alt = "";
        backImg.draggable = false;
        back.appendChild(backImg);
      }

      // Cara frontal: imagen base + ilustración + título
      const front = el("span", "face face--front");
      front.setAttribute("aria-hidden", "true");
      if (col.front_image) {
        const frontBg = el("img", "face-bg");
        frontBg.src = `${imgFolder}/${col.front_image}`;
        frontBg.alt = "";
        frontBg.draggable = false;
        front.appendChild(frontBg);
      }
      if (cardData.image && imgFolder) {
        const artImg = el("img", "face-art");
        artImg.src = cardData._imagePath || `${imgFolder}/${cardData.image}`;
        artImg.alt = "";
        artImg.draggable = false;
        applyImagePadding(artImg, col, cardData);
        front.appendChild(artImg);
      }
      if (cardData.draw_title !== false) {
        const titleEl = el("span", "face-title", formatTitle(cardData, col));
        applyTitleStyle(titleEl, col, cardData.title_style);
        applyTitlePadding(titleEl, col);
        front.appendChild(titleEl);
      }
      if (cardData.category && cardData.draw_category !== false) {
        const catEl = el("span", "face-category", cardData.category);
        applyCategoryStyle(catEl, col);
        applyCategoryPadding(catEl, col);
        front.appendChild(catEl);
      }

      inner.append(back, front);
      card.appendChild(inner);
      item.appendChild(card);
      carousel.appendChild(item);

      applyJitter(card);
    });

    section.appendChild(carousel);
    setRoot(root, section);

    bindCarouselKeys(carousel);
    bindTilt(carousel);
  }

  /**
   * D10: renderer COMPARTIDO del detalle — el mismo contenido (kicker de
   * posición, título, keywords, meaning, description) sirve al panel del
   * reveal y al diálogo de revisión (REVIEW-2). Cada llamador decide dónde
   * inserta cada nodo y si el detalle se revela por scroll (.is-visible) o
   * queda visible al instante.
   * @param {{title: string, keywords: string, meaning: string, description: string}} card
   * @param {string} position etiqueta de posición (DECK-3)
   * @returns {{kicker: HTMLElement, title: HTMLElement, detail: HTMLElement}}
   */
  function renderDetail(card, position) {
    const col = collection();
    const mode = readingMode();
    const hasLabels = mode.labels !== null;
    const kicker = hasLabels ? el("p", "reveal-kicker", `Posición · ${position || ""}`) : null;
    const title = el("h2", "reveal-title", formatTitle(card, col));
    const detail = el("div", "reveal-detail");

    // Extra meaning del modo de lectura (no colapsable, prominente)
    const extraMeaning = getExtraMeaning(card, position);
    if (extraMeaning) {
      const extraEl = el("div", "reveal-extra-meaning");
      extraEl.innerHTML = renderMarkdown(extraMeaning);
      detail.appendChild(extraEl);
    }

    // Texto de la carta (colapsable)
    if (card.meaning) {
      const wrap = el("div", "collapse-wrap");
      const inner = el("div", "reveal-card-text");
      inner.innerHTML = renderMarkdown(card.meaning);
      wrap.appendChild(inner);
      const key = "collapse-card-" + card.id;
      const toggle = createCollapseToggle(wrap, key, "descripción de " + formatTitle(card, col));
      detail.appendChild(toggle);
      detail.appendChild(wrap);
    }

    // Texto de la categoría (colapsable)
    const catKey = (card.category || "").toLowerCase();
    const categories = col.categories || [];
    const catObj = categories.find(function (c) {
      return (c.label || "").toLowerCase() === catKey;
    });
    if (catObj && catObj.meaning) {
      const wrap = el("div", "collapse-wrap");
      const inner = el("div", "reveal-category-text");
      inner.innerHTML = renderMarkdown(catObj.meaning);
      wrap.appendChild(inner);
      const key = "collapse-cat-" + catKey;
      const toggle = createCollapseToggle(wrap, key, "descripción de " + (catObj.label || catKey));
      detail.appendChild(toggle);
      detail.appendChild(wrap);
    }

    return { kicker, title, detail };
  }

  /**
   * Obtiene el extra meaning para una carta en una posición según el modo de lectura.
   * Estructura: reading_modes_extra[modo.nombre][cardId][posicionLabel]
   */
  function getExtraMeaning(card, position) {
    const col = collection();
    const mode = readingMode();
    const extra = col.reading_modes_extra || {};
    const modeExtra = extra[mode.name];
    if (!modeExtra) return null;
    const cardExtra = modeExtra[String(card.id)];
    if (!cardExtra) return null;
    return cardExtra[position] || null;
  }

  /** Chevron SVG para los botones de colapsar */
  const CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  /**
   * Crea un botón toggle para una sección colapsable.
   * Primera vez: expandido. Después: recuerda estado de localStorage.
   */
  function createCollapseToggle(wrap, storageKey, label) {
    const btn = el("button", "collapse-toggle");
    btn.type = "button";

    // Recuperar estado de localStorage (primera vez: colapsado)
    const saved = localStorage.getItem(storageKey);
    if (saved === "expanded") {
      wrap.classList.add("is-expanded");
    } else {
      wrap.classList.add("is-collapsed");
      btn.classList.add("is-collapsed");
    }

    function updateBtn() {
      const collapsed = wrap.classList.contains("is-collapsed");
      btn.innerHTML = CHEVRON_SVG + "<span>" + (collapsed ? "Ver " + label : "Ocultar " + label) + "</span>";
    }
    updateBtn();

    btn.addEventListener("click", function () {
      const isCollapsed = wrap.classList.toggle("is-collapsed");
      wrap.classList.toggle("is-expanded", !isCollapsed);
      btn.classList.toggle("is-collapsed", isCollapsed);
      updateBtn();
      localStorage.setItem(storageKey, isCollapsed ? "collapsed" : "expanded");
    });

    return btn;
  }

  /** Convierte markdown básico a HTML: ##, ###, **, párrafos */
  function renderMarkdown(text) {
    return text
      .split("\n\n")
      .map(function (block) {
        block = block.trim();
        if (!block) return "";
        if (block.startsWith("### "))
          return "<h3>" + block.slice(4) + "</h3>";
        if (block.startsWith("## "))
          return "<h2>" + block.slice(3) + "</h2>";
        if (block.startsWith("# "))
          return "<h1>" + block.slice(2) + "</h1>";
        block = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
  }

  /**
   * Fase reveal (T4, DRAW-5/8): carta agrandada estática + panel de detalle
   * revelado por scroll (IO) + acciones ("Sacar otra carta" / hint / "Ver
   * tirada" / "Nueva tirada"). El foco aterriza en el h2, destino programático.
   */
  function renderReveal(root) {
    const state = Cartas.state;
    const guard = getDrawGuard(state, poolFor(state));
    const cardData = deck().cards.find((c) => c.id === state.selectedId);
    if (!cardData) {
      // Defensivo: selección desconocida no debe romper el render.
      renderHome(root);
      return;
    }

    const posIndex = state.drawn.findIndex((d) => d.cardId === state.selectedId);
    const position = positionLabels()[posIndex] || ""; // labels del modo de lectura
    const { kicker, title, detail } = renderDetail(cardData, position); // D10

    const section = el("section", "reveal");

    if (kicker) section.appendChild(kicker);

    title.tabIndex = -1; // destino de foco programático tras el flip (DRAW-2)
    section.appendChild(title);

    const col = collection();
    const imgFolder = col.images_folder || "";

    const cardWrap = el("div", "reveal-card-wrap");
    const revealCard = el("div", "reveal-card");

    // Cara frontal de la carta en el reveal: imagen base + ilustración + título
    if (col.front_image) {
      const frontBg = el("img", "reveal-card-bg");
      frontBg.src = `${imgFolder}/${col.front_image}`;
      frontBg.alt = "";
      frontBg.draggable = false;
      revealCard.appendChild(frontBg);
    }
    if (cardData.image && imgFolder) {
      const artImg = el("img", "reveal-card-art");
      artImg.src = cardData._imagePath || `${imgFolder}/${cardData.image}`;
      artImg.alt = "";
      artImg.draggable = false;
      applyImagePadding(artImg, col, cardData);
      revealCard.appendChild(artImg);
    }
    if (cardData.draw_title !== false) {
      const revealTitle = el("span", "reveal-card-title", formatTitle(cardData, col));
      applyTitleStyle(revealTitle, col, cardData.title_style);
      applyTitlePadding(revealTitle, col);
      revealCard.appendChild(revealTitle);
    }
    if (cardData.category && cardData.draw_category !== false) {
      const catEl = el("span", "reveal-card-category", cardData.category);
      applyCategoryStyle(catEl, col);
      applyCategoryPadding(catEl, col);
      revealCard.appendChild(catEl);
    }

    cardWrap.appendChild(revealCard);
    section.appendChild(cardWrap);

    section.appendChild(detail);

    const actions = el("div", "reveal-actions");
    if (guard.canDraw) {
      const againBtn = el("button", "btn btn--primary", "Sacar otra carta");
      againBtn.type = "button";
      againBtn.addEventListener("click", () =>
        transitionDispatch({ type: "NEXT_DRAW" }, "forward")
      );
      actions.appendChild(againBtn);
    } else {
      // Tope 3/3 (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      actions.appendChild(el("p", "hint", guard.hint));
    }
    // T8: "Ver tirada" solo con 2+ cartas sacadas
    if (state.drawn.length >= 2) {
      const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
      reviewBtn.type = "button";
      reviewBtn.addEventListener("click", () =>
        transitionDispatch({ type: "REVIEW_OPEN" }, "forward")
      );
      actions.appendChild(reviewBtn);
    }
    // T12 (Slice 3): "Nueva tirada" — reset instantáneo también desde reveal.
    const resetBtn = el("button", "btn btn--ghost", "Nueva tirada");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () =>
      transitionDispatch({ type: "RESET" }, "back")
    );
    actions.appendChild(resetBtn);

    section.appendChild(actions);
    setRoot(root, section);

    // Anuncio aria-live (DRAW-7): título + posición; el hint cuando toca.
    announce(`${cardData.title} — ${position}`);
    if (!guard.canDraw) {
      window.setTimeout(() => announce(guard.hint), 500);
    }

    // DRAW-2: el h2 recibe el foco sin saltar el scroll del viewport.
    title.focus({ preventScroll: true });

    // DRAW-5: el detalle se revela al entrar al viewport (IO);
    // se retrasa para que no aparezca durante el vuelo de la carta.
    if (prefersReducedMotion()) {
      detail.classList.add("is-visible");
    } else {
      window.setTimeout(() => observeDetail(detail), 800);
    }
  }

  /**
   * Fase spread (T8, REVIEW-1): todas las cartas sacadas, EN ORDEN, cada una
   * con su etiqueta de posición (DECK-3). El render es defensivo: si se
   * llamara con drawn vacío (solo posible por llamada directa, T8 lo impide),
   * muestra el estado seguro — mensaje breve, sin spread, sin diálogo, sin
   * crash (REVIEW-1).
   */
  function renderSpread(root) {
    const state = Cartas.state;
    const section = el("section", "spread");

    // REVIEW-1: guarda de spread vacío — nunca una vista rota.
    if ((state.drawn || []).length === 0) {
      section.appendChild(el("p", "hint", "Aún no has sacado cartas"));
      setRoot(root, section);
      return;
    }

    section.appendChild(el("p", "spread-kicker", "Tu tirada"));

    const list = el("ol", "spread-list");
    const col = collection();
    const imgFolder = col.images_folder || "";
    const hasLabels = readingMode().labels !== null;

    state.drawn.forEach((d, i) => {
      const cardData = deck().cards.find((c) => c.id === d.cardId);
      if (!cardData) return; // defensivo: nunca debe ocurrir
      const position = positionLabels()[i] || ""; // etiqueta por índice del modo

      const li = el("li", "spread-item");
      li.style.setProperty("--i", String(i)); // entrada escalonada (CSS)
      const btn = el("button", "spread-card");
      btn.type = "button";
      btn.dataset.cardId = cardData.id; // para restaurar foco al cerrar (T10)
      btn.setAttribute("aria-label", `${position} · ${cardData.title}`);
      btn.addEventListener("click", () =>
        dispatch({ type: "FOCUS_CARD", cardId: cardData.id })
      );

      const face = el("span", "spread-face");
      // Miniatura de la carta: imagen base + ilustración
      if (col.front_image) {
        const frontBg = el("img", "spread-face-bg");
        frontBg.src = `${imgFolder}/${col.front_image}`;
        frontBg.alt = "";
        frontBg.draggable = false;
        face.appendChild(frontBg);
      }
      if (cardData.image && imgFolder) {
        const artImg = el("img", "spread-face-art");
        artImg.src = cardData._imagePath || `${imgFolder}/${cardData.image}`;
        artImg.alt = "";
        artImg.draggable = false;
        applyImagePadding(artImg, col, cardData);
        face.appendChild(artImg);
      }
      if (cardData.draw_title !== false) {
        const faceTitle = el("span", "spread-face-title", formatTitle(cardData, col));
        applyTitleStyle(faceTitle, col, cardData.title_style);
        applyTitlePadding(faceTitle, col);
        face.appendChild(faceTitle);
      }
      if (cardData.category && cardData.draw_category !== false) {
        const catEl = el("span", "spread-face-category", cardData.category);
        applyCategoryStyle(catEl, col);
        applyCategoryPadding(catEl, col);
        face.appendChild(catEl);
      }

      const caption = el("span", "spread-caption");
      if (hasLabels) {
        caption.appendChild(el("span", "spread-pos", position));
      }
      if (col.show_titles_in_review !== false) {
        caption.appendChild(el("span", "spread-title", cardData.title));
      }

      // Extra meaning del modo de lectura (más pequeño en spread)
      const extraMeaning = getExtraMeaning(cardData, position);
      if (extraMeaning) {
        const extraEl = el("p", "spread-extra-meaning", extraMeaning);
        caption.appendChild(extraEl);
      }

      btn.append(face, caption);
      li.appendChild(btn);
      list.appendChild(li);
    });
    section.appendChild(list);

    // T12: "Nueva tirada" resetea al instante desde la vista de spread.
    const actions = el("div", "spread-actions");
    const guard = getDrawGuard(state, poolFor(state));
    if (guard.canDraw) {
      const drawBtn = el("button", "btn btn--primary", "Sacar otra carta");
      drawBtn.type = "button";
      drawBtn.addEventListener("click", () =>
        transitionDispatch({ type: "NEXT_DRAW" }, "forward")
      );
      actions.appendChild(drawBtn);
    }
    const resetBtn = el("button", "btn btn--ghost", "Nueva tirada");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () =>
      transitionDispatch({ type: "RESET" }, "back")
    );
    actions.appendChild(resetBtn);
    section.appendChild(actions);

    setRoot(root, section);
  }

  /**
   * IntersectionObserver del detalle (DRAW-5): añade .is-visible una vez y
   * se desconecta. El scroll del carousel/reveal se lee de forma pasiva.
   */
  function observeDetail(panel) {
    if (typeof IntersectionObserver === "undefined") {
      panel.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            panel.classList.add("is-visible");
            io.disconnect();
          }
        }
      },
      { threshold: 0.2 }
    );
    io.observe(panel);
  }

  /** Región aria-live persistente (DRAW-7), fuera de #app. */
  function announce(text) {
    if (typeof document === "undefined" || !text) return;
    const live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    // Reanuncia incluso si la copia es idéntica a la anterior.
    window.setTimeout(() => {
      live.textContent = text;
    }, 30);
  }

  /** Foco en la primera carta del abanico (DRAW-2) — carousel recién abierto. */
  function focusFirstCard() {
    const root = document.getElementById("app");
    if (!root) return;
    const first = root.querySelector(".card");
    if (first) first.focus();
  }

  /* ------------------------------------------------------------------------
   * Transiciones entre vistas — View Transitions API + fallback CSS
   * ---------------------------------------------------------------------- */

  /** Limpia el estado visual compartido por las transiciones de navegación. */
  function finishNavigation(root) {
    navigationLocked = false;
    document.documentElement.removeAttribute("data-view-direction");
    document.body.classList.remove("is-view-changing");
    if (root) {
      root.removeAttribute("aria-busy");
      const section = root.firstElementChild;
      if (section) {
        section.classList.remove(
          "view-enter",
          "view-enter--forward",
          "view-enter--back"
        );
      }
    }
    motionLog("scene:enter-complete");
  }

  /**
   * Cambio de esqueleto con continuidad visual. En navegadores compatibles,
   * document.startViewTransition conserva snapshots del estado anterior y el
   * siguiente. El fallback espera la salida CSS, renderiza y reparte la nueva
   * vista con una entrada escalonada; no hay desapariciones instantáneas.
   */
  function transitionDispatch(action, direction) {
    if (navigationLocked) return false;
    if (prefersReducedMotion() || typeof document === "undefined") {
      return dispatch(action);
    }

    const root = document.getElementById("app");
    const oldSection = root && root.firstElementChild;
    if (!root || !oldSection) return dispatch(action);

    navigationLocked = true;
    root.setAttribute("aria-busy", "true");
    document.documentElement.dataset.viewDirection = direction;
    document.body.classList.add("is-view-changing");
    motionLog("scene:exit-start", { action: action.type, direction });

    if (typeof document.startViewTransition === "function") {
      const viewTransition = document.startViewTransition(() => {
        const changed = dispatch(action);
        window.scrollTo(0, 0);
        motionLog("scene:swap", { action: action.type, native: true });
        return changed;
      });
      viewTransition.finished
        .catch(() => {})
        .finally(() => finishNavigation(root));
      return true;
    }

    oldSection.classList.add("view-leave", `view-leave--${direction}`);
    window.setTimeout(() => {
      const changed = dispatch(action);
      // La salida ya es invisible: normalizamos el origen de la nueva escena
      // antes de su primer frame para que el clamp del scroll no sea visible.
      window.scrollTo(0, 0);
      motionLog("scene:swap", { action: action.type, native: false });
      const newSection = root.firstElementChild;
      if (!changed || !newSection) {
        oldSection.classList.remove("view-leave", `view-leave--${direction}`);
        finishNavigation(root);
        return;
      }

      newSection.classList.add("view-enter", `view-enter--${direction}`);
      const cleanup = () => {
        newSection.removeEventListener("animationend", onEnterEnd);
        finishNavigation(root);
      };
      const onEnterEnd = (event) => {
        // Las cartas y el caption tienen animaciones hijas que burbujean.
        // Solo la animación del propio esqueleto cierra la navegación.
        if (event.target === newSection) cleanup();
      };
      newSection.addEventListener("animationend", onEnterEnd);
      window.setTimeout(cleanup, 760);
    }, 240);
    return true;
  }

  /* ------------------------------------------------------------------------
   * Selección T3 — movimiento imperativo (D11: sin re-render en vuelo)
   * ---------------------------------------------------------------------- */

  /**
   * Selección de una carta: la transición pura T3 confirma el commit
   * (drawn + selectedId) ANTES de tocar el DOM (D5, DRAW-1). Tras el commit
   * se aplican .is-flipped (elegida) y .is-sunk (hermanas), sin render().
   * Con prefers-reduced-motion se salta directo al reveal (D6/DRAW-3).
   */
  function selectCard(cardId) {
    const prev = Cartas.state;
    const next = transition(prev, { type: "SELECT", cardId });
    if (next === prev) return; // T5: doble activación durante el reveal — no-op

    Cartas.state = next;

    motionRunId += 1;
    motionStartedAt = motionNow();
    motionLog("select:commit", { cardId });

    if (prefersReducedMotion()) {
      // DRAW-3: el estado avanza al instante, sin animación.
      dispatch({ type: "FLIP_END" });
      return;
    }

    const root = document.getElementById("app");
    if (!root) return;
    const selected = root.querySelector(`.card[data-card-id="${cardId}"]`);
    if (!selected) return;

    const cards = Array.from(root.querySelectorAll(".card"));
    const selectedIndex = cards.indexOf(selected);
    const detached = detachCardFromCarousel(selected);
    if (!detached) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    bindFlipEnd(selected);
    // La lectura fuerza el estado inicial ya reparentado antes de activar la
    // clase; así el navegador interpola el giro en lugar de saltar al final.
    selected.getBoundingClientRect();
    selected.classList.add("is-flipped");
    motionLog("flip:start", {
      cardId,
      card: compactRect(selected),
      layer: compactRect(detached.layer),
      flight: compactRect(detached.flight)
    });

    const sunk = [];
    for (const card of cards) {
      if (card !== selected) {
        const distance = Math.abs(cards.indexOf(card) - selectedIndex);
        card.style.setProperty("--sink-delay", `${Math.min(distance * 18, 180)}ms`);
        card.classList.add("is-sunk");
        sunk.push(card);
      }
    }
    // El delay parte de la distancia a la elegida y queda acotado: todas las
    // cartas terminan antes de que acabe el giro, evitando cortar el sink.
    const sinkBackstop = 680;
    for (const card of sunk) bindSinkRemoval(card, sinkBackstop);
    motionLog("siblings:sink-start", { count: sunk.length });
  }

  /**
   * Saca la carta del árbol scrollable antes de moverla. El item queda como
   * placeholder de idéntico tamaño para que el abanico no se recalcule.
   */
  function detachCardFromCarousel(card) {
    const item = card.closest(".carousel-item");
    if (!item) return null;

    const visualRect = card.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const left = visualRect.left + visualRect.width / 2 - width / 2;
    const top = visualRect.top + visualRect.height / 2 - height / 2;

    item.classList.add("carousel-item--placeholder");
    item.style.width = `${width}px`;
    item.style.height = `${height}px`;
    const section = item.closest(".carousel-section");
    if (section) section.classList.add("is-selecting");

    const layer = el("div", "selection-layer");
    layer.setAttribute("aria-hidden", "true");
    const flight = el("div", "card-flight");
    flight.style.left = `${left}px`;
    flight.style.top = `${top}px`;
    flight.style.width = `${width}px`;
    flight.style.height = `${height}px`;
    layer.appendChild(flight);
    document.body.appendChild(layer);

    card.classList.add("card--detached");
    flight.appendChild(card);
    motionLog("select:detached", {
      visualBefore: {
        x: Number(visualRect.x.toFixed(1)),
        y: Number(visualRect.y.toFixed(1)),
        width: Number(visualRect.width.toFixed(1)),
        height: Number(visualRect.height.toFixed(1))
      },
      flight: compactRect(flight),
      placeholder: compactRect(item)
    });
    return { layer, flight };
  }

  /**
   * T4: al terminar el transform del flip se enlaza la geometría de la carta
   * ya desacoplada con su hueco definitivo en el reveal.
   */
  function bindFlipEnd(card) {
    const inner = card.querySelector(".card-inner");
    if (!inner) return;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      inner.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      motionLog("flip:complete", { card: compactRect(card) });
      revealSelectedCard(card);
    };
    const onEnd = (event) => {
      if (event.target === inner && event.propertyName === "transform") finish();
    };
    inner.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, 760); // backstop (D6)
  }

  /** Continúa el recorrido con el mismo nodo que se desacopló del carrusel. */
  function revealSelectedCard(card) {
    if (!card || prefersReducedMotion()) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    flyCardToReveal(card);
  }

  /**
   * Shared element manual: renderiza el destino como hueco invisible, mueve
   * el wrapper fijo hasta allí y reintroduce la MISMA carta en el nuevo DOM.
   */
  function flyCardToReveal(card) {
    const flight = card.closest(".card-flight");
    const layer = card.closest(".selection-layer");
    if (!flight || !layer) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    const sourceRect = flight.getBoundingClientRect();
    const sourceNumber = card.querySelector(".face--front .face-num");
    const sourceNumberSize = sourceNumber
      ? parseFloat(window.getComputedStyle(sourceNumber).fontSize)
      : 0;

    dispatch({ type: "FLIP_END" });
    window.scrollTo(0, 0);
    const reveal = document.querySelector(".reveal");
    const target = reveal && reveal.querySelector(".reveal-card");
    if (!reveal || !target) {
      layer.remove();
      return;
    }

    reveal.classList.add("is-card-arriving");
    const targetRect = target.getBoundingClientRect();
    const targetNumber = target.querySelector(".face-num");
    const targetNumberSize = targetNumber
      ? parseFloat(window.getComputedStyle(targetNumber).fontSize)
      : 0;
    const scaleX = targetRect.width / sourceRect.width;
    const numberScale =
      sourceNumberSize > 0 && targetNumberSize > 0
        ? targetNumberSize / (sourceNumberSize * scaleX)
        : 1;
    flight.style.setProperty("--flight-x", `${targetRect.left - sourceRect.left}px`);
    flight.style.setProperty("--flight-y", `${targetRect.top - sourceRect.top}px`);
    flight.style.setProperty("--flight-sx", String(scaleX));
    flight.style.setProperty("--flight-sy", String(targetRect.height / sourceRect.height));
    flight.style.setProperty("--flight-num-scale", String(numberScale));
    card.classList.add("is-settling");
    motionLog("flight:prepared", {
      source: compactRect(flight),
      target: compactRect(target),
      scaleX: Number(scaleX.toFixed(4)),
      scaleY: Number((targetRect.height / sourceRect.height).toFixed(4)),
      numberScale: Number(numberScale.toFixed(4))
    });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        flight.classList.add("is-flying");
        reveal.classList.add("is-content-arriving");
        motionLog("flight:start", { card: compactRect(card) });
      });
    });

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      flight.removeEventListener("transitionend", onEnd);
      landSelectedCard(card, flight, layer, target, reveal, sourceNumber);
    };
    const onEnd = (event) => {
      if (event.target === flight && event.propertyName === "transform") finish();
    };
    flight.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, 760);
  }

  /** Reintroduce la carta en el reveal sin fundido ni sustitución visual. */
  function landSelectedCard(card, flight, layer, target, reveal, sourceNumber) {
    motionLog("flight:complete", {
      flight: compactRect(flight),
      target: compactRect(target)
    });

    card.classList.add("reveal-card", "card--revealed");
    card.classList.remove("card--detached", "is-flipped", "is-settling");
    card.disabled = true;
    card.tabIndex = -1;
    card.removeAttribute("aria-label");
    card.setAttribute("aria-hidden", "true");
    if (sourceNumber) sourceNumber.style.removeProperty("font-size");

    target.replaceWith(card);
    flight.remove();
    layer.remove();
    reveal.classList.remove("is-card-arriving", "is-content-arriving");
    motionLog("landing:complete", { card: compactRect(card) });
  }

  /**
   * T6: cada carta hundida se retira del DOM al terminar su transitionend,
   * con un barrido backstop alineado al estirón máximo de la tanda (D7,
   * DRAW-3): `backstopMs` cubre la duración más el retardo acotado para no
   * retirar cartas a media animación. El estado no cambia; solo el DOM.
   * @param {HTMLElement} card carta hundida
   * @param {number} [backstopMs] milisegundos del barrido (default 700)
   */
  function bindSinkRemoval(card, backstopMs) {
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      card.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      if (card.isConnected) card.remove();
    };
    const onEnd = (event) => {
      if (event.propertyName === "transform" || event.propertyName === "opacity") {
        remove();
      }
    };
    card.addEventListener("transitionend", onEnd);
    const timer = setTimeout(remove, backstopMs || 700); // barrido backstop (D7)
  }

  /**
   * Render declarativo: reemplaza el esqueleto de #app según (mode, phase).
   * El foco del carousel NO se decide aquí: se deriva de la transición real
   * en dispatch() comparando el estado anterior con el nuevo (R2-W1).
   */
  function render() {
    const state = Cartas.state;
    const root = document.getElementById("app");
    if (!root) return;

    if (state.mode === "draw" && state.phase === "carousel") {
      renderCarousel(root);
    } else if (state.mode === "draw" && state.phase === "reveal") {
      renderReveal(root);
    } else if (state.mode === "review" && state.phase === "spread") {
      renderSpread(root);
    } else {
      // home (y cualquier estado inesperado → home seguro)
      renderHome(root);
    }
  }

  /* ------------------------------------------------------------------------
   * Diálogo de revisión (REVIEW-2/3) — #dialog-root es HERMANO de #app
   * (hijo directo de <body>, position:fixed): con el diálogo abierto, #app
   * queda inert para que el fondo sea inerte pero el diálogo siga vivo.
   * ---------------------------------------------------------------------- */

  /** Foco en la primera carta del spread al entrar en review (T8). */
  function focusFirstSpreadCard() {
    const root = document.getElementById("app");
    if (!root) return;
    const first = root.querySelector(".spread-card");
    if (first) first.focus();
  }

  /** Foco en la acción principal del home tras "Nueva tirada" (T12). */
  function focusHomePrimary() {
    const root = document.getElementById("app");
    if (!root) return;
    const actions = root.querySelector(".home-actions");
    if (!actions) return;
    const btn =
      actions.querySelector("button:not(:disabled)") ||
      actions.querySelector("button");
    if (btn) btn.focus();
  }

  /**
   * Escape (DRAW-7, REVIEW-2/3): con el diálogo abierto lo cierra (T10); en
   * review sin diálogo vuelve al último reveal (T11); en fases de draw no hace
   * nada (T13). Un único handler global, sin preventDefault fuera de review.
   */
  function bindGlobalKeys() {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const s = Cartas.state;
      if (s.mode === "review" && s.phase === "spread") {
        event.preventDefault();
        dispatch({ type: "ESCAPE" });
      }
      // T13: en fases de draw, Escape es no-op (nada, ni preventDefault).
    });
  }

  /**
   * Despacha una acción: transición pura → render. Devuelve true si el
   * estado cambió (útil para flujos imperativos). R2-W1: el foco se deriva de
   * la transición real comparando prev/next; el diálogo (hermano de #app) se
   * sincroniza de forma imperativa (T9 abrir / T10 cerrar).
   */
  function dispatch(action) {
    const prev = Cartas.state;
    const next = transition(prev, action);
    if (next === prev) return false;

    Cartas.state = next;
    render();

    // Foco derivado del cambio real (R2-W1): solo cuando cambió el esqueleto.
    if (next.mode === "draw" && next.phase === "carousel" && prev.phase !== "carousel") {
      focusFirstCard();
    } else if (
      next.mode === "review" &&
      next.phase === "spread" &&
      prev.phase !== "spread"
    ) {
      focusFirstSpreadCard();
    } else if (next.mode === "draw" && next.phase === "home" && prev.phase !== "home") {
      focusHomePrimary();
    } else if (next.mode === "draw" && next.phase === "reveal" && prev.mode === "review") {
      // FOCUS_CARD: foco en el título del reveal
      const title = document.querySelector(".reveal-title");
      if (title) title.focus({ preventScroll: true });
    }
    return true;
  }

  async function init() {
    // Carga la colección por defecto antes de renderizar
    if (Cartas.loadCollection && !Cartas.collection) {
      await Cartas.loadCollection();
    }
    // Aspect ratio de las cartas desde el JSON
    const col = collection();
    if (col.width && col.height) {
      document.documentElement.style.setProperty("--card-aspect", `${col.width} / ${col.height}`);
    }
    // Recarga → home (sin persistencia; DRAW-1, REVIEW-5).
    Cartas.state = createInitialState();
    render();
    bindGlobalKeys();

    // Dev toggle: muestra el frente de todas las cartas del carousel
    const devBtn = document.getElementById("dev-toggle");
    if (devBtn) {
      devBtn.addEventListener("click", () => {
        const on = document.body.classList.toggle("dev-show-front");
        devBtn.setAttribute("aria-pressed", String(on));
      });
    }
  }

  /* ==== API pública (contrato de design.md) ==== */
  Cartas.createInitialState = createInitialState;
  Cartas.poolFor = poolFor;
  Cartas.getDrawGuard = getDrawGuard;
  Cartas.transition = transition;
  Cartas.render = render;
  Cartas.state = createInitialState();

  /* ==== Arranque solo en navegador (el smoke de Node no tiene document) ==== */
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
