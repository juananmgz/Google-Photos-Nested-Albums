// Google Photos Folders — Toast, restored grid, grid ancestor collapse/restore
(function () {
  "use strict";
  const G = window.__GPF;
  const S = G.state;

  // ─── Toast ──────────────────────────────────────────────────────────────────

  G.showCollectionToast = function (onCancel) {
    G.removeCollectionToast();
    const toast = document.createElement("div");
    toast.id = "gpf-toast";
    toast.innerHTML = G.safeHTML(`
      <div class="gpf-toast-spinner"></div>
      <span class="gpf-toast-text">Scanning albums… <strong class="gpf-toast-count">0</strong> found</span>
      <button class="gpf-toast-cancel" aria-label="Cancel">Cancel</button>
    `);
    toast.querySelector(".gpf-toast-cancel").onclick = onCancel;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("gpf-toast-visible"));
    return toast;
  };

  G.updateToastCount = function (n) {
    const el = document.querySelector("#gpf-toast .gpf-toast-count");
    if (el) el.textContent = n;
  };

  G.removeCollectionToast = function () {
    const toast = document.getElementById("gpf-toast");
    if (!toast) return;
    toast.classList.remove("gpf-toast-visible");
    toast.classList.add("gpf-toast-hiding");
    setTimeout(() => toast.remove(), 250);
  };

  // ─── Restored grid (toggle-off state) ───────────────────────────────────────

  function buildRestoredGrid() {
    const container = document.createElement("div");
    container.id = "gpf-restored-grid";
    container.className = "gpf-restored-grid";
    S.albumData.forEach((album) => {
      const card = document.createElement("a");
      card.href = album.href || "#";
      card.className = "gpf-restored-card gpf-card-appearing";
      card.innerHTML = G.safeHTML(`
        <div class="gpf-restored-cover">${
          album.cover
            ? `<img src="${album.cover}" loading="lazy" />`
            : `<div class="gpf-restored-empty"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
        }</div>
        <div class="gpf-restored-info">
          ${album.itemCount ? `<span class="gpf-restored-count">${album.itemCount}</span>` : ""}
          <span class="gpf-restored-name">${album.title}</span>
        </div>
      `);
      container.appendChild(card);
    });
    return container;
  }

  G.showRestoredGrid = function () {
    G.removeRestoredGrid();
    if (!S.albumData.length) return;
    const grid = buildRestoredGrid();
    const anchor = S.gpfContainer || S.originalGridParent;
    if (!anchor) return;
    const parent = S.gpfContainer ? S.gpfContainer.parentElement : S.originalGridParent;
    if (!parent) return;
    if (S.gpfContainer) S.gpfContainer.after(grid);
    else parent.appendChild(grid);
    const cards = grid.querySelectorAll(".gpf-restored-card");
    cards.forEach((c, i) => {
      c.style.animationDelay = `${i * 0.02}s`;
    });
  };

  G.removeRestoredGrid = function () {
    document.getElementById("gpf-restored-grid")?.remove();
  };

  G.fadeOutRestoredGrid = function (onDone) {
    const grid = document.getElementById("gpf-restored-grid");
    if (!grid) {
      if (onDone) onDone();
      return;
    }
    const cards = Array.from(grid.querySelectorAll(".gpf-restored-card"));
    cards.forEach((c, i) => {
      c.style.animationDelay = `${i * 0.015}s`;
      c.classList.remove("gpf-card-appearing");
      c.classList.add("gpf-card-collecting");
    });
    const totalTime = cards.length * 15 + 300;
    setTimeout(() => {
      grid.remove();
      if (onDone) onDone();
    }, totalTime);
  };

  // ─── Grid ancestor height collapse/restore ──────────────────────────────────

  G.collapseGridAncestors = function () {
    S._collapsedEls = [];
    if (!S.originalGrid) return;
    let el = S.originalGrid.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.id === "gpf-root") break;
      if (el.style.height && el.style.height !== "auto") {
        S._collapsedEls.push({ el, savedHeight: el.style.height });
        el.style.height = "auto";
      }
      el = el.parentElement;
    }
  };

  G.restoreGridAncestors = function () {
    for (const { el, savedHeight } of S._collapsedEls) {
      el.style.height = savedHeight;
    }
    S._collapsedEls = [];
  };
})();
