import { attachmentInfo, FILE_TYPES, MAX_ATTACHMENT_BYTES } from './attachments.js?v=0.34.2';

export const BOARD_KINDS = Object.freeze({ note: 'Nota', infographic: 'Infografía', document: 'Documento', presentation: 'Presentación', book: 'Libro', video: 'Video', link: 'Enlace', digital_tool: 'Herramientas digitales' });
export const BOARD_CATEGORIES = Object.freeze({ note: 'Notas', infographic: 'Infografías', document: 'Documentos', presentation: 'Presentaciones', book: 'Libros', video: 'Videos', link: 'Enlaces', digital_tool: 'Herramientas digitales' });
export const BOARD_PAGE_SIZE = 24;
export const BOARD_FILE_HINT = 'Imágenes, PDF, Word, Excel, PowerPoint y ZIP · Hasta 10 MB. Para videos, comparte su enlace.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function boardURL(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('Escribe un enlace completo que comience con https://.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || text.length > 2000 || /[\s\u0000-\u001f<>]/.test(text))
    throw new Error('Usa un enlace https válido, sin contraseñas ni espacios.');
  return url.href;
}
export function boardDraft(values, { file = null } = {}) {
  const title = String(values.title ?? '').trim(), body = String(values.body ?? '').trim(), kind = values.kind;
  if (!title || title.length > 120) throw new Error('Escribe un título de hasta 120 caracteres.');
  if (body.length > 3000) throw new Error('El texto puede tener hasta 3000 caracteres.');
  if (!Object.hasOwn(BOARD_KINDS, kind)) throw new Error('Elige el tipo de contenido.');
  const url = boardURL(values.url), info = file ? attachmentInfo(file) : null;
  if (['video', 'link'].includes(kind) && !url) throw new Error('Agrega el enlace https del contenido.');
  if (!body && !url && !file && !values.attachment) throw new Error('Escribe una nota, adjunta un archivo o agrega un enlace.');
  return { data: { title, body, kind, url, attachment: values.attachment ?? null }, info };
}
export function boardAttachment(value, courseId) {
  if (value === null || value === undefined) return null;
  if (!uuid.test(courseId)) throw new Error('La materia del archivo no es válida.');
  const expected = new RegExp(`^${courseId}/board/[0-9a-f-]{36}/[0-9a-f-]{36}\\.([a-z0-9]+)$`);
  const match = typeof value.path === 'string' && value.path.match(expected);
  if (!match || !Object.hasOwn(FILE_TYPES, match[1]) || FILE_TYPES[match[1]] !== value.type || !Number.isSafeInteger(value.size)
    || value.size < 1 || value.size > MAX_ATTACHMENT_BYTES || typeof value.name !== 'string' || !value.name || value.name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(value.name)
    || FILE_TYPES[value.name.split('.').at(-1).toLowerCase()] !== value.type)
    throw new Error('El archivo recibido no es válido. Actualiza el tablero.');
  return { path: value.path, name: value.name, size: value.size, type: value.type };
}
export function normalizeBoardPost(value, courseId) {
  if (!value || !uuid.test(value.id) || !Object.hasOwn(BOARD_KINDS, value.kind) || typeof value.title !== 'string' || !value.title || value.title.length > 120
    || typeof value.body !== 'string' || value.body.length > 3000 || !['visible', 'hidden', 'removed'].includes(value.state)
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.authorName !== 'string')
    throw new Error('No se pudo interpretar una publicación. Actualiza el tablero.');
  return { ...value, url: boardURL(value.url), attachment: boardAttachment(value.attachment, courseId),
    mine: value.mine === true, pinned: value.pinned === true, authorIsTeacher: value.authorIsTeacher === true,
    topicId: uuid.test(value.topicId) ? value.topicId : null, topicName: String(value.topicName ?? '') };
}
export function normalizeBoardPage(value, courseId, { shared = false } = {}) {
  if (!value?.actor || typeof value.actor.isTeacher !== 'boolean' || !value.settings || typeof value.settings.postingOpen !== 'boolean'
    || typeof value.settings.instructions !== 'string' || !Number.isSafeInteger(value.settings.revision) || value.settings.revision < 0
    || !Array.isArray(value.posts) || !Array.isArray(value.groups) || !Number.isSafeInteger(value.total) || value.total < 0
    || !Number.isSafeInteger(value.nextOffset) || value.nextOffset < 0 || typeof value.hasMore !== 'boolean')
    throw new Error('No se pudo cargar el tablero. Vuelve a intentarlo.');
  const posts = value.posts.map(row => {
    if (shared && (!uuid.test(row.courseId) || typeof row.courseName !== 'string' || !row.courseName.trim()
      || row.courseName.length > 200 || row.state !== 'visible')) throw new Error('La publicación de la biblioteca no es válida.');
    return normalizeBoardPost(row, shared ? row.courseId : courseId);
  });
  if (posts.length > BOARD_PAGE_SIZE || new Set(posts.map(p => p.id)).size !== posts.length || value.total < posts.length)
    throw new Error('El listado recibido no es válido. Actualiza el tablero.');
  return { ...value, posts, groups: value.groups.filter(row => uuid.test(row?.id) && typeof row.name === 'string') };
}
export function mergeBoardPosts(current, incoming) {
  const values = new Map(current.map(row => [row.id, row]));
  for (const row of incoming) if (!values.has(row.id) || values.get(row.id).revision <= row.revision) values.set(row.id, row);
  return [...values.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}
export function boardLinkLabel(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
export function boardPostRights(post, actor) {
  return { edit: post.mine && post.state === 'visible', remove: post.mine && (post.state !== 'hidden' || actor.isTeacher),
    restore: post.state !== 'visible' && (actor.isTeacher || post.mine && post.state === 'removed'), moderate: actor.isTeacher };
}
