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

  $("yr").textContent = ", " + new Date().getUTCFullYear();

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
    ctx.font = `700 150px ${FONT}`;
    const numText = fmt(h.num);
    ctx.fillText(numText, PAD - 6, 330);
    const numW = ctx.measureText(numText).width;
    ctx.fillStyle = COLORS.accent;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(h.word, PAD + numW + 20, 286, W - PAD * 2 - numW - 20);
    ctx.fillText(d.rangeLabel, PAD + numW + 20, 328, W - PAD * 2 - numW - 20);
    if (d.source === "graphql" && d.restricted) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `400 24px ${FONT}`;
      ctx.fillText(`+ ${fmt(d.restricted)} private contributions · ${fmt(d.total)} total contributions`, PAD, 374);
    } else if (d.source !== "graphql") {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `400 24px ${FONT}`;
      ctx.fillText("commits, PRs, issues and reviews combined", PAD, 374);
    }

    // heatmap
    const start = new Date(d.from + "T00:00:00Z");
    const lead = start.getUTCDay();
    const cols = Math.ceil((lead + d.days.length) / 7);
    const gridW = W - PAD * 2;
    const gap = 4;
    const cell = Math.max(4, Math.min(16, Math.floor((gridW + gap) / cols) - gap));
    const top = 400;
    d.days.forEach(([, level], i) => {
      const k = i + lead;
      const x = PAD + Math.floor(k / 7) * (cell + gap);
      const y = top + (k % 7) * (cell + gap);
      roundRect(ctx, x, y, cell, cell, 3);
      ctx.fillStyle = COLORS.levels[level] || COLORS.levels[0];
      ctx.fill();
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 20px ${FONT}`;
    const host = /^(localhost|127\.)/.test(location.hostname) ? "commits-since-jan.pages.dev" : location.host;
    ctx.fillText(`How many have you made?  ${host}`, PAD, H - 56);
    ctx.textAlign = "right";
    ctx.fillText("Not affiliated with GitHub", W - PAD, H - 56);
    ctx.textAlign = "left";

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
