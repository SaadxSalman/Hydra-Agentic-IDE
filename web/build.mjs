/**
 * Zero-dependency build for the Hydra-IDE web studio.
 * Copies web/src -> web/dist (ES modules are served as-is; nothing to bundle).
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const out = join(here, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });

writeFileSync(
  join(out, 'build.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), version: '1.0.0' }, null, 2) + '\n',
);

console.log(`[hydra-web] built studio -> ${out}`);
