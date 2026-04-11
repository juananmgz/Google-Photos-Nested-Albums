// Google Photos Folders — Network interception (fetch + XHR)
(function () {
  "use strict";
  const G = window.__GPF;

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
        if (G.addAlbum({ id: idC.val, title: nearby[0].val, cover: null, href })) found++;
      }
    } catch (_) {}
    return found;
  }

  G.interceptNetwork = function () {
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
  };
})();
