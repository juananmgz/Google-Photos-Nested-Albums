// Google Photos Folders — DOM scraping, scroll container, album grid detection
(function () {
  "use strict";
  const G = window.__GPF;
  const S = G.state;
  const SEL = G.ALBUM_LINK_SELECTOR;

  function scrapeLink(link) {
    const href = link.href || link.getAttribute("href") || "";
    const id = G.getAlbumId(href);
    if (!id) return;

    // Only read LEAF elements (no children) — they have clean, isolated text.
    // Google Photos structure per album link: [title, count, "Más opciones"]
    let title = "";
    let itemCount = null;
    for (const el of link.querySelectorAll("div,span")) {
      if (el.children.length > 0) continue;
      const t = el.textContent.trim();
      if (!t || t.length <= 1) continue;
      if (!title) { title = t; continue; }
      if (!itemCount) { itemCount = t; continue; }
      break;
    }
    if (!title) return;

    let cover = null;
    const img = link.querySelector("img");
    if (img?.src && !img.src.startsWith("data:")) cover = img.src;
    else {
      for (const d of link.querySelectorAll("div[style]")) {
        const bg = d.style.backgroundImage;
        if (bg?.includes("http")) {
          cover = bg.replace(/url\(["']?|["']?\)/g, "");
          break;
        }
      }
    }
    const shared = /\/share\//.test(href);
    G.addAlbum({ id, title, cover, href, itemCount, shared });
  }

  G.scrapeVisibleAlbums = function () {
    document.querySelectorAll(SEL).forEach(scrapeLink);
  };

  // Continuous scraping via requestAnimationFrame during scroll collection.
  // Google Photos reuses/mutates DOM nodes rather than adding new ones,
  // so MutationObserver misses them. rAF scrapes every frame instead.
  G.startContinuousScrape = function () {
    if (S._rafId) return;
    function loop() {
      G.scrapeVisibleAlbums();
      S._rafId = requestAnimationFrame(loop);
    }
    S._rafId = requestAnimationFrame(loop);
  };

  G.stopContinuousScrape = function () {
    if (S._rafId) {
      cancelAnimationFrame(S._rafId);
      S._rafId = null;
    }
  };

  G.findScrollContainer = function () {
    const link = document.querySelector(
      SEL.split(",")
        .map((s) => s.trim() + ":not(#gpf-root a)")
        .join(","),
    );
    if (link) {
      let el = link.parentElement;
      while (el && el !== document.documentElement) {
        const s = getComputedStyle(el);
        if (s.overflowY === "auto" || s.overflowY === "scroll") return el;
        el = el.parentElement;
      }
    }
    for (const sel of ['[role="main"]', "main", "#yDmH0d"]) {
      const el = document.querySelector(sel);
      if (el) {
        const s = getComputedStyle(el);
        if (s.overflowY === "auto" || s.overflowY === "scroll") return el;
      }
    }
    return null;
  };

  G.findAlbumGrid = function (scope) {
    const root = scope || document;
    const links = root.querySelectorAll(
      SEL.split(",")
        .map((s) => s.trim() + ":not(#gpf-root a)")
        .join(","),
    );
    if (!links.length) return null;
    let best = null,
      bestCount = 0;
    for (const link of links) {
      let el = link.parentElement;
      while (el && el !== document.body) {
        if (el.id === "gpf-root") break;
        if (scope && !scope.contains(el)) break;
        const kids = Array.from(el.children).filter((c) => c.querySelector(SEL) || c.matches(SEL));
        if (kids.length >= 2 && kids.length > bestCount) {
          bestCount = kids.length;
          best = el;
        }
        el = el.parentElement;
      }
    }
    return best;
  };

  G.fadeOutScrapedCards = function () {
    const selector = SEL.split(",")
      .map((s) => s.trim() + ":not(#gpf-root a)")
      .join(",");
    const links = document.querySelectorAll(selector);
    let delay = 0;

    links.forEach((link) => {
      const id = G.getAlbumId(link.href || link.getAttribute("href"));
      if (!id || !S.seenIds.has(id)) return;
      if (link.dataset.gpfCollected) return;
      link.dataset.gpfCollected = "1";

      let card = link;
      while (card.parentElement) {
        const parent = card.parentElement;
        const siblings = Array.from(parent.children).filter(
          (c) => c.querySelector(SEL) || c.matches(SEL),
        );
        if (siblings.length >= 2) break;
        card = parent;
      }

      if (card.dataset.gpfFading) return;
      card.dataset.gpfFading = "1";

      // Only fade out visually — do NOT remove from DOM.
      // Google Photos uses a virtual scroll that recycles DOM nodes.
      setTimeout(() => {
        card.classList.add("gpf-card-collecting");
      }, delay);
      delay += 30;
    });
  };
})();
