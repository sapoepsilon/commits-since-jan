"use strict";
(() => {
  const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
  const THEMES = window.THEMES || {};
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
  const SITE = "commits-since-jan.pages.dev";
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
  const host = () => (/^(localhost|127\.)/.test(location.hostname) ? SITE : location.host);

  const store = {
    get(k) {
      try {
        return localStorage.getItem("csj." + k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("csj." + k, v);
      } catch {}
    },
  };

  let current = null;
  let themeId = "dark";
  let T = THEMES.dark;
  let format = ["landscape", "post", "story"].includes(store.get("format")) ? store.get("format") : "landscape";
  let tpl = store.get("tpl") || "challenge";

  // ---------- range ----------
  function rangeQuery() {
    const v = $("range").value;
    if (v === "custom") return $("from").value ? `?from=${$("from").value}` : "";
    return v === "ytd" ? "" : `?range=${v}`;
  }

  function withTheme(q) {
    if (themeId === "dark") return q || "";
    return `${q || ""}${q ? "&" : "?"}theme=${themeId}`;
  }

  function syncRangeControls(id, from) {
    setHeadline(id || "ytd", from);
    $("range").value = id || "ytd";
    $("from").hidden = id !== "custom";
    if (id === "custom" && from) $("from").value = from;
  }

  function rangeFromUrl() {
    const p = new URLSearchParams(location.search);
    const from = p.get("from");
    const r = (p.get("range") || "").toLowerCase();
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) syncRangeControls("custom", from);
    else syncRangeControls(["30d", "90d", "12m"].includes(r) ? r : "ytd");
  }

  const RANGE_HEAD = { "30d": "in the last 30 days", "90d": "in the last 90 days", "12m": "in the last 12 months" };
  function setHeadline(id, from) {
    let t;
    if (RANGE_HEAD[id]) t = RANGE_HEAD[id];
    else if (id === "custom" && from)
      t = "since " + new Date(from + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    else t = `since January 1, ${new Date().getUTCFullYear()}`;
    $("headRange").textContent = t;
  }

  function setMsg(text, err) {
    $("msg").textContent = text || "";
    $("msg").className = "msg" + (err ? " err" : "");
  }

  function hint(text) {
    $("hint").textContent = text || "";
  }

  // ---------- theme ----------
  function applyTheme(id, updateUrl) {
    themeId = THEMES[id] ? id : "dark";
    T = THEMES[themeId];
    const s = document.documentElement.style;
    const vars = {
      bg: T.bg, panel: T.panel, border: T.border, text: T.text, muted: T.muted, accent: T.accent,
      btn: T.button, "btn-hover": T.buttonHover, grid: T.grid,
    };
    for (const k in vars) s.setProperty("--" + k, vars[k]);
    T.heat.forEach((c, i) => s.setProperty("--l" + i, c));
    s.colorScheme = T.scheme;
    document.documentElement.dataset.theme = themeId;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = T.bg;
    for (const b of $("swatches").children) b.setAttribute("aria-pressed", String(b.dataset.theme === themeId));
    if (updateUrl && current) history.replaceState(history.state, "", `/u/${encodeURIComponent(current.login)}${withTheme(current.query)}`);
    if (current) {
      renderBarsSvg($("bars"), current.chart);
      updateLinks();
    }
  }

  function buildSwatches() {
    const box = $("swatches");
    for (const id in THEMES) {
      const t = THEMES[id];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sw";
      b.dataset.theme = id;
      b.title = t.name;
      b.setAttribute("aria-label", t.name);
      b.style.setProperty("--a", t.panel);
      b.style.setProperty("--b", t.bar);
      b.addEventListener("click", () => applyTheme(id, true));
      box.appendChild(b);
    }
  }

  // ---------- numbers ----------
  function headline(d) {
    if (d.source === "graphql" && d.commits != null) {
      return {
        num: d.commits,
        label: `public commits ${d.rangeLabel}`,
        word: "public commits",
        sub: d.restricted
          ? `+ ${fmt(d.restricted)} private contributions (GitHub doesn't say which are commits) · ${fmt(d.total)} total contributions`
          : `${fmt(d.total)} total contributions`,
        cardSub: d.restricted ? `+ ${fmt(d.restricted)} private contributions · ${fmt(d.total)} total contributions` : `${fmt(d.total)} total contributions`,
        note: "Commits counted by GitHub in repositories visible to the public. Private work is only counted as a lump sum of “private contributions”, and only if the user shows private contributions on their profile.",
      };
    }
    return {
      num: d.total,
      label: `contributions ${d.rangeLabel}`,
      word: "contributions",
      sub: "Commits, PRs, issues and reviews combined",
      cardSub: "Commits, pull requests, issues and reviews combined",
      note: "This total comes from the user's public GitHub contribution calendar, so it counts commits plus PRs, issues and reviews (private ones only if the user shows them). Commit-only counts appear when the GitHub API is available.",
    };
  }

  function growthNum(c) {
    if (!c || c.growth == null || c.growth < 1.5) return null;
    return c.growth >= 10 ? Math.round(c.growth) : c.growth;
  }

  function growthText(c) {
    const g = growthNum(c);
    return g ? `${g}× vs first month` : null;
  }

  // ---------- share text ----------
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const TEMPLATES = {
    challenge: (v) => `I've made ${v.num} ${v.word} on GitHub ${v.range}. How many have you made?`,
    humble: (v) => `Slowly but surely: ${v.num} ${v.word} on GitHub ${v.range}. Busiest week so far: ${v.peak} contributions.`,
    brag: (v) =>
      `${v.num} ${v.word} ${v.range}. Peak week: ${v.peak} contributions${v.g ? `, ${v.g}× my first month` : ""}. Not slowing down.`,
    numbers: (v) => `${v.num} ${v.word} · ${v.range} · peak ${v.peak}/week${v.g ? ` · ${v.g}× growth` : ""}`,
    since: (v) => `${cap(v.range)}: ${v.num} ${v.word} on GitHub${v.g ? `, now ${v.g}× more per week than the first month` : ""}.`,
  };

  function templateText(d, id) {
    const h = headline(d);
    const c = d.chart;
    const peak = c && c.weeks.length ? c.weeks[c.peak][1] : 0;
    const v = { num: fmt(h.num), word: h.word, range: d.rangeLabel, peak: fmt(peak), g: growthNum(c) };
    return (TEMPLATES[id] || TEMPLATES.challenge)(v);
  }

  const shareTextNow = () => $("text").value.trim();

  function pageUrl(d) {
    return `${location.origin}/u/${encodeURIComponent(d.login)}${withTheme(d.query)}`;
  }

  function updateCount() {
    const n = [...shareTextNow()].length + 1 + 23;
    $("count").textContent = `${n} / 280 on X`;
    $("count").classList.toggle("warn", n > 280);
  }

  function updateLinks() {
    if (!current) return;
    const url = pageUrl(current);
    const text = shareTextNow();
    const e = encodeURIComponent;
    $("sx").href = `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`;
    $("sli").href = `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`;
    $("sbs").href = `https://bsky.app/intent/compose?text=${e(text + " " + url)}`;
    $("srd").href = `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`;
    $("sfb").href = `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    updateCount();
  }

  function setTemplate(id, save) {
    tpl = TEMPLATES[id] ? id : "challenge";
    $("tpl").value = tpl;
    if (save) store.set("tpl", tpl);
    if (current) $("text").value = templateText(current, tpl);
    updateLinks();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- page render ----------
  function render(d) {
    current = d;
    const h = headline(d);
    $("avatar").src = d.avatarUrl;
    $("avatar").alt = `${d.login}'s avatar`;
    $("name").textContent = d.name || d.login;
    $("login").textContent = "@" + d.login;
    $("login").href = `https://github.com/${encodeURIComponent(d.login)}`;
    $("label").textContent = h.label;
    $("sub").textContent = h.sub;
    $("note").textContent = h.note;
    countUp($("num"), h.num);

    const heat = $("heat");
    heat.textContent = "";
    const start = new Date(d.from + "T00:00:00Z");
    const lead = start.getUTCDay();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lead; i++) {
      const pad = document.createElement("i");
      pad.style.visibility = "hidden";
      frag.appendChild(pad);
    }
    d.days.forEach(([count, level], i) => {
      const cell = document.createElement("i");
      cell.className = "l" + level;
      cell.title = `${count} contribution${count === 1 ? "" : "s"} on ${isoDay(start.getTime() + i * 86400000)}`;
      frag.appendChild(cell);
    });
    heat.appendChild(frag);
    heat.setAttribute("aria-label", `Contribution heatmap from ${d.from} to ${d.to}`);

    $("native").hidden = !navigator.share;
    for (const id of ["result", "tools", "composer", "share"]) $(id).hidden = false;
    renderBarsSvg($("bars"), d.chart);
    $("text").value = templateText(d, tpl);
    updateLinks();
    hint("");
    document.title = `@${d.login}: ${fmt(h.num)} ${h.word} ${d.rangeLabel}`;
    syncRangeControls(d.range, d.from);
  }

  function countUp(el, target) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || target < 10 || navigator.webdriver) {
      el.textContent = fmt(target);
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function lookup(login, push) {
    login = login.trim().replace(/^@/, "");
    if (!LOGIN_RE.test(login)) {
      setMsg("That isn't a valid GitHub username.", true);
      return;
    }
    setMsg("Counting…");
    $("f").querySelector("button").disabled = true;
    try {
      const res = await fetch(`/api/u/${encodeURIComponent(login)}${rangeQuery()}`);
      const data = await res.json().catch(() => ({ message: "Something went wrong." }));
      if (!res.ok) {
        setMsg(data.message || "Something went wrong.", true);
        return;
      }
      setMsg("");
      render(data);
      if (push) history.pushState({ login: data.login }, "", `/u/${encodeURIComponent(data.login)}${withTheme(data.query)}`);
    } catch {
      setMsg("Network error. Try again.", true);
    } finally {
      $("f").querySelector("button").disabled = false;
    }
  }

  // ---------- weekly bar chart (same geometry for canvas and SVG) ----------
  function compact(n) {
    if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
    if (n >= 1e4) return `${Math.round(n / 1000)}k`;
    if (n >= 1e3) return `${+(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function barsLayout(c, x0, top, x1, bottom, gutter, minLabelGap) {
    const n = c.weeks.length;
    const plotR = x1 - gutter;
    const plotH = bottom - top;
    const yOf = (v) => bottom - Math.round((v / c.yMax) * plotH);
    const slot = (plotR - x0) / Math.max(1, n);
    const bw = Math.max(2, Math.min(64 * (gutter / 56), Math.round(slot * 0.72)));
    const bars = c.weeks.map(([start, v, len], i) => {
      const h = v > 0 ? Math.max(2, bottom - yOf(v)) : 0;
      const x = Math.round(x0 + i * slot + (slot - bw) / 2);
      const kind = i === c.peak && v > 0 ? "peak" : len < 7 && i === n - 1 ? "dim" : "bar";
      return { x, y: bottom - h, w: bw, h, v, start, len, kind };
    });
    const labels = [];
    let lastX = -1e9;
    for (const [w, m] of c.months) {
      const mx = Math.round(x0 + w * slot + (slot - bw) / 2);
      if (mx > plotR - minLabelGap / 2) continue;
      if (mx - lastX < minLabelGap) {
        if (labels.length === 1 && labels[0].w === 0) labels.pop();
        else continue;
      }
      labels.push({ x: mx, m, w });
      lastX = mx;
    }
    return { bars, labels, ticks: c.ticks.map((t) => ({ y: yOf(t), t })), plotR, peak: bars[c.peak] };
  }

  function roundTop(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  // k scales fonts/gutters for the larger Instagram canvases
  function drawBarsCanvas(ctx, c, x0, top, x1, bottom, k) {
    if (!c || !c.weeks.length) return;
    const L = barsLayout(c, x0, top, x1, bottom, 56 * k, 40 * k);
    const f = Math.round(18 * k);
    ctx.font = `500 ${f}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = T.muted;
    ctx.fillText("Weekly activity", x0, top - 16 * k);
    const g = growthText(c);
    if (g) {
      const w = ctx.measureText("Weekly activity").width;
      ctx.fillStyle = T.accent;
      ctx.fillText(`·  ${g}`, x0 + w + 10 * k, top - 16 * k);
    }
    // y-axis title above the tick labels
    ctx.fillStyle = T.muted;
    ctx.textAlign = "right";
    ctx.fillText("contributions", x1, top - 16 * k);
    for (const t of L.ticks) {
      ctx.fillStyle = T.grid;
      ctx.fillRect(x0, t.y, L.plotR - x0, Math.max(1, Math.round(k)));
      ctx.fillStyle = T.muted;
      ctx.fillText(compact(t.t), x1, t.y + 6 * k);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = T.border;
    ctx.fillRect(x0, bottom, L.plotR - x0, Math.max(1, Math.round(k)));
    for (const b of L.bars) {
      if (!b.h) continue;
      const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      grad.addColorStop(0, b.kind === "peak" ? T.peak : b.kind === "dim" ? T.dim : T.barTop);
      grad.addColorStop(1, b.kind === "dim" ? T.dim : T.barLow);
      ctx.fillStyle = grad;
      roundTop(ctx, b.x, b.y, b.w, b.h, 4 * k);
      ctx.fill();
    }
    if (L.peak && L.peak.v > 0) {
      const text = `peak: ${fmt(L.peak.v)} / week`;
      const pw = ctx.measureText(text).width;
      const px = Math.min(L.plotR - pw, Math.max(x0, L.peak.x + L.peak.w / 2 - pw / 2));
      ctx.fillStyle = T.peak;
      ctx.fillText(text, px, L.peak.y - 8 * k);
    }
    ctx.fillStyle = T.muted;
    for (const l of L.labels) ctx.fillText(l.m, l.x, bottom + 24 * k);
  }

  function renderBarsSvg(el, c) {
    el.textContent = "";
    if (!c || !c.weeks.length) return;
    // draw at the element's real pixel width so axis text stays readable on phones
    const W = Math.max(280, Math.round(el.clientWidth || 800));
    const H = W < 500 ? 200 : 250, x0 = 0, top = 30, x1 = W, bottom = H - 28;
    const L = barsLayout(c, x0, top, x1, bottom, 44, 34);
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Weekly contributions, ${c.weeks.length} weeks, peak ${L.peak ? L.peak.v : 0} per week`);
    const add = (tag, attrs, text, parent) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (text != null) n.textContent = text;
      (parent || svg).appendChild(n);
      return n;
    };
    const defs = add("defs", {});
    const grad = (id, a, b) => {
      const lg = add("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" }, null, defs);
      add("stop", { offset: "0", "stop-color": a }, null, lg);
      add("stop", { offset: "1", "stop-color": b }, null, lg);
    };
    grad("gBar", T.barTop, T.barLow);
    grad("gPeak", T.peak, T.barLow);
    add("text", { x: x1, y: top - 12, "text-anchor": "end", class: "ax" }, "contributions");
    for (const t of L.ticks) {
      add("rect", { x: x0, y: t.y, width: L.plotR - x0, height: 1, fill: T.grid });
      add("text", { x: x1, y: t.y + 5, "text-anchor": "end", class: "ax" }, compact(t.t));
    }
    add("rect", { x: x0, y: bottom, width: L.plotR - x0, height: 1, fill: T.border });
    for (const b of L.bars) {
      if (!b.h) continue;
      const r = Math.min(3, b.w / 2, b.h);
      const d = `M${b.x},${b.y + b.h}V${b.y + r}Q${b.x},${b.y} ${b.x + r},${b.y}H${b.x + b.w - r}Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + r}V${b.y + b.h}Z`;
      const p = add("path", { d, fill: b.kind === "peak" ? "url(#gPeak)" : b.kind === "dim" ? T.dim : "url(#gBar)" });
      add("title", {}, `Week of ${b.start}: ${fmt(b.v)} contributions${b.len < 7 ? ` (${b.len} days)` : ""}`, p);
    }
    if (L.peak && L.peak.v > 0) {
      const cx = L.peak.x + L.peak.w / 2;
      const anchor = cx > L.plotR - 70 ? "end" : cx < 70 ? "start" : "middle";
      add("text", { x: anchor === "end" ? L.plotR : anchor === "start" ? x0 : cx, y: L.peak.y - 7, "text-anchor": anchor, class: "pk", fill: T.peak }, `peak: ${fmt(L.peak.v)} / week`);
    }
    for (const l of L.labels) add("text", { x: l.x, y: bottom + 20, class: "ax" }, l.m);
    el.appendChild(svg);
    const g = growthText(c);
    $("growth").textContent = g ? `· ${g}` : "";
  }

  // ---------- PNG cards (client-side canvas) ----------
  const FORMATS = { landscape: [1200, 630], post: [1080, 1350], story: [1080, 1920] };

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawAvatar(ctx, img, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = T.bg;
    ctx.fill();
    if (img) {
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = T.border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function text(ctx, s, x, y, size, weight, color, align, maxW) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    if (maxW) ctx.fillText(s, x, y, maxW);
    else ctx.fillText(s, x, y);
    ctx.textAlign = "left";
  }

  async function drawCard(d, fmtId) {
    const [W, H] = FORMATS[fmtId] || FORMATS.landscape;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const h = headline(d);
    const avatar = await loadImage(d.avatarUrl);
    const M = fmtId === "landscape" ? 32 : 44;
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, M, M, W - 2 * M, H - 2 * M, fmtId === "landscape" ? 20 : 32);
    ctx.fillStyle = T.panel;
    ctx.fill();
    ctx.strokeStyle = T.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textBaseline = "alphabetic";
    const num = fmt(h.num);

    if (fmtId === "story") {
      const PAD = 96, cx = W / 2, AV = 168;
      drawAvatar(ctx, avatar, cx - AV / 2, 270, AV);
      text(ctx, d.name || d.login, cx, 520, 64, 600, T.text, "center", W - 2 * PAD);
      if (d.name) text(ctx, "@" + d.login, cx, 580, 40, 400, T.muted, "center", W - 2 * PAD);
      text(ctx, d.short, cx, 640, 34, 400, T.muted, "center", W - 2 * PAD);
      text(ctx, num, cx, 905, 260, 700, T.text, "center", W - 2 * PAD);
      text(ctx, h.word, cx, 990, 54, 600, T.accent, "center", W - 2 * PAD);
      text(ctx, d.rangeLabel, cx, 1056, 54, 600, T.accent, "center", W - 2 * PAD);
      text(ctx, h.cardSub, cx, 1120, 30, 400, T.muted, "center", W - 2 * PAD);
      drawBarsCanvas(ctx, d.chart, PAD, 1240, W - PAD, 1490, 1.6);
      text(ctx, "How many have you made?", cx, 1625, 44, 600, T.text, "center");
      text(ctx, host(), cx, 1685, 40, 500, T.accent, "center");
    } else if (fmtId === "post") {
      const PAD = 88, AV = 128;
      drawAvatar(ctx, avatar, PAD, 100, AV);
      text(ctx, d.name || d.login, PAD + AV + 32, 160, 54, 600, T.text, "left", W - PAD * 2 - AV - 32);
      if (d.name) text(ctx, "@" + d.login, PAD + AV + 32, 210, 34, 400, T.muted, "left", W - PAD * 2 - AV - 32);
      text(ctx, d.short, PAD, 320, 32, 400, T.muted);
      text(ctx, num, PAD - 6, 540, 230, 700, T.text, "left", W - PAD * 2);
      text(ctx, h.word, PAD, 612, 46, 600, T.accent, "left", W - PAD * 2);
      text(ctx, d.rangeLabel, PAD, 668, 46, 600, T.accent, "left", W - PAD * 2);
      text(ctx, h.cardSub, PAD, 728, 28, 400, T.muted, "left", W - PAD * 2);
      drawBarsCanvas(ctx, d.chart, PAD, 850, W - PAD, 1110, 1.45);
      text(ctx, "How many have you made?", PAD, 1232, 36, 600, T.text);
      text(ctx, host(), PAD, 1278, 32, 500, T.accent);
    } else {
      const PAD = 72, AV = 96;
      drawAvatar(ctx, avatar, PAD, 76, AV);
      text(ctx, d.name || d.login, PAD + AV + 24, 118, 38, 600, T.text, "left", 560);
      text(ctx, "@" + d.login, PAD + AV + 24, 156, 26, 400, T.muted, "left", 560);
      text(ctx, d.short, W - PAD, 112, 22, 400, T.muted, "right");
      ctx.font = `700 124px ${FONT}`;
      const numW = ctx.measureText(num).width;
      text(ctx, num, PAD - 4, 272, 124, 700, T.text);
      text(ctx, h.word, PAD + numW + 20, 230, 30, 600, T.accent, "left", W - PAD * 2 - numW - 20);
      text(ctx, d.rangeLabel, PAD + numW + 20, 270, 30, 600, T.accent, "left", W - PAD * 2 - numW - 20);
      text(ctx, h.cardSub, PAD, 314, 23, 400, T.muted, "left", W - PAD * 2);
      drawBarsCanvas(ctx, d.chart, PAD, 380, W - PAD, 516, 1);
      text(ctx, `How many have you made?  ${host()}`, PAD, 578, 23, 400, T.muted);
    }
    return canvas;
  }

  function fileName(fmtId) {
    const r = current.range === "ytd" ? "since-jan-1" : current.range;
    return `${current.login}-${r}-${fmtId || format}${themeId === "dark" ? "" : "-" + themeId}.png`;
  }

  async function cardFile(fmtId) {
    const canvas = await drawCard(current, fmtId);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return blob ? new File([blob], fileName(fmtId), { type: "image/png" }) : null;
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const isTouch = () => matchMedia("(pointer: coarse)").matches;

  // Exposed for headless rendering of the owner's card.
  window.__drawCardDataUrl = async (fmtId) => (await drawCard(current, fmtId || "landscape")).toDataURL("image/png");
  window.__setTheme = (id) => applyTheme(id, false);

  // ---------- wiring ----------
  $("f").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup($("q").value, true);
  });

  $("dl").addEventListener("click", async () => {
    if (!current) return;
    const file = await cardFile(format);
    if (file) download(file);
  });

  $("shot").addEventListener("click", async () => {
    if (!current) return;
    const file = await cardFile(format);
    const caption = `${shareTextNow()} ${pageUrl(current)}`;
    const payload = { files: [file], text: caption };
    if (file && navigator.canShare && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    if (file) download(file);
    hint((await copy(caption)) ? "Image downloaded and share text copied. Paste it with the image." : "Image downloaded.");
  });

  $("ig").addEventListener("click", async () => {
    if (!current) return;
    const fmtId = format === "landscape" ? "story" : format;
    const file = await cardFile(fmtId);
    const copied = await copy(`${shareTextNow()} ${pageUrl(current)}`);
    if (file && isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        hint(copied ? "Caption copied. Paste it in Instagram." : "");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    if (file) download(file);
    hint(
      `${fmtId === "story" ? "Story" : "Post"} image downloaded${copied ? " and caption copied" : ""}. Open Instagram → new ${fmtId === "story" ? "story" : "post"} → pick this image.`,
    );
  });

  for (const b of $("formats").querySelectorAll("button")) {
    b.addEventListener("click", () => {
      format = b.dataset.format;
      store.set("format", format);
      for (const o of $("formats").querySelectorAll("button")) o.setAttribute("aria-pressed", String(o === b));
    });
    b.setAttribute("aria-pressed", String(b.dataset.format === format));
  }

  $("tpl").addEventListener("change", () => setTemplate($("tpl").value, true));
  $("tplNext").addEventListener("click", () => {
    const ids = Object.keys(TEMPLATES);
    setTemplate(ids[(ids.indexOf(tpl) + 1) % ids.length], true);
  });
  $("text").addEventListener("input", updateLinks);

  // LinkedIn and Facebook only take a URL, so put the text on the clipboard.
  for (const id of ["sli", "sfb"]) {
    $(id).addEventListener("click", () => {
      copy(shareTextNow()).then((ok) => ok && hint("Post text copied. Paste it into the post."));
    });
  }

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => current && renderBarsSvg($("bars"), current.chart), 150);
  });

  $("range").addEventListener("change", () => {
    const custom = $("range").value === "custom";
    $("from").hidden = !custom;
    if (custom && !$("from").value) $("from").value = isoDay(Date.now() - 29 * 86400000);
    setHeadline($("range").value, $("from").value);
    if (custom) $("from").focus();
    relookup();
  });
  $("from").addEventListener("change", () => {
    setHeadline("custom", $("from").value);
    relookup();
  });
  $("toggleHeat").addEventListener("click", () => {
    const show = $("heatBox").hidden;
    $("heatBox").hidden = !show;
    $("toggleHeat").setAttribute("aria-expanded", String(show));
    $("toggleHeat").textContent = show ? "Hide daily heatmap" : "Show daily heatmap";
  });

  function relookup() {
    if (current) lookup(current.login, true);
    else if ($("q").value.trim()) lookup($("q").value, true);
  }

  $("copy").addEventListener("click", async () => {
    if (!current) return;
    const all = `${shareTextNow()} ${pageUrl(current)}`;
    if (await copy(all)) $("copy").textContent = "Copied!";
    else prompt("Copy this:", all);
    setTimeout(() => ($("copy").textContent = "Copy text + link"), 1500);
  });
  $("native").addEventListener("click", () => {
    if (!current || !navigator.share) return;
    navigator.share({ title: document.title, text: shareTextNow(), url: pageUrl(current) }).catch(() => {});
  });
  window.addEventListener("popstate", () => route(false));

  function route(push) {
    applyTheme(new URLSearchParams(location.search).get("theme") || "dark", false);
    const m = /^\/u\/([^/]+)\/?$/.exec(location.pathname);
    if (!m) {
      for (const id of ["result", "tools", "composer", "share"]) $(id).hidden = true;
      setHeadline("ytd");
      if (new URLSearchParams(location.search).has("invalid")) setMsg("That isn't a valid GitHub username.", true);
      return;
    }
    const login = decodeURIComponent(m[1]);
    rangeFromUrl();
    $("q").value = login;
    const boot = document.getElementById("boot");
    if (boot) {
      boot.remove();
      try {
        const data = JSON.parse(boot.textContent);
        if (data && data.login) {
          render(data);
          return;
        }
        if (data && data.message) {
          setMsg(data.message, true);
          return;
        }
      } catch {}
    }
    lookup(login, push);
  }

  buildSwatches();
  $("tpl").value = TEMPLATES[tpl] ? tpl : "challenge";
  $("from").max = isoDay(Date.now());
  $("from").min = isoDay(Date.now() - 364 * 86400000);
  route(false);
})();
