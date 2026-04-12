// Google Photos Folders — Utilities, cache, album management
(function () {
  "use strict";
  const G = window.__GPF;
  const S = G.state;

  G.getAlbumId = function (href) {
    if (!href) return null;
    const m = href.match(/\/(?:album|share)\/([^/?#]+)/);
    return m ? m[1] : null;
  };

  G.parseName = function (name) {
    return name
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  G.extractDate = function (segment) {
    const m = segment.match(/^\[(\d{4}-\d{2})\]\s*/);
    if (m) return { date: m[1], cleanName: segment.slice(m[0].length).trim() };
    const m2 = segment.match(/\s*\[(\d{4}-\d{2})\]\s*$/);
    if (m2) return { date: m2[1], cleanName: segment.replace(m2[0], "").trim() };
    return { date: null, cleanName: segment.trim() };
  };

  G.formatCount = function (n) {
    const label = n === 1 ? "álbum" : "álbumes";
    return `${n} ${label}`;
  };

  G.addAlbum = function (album) {
    const id = album.id || G.getAlbumId(album.href);
    if (!id) return false;
    if (S.seenIds.has(id)) {
      const ex = S.albumData.find((a) => a.id === id);
      if (ex) {
        if (album.cover && !ex.cover) ex.cover = album.cover;
        if (album.itemCount && !ex.itemCount) ex.itemCount = album.itemCount;
        if (album.shared) ex.shared = true;
        if (album.href && album.href.includes("/share/") && !ex.href.includes("/share/")) ex.href = album.href;
      }
      return false;
    }
    S.seenIds.add(id);
    album.id = id;
    S.albumData.push(album);
    console.log(`[GPF] +album: "${album.title}" (id: ${album.id?.slice(0, 12)}…)`);
    return true;
  };

  G.saveCache = function () {
    try {
      sessionStorage.setItem(G.CACHE_KEY, JSON.stringify(S.albumData));
    } catch (_) {}
  };

  G.loadCache = function () {
    try {
      const raw = sessionStorage.getItem(G.CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      S.albumData = parsed;
      parsed.forEach((a) => {
        if (a.id) S.seenIds.add(a.id);
      });
      console.log(`[GPF] Loaded ${S.albumData.length} albums from cache`);
      return true;
    } catch (_) {
      return false;
    }
  };
})();
