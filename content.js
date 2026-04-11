// Google Photos Folders - Content Script v7
// Silently collects all albums via scrolling + network interception,
// then replaces the main grid (not sidebar) with a folder view.

(function () {
  "use strict";

  const CACHE_KEY = "gpf_album_cache_v18";
  const PATH_KEY = "gpf_current_path";

  // ─── Trusted Types policy ────────────────────────────────────────────────────
  let _ttPolicy;
  try {
    _ttPolicy = window.trustedTypes?.createPolicy("gpf-html", { createHTML: (s) => s });
  } catch (_) {}

  function safeHTML(html) {
    return _ttPolicy ? _ttPolicy.createHTML(html) : html;
  }

  // ─── Page detection ──────────────────────────────────────────────────────────
  function isAlbumsListPage() {
    const p = location.pathname;
    if (/\/album\/[^/]+/.test(p)) return false;
    if (/\/photo\//.test(p)) return false;
    if (!/\/albums?($|\/)/.test(p)) return false;
    return true;
  }

  // ─── State ───────────────────────────────────────────────────────────────────
  let currentPath = [];
  let albumData = [];
  let gpfContainer = null;
  let originalGrid = null;
  let originalGridParent = null; // parent of the grid, to re-insert restored cards
  let isInjected = false;
  let isCollecting = false;
  let folderViewActive = true;
  const seenIds = new Set();

  // ─── Cache helpers ───────────────────────────────────────────────────────────

  function saveCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(albumData));
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      albumData = parsed;
      parsed.forEach((a) => {
        if (a.id) seenIds.add(a.id);
      });
      console.log(`[GPF] Loaded ${albumData.length} albums from cache`);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const ALBUM_LINK_SELECTOR = 'a[href*="/album/"], a[href*="/share/"]';

  function getAlbumId(href) {
    if (!href) return null;
    const m = href.match(/\/(?:album|share)\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function parseName(name) {
    return name
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function extractDate(segment) {
    const m = segment.match(/^\[(\d{4}-\d{2})\]\s*/);
    if (m) return { date: m[1], cleanName: segment.slice(m[0].length).trim() };
    const m2 = segment.match(/\s*\[(\d{4}-\d{2})\]\s*$/);
    if (m2) return { date: m2[1], cleanName: segment.replace(m2[0], "").trim() };
    return { date: null, cleanName: segment.trim() };
  }

  function formatCount(n) {
    const label = n === 1 ? "elemento" : n > 99 ? "elem." : "elementos";
    return `${n} ${label}`;
  }

  function addAlbum(album) {
    const id = album.id || getAlbumId(album.href);
    if (!id) return false;
    if (seenIds.has(id)) {
      const ex = albumData.find((a) => a.id === id);
      if (ex) {
        if (album.cover && !ex.cover) ex.cover = album.cover;
        if (album.itemCount && !ex.itemCount) ex.itemCount = album.itemCount;
        if (album.shared) ex.shared = true;
        // Prefer /share/ URL over constructed /album/ URL
        if (album.href && album.href.includes("/share/") && !ex.href.includes("/share/")) ex.href = album.href;
      }
      return false;
    }
    seenIds.add(id);
    album.id = id;
    albumData.push(album);
    console.log(`[GPF] +album: "${album.title}" (id: ${album.id?.slice(0, 12)}…)`);
    return true;
  }

  // ─── Network interception ────────────────────────────────────────────────────

  function parseGPResponse(text) {
    let found = 0;
    try {
      const clean = text.replace(/^\)\]\}'[\n\r]+/, "");
      const strRe = /"((?:[^"\\]|\\.)*)"/g;
      const strings = [];
      let sm;
      while ((sm = strRe.exec(clean)) !== null) strings.push({ val: sm[1], pos: sm.index });

      const idCandidates = strings.filter((s) => /^[A-Za-z0-9_\-]{20,80}$/.test(s.val) && !/^[A-Z_]+$/.test(s.val) && !/^-?\d[\d\-]*$/.test(s.val));
      const titleCandidates = strings.filter((s) => {
        const v = s.val;
        return (
          v.length >= 2 &&
          v.length <= 120 &&
          /[a-zA-ZÀ-ÿ0-9]/.test(v) &&
          !/^https?:\/\//.test(v) &&
          !/^[A-Za-z0-9+/]{30,}={0,2}$/.test(v) &&
          !/^[a-z]+:[a-z]/.test(v) &&
          !v.includes("\\u") &&
          !/^-?\d+$/.test(v)
        );
      });

      for (const idC of idCandidates) {
        const nearby = titleCandidates.filter((t) => Math.abs(t.pos - idC.pos) < 600);
        if (!nearby.length) continue;
        nearby.sort((a, b) => Math.abs(a.pos - idC.pos) - Math.abs(b.pos - idC.pos));
        const href = `https://photos.google.com/album/${idC.val}`;
        if (addAlbum({ id: idC.val, title: nearby[0].val, cover: null, href })) found++;
      }
    } catch (_) {}
    return found;
  }

  function interceptNetwork() {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const url = (typeof args[0] === "string" ? args[0] : args[0]?.url) || "";
      const p = origFetch.apply(this, args);
      if (/photos\.google\.com|\/_\/PhotosUi\/|batchexecute/i.test(url)) {
        p.then((r) =>
          r
            .clone()
            .text()
            .then((t) => {
              if (t.length > 200) parseGPResponse(t);
            })
            .catch(() => {}),
        ).catch(() => {});
      }
      return p;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url, ...r) {
      this._gpfUrl = url || "";
      return origOpen.apply(this, [m, url, ...r]);
    };
    XMLHttpRequest.prototype.send = function (...a) {
      if (/photos\.google\.com|\/_\/PhotosUi\/|batchexecute/i.test(this._gpfUrl || "")) {
        this.addEventListener("load", () => {
          try {
            if (this.responseText?.length > 200) parseGPResponse(this.responseText);
          } catch (_) {}
        });
      }
      return origSend.apply(this, a);
    };
  }

  // ─── DOM scraping ─────────────────────────────────────────────────────────────

  function scrapeLink(link) {
    const href = link.href || link.getAttribute("href") || "";
    const id = getAlbumId(href);
    if (!id) return;

    // Only read LEAF elements (no children) — they have clean, isolated text.
    // Google Photos structure per album link: [title, count, "Más opciones"]
    // Each is its own leaf node, so we avoid concatenation issues entirely.
    let title = "";
    let itemCount = null;
    for (const el of link.querySelectorAll("div,span")) {
      if (el.children.length > 0) continue; // skip parent nodes (concatenated text)
      const t = el.textContent.trim();
      if (!t || t.length <= 1) continue;
      if (!title) {
        title = t;
        continue;
      } // first leaf = title
      if (!itemCount) {
        itemCount = t;
        continue;
      } // second leaf = count (any language)
      break; // third leaf = "Más opciones" / actions — stop
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
    addAlbum({ id, title, cover, href, itemCount, shared });
  }

  function scrapeVisibleAlbums() {
    document.querySelectorAll(ALBUM_LINK_SELECTOR).forEach(scrapeLink);
  }

  // Continuous scraping via requestAnimationFrame during scroll collection.
  // Google Photos reuses/mutates DOM nodes rather than adding new ones,
  // so MutationObserver misses them. rAF scrapes every frame instead.
  let _rafId = null;
  function startContinuousScrape() {
    if (_rafId) return;
    function loop() {
      scrapeVisibleAlbums();
      _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
  }
  function stopContinuousScrape() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  // ─── Scroll container ────────────────────────────────────────────────────────

  function findScrollContainer() {
    // Walk up from any album link (NOT scoped to [role="main"] — GP links
    // may sit outside it) to find the nearest overflow-y:auto/scroll ancestor.
    const link = document.querySelector(
      ALBUM_LINK_SELECTOR.split(",")
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
  }

  // ─── Collection loop ─────────────────────────────────────────────────────────

  // ─── Toast helpers ──────────────────────────────────────────────────────────

  function showCollectionToast(onCancel) {
    removeCollectionToast();
    const toast = document.createElement("div");
    toast.id = "gpf-toast";
    toast.innerHTML = safeHTML(`
      <div class="gpf-toast-spinner"></div>
      <span class="gpf-toast-text">Scanning albums… <strong class="gpf-toast-count">0</strong> found</span>
      <button class="gpf-toast-cancel" aria-label="Cancel">Cancel</button>
    `);
    toast.querySelector(".gpf-toast-cancel").onclick = onCancel;
    document.body.appendChild(toast);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => toast.classList.add("gpf-toast-visible"));
    return toast;
  }

  function updateToastCount(n) {
    const el = document.querySelector("#gpf-toast .gpf-toast-count");
    if (el) el.textContent = n;
  }

  function removeCollectionToast() {
    const toast = document.getElementById("gpf-toast");
    if (!toast) return;
    toast.classList.remove("gpf-toast-visible");
    toast.classList.add("gpf-toast-hiding");
    setTimeout(() => toast.remove(), 250);
  }

  // ─── Fade out / fade in album cards ─────────────────────────────────────────

  function buildRestoredGrid() {
    // Build a simple album grid from albumData for the "toggle off" state
    const container = document.createElement('div');
    container.id = 'gpf-restored-grid';
    container.className = 'gpf-restored-grid';
    albumData.forEach(album => {
      const card = document.createElement('a');
      card.href = album.href || '#';
      card.className = 'gpf-restored-card gpf-card-appearing';
      card.innerHTML = safeHTML(`
        <div class="gpf-restored-cover">${
          album.cover
            ? `<img src="${album.cover}" loading="lazy" />`
            : `<div class="gpf-restored-empty"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
        }</div>
        <div class="gpf-restored-info">
          ${album.itemCount ? `<span class="gpf-restored-count">${album.itemCount}</span>` : ''}
          <span class="gpf-restored-name">${album.title}</span>
        </div>
      `);
      container.appendChild(card);
    });
    return container;
  }

  function showRestoredGrid() {
    removeRestoredGrid();
    if (!albumData.length) return;
    const grid = buildRestoredGrid();
    // Insert after gpfContainer (which is hidden) or into the original grid's parent
    const anchor = gpfContainer || originalGridParent;
    if (!anchor) return;
    const parent = gpfContainer ? gpfContainer.parentElement : originalGridParent;
    if (!parent) return;
    if (gpfContainer) gpfContainer.after(grid);
    else parent.appendChild(grid);
    // Stagger the appear animation
    const cards = grid.querySelectorAll('.gpf-restored-card');
    cards.forEach((c, i) => { c.style.animationDelay = `${i * 0.02}s`; });
    // Trigger reflow then remove the appearing class isn't needed —
    // the CSS animation handles it automatically
  }

  function removeRestoredGrid() {
    document.getElementById('gpf-restored-grid')?.remove();
  }

  function fadeOutRestoredGrid(onDone) {
    const grid = document.getElementById('gpf-restored-grid');
    if (!grid) { if (onDone) onDone(); return; }
    const cards = Array.from(grid.querySelectorAll('.gpf-restored-card'));
    cards.forEach((c, i) => {
      c.style.animationDelay = `${i * 0.015}s`;
      c.classList.remove('gpf-card-appearing');
      c.classList.add('gpf-card-collecting');
    });
    // Remove grid after last card fades
    const totalTime = cards.length * 15 + 300;
    setTimeout(() => {
      grid.remove();
      if (onDone) onDone();
    }, totalTime);
  }

  function fadeOutScrapedCards() {
    // Find album links in the original GP grid (not our GPF view)
    const selector = ALBUM_LINK_SELECTOR.split(',')
      .map(s => s.trim() + ':not(#gpf-root a)')
      .join(',');
    const links = document.querySelectorAll(selector);
    let delay = 0;

    links.forEach(link => {
      const id = getAlbumId(link.href || link.getAttribute('href'));
      if (!id || !seenIds.has(id)) return;
      if (link.dataset.gpfCollected) return;
      link.dataset.gpfCollected = '1';

      // Walk up to find the grid-level card (direct child of the album grid)
      let card = link;
      while (card.parentElement) {
        const parent = card.parentElement;
        const siblings = Array.from(parent.children).filter(c =>
          c.querySelector(ALBUM_LINK_SELECTOR) || c.matches(ALBUM_LINK_SELECTOR));
        if (siblings.length >= 2) break;
        card = parent;
      }

      // Skip if this card is already being collected
      if (card.dataset.gpfFading) return;
      card.dataset.gpfFading = '1';

      // Only fade out visually — do NOT remove from DOM.
      // Google Photos uses a virtual scroll that recycles DOM nodes;
      // removing them breaks its ability to render more items.
      setTimeout(() => {
        card.classList.add('gpf-card-collecting');
      }, delay);
      delay += 30;
    });
  }

  // ─── Collection loop ─────────────────────────────────────────────────────────

  function collectAllAlbums(onDone) {
    if (isCollecting) return;
    isCollecting = true;
    console.log("[GPF] Starting album collection…");
    startContinuousScrape();

    let lastCount = 0,
      stableRounds = 0,
      round = 0;
    const STABLE_NEEDED = 8,
      INTERVAL = 450,
      MAX_ROUNDS = 500,
      MIN_ROUNDS = 20;

    const sc = findScrollContainer();

    // Show toast with cancel support
    const toast = showCollectionToast(() => {
      isCollecting = false;
      stopContinuousScrape();
      removeCollectionToast();
      albumData = [];
      seenIds.clear();
      console.log("[GPF] Collection cancelled by user");
    });

    function tick() {
      if (!isCollecting) return;
      scrapeVisibleAlbums();

      const count = albumData.length;
      if (count > lastCount) {
        stableRounds = 0;
        lastCount = count;
      } else stableRounds++;
      round++;

      updateToastCount(count);

      // Don't fade out cards during collection — Google Photos uses a virtual
      // scroll that recycles DOM nodes. Hiding/removing them breaks recycling
      // and prevents new albums from loading. Toast counter shows progress.

      const atBottom = sc
        ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 150
        : window.innerHeight + window.scrollY >= document.body.scrollHeight - 150;

      if ((round >= MIN_ROUNDS && stableRounds >= STABLE_NEEDED && atBottom) || round >= MAX_ROUNDS) {
        isCollecting = false;
        stopContinuousScrape();
        removeCollectionToast();
        saveCache();
        console.log(`[GPF] Done: ${albumData.length} albums in ${round} rounds`);

        if (sc) sc.scrollTop = 0;
        window.scrollTo(0, 0);

        onDone();
        return;
      }

      // Scroll down to trigger Google Photos' virtual scroll to load more
      const step = sc
        ? Math.max(sc.clientHeight * 0.6, 300)
        : window.innerHeight * 0.6;
      if (sc) sc.scrollTop += step;
      else window.scrollBy(0, step);
      setTimeout(tick, INTERVAL);
    }

    scrapeVisibleAlbums();
    lastCount = albumData.length;
    updateToastCount(lastCount);
    setTimeout(tick, INTERVAL);
  }

  // ─── Tree ────────────────────────────────────────────────────────────────────

  function buildTree(albums) {
    const root = { children: {}, albums: [] };
    albums.forEach((album) => {
      const parts = parseName(album.title);
      if (parts.length === 1) {
        const { date, cleanName } = extractDate(parts[0]);
        root.albums.push({ ...album, displayName: cleanName, date });
        return;
      }
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!node.children[p]) node.children[p] = { children: {}, albums: [], covers: [] };
        node = node.children[p];
      }
      const { date, cleanName } = extractDate(parts[parts.length - 1]);
      node.albums.push({ ...album, displayName: cleanName, date });
      if (album.cover) {
        let cn = root;
        for (let i = 0; i < parts.length - 1; i++) {
          cn = cn.children[parts[i]];
          if (cn && cn.covers.length < 4) cn.covers.push(album.cover);
        }
      }
    });
    return root;
  }

  function getNodeAtPath(tree, path) {
    let node = tree;
    for (const seg of path) {
      if (!node.children?.[seg]) return null;
      node = node.children[seg];
    }
    return node;
  }

  // ─── Find main album grid (skip sidebar) ─────────────────────────────────────

  function findAlbumGrid() {
    // Find the container with the most album links (skip our own GPF view)
    const links = document.querySelectorAll(
      ALBUM_LINK_SELECTOR.split(",")
        .map((s) => s.trim() + ":not(#gpf-root a)")
        .join(","),
    );
    if (!links.length) return null;
    let best = null,
      bestCount = 0;
    for (const link of links) {
      let el = link.parentElement;
      while (el && el !== document.body) {
        if (el.id === "gpf-root") break; // don't go above into our own UI
        const kids = Array.from(el.children).filter((c) => c.querySelector(ALBUM_LINK_SELECTOR) || c.matches(ALBUM_LINK_SELECTOR));
        if (kids.length >= 2 && kids.length > bestCount) {
          bestCount = kids.length;
          best = el;
        }
        el = el.parentElement;
      }
    }
    return best;
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  function updateToggleButton() {
    const btn = document.getElementById("gpf-title-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(folderViewActive));
    btn.title = folderViewActive ? "Desactivar vista de carpetas" : "Activar vista de carpetas";
    btn.classList.toggle("gpf-toggle-active", folderViewActive);
  }

  function injectTitleToggle() {
    if (document.getElementById("gpf-title-toggle")) return; // already injected
    // Find the native "Álbumes" H1 heading
    const h1 = document.querySelector("h1");
    if (!h1 || !h1.textContent.trim().match(/^Álbumes$|^Albums$/)) return;
    const toggle = document.createElement("button");
    toggle.id = "gpf-title-toggle";
    toggle.className = "gpf-toggle-btn gpf-toggle-active";
    toggle.setAttribute("aria-pressed", "true");
    toggle.title = "Desactivar vista de carpetas";
    toggle.innerHTML = safeHTML(
      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
    );
    toggle.onclick = toggleFolderView;
    // Insert right after the H1
    h1.parentElement.style.display = "flex";
    h1.parentElement.style.alignItems = "center";
    h1.parentElement.style.gap = "10px";
    h1.after(toggle);
  }

  function removeTitleToggle() {
    document.getElementById("gpf-title-toggle")?.remove();
  }

  function toggleFolderView() {
    folderViewActive = !folderViewActive;
    updateToggleButton();

    if (folderViewActive) {
      // Re-enable folder view: fade out restored grid, then show GPF
      fadeOutRestoredGrid(() => {
        collapseGridAncestors();
        if (gpfContainer) gpfContainer.style.display = "";

        if (albumData.length === 0) {
          collectAllAlbums(() => {
            if (gpfContainer) gpfContainer.style.display = "";
            renderView();
          });
        } else {
          renderView();
        }
      });
    } else {
      // Disable folder view: hide GPF, show restored album cards
      if (gpfContainer) gpfContainer.style.display = "none";
      restoreGridAncestors();
      showRestoredGrid();
    }
  }

  function renderBreadcrumb() {
    const bc = gpfContainer.querySelector(".gpf-breadcrumb");
    bc.innerHTML = safeHTML("");
    const home = document.createElement("button");
    home.className = "gpf-bc-item gpf-bc-home";
    home.innerHTML = safeHTML(`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>Álbumes`);
    home.onclick = () => {
      navigateTo([]);
    };
    bc.appendChild(home);
    currentPath.forEach((seg, i) => {
      const sep = document.createElement("span");
      sep.className = "gpf-bc-sep";
      sep.textContent = "›";
      bc.appendChild(sep);
      const btn = document.createElement("button");
      btn.className = "gpf-bc-item" + (i === currentPath.length - 1 ? " gpf-bc-current" : "");
      btn.textContent = seg;
      btn.onclick = () => {
        navigateTo(currentPath.slice(0, i + 1));
      };
      bc.appendChild(btn);
    });
  }

  function makeMosaic(covers) {
    const n = Math.min(covers.length, 4);
    const m = document.createElement("div");
    m.className = `gpf-mosaic gpf-mosaic-${n}`;
    if (n === 0) {
      m.innerHTML = safeHTML(
        `<div class="gpf-mosaic-empty"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg></div>`,
      );
    } else {
      covers.slice(0, 4).forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.className = "gpf-mosaic-img";
        img.loading = "lazy";
        m.appendChild(img);
      });
    }
    return m;
  }

  function makeFolderCard(name, node) {
    const total = Object.keys(node.children).length + node.albums.length;
    const card = document.createElement("div");
    card.className = "gpf-card gpf-folder";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Carpeta ${name}`);
    card.appendChild(makeMosaic(node.covers || []));
    const info = document.createElement("div");
    info.className = "gpf-card-info";
    const metaRow = document.createElement("div");
    metaRow.className = "gpf-nested-meta-row";
    const countLbl = document.createElement("span");
    countLbl.className = "gpf-nested-count-label";
    countLbl.textContent = formatCount(total);
    metaRow.appendChild(countLbl);
    info.appendChild(metaRow);
    const titleRow = document.createElement("div");
    titleRow.className = "gpf-card-title";
    titleRow.innerHTML = safeHTML(
      `<svg class="gpf-folder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg><span>${name}</span>`,
    );
    info.appendChild(titleRow);
    card.appendChild(info);
    card.onclick = () => {
      navigateTo([...currentPath, name]);
    };
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") card.click();
    };
    return card;
  }

  function makeNestedAlbumCard(album) {
    const card = document.createElement("div");
    card.className = "gpf-card gpf-album";

    const coverDiv = document.createElement("div");
    coverDiv.className = "gpf-album-cover";
    if (album.cover) {
      const img = document.createElement("img");
      img.src = album.cover;
      img.loading = "lazy";
      coverDiv.appendChild(img);
    } else {
      coverDiv.innerHTML = safeHTML(
        `<div class="gpf-album-no-cover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`,
      );
    }
    // Overlay chips (bottom-right): shared icon + date
    if (album.shared || album.date) {
      const overlay = document.createElement("div");
      overlay.className = "gpf-cover-overlay";
      if (album.shared) {
        const sharedIcon = document.createElement("span");
        sharedIcon.className = "gpf-shared-icon";
        sharedIcon.innerHTML = safeHTML(
          `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
        );
        overlay.appendChild(sharedIcon);
      }
      if (album.date) {
        const chip = document.createElement("span");
        chip.className = "gpf-date-chip";
        chip.textContent = album.date;
        overlay.appendChild(chip);
      }
      coverDiv.appendChild(overlay);
    }
    card.appendChild(coverDiv);

    const info = document.createElement("div");
    info.className = "gpf-nested-info";
    if (album.itemCount) {
      const countEl = document.createElement("span");
      countEl.className = "gpf-item-count";
      countEl.textContent = album.itemCount;
      info.appendChild(countEl);
    }
    const nameEl = document.createElement("div");
    nameEl.className = "gpf-nested-name";
    nameEl.textContent = album.displayName || album.title;
    info.appendChild(nameEl);
    card.appendChild(info);
    if (album.href) {
      card.style.cursor = "pointer";
      card.onclick = () => {
        window.location.href = album.href;
      };
    }
    return card;
  }

  function makeRootAlbumRow(album) {
    const row = document.createElement("a");
    row.className = "gpf-root-album";
    row.href = album.href || "#";

    const thumb = document.createElement("div");
    thumb.className = "gpf-root-thumb";
    if (album.cover) {
      const img = document.createElement("img");
      img.src = album.cover;
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = safeHTML(
        `<div class="gpf-root-thumb-empty"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`,
      );
    }
    row.appendChild(thumb);

    const meta = document.createElement("div");
    meta.className = "gpf-root-meta";
    const metaTopRow = document.createElement("div");
    metaTopRow.className = "gpf-root-meta-top";
    if (album.shared) {
      const sharedIcon = document.createElement("span");
      sharedIcon.className = "gpf-shared-icon gpf-shared-inline";
      sharedIcon.innerHTML = safeHTML(
        `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
      );
      metaTopRow.appendChild(sharedIcon);
    }
    if (album.date) {
      const chip = document.createElement("span");
      chip.className = "gpf-date-chip";
      chip.textContent = album.date;
      metaTopRow.appendChild(chip);
    }
    if (metaTopRow.children.length) meta.appendChild(metaTopRow);
    const nameEl = document.createElement("div");
    nameEl.className = "gpf-root-name";
    nameEl.textContent = album.displayName || album.title;
    meta.appendChild(nameEl);
    row.appendChild(meta);
    return row;
  }

  // ─── Folder navigation with history support ────────────────────────────────
  // Push GPF folder path into history so browser back/forward works.
  let _gpfNavigating = false; // flag to avoid re-entrant handleNavigation

  function navigateTo(path, { replace = false } = {}) {
    currentPath = path;
    const state = { gpfPath: path.slice() };
    const url = location.href;
    _gpfNavigating = true;
    if (replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
    _gpfNavigating = false;
    try {
      sessionStorage.setItem(PATH_KEY, JSON.stringify(path));
    } catch (_) {}
    renderView();
  }

  function renderView() {
    if (!gpfContainer) return;
    const grid = gpfContainer.querySelector(".gpf-grid");
    grid.style.minHeight = "";
    grid.style.height = "auto";
    grid.innerHTML = safeHTML("");

    renderBreadcrumb();

    const tree = buildTree(albumData);
    const node = currentPath.length === 0 ? tree : getNodeAtPath(tree, currentPath);
    if (!node) {
      grid.innerHTML = safeHTML('<p class="gpf-empty">Carpeta no encontrada.</p>');
      return;
    }

    const folderNames = Object.keys(node.children).sort((a, b) => a.localeCompare(b, "es"));
    folderNames.forEach((name) => grid.appendChild(makeFolderCard(name, node.children[name])));

    const albums = (node.albums || []).slice().sort((a, b) => {
      const da = a.date || "",
        db = b.date || "";
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return (a.displayName || a.title).localeCompare(b.displayName || b.title, "es");
    });

    if (currentPath.length === 0) {
      if (albums.length > 0) {
        if (folderNames.length > 0) {
          const div = document.createElement("div");
          div.className = "gpf-section-divider";
          grid.appendChild(div);
        }
        const wrap = document.createElement("div");
        wrap.className = "gpf-root-list";
        albums.forEach((a) => wrap.appendChild(makeRootAlbumRow(a)));
        grid.appendChild(wrap);
      }
    } else {
      albums.forEach((a) => grid.appendChild(makeNestedAlbumCard(a)));
    }

    if (!folderNames.length && !albums.length) {
      grid.innerHTML = safeHTML('<p class="gpf-empty">Esta carpeta está vacía.</p>');
    }

    grid.querySelectorAll(".gpf-card, .gpf-root-album").forEach((el, i) => {
      el.style.animationDelay = `${i * 0.02}s`;
    });

    // Only scroll to top when navigating deeper into a folder, not when going back
    // (breadcrumb navigation should keep the current scroll position)
  }

  // ─── Show folder view (swap grid) ────────────────────────────────────────────

  let _collapsedEls = [];

  function collapseGridAncestors() {
    _collapsedEls = [];
    if (!originalGrid) return;
    let el = originalGrid.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.id === "gpf-root") break;
      // Google Photos sets explicit inline height on virtual-scroll containers
      if (el.style.height && el.style.height !== "auto") {
        _collapsedEls.push({ el, savedHeight: el.style.height });
        el.style.height = "auto";
      }
      el = el.parentElement;
    }
  }

  function restoreGridAncestors() {
    for (const { el, savedHeight } of _collapsedEls) {
      el.style.height = savedHeight;
    }
    _collapsedEls = [];
  }

  function showFolderView(gridEl) {
    originalGrid = gridEl;
    originalGridParent = gridEl.parentElement;
    gridEl.style.cssText = "display:none!important";
    collapseGridAncestors();

    gpfContainer = document.createElement("div");
    gpfContainer.className = "gpf-wrapper";
    gpfContainer.id = "gpf-root";
    gpfContainer.innerHTML = safeHTML(`
      <nav class="gpf-breadcrumb" aria-label="Navegación"></nav>
      <div class="gpf-grid" role="list"></div>`);
    gridEl.parentNode.insertBefore(gpfContainer, gridEl);

    const sc = findScrollContainer();
    if (sc) sc.scrollTop = 0;
    window.scrollTo(0, 0);

    // Restore folder path from history state or sessionStorage (survives refresh)
    let savedPath = history.state?.gpfPath;
    if (!Array.isArray(savedPath) || savedPath.length === 0) {
      try {
        savedPath = JSON.parse(sessionStorage.getItem(PATH_KEY));
      } catch (_) {}
    }
    if (Array.isArray(savedPath) && savedPath.length > 0) {
      currentPath = savedPath;
    }
    _gpfNavigating = true;
    history.replaceState({ gpfPath: currentPath.slice() }, "", location.href);
    _gpfNavigating = false;
    renderView();
    injectTitleToggle();
    isInjected = true;
  }

  // ─── Boot ────────────────────────────────────────────────────────────────────

  function findAndInject() {
    if (!isAlbumsListPage()) return;
    if (isInjected || isCollecting) return;
    const grid = findAlbumGrid();
    if (!grid || !grid.querySelectorAll(ALBUM_LINK_SELECTOR).length) return;

    // Try cache first — instant swap
    if (loadCache()) {
      showFolderView(grid);
      return;
    }

    // No cache — collect all albums by scrolling, then swap
    collectAllAlbums(() => {
      // Re-find the grid in case DOM changed during scrolling
      const g = findAlbumGrid();
      if (g) showFolderView(g);
    });
  }

  function handleNavigation() {
    if (_gpfNavigating) return; // our own pushState, ignore

    document.getElementById("gpf-root")?.remove();
    removeTitleToggle();
    removeRestoredGrid();
    restoreGridAncestors();
    if (originalGrid) {
      originalGrid.style.cssText = "";
    }
    gpfContainer = null;
    originalGrid = null;
    originalGridParent = null;
    isInjected = false;
    isCollecting = false;
    folderViewActive = true;
    currentPath = [];
    try {
      sessionStorage.removeItem(PATH_KEY);
    } catch (_) {}

    if (isAlbumsListPage()) setTimeout(findAndInject, 900);
  }

  function handlePopState(e) {
    // If the popped state has a gpfPath, it's internal GPF navigation
    if (e.state && Array.isArray(e.state.gpfPath) && isInjected && gpfContainer) {
      currentPath = e.state.gpfPath;
      renderView();
      return;
    }
    handleNavigation();
  }

  interceptNetwork();

  ["pushState", "replaceState"].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function (...a) {
      orig.apply(this, a);
      if (!_gpfNavigating) handleNavigation();
    };
  });
  window.addEventListener("popstate", handlePopState);

  new MutationObserver(() => {
    if (!isInjected && !isCollecting && isAlbumsListPage()) findAndInject();
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "complete") setTimeout(findAndInject, 1200);
  else window.addEventListener("load", () => setTimeout(findAndInject, 1200));
})();
