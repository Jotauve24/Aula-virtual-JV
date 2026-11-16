import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { boardURL, boardDraft, boardAttachment, normalizeBoardPage, normalizeBoardPost, mergeBoardPosts, boardPostRights } from '../assets/content-board-model.js';
import { createContentBoardSession } from '../assets/content-board-session.js';
import { createContentBoardDemo } from '../assets/content-board-demo.js';
const c = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const path = `${c}/board/${id}/${id}.pdf`;
const attachment = { path, name: 'Trabajo.pdf', type: 'application/pdf', size: 100 };
const post = (changes = {}) => ({ id, title: 'Una idea', body: 'Texto de ejemplo', kind: 'note', url: '', attachment: null,
  authorName: 'Ana Prueba', authorIsTeacher: false, topicId: null, topicName: '', mine: true,
  pinned: false, state: 'visible', revision: 1, createdAt: '2026-11-16T12:00:00Z', ...changes });
const page = (posts = [], changes = {}) => ({ actor: { isTeacher: false, name: 'Ana Prueba' }, settings: { instructions: '', postingOpen: true, revision: 0 },
  posts, groups: [], total: posts.length, nextOffset: posts.length, hasMore: false, ...changes });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('board links accept HTTPS resources and reject executable schemes, credentials and controls', () => {
  assert.equal(boardURL(' https://example.invalid/recurso '), 'https://example.invalid/recurso');
  assert.equal(boardURL(''), '');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///a', 'http://example.invalid', '//example.invalid',
    'https://u:secret@example.invalid/', 'https://example.invalid/a b', 'https://example.invalid/<script>', 'https://example.invalid/\npath']) assert.throws(() => boardURL(value));
});
test('publication validation supports text, documents and video links without losing zeros in text', () => {
  assert.deepEqual(boardDraft({ title: ' Título ', body: ' 0 ', kind: 'note' }).data, { title: 'Título', body: '0', kind: 'note', url: '', attachment: null });
  assert.equal(boardDraft({ title: 'Archivo', body: '', kind: 'document' }, { file: { name: 'Datos.csv', size: 50 } }).info.type, 'text/csv');
  assert.equal(boardDraft({ title: 'Video', kind: 'video', url: 'https://example.invalid/video' }).data.url, 'https://example.invalid/video');
  for (const values of [{ title: '', kind: 'note', body: 'A' }, { title: 'A', body: '', kind: 'note' },
    { title: 'A', kind: 'video' }, { title: 'A', kind: 'constructor', body: 'A' }, { title: 'A', kind: 'note', body: 'x'.repeat(3001) }]) assert.throws(() => boardDraft(values));
  assert.throws(() => boardDraft({ title: 'A', kind: 'document' }, { file: { name: 'unsafe.html', size: 20 } }));
});
test('board attachments cannot point to another course, private chat or an executable download name', () => {
  assert.deepEqual(boardAttachment(attachment, c), attachment);
  for (const changes of [{ path: path.replace(c, other) }, { path: path.replace('/board/', `/${id}/`) },
    { type: 'text/html' }, { name: 'archivo.exe' }, { name: '../Trabajo.pdf' }, { size: 10485761 }, { size: 0 }])
    assert.throws(() => boardAttachment({ ...attachment, ...changes }, c));
});
test('list responses distinguish an empty board from bad data and preserve safely rendered user text', () => {
  const empty = normalizeBoardPage(page(), c); assert.equal(empty.total, 0); assert.deepEqual(empty.posts, []);
  const safe = normalizeBoardPost(post({ title: '<img src=x onerror=alert(1)>', body: '<script>test</script>' }), c);
  assert.equal(safe.title, '<img src=x onerror=alert(1)>');
  for (const changes of [{ total: null }, { total: -1 }, { posts: [post(), post()] }, { posts: [post({ attachment: { ...attachment, path: path.replace(c, other) } })] }])
    assert.throws(() => normalizeBoardPage(page([], changes), c));
});
test('page merging preserves newer revisions, orders teacher highlights first and deduplicates offset overlap', () => {
  const old = post(), newer = post({ revision: 2, title: 'Editada' });
  const pinned = post({ id: other, createdAt: '2020-01-01T00:00:00Z', pinned: true, mine: false });
  const result = mergeBoardPosts([newer], [old, pinned]); assert.equal(result.length, 2); assert.equal(result[0].id, other); assert.equal(result[1].title, 'Editada');
});
test('student controls cannot reverse a teacher hide, while withdrawn work stays restorable', () => {
  const student = { isTeacher: false }, teacher = { isTeacher: true };
  assert.equal(boardPostRights(post({ mine: false }), student).edit, false);
  assert.equal(boardPostRights(post({ state: 'hidden' }), student).restore, false);
  assert.equal(boardPostRights(post({ state: 'hidden' }), student).remove, false);
  assert.equal(boardPostRights(post({ state: 'removed' }), student).restore, true);
  assert.equal(boardPostRights(post({ state: 'hidden', mine: false }), teacher).restore, true);
});
test('a late course response and a late signout response never restore old board content', async () => {
  let finish, signed = true;
  const session = createContentBoardSession({ signedIn: () => signed, rpc: () => new Promise(resolve => { finish = resolve; }) });
  session.setContext(c); const loading = session.load(); session.setContext(other); finish(page([post()])); await loading;
  assert.equal(session.snapshot().courseId, other); assert.equal(session.snapshot().posts.length, 0);
  const next = session.load(); signed = false; finish(page([post()])); await next; assert.equal(session.snapshot().posts.length, 0);
});
test('a slower previous filter cannot replace a newer search', async () => {
  const pending = [];
  const session = createContentBoardSession({ signedIn: () => true, rpc: (_, args) => new Promise(resolve => pending.push({ args, resolve })) });
  session.setContext(c); session.filter({ kind: 'document' }); session.filter({ search: 'nueva' });
  assert.equal(pending[1].args.p_search, 'nueva');
  pending[1].resolve(page([post({ kind: 'document', title: 'Nueva' })])); await tick();
  pending[0].resolve(page([post({ title: 'Anterior' })])); await tick(); assert.equal(session.snapshot().posts[0].title, 'Nueva');
});
test('publishing is explicit and concurrent clicks cannot send duplicate saves', async () => {
  let finish; const calls = [];
  const session = createContentBoardSession({ signedIn: () => true, rpc: async (name, args) => {
    calls.push({ name, args }); return name === 'course_board' ? page() : new Promise(resolve => { finish = resolve; });
  } });
  session.setContext(c); await session.load(); assert.equal(calls.length, 1);
  const saving = session.save(id, 0, { title: 'Nueva', body: 'Contenido', kind: 'note', url: '' });
  assert.equal(await session.save(id, 0, {}), null); assert.equal(calls.filter(x => x.name === 'course_board_save_post').length, 1);
  assert.equal(calls[1].args.p_course_id, c); finish(post()); await saving; await tick(); assert.equal(session.snapshot().saving, false);
});
test('a failed save retains the list and a successful retry refreshes it', async () => {
  let fail = true;
  const session = createContentBoardSession({ signedIn: () => true, rpc: async name => {
    if (name === 'course_board') return page([post()]);
    if (fail) throw Object.assign(Error('Cambió en otro dispositivo'), { code: 'PT409' }); return post({ revision: 2 });
  } });
  session.setContext(c); await session.load();
  await assert.rejects(session.save(id, 1, {}), /otro dispositivo/); assert.equal(session.snapshot().posts.length, 1); assert.equal(session.snapshot().saving, false);
  fail = false; await session.save(id, 1, {}); assert.equal(session.snapshot().error, '');
});
test('access revocation clears the old list instead of presenting it as an empty successful board', async () => {
  let fail = false;
  const session = createContentBoardSession({ signedIn: () => true, rpc: async () => { if (fail) throw Object.assign(Error('Acceso denegado'), { code: '42501' }); return page([post()]); } });
  session.setContext(c); await session.load(); fail = true; await session.load();
  assert.equal(session.snapshot().posts.length, 0); assert.equal(session.snapshot().phase, 'error'); assert.match(session.snapshot().error, /Acceso denegado/);
});
test('teacher settings save the opened revision and do not manufacture student or contact data', async () => {
  const calls = [];
  const session = createContentBoardSession({ signedIn: () => true, rpc: async (name, args) => {
    calls.push({ name, args }); return name === 'course_board' ? page([], { actor: { isTeacher: true } }) : { instructions: 'Actividad', postingOpen: false, revision: 1 };
  } });
  session.setContext(c); await session.load(); await session.saveSettings('Actividad', false, 0);
  assert.deepEqual(calls.find(x => x.name === 'teacher_save_board_settings').args, { p_course_id: c, p_instructions: 'Actividad', p_posting_open: false, p_expected_revision: 0 });
});
test('zombie board examples, uploads and edits stay local and reset removes the local draft', async () => {
  const demo = createContentBoardDemo({ crypto: { randomUUID } }); demo.setContext(c);
  const args = { p_course_id: c, p_kind: '', p_scope: 'all', p_search: '', p_offset: 0, p_limit: 24 };
  const initial = normalizeBoardPage(await demo.request('course_board', args), c); assert.equal(initial.total, 5); assert.ok(initial.posts.some(p => p.demoImage === 'teamwork'));
  const file = new Blob(['documento'], { type: 'application/pdf' });
  const path = await demo.files.upload(c, file, { name: 'Ejemplo.pdf', extension: 'pdf', type: 'application/pdf' });
  const created = await demo.request('course_board_save_post', { p_course_id: c, p_post_id: id, p_expected_revision: 0,
    p_data: { title: 'Mi documento', body: '', kind: 'document', url: '', attachment: { path, name: 'Ejemplo.pdf' } } });
  assert.equal(created.mine, true); assert.equal((await demo.files.blob(created.attachment)).size, file.size);
  assert.equal((await demo.request('course_board', { ...args, p_scope: 'mine' })).total, 1);
  demo.reset(); assert.equal((await demo.request('course_board', { ...args, p_scope: 'mine' })).total, 0);
  await assert.rejects(demo.files.blob(created.attachment), /ya no está disponible/);
});
