# Commits since Jan 1

How many commits have you made since January 1? Type any GitHub username and get
the count, a weekly activity chart and a shareable card.

**Live:** https://commits-since-jan.pages.dev

- Ranges: since Jan 1 (default), last 30 / 90 days, last 12 months, or a custom
  start date (GitHub allows at most one year). Deep links: `/u/<login>?range=30d`,
  `/u/<login>?from=2026-03-01`, plus `&theme=light|dimmed|hc|halloween|dracula`.
- Sharing: X, LinkedIn, Bluesky, Reddit, Facebook, native share, copy, and
  Instagram Story/Post images. Share text comes from editable presets.
- Link previews: `/u/<login>` serves per-user Open Graph tags and a per-user PNG at
  `/og/<login>.png`.

## Data

With a `GITHUB_TOKEN`, the Worker asks the GitHub GraphQL API for
`contributionsCollection` and shows `totalCommitContributions` (commits in
repositories the public can see) plus the private-contribution count GitHub
reports. Without a token, or when the API is rate-limited, it parses the public
contribution calendar (`github.com/users/<login>/contributions`) and shows total
contributions instead. The weekly bars always count all contribution types,
because that is what the calendar provides.

## How it stays on the Cloudflare free plan

- Cloudflare Pages serves the HTML, JS, CSS and images as static files. Only
  `/u/*`, `/api/*` and `/og/*` run the Worker (see `public/_routes.json`).
- Every (user, range) result and every (user, range, theme) share image is
  cached with the Cache API for 6 hours, so each one is fetched or drawn about
  once per Cloudflare location. Unknown users are cached for an hour.
- Usernames are validated before any GitHub request.
- A deep-linked `/u/<login>` page embeds its data, so it costs one Worker request.
- Share images are drawn by a small 4-bit indexed PNG encoder
  (`src/png.ts`) with pre-rasterised glyphs and the runtime's native
  `CompressionStream`. No satori, resvg or wasm. A render takes about 5 ms of CPU.

## Develop and deploy

```sh
npm install
npm run build                 # public/ + bundled _worker.js and themes.js into dist/
npx wrangler pages dev        # local server on :8788

# one-time: create the Pages project, then deploy
npx wrangler pages project create commits-since-jan --production-branch main
npm run deploy

# optional: commit counts via the GraphQL API (a fine-grained PAT with no scopes is enough)
npx wrangler pages secret put GITHUB_TOKEN --project-name commits-since-jan
```

`scripts/gen-font.py` regenerates `src/font.ts` from an Inter TTF, and
`scripts/bench-og.ts` measures the PNG renderer's CPU time in Node.

## License

MIT. See [LICENSE](LICENSE).
