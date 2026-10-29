// Tiny 4-bit indexed-palette PNG renderer for the per-user share image.
// No wasm, no satori: rectangles + pre-rasterised 2-bit glyphs, compressed with
// the runtime's native CompressionStream("deflate") (zlib, which PNG expects).

import { compact, growthText, type ChartModel } from "./chart";
import { FONTS } from "./font";

export const W = 1200;
export const H = 630;

const hex = (h: string): [number, number, number] => [
	parseInt(h.slice(1, 3), 16),
	parseInt(h.slice(3, 5), 16),
	parseInt(h.slice(5, 7), 16),
];
const mix = (a: string, b: string, t: number) => {
	const A = hex(a);
	const B = hex(b);
	return A.map((v, i) => Math.round(v * t + B[i] * (1 - t))) as [number, number, number];
};

const BG = "#0d1117";
const PANEL = "#161b22";
const BORDER = "#30363d";
const TEXT = "#e6edf3";
const MUTED = "#7d8590";
const ACCENT = "#2f81f7";
const GRID = "#21262d";
const BAR = "#26a641";
const PEAK = "#39d353";
const BAR_DIM = "#006d32";

export const C = {
	bg: 0, panel: 1, border: 2, text: 3, muted: 4, accent: 5,
	grid: 6, bar: 7, peak: 8, barDim: 9,
} as const;

// 16-entry palette; 10-15 are anti-aliasing blends of the text colours on PANEL.
const PALETTE: [number, number, number][] = [
	hex(BG),
	hex(PANEL),
	hex(BORDER),
	hex(TEXT),
	hex(MUTED),
	hex(ACCENT),
	hex(GRID),
	hex(BAR),
	hex(PEAK),
	hex(BAR_DIM),
	mix(TEXT, PANEL, 0.33),
	mix(TEXT, PANEL, 0.66),
	mix(MUTED, PANEL, 0.4),
	mix(MUTED, PANEL, 0.75),
	mix(ACCENT, PANEL, 0.5),
	mix(PEAK, PANEL, 0.5),
];
// colour index -> palette index for alpha levels [0..3]
const AA: Record<number, [number, number, number, number]> = {
	[C.text]: [C.panel, 10, 11, C.text],
	[C.muted]: [C.panel, 12, 13, C.muted],
	[C.accent]: [C.panel, 14, 14, C.accent],
	[C.peak]: [C.panel, 15, 15, C.peak],
};

// Glyph spans are pre-computed at build time; each glyph is base64-decoded on
// first use and cached per isolate (immutable data, safe across requests).
const runsCache = new Map<string, Int16Array>();

function runsOf(font: string, ch: string, data: string) {
	const key = font + ch;
	let r = runsCache.get(key);
	if (!r) {
		const bin = atob(data);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		r = new Int16Array(bytes.buffer);
		runsCache.set(key, r);
	}
	return r;
}

const STRIDE = 1 + W / 2; // filter byte + 4-bit pixels

// Draws straight into PNG scanlines (filter 0, two pixels per byte), so the
// encoder needs no per-pixel packing pass; spans are filled natively.
export class Canvas {
	raw = new Uint8Array(H * STRIDE);

	set(x: number, y: number, c: number) {
		if (x < 0 || x >= W || y < 0 || y >= H) return;
		const i = y * STRIDE + 1 + (x >> 1);
		this.raw[i] = x & 1 ? (this.raw[i] & 0xf0) | c : (this.raw[i] & 0x0f) | (c << 4);
	}

	span(x0: number, x1: number, y: number, c: number) {
		x0 = Math.max(0, x0 | 0);
		x1 = Math.min(W, x1 | 0);
		if (x1 <= x0 || y < 0 || y >= H) return;
		if (x0 & 1) this.set(x0++, y, c);
		if (x1 & 1) this.set(--x1, y, c);
		if (x1 > x0) {
			const row = y * STRIDE + 1;
			this.raw.fill((c << 4) | c, row + (x0 >> 1), row + (x1 >> 1));
		}
	}

