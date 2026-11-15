// TIDELOCK — the make.fun entry program (Node 22, standard library only).
//
// The repository is the game: game/ holds the playable static site (ES
// modules, three.js vendored beside them, no build step) and screenshots/
// holds four renders of it. This program hands the entry in: it copies
// game/ and screenshots/ next to the output directory and writes
// dossier.json with the vendored make.fun library, exactly as the
// competition's scorer recomputes it.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (its gate.json): only text_max_bytes shapes
// the dossier bytes; the rest make this program refuse an entry the scorer
// would refuse anyway (too many screenshots, an oversized game tree, ...).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
