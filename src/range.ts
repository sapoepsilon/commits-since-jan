// Date ranges. GitHub's contributionsCollection accepts at most one year, so
// every range is clamped to [today - 364 days, today] and normalised to whole
// UTC days, which keeps the cache key space bounded.

export type RangeId = "ytd" | "30d" | "90d" | "12m" | "custom";

export interface Range {
	id: RangeId;
	from: string; // YYYY-MM-DD (inclusive)
	to: string; // YYYY-MM-DD (today, UTC)
	label: string; // "since Jan 1, 2026", "in the last 30 days", ...
	short: string; // "Jan 1 – Oct 29, 2026"
	query: string; // canonical query string ("" for the default), e.g. "?range=30d"
}

const DAY = 86400000;
const PRESETS = new Set(["ytd", "30d", "90d", "12m"]);

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const md = (d: string) =>
	new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const mdy = (d: string) =>
	new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

export function parseRange(params: URLSearchParams, now = Date.now()): Range {
	const todayT = Date.parse(`${iso(now)}T00:00:00Z`);
	const to = iso(todayT);
	const minT = todayT - 364 * DAY;
	const year = new Date(todayT).getUTCFullYear();

	let raw = (params.get("from") ?? params.get("range") ?? "ytd").trim().toLowerCase();
	if (raw.startsWith("from=")) raw = raw.slice(5);
	if (raw.startsWith("from:")) raw = raw.slice(5);

	let id: RangeId = "ytd";
	let fromT = Date.parse(`${year}-01-01T00:00:00Z`);
	if (PRESETS.has(raw)) {
		id = raw as RangeId;
		if (id === "30d") fromT = todayT - 29 * DAY;
		else if (id === "90d") fromT = todayT - 89 * DAY;
		else if (id === "12m") fromT = minT;
	} else if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
		id = "custom";
		fromT = Math.min(todayT, Math.max(minT, Date.parse(`${raw}T00:00:00Z`)));
	}
	const from = iso(fromT);
	// Collapse custom dates that equal a preset so each window has one cache entry.
	if (id === "custom") {
		if (from === `${year}-01-01`) id = "ytd";
		else if (fromT === todayT - 29 * DAY) id = "30d";
		else if (fromT === todayT - 89 * DAY) id = "90d";
		else if (fromT === minT) id = "12m";
	}

	const short = `${md(from)}${from.slice(0, 4) !== to.slice(0, 4) ? `, ${from.slice(0, 4)}` : ""} – ${mdy(to)}`;
	let label: string;
	let query: string;
	switch (id) {
		case "ytd":
			label = `since Jan 1, ${year}`;
			query = "";
			break;
		case "30d":
			label = "in the last 30 days";
			query = "?range=30d";
			break;
		case "90d":
			label = "in the last 90 days";
			query = "?range=90d";
			break;
		case "12m":
			label = "in the last 12 months";
			query = "?range=12m";
			break;
		default:
			label = `since ${mdy(from)}`;
			query = `?from=${from}`;
	}
	return { id, from, to, label, short, query };
}
