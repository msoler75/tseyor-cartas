/* ============================================================================
 * Cartas Tseyor — Mazo de cartas (deck.js)
 * ============================================================================
 * En navegador: loadCollection() carga data/<nombre>.json y sobreescribe
 * este mazo. En Node (smoke tests): se usa este mazo estático como fixture.
 *
 * API pública:
 *   Cartas.loadCollection(name)  — carga colección desde JSON
 *   Cartas.deck                  — mazo activo (fallback si no se carga JSON)
 * ========================================================================== */

window.Cartas = window.Cartas || {};

(function () {
  "use strict";

  /* -----------------------------------------------------------------------
   * Mazo de test (2 cartas) — mínimo para smoke.mjs
   * En navegador, loadCollection() lo sobreescribe con el JSON real.
   * --------------------------------------------------------------------- */
  window.Cartas.deck = {
    positions: ["Situación actual", "Desafío", "Consejo"],
    cards: [
      {
        id: "sol",
        title: "El Sol",
        keywords: "claridad, energía",
        meaning: "Claridad y energía renovada.",
        description: "El Sol marca un momento de claridad.",
        image: ""
      },
      {
        id: "luna",
        title: "La Luna",
        keywords: "intuición, misterio",
        meaning: "Escucha tu intuición.",
        description: "La Luna ilumina de otro modo.",
        image: ""
      }
    ]
  };

  /* -----------------------------------------------------------------------
   * Carga de colección desde JSON (data/<name>.json)
   * --------------------------------------------------------------------- */

  function transformCards(jsonCards, imagesFolder) {
    return jsonCards.map(function (c) {
      var imgId = c.image || c.id + ".jpg";
      return {
        id: String(c.id),
        title: c.title || "",
        category: c.category || "",
        keywords: c.category || "",
        meaning: c.meaning || "",
        description: "",
        image: imgId,
        draw_title: c.draw_title,
        draw_category: c.draw_category,
        title_style: c.title_style || "",
        image_padding: c.image_padding || null,
        _imagePath: imagesFolder ? imagesFolder + "/" + imgId : ""
      };
    });
  }

  function loadCollection(name) {
    name = name || "uommo";
    var url = "data/" + name + ".json";
    return fetch(url)
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      })
      .then(function (config) {
        var imagesFolder = config.images_folder || "";
        window.Cartas.collection = config;
        window.Cartas.deck = {
          positions: config.positions || [
            "Situación actual",
            "Desafío",
            "Consejo"
          ],
          cards: transformCards(config.cards || [], imagesFolder)
        };
        return config;
      })
      .catch(function (err) {
        console.error(
          '[Cartas] Error cargando colección "' + name + '":',
          err
        );
        window.Cartas.collection = {
          deck: name,
          cards: [],
          positions: []
        };
        return null;
      });
  }

  window.Cartas.loadCollection = loadCollection;
})();
