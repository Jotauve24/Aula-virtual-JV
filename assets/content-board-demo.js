import { BOARD_PAGE_SIZE, boardDraft, mergeBoardPosts } from './content-board-model.js?v=0.34.0';

// Every demo post and selected file stays in this browser instance.
export function createContentBoardDemo({ crypto = globalThis.crypto, now = () => new Date().toISOString() } = {}) {
  let courseId = '', posts = [], groups = [], settings, actor;
  const blobs = new Map();
  function reset() {
    blobs.clear(); groups = [1, 2, 3].map(n => ({ id: crypto.randomUUID(), name: 'Equipo de ejemplo ' + n }));
    actor = { isTeacher: false, name: 'Tu perfil de prueba', topicId: groups[0].id, studentId: crypto.randomUUID() };
    settings = { instructions: 'Comparte una lectura, una idea creativa o un recurso que pueda inspirar a otros estudiantes. Cuida la autoría y participa con respeto.', postingOpen: true, revision: 1 };
    const sample = (kind, title, body, group, extra = {}) => ({ id: crypto.randomUUID(), kind, title, body, url: '', attachment: null,
      authorName: 'Compañero de ejemplo', authorIsTeacher: false, topicId: groups[group].id, topicName: groups[group].name,
      mine: false, pinned: false, state: 'visible', revision: 1, createdAt: now(), updatedAt: now(), ...extra });
    posts = [sample('note', 'Una idea para comenzar', 'Un espacio para compartir lo que aprendemos. Cada publicación puede incluir una nota, un archivo o un enlace.', 0, { pinned: true }),
      sample('infographic', 'Un equipo, muchas ideas', 'Infografía de ejemplo: planificar, investigar, crear y revisar juntos.', 0, { demoImage: 'teamwork' }),
      sample('presentation', 'Así presentamos nuestro proyecto', 'Puedes publicar tu presentación de PowerPoint o compartir el enlace de la herramienta con la que la creaste.', 1),
      sample('book', 'Lecturas para seguir explorando', 'Comparte un libro en PDF o el enlace de una lectura. Explica cómo puede ayudar a tus compañeros.', 2),
      sample('document', 'Nuestro documento de trabajo', 'Prueba a publicar un archivo desde el botón Publicar contenido. Nada de esta demostración se envía a los estudiantes.', 1)];
  }
  return {
    setContext(id) { if (id !== courseId) { courseId = id; reset(); } }, reset,
    async request(name, args) {
      if (!courseId || args.p_course_id !== courseId) throw new Error('Vuelve a abrir el tablero desde tu sala docente.');
      if (name === 'course_board') {
        const all = mergeBoardPosts([], posts).filter(p => (args.p_scope === 'hidden' ? p.state !== 'visible' && p.mine : args.p_scope === 'mine' ? p.mine : p.state === 'visible')
          && (!args.p_kind || args.p_kind === p.kind) && (!args.p_topic_id || args.p_topic_id === p.topicId)
          && (!args.p_search || (p.title + ' ' + p.body + ' ' + p.authorName).toLowerCase().includes(args.p_search.toLowerCase())));
        const offset = args.p_offset ?? 0, rows = all.slice(offset, offset + (args.p_limit ?? BOARD_PAGE_SIZE));
        return structuredClone({ actor, settings, groups, posts: rows, total: all.length, hasMore: offset + rows.length < all.length, nextOffset: offset + rows.length });
      }
      const previous = posts.find(p => p.id === args.p_post_id);
      const conflict = () => Object.assign(new Error('La publicación cambió. Actualiza el tablero.'), { code: 'PT409' });
      if (name === 'course_board_save_post') {
        if (previous && (!previous.mine || previous.revision !== args.p_expected_revision) || !previous && args.p_expected_revision !== 0) throw conflict();
        const data = boardDraft(args.p_data).data;
        if (data.attachment) {
          const item = blobs.get(data.attachment.path); if (!item) throw new Error('Este archivo de prueba ya no está disponible.');
          data.attachment = { path: data.attachment.path, name: data.attachment.name, size: item.blob.size, type: item.type };
        }
        const post = { id: args.p_post_id, ...data, mine: true, authorName: actor.name, authorIsTeacher: false, topicId: actor.topicId,
          topicName: groups[0].name, pinned: false, state: 'visible', createdAt: previous?.createdAt ?? now(), updatedAt: now(), revision: (previous?.revision ?? 0) + 1 };
        posts = posts.filter(p => p.id !== post.id); posts.push(post); return structuredClone(post);
      }
      if (name === 'course_board_set_post_state') {
        if (!previous?.mine || previous.revision !== args.p_expected_revision || !['remove', 'restore'].includes(args.p_action)) throw conflict();
        previous.state = args.p_action === 'remove' ? 'removed' : 'visible'; previous.revision++; previous.updatedAt = now(); return structuredClone(previous);
      }
      throw new Error('Esta operación no forma parte de la demostración.');
    },
    files: {
      async upload(id, file, info) {
        if (!courseId || id !== courseId) throw new Error('Vuelve a abrir el tablero.');
        const path = `${id}/board/00000000-0000-4000-8000-000000000011/${crypto.randomUUID()}.${info.extension}`;
        blobs.set(path, { blob: file, type: info.type }); return path;
      },
      async cancel(path) { if (!posts.some(p => p.attachment?.path === path)) blobs.delete(path); },
      async blob(attachment) { const item = blobs.get(attachment.path); if (!item) throw new Error('Este archivo de prueba ya no está disponible.'); return new Blob([item.blob], { type: item.type }); }
    }
  };
}
