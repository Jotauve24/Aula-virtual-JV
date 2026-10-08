import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const sessionKey = 'aula-supabase-session';
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) &&
  /^sb_publishable_|^eyJ/.test(SUPABASE_PUBLISHABLE_KEY);

function endpoint(path) {
  if (!configured) throw new Error('La conexión con Supabase todavía no está configurada.');
  return `${SUPABASE_URL}${path}`;
}
function session() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); }
  catch { return null; }
}
function saveSession(value) {
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify({ ...value,
    expires_at: value.expires_at || Math.floor(Date.now()/1000) + value.expires_in }));
  else sessionStorage.removeItem(sessionKey);
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
  return request('/auth/v1/otp', { email, create_user: true });
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
