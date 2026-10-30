import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = ['assets', 'scripts'].flatMap(directory =>
  readdirSync(new URL('../' + directory + '/', import.meta.url), { recursive: true })
    .filter(name => /\.(?:js|mjs)$/.test(name))
    .map(name => directory + '/' + name));
modules.push('chat-worker.js');

for (const file of modules) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error));
    process.exit(1);
  }
}
console.log('Sintaxis correcta en los ' + modules.length + ' módulos del proyecto.');
