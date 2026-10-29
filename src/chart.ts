// Weekly bar-chart model shared by the page, the client PNG and the server OG
// image. Weeks start on Sunday (like GitHub's calendar), so the first and last
// bars can be partial weeks.

export interface ChartModel {
	weeks: [string, number, number][]; // [weekStart YYYY-MM-DD, total, daysInRange]
	peak: number; // index into weeks
	yMax: number; // nice axis maximum (> peak value, leaves room for the label)
	ticks: number[]; // gridline values
	months: [number, string][]; // [week index, "Jan"]
	growth: number | null; // last 4 full weeks avg / first 4 full weeks avg
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;

function niceCeil(v: number) {
	if (v <= 0) return 4;
	const p = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
	return 10 * p;
}

export function buildChart(from: string, days: [number, number][]): ChartModel {
	const start = Date.parse(`${from}T00:00:00Z`);
	const lead = new Date(start).getUTCDay();
	const weeks: [string, number, number][] = [];
	for (let i = 0; i < days.length; i++) {
		const w = Math.floor((i + lead) / 7);
		if (!weeks[w]) {
			const ws = start + (w * 7 - lead) * DAY;
			weeks[w] = [new Date(Math.max(ws, start)).toISOString().slice(0, 10), 0, 0];
		}
		weeks[w][1] += days[i][0];
		weeks[w][2]++;
	}

	let peak = 0;
	for (let i = 1; i < weeks.length; i++) if (weeks[i][1] > weeks[peak][1]) peak = i;
	const peakVal = weeks[peak]?.[1] ?? 0;
	const yMax = niceCeil(Math.max(4, peakVal * 1.18));
	const ticks = [yMax / 2, yMax];

	// Label a month at the first week that contains its 1st day (or the first bar).
	const months: [number, string][] = [];
	let lastMonth = -1;
	for (let i = 0; i < days.length; i++) {
		const d = new Date(start + i * DAY);
		const m = d.getUTCMonth();
		if (m !== lastMonth && (i === 0 || d.getUTCDate() === 1)) {
			const w = Math.floor((i + lead) / 7);
			// two months starting in the same week: keep the later one
			if (months.length && months[months.length - 1][0] === w) months.pop();
			months.push([w, MONTHS[m]]);
			lastMonth = m;
		}
	}

	let growth: number | null = null;
	const full = weeks.filter((w) => w[2] === 7);
	if (full.length >= 12) {
		const avg = (ws: typeof full) => ws.reduce((n, w) => n + w[1], 0) / ws.length;
		const first = avg(full.slice(0, 4));
		const last = avg(full.slice(-4));
		if (first > 0) growth = Math.round((last / first) * 10) / 10;
	}

	return { weeks, peak, yMax, ticks, months, growth };
}

export function compact(n: number) {
	if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
	if (n >= 10_000) return `${Math.round(n / 1000)}k`;
	if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
	return String(n);
}

// growth text only when it reads well (a clear rise)
export function growthText(c: ChartModel) {
	if (c.growth === null || c.growth < 1.5) return null;
	return `${c.growth >= 10 ? Math.round(c.growth) : c.growth}× vs first month`;
}
