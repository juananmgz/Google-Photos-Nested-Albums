// Google Photos Folders — Tree, rendering, navigation, toggle
(function () {
  "use strict";
  const G = window.__GPF;
  const S = G.state;

  // ─── Tree ───────────────────────────────────────────────────────────────────

  function buildTree(albums) {
    const root = { children: {}, albums: [] };
    albums.forEach((album) => {
      const parts = G.parseName(album.title);
      if (parts.length === 1) {
        const { date, cleanName } = G.extractDate(parts[0]);
        root.albums.push({ ...album, displayName: cleanName, date });
        return;
      }
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!node.children[p]) node.children[p] = { children: {}, albums: [], covers: [] };
        node = node.children[p];
      }
      const { date, cleanName } = G.extractDate(parts[parts.length - 1]);
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

  // ─── Card builders ──────────────────────────────────────────────────────────

  function makeMosaic(covers) {
    const n = Math.min(covers.length, 4);
    const m = document.createElement("div");
    m.className = `gpf-mosaic gpf-mosaic-${n}`;
    if (n === 0) {
      m.innerHTML = G.safeHTML(
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
    countLbl.textContent = G.formatCount(total);
    metaRow.appendChild(countLbl);
    info.appendChild(metaRow);
    const titleRow = document.createElement("div");
    titleRow.className = "gpf-card-title";
    titleRow.innerHTML = G.safeHTML(
      `<svg class="gpf-folder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg><span>${name}</span>`,
    );
    info.appendChild(titleRow);
    card.appendChild(info);
    card.onclick = () => {
      G.navigateTo([...S.currentPath, name]);
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
      coverDiv.innerHTML = G.safeHTML(
        `<div class="gpf-album-no-cover"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`,
      );
    }
    if (album.shared || album.date) {
      const overlay = document.createElement("div");
      overlay.className = "gpf-cover-overlay";
      if (album.shared) {
        const sharedIcon = document.createElement("span");
        sharedIcon.className = "gpf-shared-icon";
        sharedIcon.innerHTML = G.safeHTML(
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
      thumb.innerHTML = G.safeHTML(
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
      sharedIcon.innerHTML = G.safeHTML(
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

  // ─── Toggle ─────────────────────────────────────────────────────────────────

  function updateToggleButton() {
    const btn = document.getElementById("gpf-title-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(S.folderViewActive));
    btn.title = S.folderViewActive ? "Desactivar vista de carpetas" : "Activar vista de carpetas";
    btn.classList.toggle("gpf-toggle-active", S.folderViewActive);
  }

  G.injectTitleToggle = function () {
    if (document.getElementById("gpf-title-toggle")) return;
    const h1 = document.querySelector("h1");
    if (!h1) return;
    const toggle = document.createElement("button");
    toggle.id = "gpf-title-toggle";
    toggle.className = "gpf-toggle-btn" + (S.folderViewActive ? " gpf-toggle-active" : "");
    toggle.setAttribute("aria-pressed", String(S.folderViewActive));
    toggle.title = S.folderViewActive ? "Desactivar vista de carpetas" : "Activar vista de carpetas";
    toggle.innerHTML = G.safeHTML(
      `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
    );
    toggle.onclick = G.toggleFolderView;
    h1.after(toggle);
  };

  G.removeTitleToggle = function () {
    document.getElementById("gpf-title-toggle")?.remove();
  };

  G.toggleFolderView = function () {
    S.folderViewActive = !S.folderViewActive;
    updateToggleButton();

    const gpfGrid = S.gpfContainer?.querySelector(".gpf-grid");

    if (S.folderViewActive) {
      G.fadeOutRestoredGrid(() => {
        G.collapseGridAncestors();
        if (gpfGrid) gpfGrid.style.display = "";

        if (S.albumData.length === 0) {
          // Late-bound: collectAllAlbums is in gpf-boot.js
          G.collectAllAlbums(() => {
            if (gpfGrid) gpfGrid.style.display = "";
            G.renderView();
          });
        } else {
          G.renderView();
        }
      });
    } else {
      if (gpfGrid) gpfGrid.style.display = "none";
      G.restoreGridAncestors();
      G.showRestoredGrid();
    }
  };

  // ─── Navigation & rendering ─────────────────────────────────────────────────

  function renderBreadcrumb() {
    const bc = S.gpfContainer.querySelector(".gpf-breadcrumb");
    bc.innerHTML = G.safeHTML("");
    const home = document.createElement("button");
    home.className = "gpf-bc-item gpf-bc-home";
    home.innerHTML = G.safeHTML(`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>Álbumes`);
    home.onclick = () => {
      G.navigateTo([]);
    };
    bc.appendChild(home);
    S.currentPath.forEach((seg, i) => {
      const sep = document.createElement("span");
      sep.className = "gpf-bc-sep";
      sep.textContent = "›";
      bc.appendChild(sep);
      const btn = document.createElement("button");
      btn.className = "gpf-bc-item" + (i === S.currentPath.length - 1 ? " gpf-bc-current" : "");
      btn.textContent = seg;
      btn.onclick = () => {
        G.navigateTo(S.currentPath.slice(0, i + 1));
      };
      bc.appendChild(btn);
    });
    // Re-inject toggle next to h1 if SPA destroyed it
    G.injectTitleToggle();
  }

  G.navigateTo = function (path, { replace = false } = {}) {
    S.currentPath = path;
    const state = { gpfPath: path.slice() };
    const url = location.href;
    S._gpfNavigating = true;
    if (replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
    S._gpfNavigating = false;
    try {
      sessionStorage.setItem(G.PATH_KEY, JSON.stringify(path));
    } catch (_) {}
    G.renderView();
  };

  G.renderView = function () {
    if (!S.gpfContainer) return;
    const grid = S.gpfContainer.querySelector(".gpf-grid");
    grid.style.minHeight = "";
    grid.style.height = "auto";
    grid.innerHTML = G.safeHTML("");

    renderBreadcrumb();

    const tree = buildTree(S.albumData);
    const node = S.currentPath.length === 0 ? tree : getNodeAtPath(tree, S.currentPath);
    if (!node) {
      grid.innerHTML = G.safeHTML('<p class="gpf-empty">Carpeta no encontrada.</p>');
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

    if (S.currentPath.length === 0) {
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
      grid.innerHTML = G.safeHTML('<p class="gpf-empty">Esta carpeta está vacía.</p>');
    }

    grid.querySelectorAll(".gpf-card, .gpf-root-album").forEach((el, i) => {
      el.style.animationDelay = `${i * 0.02}s`;
    });
  };
})();
