// Google Photos Folders — Namespace, state, constants
(function () {
  "use strict";

  let _ttPolicy;
  try {
    _ttPolicy = window.trustedTypes?.createPolicy("gpf-html", { createHTML: (s) => s });
  } catch (_) {}

  const G = (window.__GPF = {
    CACHE_KEY: "gpf_album_cache_v18",
    PATH_KEY: "gpf_current_path",
    ALBUM_LINK_SELECTOR: 'a[href*="/album/"], a[href*="/share/"]',

    safeHTML: function (html) {
      return _ttPolicy ? _ttPolicy.createHTML(html) : html;
    },

    isAlbumsListPage: function () {
      const p = location.pathname;
      if (/\/album\/[^/]+/.test(p)) return false;
      if (/\/photo\//.test(p)) return false;
      if (!/\/albums?($|\/)/.test(p)) return false;
      return true;
    },

    // All mutable state — always access via G.state.xxx, never cache locally
    state: {
      currentPath: [],
      albumData: [],
      gpfContainer: null,
      originalGrid: null,
      originalGridParent: null,
      isInjected: false,
      isCollecting: false,
      folderViewActive: true,
      seenIds: new Set(),
      _rafId: null,
      _collapsedEls: [],
      _gpfNavigating: false,
    },
  });
})();
