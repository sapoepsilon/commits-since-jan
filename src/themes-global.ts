// Bundled to dist/themes.js so the page uses the same theme table as the Worker.
import { THEMES } from "./themes";

Object.assign(globalThis, { THEMES });
