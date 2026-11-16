import { BOARD_PAGE_SIZE, mergeBoardPosts, normalizeBoardPage, normalizeBoardPost } from './content-board-model.js?v=0.31.0';

const defaultFilters = () => ({ kind: '', scope: 'all', topicId: '', search: '' });
export function createContentBoardSession({ rpc, signedIn, onChange = () => {} }) {
  let epoch = 0, request = 0, state = fresh();
  function fresh(courseId = '') { return { courseId, phase: 'idle', actor: null, settings: null, posts: [], groups: [],
    total: 0, offset: 0, hasMore: false, filters: defaultFilters(), loading: false, saving: false, error: '', notice: '' }; }
  const emit = kind => onChange(kind, state);
  const current = (token, id) => token === epoch && id === state.courseId && signedIn();
  function reset(courseId = '') { epoch++; request++; state = fresh(courseId); emit('reset'); }
  function setContext(id) { if (id !== state.courseId) reset(id); }
  async function load(more = false) {
    if (!state.courseId || !signedIn() || more && (!state.hasMore || state.loading)) return;
    const id = state.courseId, token = epoch, fetchId = ++request;
    const offset = more ? state.offset : 0, filters = { ...state.filters };
    state.loading = true; state.error = ''; emit('loading');
    try {
      const data = normalizeBoardPage(await rpc('course_board', { p_course_id: id, p_kind: filters.kind, p_scope: filters.scope,
        p_topic_id: filters.topicId || null, p_search: filters.search.trim(), p_offset: offset, p_limit: BOARD_PAGE_SIZE }), id);
      if (!current(token, id) || fetchId !== request) return;
      Object.assign(state, { actor: data.actor, settings: data.settings, groups: data.groups,
        posts: more ? mergeBoardPosts(state.posts, data.posts) : data.posts, total: data.total, offset: data.nextOffset,
        hasMore: data.hasMore, phase: 'ready', error: '' });
      emit('loaded');
    } catch (error) {
      if (!current(token, id) || fetchId !== request) return;
      if (error.code === '42501') { state.posts = []; state.actor = state.settings = null; }
      state.phase = state.actor ? 'ready' : 'error'; state.error = error.message || 'No se pudo cargar el tablero.'; emit('error');
    } finally { if (current(token, id) && fetchId === request) { state.loading = false; emit('settled'); } }
  }
  function filter(patch) {
    state.filters = { ...state.filters, ...patch };
    state.filters.search = state.filters.search.slice(0, 120);
    void load();
  }
  async function mutate(name, args, notice) {
    if (!state.courseId || !signedIn() || state.saving) return null;
    const id = state.courseId, token = epoch;
    state.saving = true; state.error = ''; emit('saving');
    try {
      const value = await rpc(name, { p_course_id: id, ...args });
      if (!current(token, id)) return null;
      const result = name === 'teacher_save_board_settings' ? value : normalizeBoardPost(value, id);
      state.notice = notice;
      if (name === 'teacher_save_board_settings') state.settings = result;
      emit('saved');
      void load();
      return result;
    } catch (error) {
      if (!current(token, id)) return null;
      state.error = error.message || 'No se pudo guardar. Tus cambios siguen aquí.'; emit('error');
      throw error;
    } finally { if (current(token, id)) { state.saving = false; emit('settled'); } }
  }
  return { snapshot: () => state, reset: () => reset(), setContext, load, filter,
    saveSettings: (instructions, postingOpen, revision) => mutate('teacher_save_board_settings', {
      p_instructions: instructions, p_posting_open: postingOpen, p_expected_revision: revision
    }, 'Indicaciones guardadas.'),
    save: (id, revision, data) => mutate('course_board_save_post', { p_post_id: id, p_expected_revision: revision, p_data: data }, 'Publicación guardada.'),
    action: (post, action) => mutate('course_board_set_post_state', { p_post_id: post.id, p_expected_revision: post.revision, p_action: action },
      action === 'restore' ? 'Publicación restaurada.' : action === 'hide' ? 'Publicación oculta. Puedes restaurarla desde los filtros.' : action === 'remove' ? 'Publicación retirada. Puedes restaurarla desde tus publicaciones.' : 'Publicación actualizada.') };
}
