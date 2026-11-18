import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const file of ['index.html', 'live.html', 'docente.html', 'docente-sala.html','biblioteca.html']) test(`${file} keeps unique element identities for accessible navigation`, () => {
  const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs break tab panels, labels and dialog focus.');
  for (const match of html.matchAll(/aria-controls="(panel-[^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing tab panel ${match[1]}`);
});