	rect(x: number, y: number, w: number, h: number, c: number) {
		for (let yy = Math.max(0, y | 0); yy < Math.min(H, (y + h) | 0); yy++) this.span(x, x + w, yy, c);
	}

	// rounded rect; with `border`, a 2px outline in that colour
	roundRect(x: number, y: number, w: number, h: number, r: number, fill: number, border?: number) {
		if (border !== undefined) {
			this.roundRect(x, y, w, h, r, border);
			this.roundRect(x + 2, y + 2, w - 4, h - 4, r - 2, fill);
			return;
		}
		for (let yy = 0; yy < h; yy++) {
			const dy = yy < r ? r - yy - 0.5 : yy >= h - r ? yy - (h - r) + 0.5 : 0;
			const inset = dy > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
			this.span(x + inset, x + w - inset, y + yy, fill);
		}
	}

	cell(x: number, y: number, s: number, c: number, bg: number) {
		this.rect(x, y, s, s, c);
		if (s >= 8) {
			this.set(x, y, bg);
			this.set(x + s - 1, y, bg);
			this.set(x, y + s - 1, bg);
			this.set(x + s - 1, y + s - 1, bg);
		}
	}

	measure(font: keyof typeof FONTS, s: string) {
		const set = FONTS[font];
		let w = 0;
		for (const ch of s) w += (set.g[ch] ?? set.g["?"] ?? [0])[0];
		return w;
	}

	fit(font: keyof typeof FONTS, s: string, maxW: number) {
		if (this.measure(font, s) <= maxW) return s;
		let t = s;
		while (t.length > 1 && this.measure(font, t + "…") > maxW) t = t.slice(0, -1);
		return t + "…";
	}

	text(font: keyof typeof FONTS, s: string, x: number, baseline: number, color: number, align: "left" | "right" = "left") {
		const set = FONTS[font];
		const map = AA[color] ?? [C.panel, color, color, color];
		let pen = align === "right" ? x - this.measure(font, s) : x;
		for (const ch of s) {
			const key = set.g[ch] ? ch : "?";
			const g = set.g[key];
			if (!g) continue;
			const ox = Math.round(pen) + g[1];
			const oy = baseline + g[2];
			const runs = runsOf(font, key, g[3]);
			for (let i = 0; i < runs.length; i += 4) {
				const x0 = ox + runs[i + 1];
				this.span(x0, x0 + runs[i + 2], oy + runs[i], map[runs[i + 3]]);
			}
			pen += g[0];
		}
		return pen;
	}
}

const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(parts: Uint8Array[]) {
	let c = 0xffffffff;
	for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
	const out = new Uint8Array(12 + data.length);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, data.length);
	const t = new TextEncoder().encode(type);
	out.set(t, 4);
	out.set(data, 8);
	dv.setUint32(8 + data.length, crc32([t, data]));
	return out;
}

export async function encodePng(c: Canvas): Promise<Uint8Array> {
	const raw = c.raw;
	const zlib = new Uint8Array(
		await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer(),
	);

	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, W);
	dv.setUint32(4, H);
	ihdr[8] = 4; // bit depth
	ihdr[9] = 3; // indexed colour
	const plte = new Uint8Array(PALETTE.length * 3);
	PALETTE.forEach((p, i) => plte.set(p, i * 3));

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("PLTE", plte),
		chunk("IDAT", zlib),
		chunk("IEND", new Uint8Array(0)),
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

export interface CardData {
	login: string;
	name: string | null;
	num: number;
	label: string; // e.g. "public commits"
	rangeLabel: string; // "since Jan 1, 2026"
	short: string; // "Jan 1 – Oct 29, 2026"
	sub: string;
	unit: string; // what the weekly bars count, e.g. "contributions"
	chart: ChartModel;
	host: string;
}

