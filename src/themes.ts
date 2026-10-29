// Colour themes shared by the server OG renderer and (via the generated
// dist/themes.js) the page and the client-side PNGs.

export interface Theme {
	name: string;
	bg: string;
	panel: string;
	border: string;
	text: string;
	muted: string;
	accent: string;
	grid: string;
	bar: string; // regular week
	barTop: string; // gradient top (client only)
	barLow: string; // gradient bottom (client only)
	peak: string; // peak week
	dim: string; // current partial week
	button: string; // page button background
	buttonHover: string;
	heat: [string, string, string, string, string]; // page heatmap levels 0-4
	scheme: "dark" | "light";
}

export const THEMES = {
	dark: {
		name: "GitHub Dark",
		bg: "#0d1117",
		panel: "#161b22",
		border: "#30363d",
		text: "#e6edf3",
		muted: "#7d8590",
		accent: "#2f81f7",
		grid: "#21262d",
		bar: "#26a641",
		barTop: "#2ea043",
		barLow: "#1a7f37",
		peak: "#39d353",
		dim: "#006d32",
		button: "#21262d",
		buttonHover: "#30363d",
		heat: ["#1c222b", "#0e4429", "#006d32", "#26a641", "#39d353"],
		scheme: "dark",
	},
	light: {
		name: "GitHub Light",
		bg: "#f6f8fa",
		panel: "#ffffff",
		border: "#d0d7de",
		text: "#1f2328",
		muted: "#656d76",
		accent: "#0969da",
		grid: "#eaeef2",
		bar: "#30a14e",
		barTop: "#40c463",
		barLow: "#2da44e",
		peak: "#216e39",
		dim: "#9be9a8",
		button: "#f6f8fa",
		buttonHover: "#eaeef2",
		heat: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
		scheme: "light",
	},
	dimmed: {
		name: "Dimmed",
		bg: "#22272e",
		panel: "#2d333b",
		border: "#444c56",
		text: "#adbac7",
		muted: "#768390",
		accent: "#539bf5",
		grid: "#373e47",
		bar: "#46954a",
		barTop: "#57ab5a",
		barLow: "#347d39",
		peak: "#6bc46d",
		dim: "#1b4721",
		button: "#373e47",
		buttonHover: "#444c56",
		heat: ["#373e47", "#0e4429", "#006d32", "#26a641", "#39d353"],
		scheme: "dark",
	},
	hc: {
		name: "High Contrast",
		bg: "#010409",
		panel: "#0a0c10",
		border: "#7a828e",
		text: "#ffffff",
		muted: "#b7bdc8",
		accent: "#71b7ff",
		grid: "#3d424d",
		bar: "#26cd4d",
		barTop: "#4ae168",
		barLow: "#1f9e3c",
		peak: "#7ee787",
		dim: "#006222",
		button: "#272b33",
		buttonHover: "#3d424d",
		heat: ["#272b33", "#006222", "#1f9e3c", "#26cd4d", "#7ee787"],
		scheme: "dark",
	},
	halloween: {
		name: "Halloween",
		bg: "#0b0a10",
		panel: "#16131d",
		border: "#3a2f45",
		text: "#f5ecdf",
		muted: "#9d8fae",
		accent: "#fe9600",
		grid: "#261f30",
		bar: "#fa7a18",
		barTop: "#ffa333",
		barLow: "#bd561d",
		peak: "#ffee4a",
		dim: "#631c03",
		button: "#261f30",
		buttonHover: "#3a2f45",
		heat: ["#261f30", "#631c03", "#bd561d", "#fa7a18", "#fddf68"],
		scheme: "dark",
	},
	dracula: {
		name: "Dracula",
		bg: "#1e1f29",
		panel: "#282a36",
		border: "#44475a",
		text: "#f8f8f2",
		muted: "#a4a9cc",
		accent: "#bd93f9",
		grid: "#363949",
		bar: "#bd93f9",
		barTop: "#caa6fb",
		barLow: "#8c62d8",
		peak: "#ff79c6",
		dim: "#5d4a8a",
		button: "#363949",
		buttonHover: "#44475a",
		heat: ["#363949", "#4b3b75", "#7a5cc7", "#bd93f9", "#ff79c6"],
		scheme: "dark",
	},
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;

export function parseTheme(params: URLSearchParams): ThemeId {
	const t = (params.get("theme") ?? "").toLowerCase();
	return t in THEMES ? (t as ThemeId) : "dark";
}
