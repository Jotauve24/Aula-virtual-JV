import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const sessionKey = 'aula-supabase-session';
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) &&
  /^sb_publishable_|^eyJ/.test(SUPABASE_PUBLISHABLE_KEY);

function endpoint(path) {
  if (!configured) throw new Error('La conexión con Supabase todavía no está configurada.');
  return `${SUPABASE_URL}${path}`;
}
function session() {
  try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
  catch { return null; }
}
function saveSession(value) {
  if (value) localStorage.setItem(sessionKey, JSON.stringify({ ...value,
    expires_at: value.expires_at || Math.floor(Date.now()/1000) + value.expires_in }));
  else localStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionKey);
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
  saveSession({ access_token: fragment.get('access_token'),
    refresh_token: fragment.get('refresh_token'),
    expires_in: Number(fragment.get('expires_in')) || 3600 });
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
  if (!response.ok) throw new Error(data.message || data.msg || data.error_description ||
    (response.status === 429 ? 'Demasiados intentos. Prueba más tarde.' : 'No se pudo completar la solicitud.'));
  return data;
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
  location.assign(endpoint(`/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`));
}
export async function verifyCode(email, token) {
  const data = await request('/auth/v1/verify', { email, token, type: 'email' });
  saveSession(data);
  return data;
}
async function accessToken() {
  const value = session();
  if (!value?.access_token) throw new Error('Inicia sesión con tu correo.');
  if (value.expires_at && value.expires_at * 1000 > Date.now() + 60000) return value.access_token;
  if (!value.refresh_token) throw new Error('La sesión venció. Inicia sesión otra vez.');
  const renewed = await request('/auth/v1/token?grant_type=refresh_token',
    { refresh_token: value.refresh_token });
  saveSession(renewed);
  return renewed.access_token;
}
export async function rpc(name, body = {}) {
  const token = await accessToken();
  return request(`/rest/v1/rpc/${name}`, body, token);
}
export function signedIn() { return !!session()?.access_token; }
export function signOut() { saveSession(null); }
