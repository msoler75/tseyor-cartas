(function () {
  "use strict";

  const Cartas = (window.Cartas = window.Cartas || {});
  const imageCache = new Map();
  const fontCache = new Map();

  function parseStyle(cssText) {
    const style = {};
    String(cssText || "").split(";").forEach(function (declaration) {
      const separator = declaration.indexOf(":");
      if (separator === -1) return;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (property && value) style[property] = value;
    });
    return style;
  }

  function mergedStyle(base, override) {
    return Object.assign({}, parseStyle(base), parseStyle(override));
  }

  function imagePath(folder, file) {
    if (!file) return "";
    if (/^(?:data:|blob:|https?:|\/)/i.test(file)) return file;
    return `${String(folder || "").replace(/\/$/, "")}/${file}`;
  }

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imageCache.has(url)) return imageCache.get(url);

    const pending = new Promise(function (resolve, reject) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = function () { resolve(image); };
      image.onerror = function () {
        reject(new Error(`No se pudo cargar la imagen de carta: ${url}`));
      };
      image.src = url;
    });
    imageCache.set(url, pending);
    return pending;
  }

  function formatTitle(card, collection) {
    const format = collection.title_format;
    if (!format) return card.title || "";
    return format
      .replace("%ID%", card.id)
      .replace("%TITLE%", card.title || "");
  }

  function paddingBox(value, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    if (!Array.isArray(source) || source.length < 4) return [0, 0, 0, 0];
    return source.map(function (part) {
      const number = Number(part);
      return Number.isFinite(number) ? number : 0;
    });
  }

  function imageRect(sourceWidth, sourceHeight, box) {
    if (!sourceWidth || !sourceHeight || box.width <= 0 || box.height <= 0) return null;
    const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height
    };
  }

  function drawPositionedImage(ctx, image, box) {
    if (!image) return;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const target = imageRect(sourceWidth, sourceHeight, box);
    if (!target) return;
    ctx.drawImage(
      image,
      target.x,
      target.y,
      target.width,
      target.height
    );
  }

  function fontSize(style, fallback) {
    const parsed = parseFloat(style["font-size"]);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function fontDescriptor(style, fallbackSize) {
    const size = fontSize(style, fallbackSize);
    const family = style["font-family"] || "'Bradley Hand ITC TT Bold', serif";
    const weight = style["font-weight"] || "normal";
    const fontStyle = style["font-style"] || "normal";
    return `${fontStyle} ${weight} ${size}px ${family}`;
  }

  function loadFont(style, fallbackSize, sample) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const descriptor = fontDescriptor(style, fallbackSize);
    if (fontCache.has(descriptor)) return fontCache.get(descriptor);
    const pending = document.fonts.load(descriptor, sample || "Aa").catch(function (error) {
      fontCache.delete(descriptor);
      console.warn("[Cartas canvas] No se pudo precargar la fuente", { descriptor, error });
    });
    fontCache.set(descriptor, pending);
    return pending;
  }

  function loadCardFonts(card, collection) {
    if (!card) return Promise.resolve();
    const tasks = [];
    if (card.draw_category !== false && card.category) {
      tasks.push(loadFont(
        mergedStyle(collection.category_style, card.category_style),
        60,
        card.category
      ));
    }
    if (card.draw_title !== false) {
      tasks.push(loadFont(
        mergedStyle(collection.title_style, card.title_style),
        75,
        formatTitle(card, collection)
      ));
    }
    return Promise.all(tasks);
  }

  function transformedText(text, style) {
    const value = String(text || "");
    switch ((style["text-transform"] || "").toLowerCase()) {
      case "uppercase": return value.toUpperCase();
      case "lowercase": return value.toLowerCase();
      case "capitalize": return value.replace(/\b\S/g, function (letter) { return letter.toUpperCase(); });
      default: return value;
    }
  }

  function linesForWidth(ctx, text, maxWidth) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${line} ${words[index]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = words[index];
      }
    }
    lines.push(line);
    return lines;
  }

  function drawConfiguredText(ctx, text, box, style, fallbackSize) {
    if (!text || box.width <= 0 || box.height <= 0) return;
    const size = fontSize(style, fallbackSize);
    const lineHeightValue = parseFloat(style["line-height"]);
    const lineHeight = size * (Number.isFinite(lineHeightValue) ? lineHeightValue : 1.2);

    ctx.save();
    ctx.font = fontDescriptor(style, fallbackSize);
    ctx.fillStyle = style.color || "#26221c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(242, 234, 217, 0.75)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    const lines = linesForWidth(ctx, transformedText(text, style), box.width);
    const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
    const startY = box.y + box.height / 2 - blockHeight / 2 + lineHeight / 2;
    lines.forEach(function (line, index) {
      ctx.fillText(line, box.x + box.width / 2, startY + index * lineHeight, box.width);
    });
    ctx.restore();
  }

  function contentBoxFromPadding(padding, width, height) {
    return {
      x: padding[3],
      y: padding[0],
      width: Math.max(0, width - padding[1] - padding[3]),
      height: Math.max(0, height - padding[0] - padding[2])
    };
  }

  function drawFallbackBack(ctx, width, height) {
    ctx.fillStyle = "#e9dfc8";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#d5c7a6";
    ctx.lineWidth = Math.max(3, width * 0.007);
    ctx.strokeRect(width * 0.035, height * 0.024, width * 0.93, height * 0.952);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#f2ead9";
    ctx.strokeStyle = "#26221c";
    ctx.fillRect(-width * 0.18, -width * 0.18, width * 0.36, width * 0.36);
    ctx.strokeRect(-width * 0.18, -width * 0.18, width * 0.36, width * 0.36);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = "#b3401f";
    ctx.fill();
  }

  async function renderInto(canvas, card, collection, options) {
    const settings = options || {};
    const width = Number(collection.width) || 764;
    const height = Number(collection.height) || 1110;
    const face = settings.face || "front";
    canvas.width = width;
    canvas.height = height;
    canvas.style.aspectRatio = `${width} / ${height}`;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    if (face === "back") {
      const back = await loadImage(imagePath(collection.images_folder, collection.back_image));
      if (back) ctx.drawImage(back, 0, 0, width, height);
      else drawFallbackBack(ctx, width, height);
      return canvas;
    }

    const frontUrl = imagePath(collection.images_folder, collection.front_image);
    const artUrl = card && (card._imagePath || imagePath(collection.images_folder, card.image));
    const assetsPromise = Promise.all([
      loadImage(frontUrl).catch(function () { return null; }),
      loadImage(artUrl).catch(function () { return null; })
    ]);
    const results = await Promise.all([assetsPromise, loadCardFonts(card, collection)]);
    const assets = results[0];

    if (assets[0]) {
      ctx.drawImage(assets[0], 0, 0, width, height);
    } else {
      ctx.fillStyle = "#e9dfc8";
      ctx.fillRect(0, 0, width, height);
    }

    const imagePadding = paddingBox(card && card.image_padding, collection.image_padding);
    drawPositionedImage(ctx, assets[1], contentBoxFromPadding(imagePadding, width, height));

    if (card && card.draw_category !== false && card.category) {
      const categoryPadding = paddingBox(card.category_padding, collection.category_padding);
      const categoryStyle = mergedStyle(collection.category_style, card.category_style);
      drawConfiguredText(
        ctx,
        card.category,
        contentBoxFromPadding(categoryPadding, width, height),
        categoryStyle,
        60
      );
    }

    if (card && card.draw_title !== false) {
      const titlePadding = paddingBox(card.title_padding, collection.title_padding);
      const titleStyle = mergedStyle(collection.title_style, card.title_style);
      drawConfiguredText(
        ctx,
        formatTitle(card, collection),
        contentBoxFromPadding(titlePadding, width, height),
        titleStyle,
        75
      );
    }
    return canvas;
  }

  function createCanvas(card, collection, options) {
    const canvas = document.createElement("canvas");
    const face = (options && options.face) || "front";
    canvas.className = `card-canvas card-canvas--${face}`;
    canvas.setAttribute("aria-hidden", "true");
    canvas.renderComplete = renderInto(canvas, card, collection, options).catch(function (error) {
      console.error("[Cartas canvas] Error al renderizar la carta", {
        cardId: card && card.id,
        face,
        error
      });
      throw error;
    });
    return canvas;
  }

  async function renderCard(card, collection, options) {
    const canvas = createCanvas(card, collection, options);
    await canvas.renderComplete;
    return canvas;
  }

  function preloadImages(collection) {
    if (!collection || !collection.images_folder) return Promise.resolve();
    var promises = [];
    var back = collection.back_image;
    if (back) promises.push(loadImage(imagePath(collection.images_folder, back)));
    var cards = collection.cards || [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var img = c.image || (c.id + ".jpg");
      promises.push(loadImage(imagePath(collection.images_folder, img)));
    }
    return Promise.all(promises).then(function () {});
  }

  Cartas.cardRenderer = {
    createCanvas,
    formatTitle,
    imageRect,
    loadImage,
    preloadImages,
    renderCard,
    renderInto
  };
})();
