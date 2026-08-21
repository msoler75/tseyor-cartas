(function () {
  "use strict";

  const Cartas = (window.Cartas = window.Cartas || {});

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatTitle(cardData, col) {
    return Cartas.cardRenderer.formatTitle(cardData, col);
  }

  function decorateCardFace(root, cardData, col, options) {
    const kind = (options && options.kind) || "front";
    root.setAttribute("aria-hidden", "true");
    root.classList.add("has-card-canvas");
    root.appendChild(Cartas.cardRenderer.createCanvas(cardData, col, { face: "front", kind }));
    return root;
  }

  function buildCardFace(cardData, col, options) {
    const kind = (options && options.kind) || "front";
    const root = el("span", kind === "back" ? "face face--back" : "face face--front");
    root.setAttribute("aria-hidden", "true");

    if (kind === "back") {
      root.classList.add("has-card-canvas");
      root.appendChild(Cartas.cardRenderer.createCanvas(cardData, col, { face: "back", kind }));
      return root;
    }

    return decorateCardFace(root, cardData, col, options);
  }

  Cartas.ui = {
    buildCardFace,
    decorateCardFace,
    formatTitle
  };
})();
