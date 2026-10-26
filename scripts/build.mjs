// copies only the files the website needs into _site/ (no tests, docs or scripts).
// used by Cloudflare Pages: build command `npm run build`, output directory `_site`.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SITE = ['index.html', 'manifest.webmanifest', 'sw.js', '_headers', 'css', 'js', 'fonts', 'icons', 'vendor'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of SITE) cpSync(join(ROOT, f), join(OUT, f), { recursive: true });
console.log(`built _site/ (${SITE.length} entries)`);
