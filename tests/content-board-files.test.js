import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../assets/supabase-client.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const student = '00000000-0000-4000-8000-000000000001', teacher = '00000000-0000-4000-8000-000000000002', course = '00000000-0000-4000-8000-000000000003';
const token = sub => 'qa.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.qa';
function app({ failUpload = false } = {}) {
  const values = new Map([['aula-student-session', JSON.stringify({ access_token: token(student), expires_at: 4102444800 })],
    ['aula-supabase-session', JSON.stringify({ access_token: token(teacher), expires_at: 4102444800 })]]);
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (failUpload && options.method === 'POST') return { ok: false, json: async () => ({ message: 'Subida interrumpida' }) };
    return { ok: true, blob: async () => new Blob(['contenido'], { type: 'text/plain' }), json: async () => ({}) };
  };
  const context = vm.createContext({ SUPABASE_URL: 'https://testproject.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    location: { hash: '', pathname: '/live.html', search: '', href: 'https://aula.example/live.html', origin: 'https://aula.example' },
    history: { replaceState() {} }, localStorage, sessionStorage: { removeItem() {} }, fetch, atob, Date, URL, URLSearchParams,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000004' }, AbortController, setTimeout, clearTimeout });
  const api = vm.runInContext(code + '\n({contentBoardFiles})', context);
  return { api, calls, values };
}
test('board upload chooses the matching student or teacher session and a separate chat namespace', async () => {
  const page = app();
  const info = { extension: 'txt', type: 'text/plain' }, file = new Blob(['contenido']);
  const s = await page.api.contentBoardFiles('student').upload(course, file, info);
  const t = await page.api.contentBoardFiles('teacher').upload(course, file, info);
  assert.ok(s.startsWith(`${course}/board/${student}/`)); assert.ok(t.startsWith(`${course}/board/${teacher}/`));
  assert.equal(page.calls[0].options.headers.Authorization, 'Bearer ' + token(student));
  assert.equal(page.calls[1].options.headers.Authorization, 'Bearer ' + token(teacher));
  assert.equal(page.calls[0].options.headers['x-upsert'], 'false'); assert.equal(page.calls[0].options.body, file);
  assert.ok(page.calls.every(c => c.url.includes('/team-attachments/') && !c.url.includes('/object/public/')));
});
test('board download is authenticated and never substitutes a public or signed URL', async () => {
  const page = app(); const path = `${course}/board/${teacher}/f.txt`;
  const blob = await page.api.contentBoardFiles('teacher').blob({ path });
  assert.equal(await blob.text(), 'contenido'); assert.ok(page.calls[0].url.includes('/object/authenticated/team-attachments/'));
  assert.equal(page.calls[0].options.headers.Authorization, 'Bearer ' + token(teacher));
});
test('an interrupted upload tries to remove only that pending object without losing either session', async () => {
  const page = app({ failUpload: true });
  await assert.rejects(page.api.contentBoardFiles('student').upload(course, new Blob(['x']), { extension: 'txt', type: 'text/plain' }), /Subida interrumpida/);
  assert.equal(page.calls.length, 2); assert.equal(page.calls[1].options.method, 'DELETE');
  const prefixes = JSON.parse(page.calls[1].options.body).prefixes; assert.equal(prefixes.length, 1); assert.ok(prefixes[0].startsWith(`${course}/board/${student}/`));
  assert.equal(page.values.size, 2);
});
