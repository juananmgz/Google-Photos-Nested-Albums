// Google Photos Folders — Collection loop, folder view swap, boot
(function () {
  "use strict";
  const G = window.__GPF;
  const S = G.state;

  // ─── Collection loop ────────────────────────────────────────────────────────

  G.collectAllAlbums = function (onDone) {
    if (S.isCollecting) return;
    S.isCollecting = true;
    console.log("[GPF] Starting album collection…");
    G.startContinuousScrape();

    let lastCount = 0,
      stableRounds = 0,
      round = 0;
    const STABLE_NEEDED = 8,
      INTERVAL = 450,
      MAX_ROUNDS = 500,
      MIN_ROUNDS = 20;

    const sc = G.findScrollContainer();

    G.showCollectionToast(() => {
      S.isCollecting = false;
      G.stopContinuousScrape();
      G.removeCollectionToast();
      S.albumData = [];
      S.seenIds.clear();
      console.log("[GPF] Collection cancelled by user");
    });

    function tick() {
      if (!S.isCollecting) return;
      G.scrapeVisibleAlbums();

      const count = S.albumData.length;
      if (count > lastCount) {
        stableRounds = 0;
        lastCount = count;
      } else stableRounds++;
      round++;

      G.updateToastCount(count);

      const atBottom = sc
        ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 150
        : window.innerHeight + window.scrollY >= document.body.scrollHeight - 150;

      if ((round >= MIN_ROUNDS && stableRounds >= STABLE_NEEDED && atBottom) || round >= MAX_ROUNDS) {
        S.isCollecting = false;
        G.stopContinuousScrape();
        G.removeCollectionToast();
        G.saveCache();
        console.log(`[GPF] Done: ${S.albumData.length} albums in ${round} rounds`);

        if (sc) sc.scrollTop = 0;
        window.scrollTo(0, 0);

        onDone();
        return;
      }

      const step = sc ? Math.max(sc.clientHeight * 0.6, 300) : window.innerHeight * 0.6;
      if (sc) sc.scrollTop += step;
      else window.scrollBy(0, step);
      setTimeout(tick, INTERVAL);
    }

    G.scrapeVisibleAlbums();
    lastCount = S.albumData.length;
    G.updateToastCount(lastCount);
    setTimeout(tick, INTERVAL);
  };

  // ─── Show folder view (swap grid) ──────────────────────────────────────────

  function showFolderView(gridEl) {
    S.originalGrid = gridEl;
    S.originalGridParent = gridEl.parentElement;
    gridEl.style.cssText = "display:none!important";
    G.collapseGridAncestors();

    S.gpfContainer = document.createElement("div");
    S.gpfContainer.className = "gpf-wrapper";
    S.gpfContainer.id = "gpf-root";
    S.gpfContainer.innerHTML = G.safeHTML(`
      <nav class="gpf-breadcrumb" aria-label="Navegación"></nav>
      <div class="gpf-grid" role="list"></div>`);
    gridEl.parentNode.insertBefore(S.gpfContainer, gridEl);

    const sc = G.findScrollContainer();
    if (sc) sc.scrollTop = 0;
    window.scrollTo(0, 0);

    let savedPath = history.state?.gpfPath;
    if (!Array.isArray(savedPath) || savedPath.length === 0) {
      try {
        savedPath = JSON.parse(sessionStorage.getItem(G.PATH_KEY));
      } catch (_) {}
    }
    if (Array.isArray(savedPath) && savedPath.length > 0) {
      S.currentPath = savedPath;
    }
    S._gpfNavigating = true;
    history.replaceState({ gpfPath: S.currentPath.slice() }, "", location.href);
    S._gpfNavigating = false;
    G.renderView();
    G.injectTitleToggle();
    S.isInjected = true;
  }

  // ─── Retry logic ─────────────────────────────────────────────────────────────
  // Google Photos is a SPA — the album grid may not exist yet after navigation
  // or initial load. Poll until the grid appears instead of relying on a single
  // attempt + MutationObserver (which misses recycled/mutated nodes).

  let _retryTimer = null;
  const RETRY_INTERVAL = 500;
  const MAX_RETRIES = 30; // 15 s total

  function startRetry() {
    clearRetry();
    let retries = 0;
    _retryTimer = setInterval(() => {
      retries++;
      if (retries >= MAX_RETRIES || S.isInjected || S.isCollecting || !G.isAlbumsListPage()) {
        clearRetry();
        return;
      }
      findAndInject();
    }, RETRY_INTERVAL);
  }

  function clearRetry() {
    if (_retryTimer) {
      clearInterval(_retryTimer);
      _retryTimer = null;
    }
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  function findAndInject() {
    if (!G.isAlbumsListPage()) return;
    if (S.isInjected || S.isCollecting) return;
    const grid = G.findAlbumGrid();
    if (!grid || !grid.querySelectorAll(G.ALBUM_LINK_SELECTOR).length) return;

    clearRetry();

    if (G.loadCache()) {
      showFolderView(grid);
      return;
    }

    G.collectAllAlbums(() => {
      const g = G.findAlbumGrid();
      if (g) showFolderView(g);
    });
  }

  function handleNavigation() {
    if (S._gpfNavigating) return;
    clearRetry();

    document.getElementById("gpf-root")?.remove();
    G.removeTitleToggle();
    G.removeRestoredGrid();
    G.restoreGridAncestors();
    if (S.originalGrid) {
      S.originalGrid.style.cssText = "";
    }
    S.gpfContainer = null;
    S.originalGrid = null;
    S.originalGridParent = null;
    S.isInjected = false;
    S.isCollecting = false;
    S.folderViewActive = true;
    S.currentPath = [];
    try {
      sessionStorage.removeItem(G.PATH_KEY);
    } catch (_) {}

    if (G.isAlbumsListPage()) {
      setTimeout(findAndInject, 600);
      startRetry();
    }
  }

  function handlePopState(e) {
    if (e.state && Array.isArray(e.state.gpfPath) && S.isInjected && S.gpfContainer) {
      S.currentPath = e.state.gpfPath;
      G.renderView();
      return;
    }
    handleNavigation();
  }

  // ─── Initialize ─────────────────────────────────────────────────────────────

  G.interceptNetwork();

  ["pushState", "replaceState"].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function (...a) {
      orig.apply(this, a);
      if (!S._gpfNavigating) handleNavigation();
    };
  });
  window.addEventListener("popstate", handlePopState);

  // Google Photos SPA may navigate without pushState/replaceState (e.g.
  // Navigation API or internal routing). Poll for URL changes as fallback.
  // Also acts as watchdog: if the SPA replaces the content area and destroys
  // our gpf-root while isInjected is still true, reset and re-inject.
  let _lastUrl = location.href;
  setInterval(() => {
    const cur = location.href;
    if (cur !== _lastUrl) {
      _lastUrl = cur;
      if (!S._gpfNavigating) handleNavigation();
    }
    // Watchdog: detect if folder view was destroyed by SPA DOM replacement
    if (S.isInjected && !document.getElementById("gpf-root")) {
      S.isInjected = false;
      S.gpfContainer = null;
      S.originalGrid = null;
      S.originalGridParent = null;
      if (G.isAlbumsListPage()) {
        startRetry();
        findAndInject();
      }
    }
  }, 300);

  new MutationObserver(() => {
    if (!S.isInjected && !S.isCollecting && G.isAlbumsListPage()) findAndInject();
  }).observe(document.body, { childList: true, subtree: true });

  function bootInit() {
    setTimeout(findAndInject, 800);
    if (G.isAlbumsListPage()) startRetry();
  }

  if (document.readyState === "complete") bootInit();
  else window.addEventListener("load", bootInit);
})();