export async function renderCard(d: CardData): Promise<Uint8Array> {
	const cv = new Canvas();
	cv.rect(0, 0, W, H, C.bg);
	cv.roundRect(32, 32, W - 64, H - 64, 20, C.panel, C.border);

	const PAD = 72;
	const title = d.name || `@${d.login}`;
	cv.text("h1", cv.fit("h1", title, 700), PAD, 118, C.text);
	if (d.name) cv.text("h2", cv.fit("h2", `@${d.login}`, 700), PAD, 160, C.muted);
	cv.text("body", d.short, W - PAD, 112, C.muted, "right");

	const num = d.num.toLocaleString("en-US");
	const end = cv.text("big", num, PAD - 4, 272, C.text);
	const rest = W - PAD - (end + 20);
	cv.text("h2", cv.fit("h2", d.label, rest), end + 20, 230, C.accent);
	cv.text("h2", cv.fit("h2", d.rangeLabel, rest), end + 20, 270, C.accent);
	cv.text("body", cv.fit("body", d.sub, W - PAD * 2), PAD, 314, C.muted);

	drawBars(cv, d.chart, d.unit, PAD, 380, W - PAD, 516);

	cv.text("body", `How many have you made?  ${d.host}`, PAD, 578, C.muted);
	return encodePng(cv);
}

function drawBars(cv: Canvas, c: ChartModel, unit: string, x0: number, top: number, x1: number, bottom: number) {
	const n = c.weeks.length;
	if (!n) return;
	const plotR = x1 - 56; // right gutter for tick labels
	const plotH = bottom - top;
	const yOf = (v: number) => bottom - Math.round((v / c.yMax) * plotH);

	const g = growthText(c);
	const capEnd = cv.text("small", `${unit} per week`, x0, top - 16, C.muted);
	if (g) cv.text("small", `·  ${g}`, capEnd + 10, top - 16, C.accent);

	for (const t of c.ticks) {
		const y = yOf(t);
		cv.rect(x0, y, plotR - x0, 1, C.grid);
		cv.text("small", compact(t), x1, y + 6, C.muted, "right");
	}
	cv.rect(x0, bottom, plotR - x0, 1, C.border);

	const slot = (plotR - x0) / n;
	const bw = Math.max(2, Math.min(64, Math.round(slot * 0.72)));
	const r = Math.min(4, bw >> 1);
	let peakX = 0;
	let peakTop = bottom;
	for (let i = 0; i < n; i++) {
		const v = c.weeks[i][1];
		if (v <= 0) continue;
		const bh = Math.max(2, bottom - yOf(v));
		const bx = Math.round(x0 + i * slot + (slot - bw) / 2);
		const by = bottom - bh;
		const col = i === c.peak ? C.peak : c.weeks[i][2] < 7 && i === n - 1 ? C.barDim : C.bar;
		for (let yy = 0; yy < bh; yy++) {
			const dy = yy < r ? r - yy - 0.5 : 0;
			const inset = dy > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
			cv.span(bx + inset, bx + bw - inset, by + yy, col);
		}
		if (i === c.peak) {
			peakX = bx + bw / 2;
			peakTop = by;
		}
	}

	if (c.weeks[c.peak][1] > 0) {
	const peakText = `peak: ${c.weeks[c.peak][1].toLocaleString("en-US")} / week`;
	const pw = cv.measure("small", peakText);
	const px = Math.min(plotR - pw, Math.max(x0, peakX - pw / 2));
	cv.text("small", peakText, Math.round(px), peakTop - 8, C.peak);
	}

	let lastX = -1e9;
	const labels: [number, string, number][] = [];
	for (const [w, m] of c.months) {
		const mx = Math.round(x0 + w * slot + (slot - bw) / 2);
		if (mx > plotR - 20) continue;
		if (mx - lastX < 40) {
			// a partial first month gives way to the next full one
			if (labels.length === 1 && labels[0][2] === 0) labels.pop();
			else continue;
		}
		labels.push([mx, m, w]);
		lastX = mx;
	}
	for (const [mx, m] of labels) cv.text("small", m, mx, bottom + 24, C.muted);
}
