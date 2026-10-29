// Measures CPU time of the Worker's PNG share-image renderer in Node.
// npx esbuild scripts/bench-og.ts --bundle --platform=node --format=esm --outfile=/tmp/bench-og.mjs && node /tmp/bench-og.mjs [out.png]
import { writeFileSync } from "node:fs";
import { buildChart } from "../src/chart";
import { renderCard } from "../src/png";

// Synthetic year that climbs from ~25/day to ~700/day, with noise.
const days: [number, number][] = Array.from({ length: 365 }, (_, i) => {
	const base = 25 * Math.pow(28, i / 364);
	return [Math.round(base * (0.6 + ((i * 7919) % 10) / 12)), (i * 7919) % 5];
});
const data = {
	login: "octocat",
	name: "The Octocat",
	num: 1234,
	label: "public commits",
	rangeLabel: "in the last 12 months",
	short: "Oct 30, 2025 – Oct 29, 2026",
	sub: "+ 567 private contributions · 2,345 total contributions",
	unit: "contributions",
	chart: buildChart("2025-10-30", days),
	host: "example.pages.dev",
};
let png = await renderCard(data); // warm-up (JIT + glyph decode)
const runs = 20;
const t0 = process.cpuUsage();
const w0 = performance.now();
for (let i = 0; i < runs; i++) png = await renderCard(data);
const cpu = process.cpuUsage(t0);
console.log(
	JSON.stringify({
		bytes: png.length,
		wallMsPerRender: +((performance.now() - w0) / runs).toFixed(2),
		cpuMsPerRender: +((cpu.user + cpu.system) / 1000 / runs).toFixed(2),
	}),
);
if (process.argv[2]) writeFileSync(process.argv[2], png);
