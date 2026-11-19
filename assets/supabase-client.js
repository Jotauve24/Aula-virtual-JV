import { openAuthPage } from './embed.js?v=0.34.3';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js?v=0.34.3';

const sessionKey = 'aula-supabase-session';
const studentSessionKey = 'aula-student-session';
const teacherRecoveryKey = 'aula-teacher-password-recovery';
let teacherSignInGeneration = 0;
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) &&
  /^sb_publishable_|^eyJ/.test(SUPABASE_PUBLISHABLE_KEY);

function endpoint(path) {
  if (!configured) throw new Error('La conexión con Supabase todavía no está configurada.');
  return `${SUPABASE_URL}${path}`;
}
function session(key = sessionKey) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}
function saveSession(value, key = sessionKey) {
  if (value) localStorage.setItem(key, JSON.stringify({ ...value,
    expires_at: value.expires_at || Math.floor(Date.now()/1000) + value.expires_in }));
  else localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
function teacherIdentity(value = session()) {
  try {
    const payload = value.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const id = JSON.parse(atob(payload)).sub;
    return typeof id === 'string' && id ? id : null;
  } catch { return null; }
}
// Previous releases stored the session only in one tab. Preserve it on upgrade.
if (!session()) {
  try {
    const previous = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (previous?.access_token && previous?.refresh_token) saveSession(previous);
  } catch { /* No prior session to migrate. */ }
}
// Supabase's default email template uses a magic link. It returns the session
// in the URL fragment, which is removed immediately after reading it.
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('access_token') && fragment.has('refresh_token')) {
  const isStudentCallback = /\/live\.html$/.test(location.pathname);
  saveSession({ access_token: fragment.get('access_token'),
    refresh_token: fragment.get('refresh_token'),
    expires_in: Number(fragment.get('expires_in')) || 3600 },
    isStudentCallback ? studentSessionKey : sessionKey);
  if (!isStudentCallback) {
    if (fragment.get('type') === 'recovery' && teacherIdentity())
      sessionStorage.setItem(teacherRecoveryKey, teacherIdentity());
    else sessionStorage.removeItem(teacherRecoveryKey);
  }
  history.replaceState(null, '', location.pathname + location.search);
}
const callbackError = fragment.get('error_code') || fragment.get('error');
if (callbackError) history.replaceState(null, '', location.pathname + location.search);
async function request(path, body, token, method = 'POST') {
  const response = await fetch(endpoint(path), {
    method,
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.msg || data.error_description ||
      (response.status === 429 ? 'Demasiados intentos. Prueba más tarde.' : 'No se pudo completar la solicitud.'));
    error.status = response.status;
    error.code = data.code || data.error_code || data.error;
    throw error;
  }
  return data;
}
function invalidAuthSession(status, code) {
  return [400, 401, 403].includes(status) &&
    /^(refresh_token_(not_found|already_used)|session_not_found|user_not_found|user_banned|invalid_grant|bad_jwt)$/.test(code || '');
}
export async function sendCode(email) {
  const redirect = new URL('docente.html', location.href).href;
  return request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`,
    { email: email.trim().toLowerCase(), create_user: false });
}
export async function signInTeacherWithPassword(email, password) {
  const generation = ++teacherSignInGeneration;
  const data = await request('/auth/v1/token?grant_type=password',
    { email: email.trim().toLowerCase(), password });
  if (generation !== teacherSignInGeneration) throw new Error('La sesión se cerró. Inténtalo nuevamente.');
  if (!data.access_token || !data.refresh_token || data.user?.is_anonymous === true)
    throw new Error('No se pudo iniciar la sesión docente.');
  saveSession(data);
  sessionStorage.removeItem(teacherRecoveryKey);
}
export async function resetTeacherPassword(email) {
  const redirect = new URL('docente.html', location.href).href;
  return request('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect),
    { email: email.trim().toLowerCase() });
}
export function teacherRecoveryPending() {
  const identity = teacherIdentity();
  return !!identity && sessionStorage.getItem(teacherRecoveryKey) === identity;
}
export function teacherCallbackError() {
  return callbackError ? 'Este enlace de acceso venció o ya se utilizó. Entra con tu contraseña o solicita otro enlace.' : '';
}
export async function updateTeacherPassword(password) {
  if (typeof password !== 'string' || password.length < 8)
    throw new Error('Usa una contraseña de al menos 8 caracteres.');
  const generation = teacherSignInGeneration, token = await accessToken();
  if (generation !== teacherSignInGeneration) throw new Error('La sesión se cerró. Inténtalo nuevamente.');
  await request('/auth/v1/user', { password }, token, 'PUT');
  if (generation !== teacherSignInGeneration || !signedIn())
    throw new Error('La sesión se cerró. Entra nuevamente con tu contraseña.');
  sessionStorage.removeItem(teacherRecoveryKey);
}
export function teacherAuthError(error) {
  const code = error?.code || '';
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(error?.message || ''))
    return 'Se alcanzó el límite de correos de acceso. Entra con tu contraseña si ya tienes una, o espera antes de solicitar otro correo.';
  if (error?.status === 429 || /over_request_rate_limit|over_email_send_rate_limit/.test(code))
    return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
  if (/invalid_credentials|email_not_confirmed/.test(code) || error?.status === 400 && /invalid login/i.test(error?.message || ''))
    return 'No se pudo entrar con esos datos. Revisa tu correo y contraseña, o usa «Crear o recuperar contraseña».';
  if (/weak_password/.test(code)) return 'Elige una contraseña más segura, con letras, números y símbolos.';
  if (/same_password/.test(code)) return 'Elige una contraseña diferente a la actual.';
  if (/reauthentication|session_not_found|bad_jwt|refresh_token/.test(code) || error?.status === 401)
    return 'Por seguridad, vuelve a entrar o usa «Crear o recuperar contraseña» para confirmar tu identidad.';
  if (/al menos 8|sesión se cerró/.test(error?.message || '')) return error.message;
  return 'No se pudo completar el acceso. Revisa tu conexión y vuelve a intentarlo.';
}
export async function googleAvailable() {
  if (!configured) return false;
  const response = await fetch(endpoint('/auth/v1/settings'), {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache: 'no-store' });
  if (!response.ok) return false;
  const settings = await response.json();
  return settings.external?.google === true;
}
export function signInWithGoogle() {
  const redirect = location.origin + location.pathname;
  openAuthPage(endpoint(`/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`));
}
// Student magic links are scoped to /live.html and never replace teacher sessions.
function studentRedirect(mode) {
  const url = new URL('live.html', location.href);
  url.searchParams.set('student_auth', mode);
  // Carry the recovery intent in the verified link: email apps often open a
  // different browser, where the original browser's storage is unavailable.
  const code = (localStorage.getItem('aula-student-recovery-code') || '').trim().toUpperCase().replace(/\s/g, '');
  if (/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code)) url.searchParams.set('recovery_code', code);
  if (localStorage.getItem('aula-student-document-recovery') === '1') url.searchParams.set('recovery_document', '1');
  return url.toString();
}
export function studentCallbackError() {
  return callbackError ? 'Este enlace de acceso venció, ya se utilizó o fue rechazado. Solicita uno nuevo y abre el correo más reciente.' : '';
}
export function studentAuthError(error) {
  if (error?.status === 429 || /over_email_send_rate_limit|over_request_rate_limit/.test(error?.code || '') || /email rate limit/i.test(error?.message || ''))
    return 'Se alcanzó el límite de intentos o correos. Espera unos minutos antes de solicitar otro enlace y revisa también la carpeta de correo no deseado.';
  if (error?.code === 'email_address_not_authorized')
    return 'El servicio de correo no permite enviar a esa dirección. Comunícalo al docente para revisar la configuración del envío. Tu perfil se conserva.';
  if (/email_exists|identity_already_exists|user_already_exists/.test(error?.code || ''))
    return 'Ese correo ya está asociado a una cuenta. Conserva esta sesión y solicita ayuda al docente para unir el acceso sin perder tu equipo.';
  if (error?.status >= 500 || /failed to fetch|network|load failed/i.test(error?.message || ''))
    return 'No pudimos conectar con el aula. Tu sesión se conserva; revisa la conexión y vuelve a intentarlo.';
  return error?.message || 'No pudimos comprobar tu acceso. Revisa la conexión y vuelve a intentarlo.';
}
export async function emailStudentLogin(email) {
  return request('/auth/v1/otp?redirect_to=' + encodeURIComponent(studentRedirect('login')),
    { email: email.trim().toLowerCase(), create_user: true });
}
export async function protectStudentAccount(email) {
  return sessionRequest(studentSessionKey, '/auth/v1/user?redirect_to=' +
    encodeURIComponent(studentRedirect('protected')), {email:email.trim().toLowerCase()}, 'PUT');
}
export async function studentAuthUser() {
  const before = session(studentSessionKey);
  try { return await sessionRequest(studentSessionKey, '/auth/v1/user', undefined, 'GET'); }
  catch (error) {
    if (invalidAuthSession(error.status, error.code)) {
      if (session(studentSessionKey)?.refresh_token === before?.refresh_token) saveSession(null, studentSessionKey);
      throw new Error('Tu sesión no está disponible. Recupera el acceso con tu correo.');
    }
    throw error;
  }
}
let anonymousSignIn = null, studentSignInGeneration = 0;
export async function signInStudentAnonymously() {
  if (session(studentSessionKey)?.access_token) return;
  const generation = studentSignInGeneration;
  if (!anonymousSignIn) anonymousSignIn = (async () => {
    const data = await request('/auth/v1/signup', { data: {} });
    if (generation !== studentSignInGeneration)
      throw new Error('La sesión se cerró. Inicia sesión nuevamente.');
    if (!data.access_token || !data.refresh_token || data.user?.is_anonymous !== true)
      throw new Error('El acceso estudiantil sin correo aún no está habilitado.');
    // A verified email callback may have completed while signup was pending.
    if (!session(studentSessionKey)?.access_token) saveSession(data, studentSessionKey);
  })();
  const pending = anonymousSignIn;
  try { await pending; }
  finally { if (anonymousSignIn === pending) anonymousSignIn = null; }
}
// Presence, chat and teacher dashboard can ask for a token simultaneously.
// Share refreshes per session, never across student and teacher identities.
const pendingRefreshes = new Map();
async function accessToken(key = sessionKey, force = false, rejectedToken = null) {
  const usable = value => value?.access_token &&
    (!force || value.access_token !== rejectedToken) && value.expires_at * 1000 > Date.now() + 60000;
  const value = session(key);
  if (!value?.access_token) throw new Error('Inicia sesión con tu correo.');
  if (usable(value)) return value.access_token;
  if (pendingRefreshes.has(key)) return pendingRefreshes.get(key);
  const renew = async () => {
    // Re-read after obtaining the browser-wide lock. Another tab may already
    // have rotated the token, signed out, or completed an email login.
    const value = session(key);
    if (!value?.access_token) throw new Error('La sesión se cerró. Inicia sesión nuevamente.');
    if (usable(value)) return value.access_token;
    if (!value.refresh_token) {
      saveSession(null, key);
      throw new Error('Tu sesión venció. Recupera el acceso con tu correo.');
    }
    let renewed;
    try {
      renewed = await request('/auth/v1/token?grant_type=refresh_token',
        { refresh_token: value.refresh_token });
    } catch (error) {
      const current = session(key);
      if (current?.access_token && (current.refresh_token !== value.refresh_token ||
          current.access_token !== value.access_token)) return current.access_token;
      // Only a definitive Auth rejection expires this saved credential.
      // Network failures and rate limits must preserve the original session.
      if (invalidAuthSession(error.status, error.code)) {
        if (current?.refresh_token === value.refresh_token && current.access_token === value.access_token)
          saveSession(null, key);
        throw new Error('Tu sesión venció. Recupera el acceso con tu correo.');
      }
      throw error;
    }
    const current = session(key);
    // A student can log out, or enter with a different account, while the
    // network request is pending. Never restore their former credentials.
    if (!current || current.refresh_token !== value.refresh_token ||
        current.access_token !== value.access_token) {
      if (!current?.access_token) throw new Error('La sesión se cerró. Inicia sesión nuevamente.');
      return current.access_token;
    }
    saveSession(renewed, key);
    return renewed.access_token;
  };
  const refresh = typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('aula-auth-refresh:' + key, renew) : renew();
  pendingRefreshes.set(key, refresh);
  try { return await refresh; }
  finally { if (pendingRefreshes.get(key) === refresh) pendingRefreshes.delete(key); }
}
async function sessionRequest(key, path, body, method = 'POST') {
  const token = await accessToken(key);
  try { return await request(path, body, token, method); }
  catch (error) {
    // A sleeping tab or a device clock can leave a locally "valid" JWT that
    // the server has expired. Only an authentication rejection is retried.
    if (error.status !== 401 || !/^(PGRST301|PGRST303|bad_jwt|jwt_expired)$/.test(error.code || '')) throw error;
    const renewed = await accessToken(key, true, token);
    return request(path, body, renewed, method);
  }
}
export async function rpc(name, body = {}) {
  return sessionRequest(sessionKey, `/rest/v1/rpc/${name}`, body);
}
export async function studentRpc(name, body = {}) {
  return sessionRequest(studentSessionKey, `/rest/v1/rpc/${name}`, body);
}
export function studentSignedIn() { return !!session(studentSessionKey)?.access_token; }
export function studentSignOut() {
  studentSignInGeneration++; anonymousSignIn = null;
  saveSession(null, studentSessionKey);
}
export function signedIn() { return !!session()?.access_token; }
// Cache invalidation only. RPCs and Storage still enforce every permission.
export function sessionUserId(role) {
  if (!['teacher', 'student'].includes(role)) return null;
  return teacherIdentity(session(role === 'student' ? studentSessionKey : sessionKey));
}
export function signOut() {
  teacherSignInGeneration++;
  saveSession(null);
  sessionStorage.removeItem(teacherRecoveryKey);
}

// Delete only objects returned by the teacher-owned course manifest. Storage's
// API removes the underlying files as well as their metadata.
export async function deleteTeacherCourseFiles(courseId, paths) {
  if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path.startsWith(courseId + '/')))
    throw new Error('La lista de archivos de esta materia no es válida.');
  for (let i = 0; i < paths.length; i += 100) {
    const token = await accessToken();
    const response = await fetch(endpoint('/storage/v1/object/team-attachments'), {
      method: 'DELETE', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.error || 'No se pudieron retirar los archivos de la materia.');
    }
  }
}


const attachmentBucket = 'team-attachments';
const storagePath = path => path.split('/').map(encodeURIComponent).join('/');
async function storageRequest(path, options = {}, key = studentSessionKey) {
  const token = await accessToken(key);
  const response = await fetch(endpoint('/storage/v1/' + path), {
    ...options, cache: 'no-store', headers: { apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`, ...options.headers }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'No se pudo completar la operación con el archivo.');
  }
  return response;
}
export async function uploadTeamFile(courseId, topicId, file, info) {
  const token = await accessToken(studentSessionKey);
  const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  const path = `${courseId}/${topicId}/${claims.sub}/${crypto.randomUUID()}.${info.extension}`;
  await storageRequest(`object/${attachmentBucket}/${storagePath(path)}`, {
    method:'POST', headers:{'Content-Type':info.type,'x-upsert':'false','Cache-Control':'private, max-age=0'}, body:file,
    signal: AbortSignal.timeout(120000)
  });
  return path;
}
export async function cancelTeamFile(path) {
  await storageRequest(`object/${attachmentBucket}`, {
    method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prefixes:[path]})
  });
}
export async function downloadTeamFile(attachment) {
  const response = await storageRequest(`object/authenticated/${attachmentBucket}/${storagePath(attachment.path)}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = attachment.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Same private bucket and course cleanup, with a separate namespace from chat.
export function contentBoardFiles(role = 'student') {
  if (!['student', 'teacher'].includes(role)) throw new Error('Tipo de acceso al tablero inválido.');
  const key = role === 'teacher' ? sessionKey : studentSessionKey;
  return {
    async upload(courseId, file, info) {
      const token = await accessToken(key);
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const path = `${courseId}/board/${claims.sub}/${crypto.randomUUID()}.${info.extension}`;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 120000);
      try {
        await storageRequest(`object/${attachmentBucket}/${storagePath(path)}`, {
          method: 'POST', headers: { 'Content-Type': info.type, 'x-upsert': 'false', 'Cache-Control': 'private, max-age=0' },
          body: file, signal: controller.signal
        }, key);
      } catch (error) {
        // A lost upload response can leave a pending object. Never remove a file
        // already referenced by a published post; Storage enforces that guard.
        await storageRequest(`object/${attachmentBucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [path] }) }, key).catch(() => {});
        throw error;
      } finally { clearTimeout(timeout); }
      return path;
    },
    async cancel(path) {
      await storageRequest(`object/${attachmentBucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }) }, key);
    },
    async blob(attachment) {
      const response = await storageRequest(`object/authenticated/${attachmentBucket}/${storagePath(attachment.path)}`, {}, key);
      return response.blob();
    }
  };
}
