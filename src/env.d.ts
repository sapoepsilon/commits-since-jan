// Bindings available to the Pages advanced-mode Worker (_worker.js).
// GITHUB_TOKEN is an optional Pages secret:
//   npx wrangler pages secret put GITHUB_TOKEN --project-name <project>
// Without it the Worker falls back to GitHub's public HTML calendar.
interface Env {
	ASSETS: Fetcher;
	GITHUB_TOKEN?: string;
}
