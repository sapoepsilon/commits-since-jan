// Commits since January 1 — a tiny Pages advanced-mode Worker that stays inside
// the free plan: static files are served by Pages without invoking this code
// (see public/_routes.json), every user result and share image is cached at the
// edge with the Cache API, and share images are drawn with a small indexed PNG
// encoder instead of satori/resvg/wasm.

import { renderCard } from "./png";
import { parseRange, type Range } from "./range";

const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const RESULT_TTL = 6 * 60 * 60; // seconds
const NOT_FOUND_TTL = 60 * 60;
const CACHE_VERSION = "v3";
const UA = "commits-since-jan";

type Source = "graphql" | "html";

interface UserResult {
	login: string;
	name: string | null;
	avatarUrl: string;
	range: Range["id"];
	from: string;
	to: string;
	rangeLabel: string;
	short: string;
	query: string;
	source: Source;
	commits: number | null; // graphql: commits in public/visible repos
	restricted: number | null; // graphql: private contributions GitHub reports only as a count
	total: number; // all contribution types in the range
	days: [number, number][]; // one per day from `from` to `to`: [count, level 0-4]
	fetchedAt: string;
}

class NotFoundError extends Error {}
class UpstreamError extends Error {}

// Per-isolate memo of immutable JSON strings so hot users skip even the Cache
// API lookup. Bounded so it never grows without limit.
const memo = new Map<string, { exp: number; body: string; status: number }>();
const MEMO_MAX = 300;

function memoGet(key: string) {
	const hit = memo.get(key);
	if (!hit) return undefined;
	if (hit.exp < Date.now()) {
		memo.delete(key);
		return undefined;
	}
	return hit;
}

function memoSet(key: string, body: string, status: number, ttlSec: number) {
	if (memo.size >= MEMO_MAX) {
		const oldest = memo.keys().next().value;
		if (oldest !== undefined) memo.delete(oldest);
	}
	memo.set(key, { exp: Date.now() + ttlSec * 1000, body, status });
}

const LEVELS: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
};

const GQL = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    login name avatarUrl
    contributionsCollection(from:$from,to:$to){
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount contributionLevel } }
      }
    }
  }
}`;

interface GqlResponse {
	data?: {
		user: null | {
			login: string;
			name: string | null;
			avatarUrl: string;
			contributionsCollection: {
				totalCommitContributions: number;
				restrictedContributionsCount: number;
				contributionCalendar: {
					totalContributions: number;
					weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
				};
			};
		};
	};
	errors?: { type?: string; message?: string }[];
}

function base(r: Range) {
	return { range: r.id, from: r.from, to: r.to, rangeLabel: r.label, short: r.short, query: r.query };
}

async function viaGraphQL(login: string, r: Range, token: string): Promise<UserResult> {
	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": UA },
		body: JSON.stringify({ query: GQL, variables: { login, from: `${r.from}T00:00:00Z`, to: new Date().toISOString() } }),
	});
	if (!res.ok) throw new UpstreamError(`graphql http ${res.status}`);
	const json = (await res.json()) as GqlResponse;
	if (json.errors?.some((e) => e.type === "NOT_FOUND") || (json.data && json.data.user === null)) {
		throw new NotFoundError(login);
	}
	if (json.errors?.length || !json.data?.user) {
		throw new UpstreamError(`graphql error ${json.errors?.[0]?.type ?? "unknown"}`);
	}
	const u = json.data.user;
	const cc = u.contributionsCollection;
	const byDate = new Map<string, [number, number]>();
	for (const w of cc.contributionCalendar.weeks) {
		for (const d of w.contributionDays) byDate.set(d.date, [d.contributionCount, LEVELS[d.contributionLevel] ?? 0]);
	}
	return {
		login: u.login,
		name: u.name,
		avatarUrl: u.avatarUrl,
		...base(r),
		source: "graphql",
		commits: cc.totalCommitContributions,
		restricted: cc.restrictedContributionsCount,
		total: cc.contributionCalendar.totalContributions,
		days: daysBetween(r, byDate).days,
		fetchedAt: new Date().toISOString(),
	};
}

function daysBetween(r: Range, byDate: Map<string, [number, number]>) {
	const days: [number, number][] = [];
	let total = 0;
	for (let t = Date.parse(`${r.from}T00:00:00Z`); ; t += 86400000) {
		const d = new Date(t).toISOString().slice(0, 10);
		if (d > r.to) break;
		const v = byDate.get(d) ?? [0, 0];
		total += v[0];
		days.push(v);
	}
	return { days, total };
}

// Public calendar, no token needed. Without query params GitHub returns the
// rolling last ~53 weeks, which covers every allowed range, so all ranges for a
// login share one upstream URL (and Cloudflare's subrequest cache).
async function viaPublicHtml(login: string, r: Range): Promise<UserResult> {
	const res = await fetch(`https://github.com/users/${login}/contributions`, {
		headers: { "user-agent": UA, accept: "text/html" },
		cf: { cacheTtl: RESULT_TTL, cacheEverything: true },
	});
	if (res.status === 404) throw new NotFoundError(login);
	if (!res.ok) throw new UpstreamError(`contributions html ${res.status}`);
	const html = await res.text();

	const cells = new Map<string, { date: string; level: number }>();
	const cellRe = /<td\b[^>]*?data-date="(\d{4}-\d{2}-\d{2})"[^>]*?id="([^"]+)"[^>]*?data-level="(\d)"/g;
	for (let m; (m = cellRe.exec(html)); ) cells.set(m[2], { date: m[1], level: Number(m[3]) });
	const counts = new Map<string, number>();
	const tipRe = /<tool-tip\b[^>]*?for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
	for (let m; (m = tipRe.exec(html)); ) {
		const n = /^([\d,]+) contribution/.exec(m[2]);
		counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
	}
	if (cells.size === 0) throw new UpstreamError("contributions html: no calendar");
	const byDate = new Map<string, [number, number]>();
	for (const [id, c] of cells) byDate.set(c.date, [counts.get(id) ?? 0, c.level]);
	const { days, total } = daysBetween(r, byDate);

	// Resolve the avatar redirect so the browser gets a CORS-enabled URL.
	let avatarUrl = `https://avatars.githubusercontent.com/${login}`;
	try {
		const a = await fetch(`https://github.com/${login}.png?size=200`, {
			redirect: "manual",
			headers: { "user-agent": UA },
			cf: { cacheTtl: RESULT_TTL },
		});
		const loc = a.headers.get("location");
		if (loc?.startsWith("https://avatars.githubusercontent.com/")) avatarUrl = loc;
		await a.body?.cancel();
	} catch {
		// keep the default avatar URL
	}

	return {
		login,
		name: null,
		avatarUrl,
		...base(r),
		source: "html",
		commits: null,
		restricted: null,
		total,
		days,
		fetchedAt: new Date().toISOString(),
	};
}

