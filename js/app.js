/* ============================================================
   Interactive Sacred Art Exhibit — controller
   Loads data/exhibit.json and builds the experience.
   One codebase, two modes:
     ?mode=kiosk  -> kiosk lockdown + idle attract loop
     (default)    -> responsive web/mobile
   All content (image, regions, videos, text) is data-driven so
   museum staff update data/exhibit.json + assets/ only.
   ============================================================ */
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const MODE = params.get("mode") === "kiosk" ? "kiosk" : "web";

  const $ = (sel, root = document) => root.querySelector(sel);
  const tpl = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

  let data = null;
  let modalEls = null;
  let attractEls = null;
  let idleTimer = null;
  let lastActiveTrigger = null;

  /* ---------- Boot ---------- */
  async function boot() {
    document.body.dataset.mode = MODE;
    try {
      const res = await fetch("data/exhibit.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      $("#app").innerHTML =
        `<div class="loader">Could not load exhibit data.<br><small>${err.message}</small></div>`;
      return;
    }
    render();
    registerServiceWorker();
  }

  /* ---------- Render main stage ---------- */
  function render() {
    const ex = data.exhibit;
    document.title = `${ex.title} — ${ex.collection || "Interactive Exhibit"}`;

    const app = $("#app");
    app.innerHTML = "";
    const stage = tpl("tpl-stage");

    $(".exhibit-title", stage).textContent = ex.title;
    $(".exhibit-meta", stage).textContent =
      [ex.artist, ex.year].filter(Boolean).join(" · ");
    $(".exhibit-intro", stage).textContent = ex.intro || "";

    const img = $(".painting", stage);
    img.src = ex.image;
    img.alt = `${ex.title} by ${ex.artist || "unknown artist"}`;

    // Hotspots (desktop / kiosk)
    const hotspots = $(".hotspots", stage);
    // Title list (mobile)
    const list = $(".title-list", stage);

    // SVG overlay for polygon regions, sized to the image's native pixels.
    const svg = buildHotspotSvg(ex);
    hotspots.appendChild(svg);

    data.regions.forEach((region) => {
      // Only traced polygons are drawn on the painting. Regions without a
      // polygon are still reachable via the title bar until they're traced.
      if (region.polygon && region.polygon.length >= 3) {
        svg.appendChild(buildPolygon(region));   // traced shape (from Figma)
      }
      list.appendChild(buildTitleItem(region));
    });

    $(".btn-fullscreen", stage).addEventListener("click", toggleFullscreen);

    app.appendChild(stage);

    // Modal + attract are appended to body once
    setupModal();
    if (MODE === "kiosk") setupKiosk(ex);
  }

  const SVGNS = "http://www.w3.org/2000/svg";

  function buildHotspotSvg(ex) {
    const w = ex.imageWidth || 1000;
    const h = ex.imageHeight || 1400;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "hotspot-svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none"); // overlay matches image box
    return svg;
  }

  function buildPolygon(region) {
    const poly = document.createElementNS(SVGNS, "polygon");
    poly.setAttribute("class", "hotspot-poly");
    poly.setAttribute("points", region.polygon.map((p) => p.join(",")).join(" "));
    poly.setAttribute("tabindex", "0");
    poly.setAttribute("role", "button");
    poly.setAttribute("aria-label", region.title);
    const t = document.createElementNS(SVGNS, "title");
    t.textContent = region.title;
    poly.appendChild(t);
    poly.addEventListener("click", () => openModal(region, poly));
    poly.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(region, poly); }
    });
    return poly;
  }

  function buildTitleItem(region) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "title-link";
    btn.type = "button";
    btn.innerHTML =
      `<span class="tl-title"></span>` +
      (region.duration ? `<span class="tl-dur"></span>` : "");
    $(".tl-title", btn).textContent = region.title;
    if (region.duration) $(".tl-dur", btn).textContent = region.duration;
    btn.addEventListener("click", () => openModal(region, btn));
    li.appendChild(btn);
    return li;
  }

  /* ---------- Modal ---------- */
  function setupModal() {
    if (modalEls) return;
    const overlay = tpl("tpl-modal");
    document.body.appendChild(overlay);
    modalEls = {
      overlay,
      video: $(".modal-video", overlay),
      placeholder: $(".modal-video-placeholder", overlay),
      title: $(".modal-title", overlay),
      duration: $(".modal-duration", overlay),
      text: $(".modal-text", overlay),
    };
    $(".modal-close", overlay).addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeModal();
    });
  }

  function openModal(region, trigger) {
    lastActiveTrigger = trigger || null;
    const { overlay, video, placeholder, title, duration, text } = modalEls;
    title.textContent = region.title;
    duration.textContent = region.duration ? `Running time ${region.duration}` : "";
    text.textContent = region.text || "";

    // Probe the video: if it loads, play it; otherwise show placeholder.
    video.hidden = false;
    placeholder.hidden = true;
    video.onerror = () => { video.hidden = true; placeholder.hidden = false; };
    if (region.video) {
      video.src = region.video;
      if (region.poster) video.poster = region.poster;
      video.load();
      const p = video.play();
      if (p && p.catch) p.catch(() => { /* autoplay may be blocked; controls remain */ });
    } else {
      video.hidden = true;
      placeholder.hidden = false;
    }

    overlay.hidden = false;
    $(".modal-close", overlay).focus();
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const { overlay, video } = modalEls;
    video.pause();
    video.removeAttribute("src");
    video.load();
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastActiveTrigger) lastActiveTrigger.focus();
  }

  /* ---------- Fullscreen ---------- */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  /* ---------- Kiosk: idle attract loop + lockdown ---------- */
  function setupKiosk(ex) {
    attractEls = tpl("tpl-attract");
    $(".attract-title", attractEls).textContent = ex.attractTitle || ex.title;
    $(".attract-subtitle", attractEls).textContent = ex.attractSubtitle || "";
    $(".attract-prompt", attractEls).textContent = ex.attractPrompt || "Touch to begin";
    document.body.appendChild(attractEls);

    attractEls.addEventListener("click", dismissAttract);

    const timeoutMs = (ex.idleTimeoutSeconds || 90) * 1000;
    ["pointerdown", "keydown", "touchstart", "mousemove"].forEach((evt) =>
      document.addEventListener(evt, () => resetIdle(timeoutMs), { passive: true })
    );
    resetIdle(timeoutMs);

    // Lockdown: block context menu, text selection, pinch-zoom, gestures.
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("dblclick", (e) => e.preventDefault());
  }

  function resetIdle(timeoutMs) {
    if (!attractEls) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showAttract, timeoutMs);
  }

  function showAttract() {
    if (!modalEls.overlay.hidden) closeModal();
    attractEls.hidden = false;
  }

  function dismissAttract() {
    attractEls.hidden = true;
  }

  /* ---------- Offline support ---------- */
  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
