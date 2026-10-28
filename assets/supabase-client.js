import { openAuthPage } from './embed.js?v=0.23.0';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js?v=0.23.0';

const sessionKey = 'aula-supabase-session';
const studentSessionKey = 'aula-student-session';
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
  history.replaceState(null, '', location.pathname + location.search);
}
async function request(path, body, token) {
  const response = await fetch(endpoint(path), {
    method: 'POST',
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
  const redirect = location.origin + location.pathname;
  return request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`,
    { email, create_user: true });
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
  return url.toString();
}
export async function emailStudentLogin(email) {
  return request('/auth/v1/otp?redirect_to=' + encodeURIComponent(studentRedirect('login')),
    { email: email.trim().toLowerCase(), create_user: true });
}
export async function protectStudentAccount(email) {
  const token = await accessToken(studentSessionKey);
  const res = await fetch(endpoint('/auth/v1/user?redirect_to=' +
    encodeURIComponent(studentRedirect('protected'))), {
    method:'PUT', cache:'no-store',
    headers:{ 'Content-Type':'application/json', apikey:SUPABASE_PUBLISHABLE_KEY,
      Authorization:'Bearer '+token },
    body:JSON.stringify({email:email.trim().toLowerCase()})
  });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.msg || body.message || body.error_description ||
    'No se pudo enviar el correo de verificación. Consulta al docente.');
  return body;
}
export async function studentAuthUser() {
  const token = await accessToken(studentSessionKey);
  const res = await fetch(endpoint('/auth/v1/user'), {
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:'Bearer '+token},
    cache:'no-store'
  });
  if (!res.ok) {
    const body = await res.json().catch(()=>({}));
    if (invalidAuthSession(res.status, body.code || body.error_code) &&
        session(studentSessionKey)?.access_token === token) saveSession(null, studentSessionKey);
    throw new Error('Tu sesión no está disponible. Recupera el acceso con tu correo.');
  }
  return res.json();
}
let anonymousSignIn = null;
export async function signInStudentAnonymously() {
  if (session(studentSessionKey)?.access_token) return;
  if (!anonymousSignIn) anonymousSignIn = (async () => {
    const data = await request('/auth/v1/signup', { data: {} });
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
async function accessToken(key = sessionKey) {
  const value = session(key);
  if (!value?.access_token) throw new Error('Inicia sesión con tu correo.');
  if (value.expires_at && value.expires_at * 1000 > Date.now() + 60000) return value.access_token;
  if (!value.refresh_token) {
    saveSession(null, key);
    throw new Error('Tu sesión venció. Recupera el acceso con tu correo.');
  }
  if (pendingRefreshes.has(key)) return pendingRefreshes.get(key);
  const refresh = (async () => {
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
  })();
  pendingRefreshes.set(key, refresh);
  try { return await refresh; }
  finally { if (pendingRefreshes.get(key) === refresh) pendingRefreshes.delete(key); }
}
export async function rpc(name, body = {}) {
  const token = await accessToken();
  return request(`/rest/v1/rpc/${name}`, body, token);
}
export async function studentRpc(name, body = {}) {
  const token = await accessToken(studentSessionKey);
  return request(`/rest/v1/rpc/${name}`, body, token);
}
export function studentSignedIn() { return !!session(studentSessionKey)?.access_token; }
export function studentSignOut() { saveSession(null, studentSessionKey); }
export function signedIn() { return !!session()?.access_token; }
export function signOut() { saveSession(null); }

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
async function storageRequest(path, options = {}) {
  const token = await accessToken(studentSessionKey);
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