async function lookup(login: string, r: Range, env: Env): Promise<UserResult> {
	if (env.GITHUB_TOKEN) {
		try {
			return await viaGraphQL(login, r, env.GITHUB_TOKEN);
		} catch (e) {
			if (e instanceof NotFoundError) throw e;
			console.log(JSON.stringify({ msg: "graphql failed, using html fallback", login, err: String(e) }));
		}
	}
	return viaPublicHtml(login, r);
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
type CacheState = "MEMO" | "HIT" | "MISS";

const cacheUrl = (origin: string, kind: string, login: string, r: Range) =>
	`${origin}/__cache/${CACHE_VERSION}/${kind}/${login.toLowerCase()}/${r.from}/${r.to}`;

// JSON body + status for (login, range): memo -> Cache API -> GitHub.
async function getResult(
	login: string,
	r: Range,
	env: Env,
	ctx: ExecutionContext,
	origin: string,
): Promise<{ body: string; status: number; cache: CacheState }> {
	const key = cacheUrl(origin, "data", login, r);
	const m = memoGet(key);
	if (m) return { body: m.body, status: m.status, cache: "MEMO" };

	const cache = caches.default;
	const hit = await cache.match(key);
	if (hit) {
		const body = await hit.text();
		memoSet(key, body, hit.status, 300);
		return { body, status: hit.status, cache: "HIT" };
	}

	let body: string;
	let status: number;
	let ttl: number;
	try {
		body = JSON.stringify(await lookup(login, r, env));
		status = 200;
		ttl = RESULT_TTL;
	} catch (e) {
		if (e instanceof NotFoundError) {
			body = JSON.stringify({ error: "not_found", message: `No GitHub user named “${login}”.` });
			status = 404;
			ttl = NOT_FOUND_TTL;
		} else {
			console.log(JSON.stringify({ msg: "lookup failed", login, err: String(e) }));
			// Short negative cache so a GitHub outage doesn't stampede upstream.
			body = JSON.stringify({ error: "upstream", message: "GitHub didn't answer just now. Try again in a minute." });
			status = 502;
			ttl = 60;
		}
	}
	ctx.waitUntil(
		cache.put(key, new Response(body, { status, headers: { ...JSON_HEADERS, "cache-control": `public, max-age=${ttl}` } })),
	);
	memoSet(key, body, status, Math.min(ttl, 300));
	return { body, status, cache: "MISS" };
}

const fmt = (n: number) => n.toLocaleString("en-US");

function headline(d: UserResult) {
	if (d.source === "graphql" && d.commits !== null) {
		return {
			num: d.commits,
			word: "public commits",
			sub: d.restricted
				? `+ ${fmt(d.restricted)} private contributions · ${fmt(d.total)} total contributions`
				: `${fmt(d.total)} total contributions`,
		};
	}
	return { num: d.total, word: "contributions", sub: "Commits, pull requests, issues and reviews combined" };
}

function describe(d: UserResult) {
	const who = d.name ? `${d.name} (@${d.login})` : `@${d.login}`;
	const h = headline(d);
	return {
		title: `${who}: ${fmt(h.num)} ${h.word} ${d.rangeLabel}`,
		desc: `${who} has made ${fmt(h.num)} ${h.word} on GitHub ${d.rangeLabel}. How many have you made?`,
	};
}

async function userPage(url: URL, login: string, r: Range, env: Env, ctx: ExecutionContext): Promise<Response> {
	const { body, status, cache } = await getResult(login, r, env, ctx, url.origin);

	let title = `@${login} · Commits since Jan 1`;
	let desc = "How many commits have you made on GitHub since January 1? Look up any username.";
	let canonLogin = login;
	if (status === 200) {
		const d = JSON.parse(body) as UserResult;
		({ title, desc } = describe(d));
		canonLogin = d.login;
	}

	const shell = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
	const pageUrl = `${url.origin}/u/${encodeURIComponent(canonLogin)}${r.query}`;
	const image =
		status === 200 ? `${url.origin}/og/${encodeURIComponent(canonLogin)}.png${r.query}` : `${url.origin}/og.png`;
	// Embed the result so a deep-linked visit costs one Worker request, not two.
	const boot = `<script id="boot" type="application/json">${body.replace(/</g, "\\u003c")}</script>`;

	const attr = (name: string, value: string) => ({
		element(el: Element) {
			el.setAttribute(name, value);
		},
	});
	const rewritten = new HTMLRewriter()
		.on("title", {
			element(el) {
				el.setInnerContent(title);
			},
		})
		.on('meta[name="description"]', attr("content", desc))
		.on('meta[property="og:title"]', attr("content", title))
		.on('meta[property="og:description"]', attr("content", desc))
		.on('meta[property="og:url"]', attr("content", pageUrl))
		.on('meta[property="og:image"]', attr("content", image))
		.on('meta[property="og:image:alt"]', attr("content", title))
		.on('meta[name="twitter:title"]', attr("content", title))
		.on('meta[name="twitter:description"]', attr("content", desc))
		.on('meta[name="twitter:image"]', attr("content", image))
		.on('link[rel="canonical"]', attr("href", pageUrl))
		.on("head", {
			element(el) {
				el.append(boot, { html: true });
			},
		})
		.transform(shell);

	const headers = new Headers(rewritten.headers);
	headers.set("content-type", "text/html; charset=utf-8");
	headers.set("cache-control", status === 200 ? "public, max-age=300" : "public, max-age=60");
	headers.set("x-cache", cache);
	headers.delete("etag");
	return new Response(rewritten.body, { status, headers });
}

async function ogImage(url: URL, login: string, r: Range, env: Env, ctx: ExecutionContext): Promise<Response> {
	const key = cacheUrl(url.origin, "og", login, r);
	const cache = caches.default;
	const hit = await cache.match(key);
	if (hit) {
		const res = new Response(hit.body, hit);
		res.headers.set("x-cache", "HIT");
		return res;
	}

	const { body, status } = await getResult(login, r, env, ctx, url.origin);
	if (status !== 200) {
		const fallback = await env.ASSETS.fetch(new Request(`${url.origin}/og.png`));
		const res = new Response(fallback.body, fallback);
		res.headers.set("cache-control", "public, max-age=300");
		res.headers.set("x-cache", "FALLBACK");
		return res;
	}

	const d = JSON.parse(body) as UserResult;
	const h = headline(d);
	const png = await renderCard({
		login: d.login,
		name: d.name,
		num: h.num,
		label: h.word,
		rangeLabel: d.rangeLabel,
		short: d.short,
		sub: h.sub,
		from: d.from,
		days: d.days,
		host: url.host,
	});
	const headers = {
		"content-type": "image/png",
		"cache-control": `public, max-age=${RESULT_TTL}`,
		"x-content-type-options": "nosniff",
	};
	ctx.waitUntil(cache.put(key, new Response(png, { headers })));
	return new Response(png, { headers: { ...headers, "x-cache": "MISS" } });
}

function cleanLogin(raw: string) {
	try {
		return decodeURIComponent(raw).trim().replace(/^@/, "");
	} catch {
		return "";
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
		}

		const api = /^\/api\/u\/([^/]+)\/?$/.exec(url.pathname);
		const page = /^\/u\/([^/]+)\/?$/.exec(url.pathname);
		const og = /^\/og\/([^/]+)\.png$/.exec(url.pathname);
		const raw = api?.[1] ?? page?.[1] ?? og?.[1];
		if (raw === undefined) return env.ASSETS.fetch(request);

		const login = cleanLogin(raw);
		const r = parseRange(url.searchParams);
		if (!LOGIN_RE.test(login)) {
			if (page) return Response.redirect(`${url.origin}/?invalid=1`, 302);
			if (og) return env.ASSETS.fetch(new Request(`${url.origin}/og.png`));
			return new Response(JSON.stringify({ error: "invalid", message: "That isn't a valid GitHub username." }), {
				status: 400,
				headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" },
			});
		}
		if (page) return userPage(url, login, r, env, ctx);
		if (og) return ogImage(url, login, r, env, ctx);

		const { body, status, cache } = await getResult(login, r, env, ctx, url.origin);
		return new Response(body, {
			status,
			headers: {
				...JSON_HEADERS,
				"cache-control": status === 200 ? "public, max-age=300" : "public, max-age=60",
				"x-cache": cache,
			},
		});
	},
} satisfies ExportedHandler<Env>;
