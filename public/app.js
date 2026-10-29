"use strict";
(() => {
  const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
  const COLORS = {
    bg: "#0d1117", panel: "#161b22", border: "#30363d", text: "#e6edf3",
    muted: "#7d8590", accent: "#2f81f7",
    levels: ["#1c222b", "#0e4429", "#006d32", "#26a641", "#39d353"],
  };
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

  function rangeQuery() {
    const v = $("range").value;
    if (v === "custom") return $("from").value ? `?from=${$("from").value}` : "";
    return v === "ytd" ? "" : `?range=${v}`;
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
  let current = null;

  const RANGE_HEAD = { "30d": "in the last 30 days", "90d": "in the last 90 days", "12m": "in the last 12 months" };
  function setHeadline(id, from) {
    let t;
    if (RANGE_HEAD[id]) t = RANGE_HEAD[id];
    else if (id === "custom" && from) t = "since " + new Date(from + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    else t = `since January 1, ${new Date().getUTCFullYear()}`;
    $("headRange").textContent = t;
  }
  setHeadline("ytd");

  function setMsg(text, err) {
    $("msg").textContent = text || "";
    $("msg").className = "msg" + (err ? " err" : "");
  }

  function headline(d) {
    if (d.source === "graphql" && d.commits != null) {
      return {
        num: d.commits,
        label: `public commits ${d.rangeLabel}`,
        word: "public commits",
        sub: d.restricted
          ? `+ ${fmt(d.restricted)} private contributions (GitHub doesn't say which are commits) · ${fmt(d.total)} total contributions`
          : `${fmt(d.total)} total contributions`,
        note: "Commits counted by GitHub in repositories visible to the public. Private work is only counted as a lump sum of “private contributions”, and only if the user shows private contributions on their profile.",
      };
    }
    return {
      num: d.total,
      label: `contributions ${d.rangeLabel}`,
      sub: "Commits, PRs, issues and reviews combined",
      note: "This total comes from the user's public GitHub contribution calendar, so it counts commits plus PRs, issues and reviews (private ones only if the user shows them). Commit-only counts appear when the GitHub API is available.",
      word: "contributions",
    };
  }

  function shareText(d) {
    const h = headline(d);
    return `I've made ${fmt(h.num)} ${h.word} on GitHub ${d.rangeLabel}. How many have you made?`;
  }

  function pageUrl(d) {
    return `${location.origin}/u/${encodeURIComponent(d.login)}${d.query || ""}`;
  }

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
      const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      cell.title = `${count} contribution${count === 1 ? "" : "s"} on ${date}`;
      frag.appendChild(cell);
    });
    heat.appendChild(frag);
    heat.setAttribute("aria-label", `Contribution heatmap from ${d.from} to ${d.to}`);

    const url = pageUrl(d);
    const text = shareText(d);
    const e = encodeURIComponent;
    $("sx").href = `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`;
    $("sli").href = `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`;
    $("sbs").href = `https://bsky.app/intent/compose?text=${e(text + " " + url)}`;
    $("srd").href = `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`;
    $("sfb").href = `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    $("native").hidden = !navigator.share;

    $("result").hidden = false;
    renderBarsSvg($("bars"), d.chart);
    $("share").hidden = false;
    document.title = `@${d.login}: ${fmt(h.num)} ${h.word} ${d.rangeLabel}`;
    syncRangeControls(d.range, d.from);
  }

  function countUp(el, target) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || target < 10) {
      el.textContent = fmt(target);
      return;
    }
    const t0 = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
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
      if (push) history.pushState({ login: data.login }, "", `/u/${encodeURIComponent(data.login)}${data.query || ""}`);
    } catch {
      setMsg("Network error. Try again.", true);
    } finally {
      $("f").querySelector("button").disabled = false;
    }
  }


  // ---------- weekly bar chart (same geometry for canvas and SVG) ----------
  const BAR = { bar: "#26a641", barTop: "#2ea043", barLow: "#1a7f37", peak: "#39d353", dim: "#006d32", grid: "#21262d" };

  function compact(n) {
    if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
    if (n >= 1e4) return `${Math.round(n / 1000)}k`;
    if (n >= 1e3) return `${+(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function growthText(c) {
    if (c.growth == null || c.growth < 1.5) return null;
    return `${c.growth >= 10 ? Math.round(c.growth) : c.growth}× vs first month`;
  }

  function barsLayout(c, x0, top, x1, bottom, gutter, minLabelGap) {
    const n = c.weeks.length;
    const plotR = x1 - gutter;
    const plotH = bottom - top;
    const yOf = (v) => bottom - Math.round((v / c.yMax) * plotH);
    const slot = (plotR - x0) / Math.max(1, n);
    const bw = Math.max(2, Math.min(64, Math.round(slot * 0.72)));
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
      if (mx > plotR - 20) continue;
      if (mx - lastX < minLabelGap) {
        if (labels.length === 1 && labels[0].w === 0) labels.pop();
        else continue;
      }
      labels.push({ x: mx, m, w });
      lastX = mx;
    }
    return { bars, labels, ticks: c.ticks.map((t) => ({ y: yOf(t), t })), plotR, slot, bw, peak: bars[c.peak] };
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

  function drawBarsCanvas(ctx, c, x0, top, x1, bottom) {
    if (!c || !c.weeks.length) return;
    const L = barsLayout(c, x0, top, x1, bottom, 56, 40);
    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`contributions per week`, x0, top - 16);
    const g = growthText(c);
    if (g) {
      const w = ctx.measureText("contributions per week").width;
      ctx.fillStyle = COLORS.accent;
      ctx.fillText(`·  ${g}`, x0 + w + 10, top - 16);
    }
    for (const t of L.ticks) {
      ctx.fillStyle = BAR.grid;
      ctx.fillRect(x0, t.y, L.plotR - x0, 1);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.fillText(compact(t.t), x1, t.y + 6);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = COLORS.border;
    ctx.fillRect(x0, bottom, L.plotR - x0, 1);
    for (const b of L.bars) {
      if (!b.h) continue;
      const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      const top = b.kind === "peak" ? BAR.peak : b.kind === "dim" ? BAR.dim : BAR.barTop;
      grad.addColorStop(0, top);
      grad.addColorStop(1, b.kind === "dim" ? BAR.dim : BAR.barLow);
      ctx.fillStyle = grad;
      roundTop(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
    }
    if (L.peak && L.peak.v > 0) {
      const text = `peak: ${fmt(L.peak.v)} / week`;
      const pw = ctx.measureText(text).width;
      const px = Math.min(L.plotR - pw, Math.max(x0, L.peak.x + L.peak.w / 2 - pw / 2));
      ctx.fillStyle = BAR.peak;
      ctx.fillText(text, px, L.peak.y - 8);
    }
    ctx.fillStyle = COLORS.muted;
    for (const l of L.labels) ctx.fillText(l.m, l.x, bottom + 24);
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
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    };
    const defs = add("defs", {});
    const mk = (id, a, b) => {
      const lg = document.createElementNS(NS, "linearGradient");
      lg.setAttribute("id", id);
      lg.setAttribute("x1", "0"); lg.setAttribute("y1", "0"); lg.setAttribute("x2", "0"); lg.setAttribute("y2", "1");
      for (const [off, col] of [["0", a], ["1", b]]) {
        const st = document.createElementNS(NS, "stop");
        st.setAttribute("offset", off);
        st.setAttribute("stop-color", col);
        lg.appendChild(st);
      }
      defs.appendChild(lg);
    };
    mk("gBar", BAR.barTop, BAR.barLow);
    mk("gPeak", BAR.peak, BAR.barLow);
    for (const t of L.ticks) {
      add("rect", { x: x0, y: t.y, width: L.plotR - x0, height: 1, fill: BAR.grid });
      add("text", { x: x1, y: t.y + 5, "text-anchor": "end", class: "ax" }, compact(t.t));
    }
    add("rect", { x: x0, y: bottom, width: L.plotR - x0, height: 1, fill: COLORS.border });
    for (const b of L.bars) {
      if (!b.h) continue;
      const r = Math.min(3, b.w / 2, b.h);
      const d = `M${b.x},${b.y + b.h}V${b.y + r}Q${b.x},${b.y} ${b.x + r},${b.y}H${b.x + b.w - r}Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + r}V${b.y + b.h}Z`;
      const p = add("path", { d, fill: b.kind === "peak" ? "url(#gPeak)" : b.kind === "dim" ? BAR.dim : "url(#gBar)" });
      const t = document.createElementNS(NS, "title");
      t.textContent = `Week of ${b.start}: ${fmt(b.v)} contributions${b.len < 7 ? ` (${b.len} days)` : ""}`;
      p.appendChild(t);
    }
    if (L.peak && L.peak.v > 0) {
      const text = `peak: ${fmt(L.peak.v)} / week`;
      const cx = L.peak.x + L.peak.w / 2;
      const anchor = cx > L.plotR - 70 ? "end" : cx < 70 ? "start" : "middle";
      add("text", { x: anchor === "end" ? L.plotR : anchor === "start" ? x0 : cx, y: L.peak.y - 7, "text-anchor": anchor, class: "pk" }, text);
    }
    for (const l of L.labels) add("text", { x: l.x, y: bottom + 20, class: "ax" }, l.m);
    el.appendChild(svg);
    const g = growthText(c);
    $("growth").textContent = g ? `· ${g}` : "";
  }

  // ---------- PNG card (client-side canvas, 1200x630) ----------
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

  async function drawCard(d) {
    const W = 1200, H = 630, S = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext("2d");
    ctx.scale(S, S);
    const h = headline(d);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, 32, 32, W - 64, H - 64, 20);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    const PAD = 72;
    const avatar = await loadImage(d.avatarUrl);
    const AV = 96;
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + AV / 2, 76 + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    if (avatar) {
      ctx.clip();
      ctx.drawImage(avatar, PAD, 76, AV, AV);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(PAD + AV / 2, 76 + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.border;
    ctx.stroke();

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 38px ${FONT}`;
    ctx.fillText(d.name || d.login, PAD + AV + 24, 118, 560);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 26px ${FONT}`;
    ctx.fillText("@" + d.login, PAD + AV + 24, 156, 560);

    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 22px ${FONT}`;
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(d.short, W - PAD, 112);
    ctx.textAlign = "left";

    ctx.fillStyle = COLORS.text;
    ctx.font = `700 124px ${FONT}`;
    const numText = fmt(h.num);
    ctx.fillText(numText, PAD - 4, 272);
    const numW = ctx.measureText(numText).width;
    ctx.fillStyle = COLORS.accent;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(h.word, PAD + numW + 20, 230, W - PAD * 2 - numW - 20);
    ctx.fillText(d.rangeLabel, PAD + numW + 20, 270, W - PAD * 2 - numW - 20);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 23px ${FONT}`;
    ctx.fillText(h.sub, PAD, 314, W - PAD * 2);

    drawBarsCanvas(ctx, d.chart, PAD, 380, W - PAD, 516);

    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 23px ${FONT}`;
    const host = /^(localhost|127\.)/.test(location.hostname) ? "commits-since-jan.pages.dev" : location.host;
    ctx.fillText(`How many have you made?  ${host}`, PAD, 578);

    // downscale to exactly 1200x630 for sharing
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(canvas, 0, 0, W, H);
    return out;
  }

  function fileName() {
    return `${current.login}-${current.range === "ytd" ? "since-jan-1" : current.range}-${current.to}.png`;
  }

  async function downloadPng() {
    if (!current) return;
    const canvas = await drawCard(current);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Exposed for headless rendering of the owner's card.
  window.__drawCardDataUrl = async () => (await drawCard(current)).toDataURL("image/png");

  // ---------- wiring ----------
  $("f").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup($("q").value, true);
  });
  $("dl").addEventListener("click", downloadPng);
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => current && renderBarsSvg($("bars"), current.chart), 150);
  });
  $("shot").addEventListener("click", async () => {
    if (!current) return;
    const canvas = await drawCard(current);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = blob && new File([blob], fileName(), { type: "image/png" });
    const payload = { files: [file], text: shareText(current) + " " + pageUrl(current) };
    if (file && navigator.canShare && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    await downloadPng();
    try {
      await navigator.clipboard.writeText(shareText(current) + " " + pageUrl(current));
      setMsg("Image downloaded and share text copied. Paste it with the image.");
    } catch {
      setMsg("Image downloaded.");
    }
  });
  $("range").addEventListener("change", () => {
    const custom = $("range").value === "custom";
    $("from").hidden = !custom;
    if (custom) {
      if (!$("from").value) $("from").value = isoDay(Date.now() - 29 * 86400000);
      $("from").focus();
    }
    relookup();
  });
  $("from").addEventListener("change", relookup);
  $("range").addEventListener("change", () => setHeadline($("range").value, $("from").value));
  $("from").addEventListener("change", () => setHeadline("custom", $("from").value));
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
    try {
      await navigator.clipboard.writeText(pageUrl(current));
      $("copy").textContent = "Copied!";
    } catch {
      prompt("Copy this link:", pageUrl(current));
    }
    setTimeout(() => ($("copy").textContent = "Copy link"), 1500);
  });
  $("native").addEventListener("click", () => {
    if (!current || !navigator.share) return;
    navigator.share({ title: document.title, text: shareText(current), url: pageUrl(current) }).catch(() => {});
  });
  window.addEventListener("popstate", () => route(false));

  function route(push) {
    const m = /^\/u\/([^/]+)\/?$/.exec(location.pathname);
    if (!m) {
      $("result").hidden = true;
      $("share").hidden = true;
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
  $("from").max = isoDay(Date.now());
  $("from").min = isoDay(Date.now() - 364 * 86400000);
  route(false);
})();
