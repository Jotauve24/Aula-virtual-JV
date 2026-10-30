// Permission is requested only by the activation button, never on page load.
export function pushAvailability({ secure, supported, appleMobile, standalone, permission }) {
  if (!secure) return 'insecure';
  if (appleMobile && !standalone) return 'install';
  if (!supported) return 'unsupported';
  if (permission === 'denied') return 'denied';
  return 'available';
}
const appleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
const standalone = () => {
  try { return window.top.matchMedia('(display-mode: standalone)').matches || window.top.navigator.standalone === true; }
  catch { return matchMedia('(display-mode: standalone)').matches; }
};
const keyBytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));

export function createChatPushSettings({ rpc, signedIn }) {
  let host, state, enable, disable, context = null, registration = null, subscription = null;
  let config = null, preparing = null, busy = false, active = false, generation = 0, error = '';
  const status = text => { if (state) state.textContent = text; };
  const availability = () => pushAvailability({secure:window.isSecureContext,
    supported:'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    appleMobile:appleMobile(),standalone:standalone(),permission:window.Notification?.permission});
  function paint() {
    if (!host) return;
    const available = availability();
    enable.hidden = active || available !== 'available';
    disable.hidden = !active;
    enable.disabled = disable.disabled = busy || !config?.enabled || !registration || !context;
    enable.textContent = busy ? 'Activando…' : 'Activar notificaciones';
    if (available === 'install') status('En iPhone o iPad: abre esta página en Safari, toca Compartir → Agregar a inicio y entra desde el icono de AulavirtualJV. Necesitas iOS 16.4 o posterior.');
    else if (available === 'denied') status('El permiso está bloqueado. Actívalo en los ajustes de notificaciones del navegador o de AulavirtualJV y vuelve a esta pantalla.');
    else if (available === 'insecure') status('Las notificaciones necesitan una conexión HTTPS.');
    else if (available === 'unsupported') status('Este navegador no permite avisos del sistema. Usa Safari actualizado en iPhone o Chrome actualizado en Android. Los avisos dentro del aula siguen disponibles.');
    else if (error) status(error);
    else if (active) status('Activas en este dispositivo. Recibirás avisos de tus equipos aunque cierres el aula.');
    else if (config?.enabled && registration) status('Recibe un aviso cuando tu equipo escriba. Tú decides si das permiso.');
  }
  async function prepare() {
    if (preparing || !context || !signedIn() || availability() !== 'available') { paint(); return preparing; }
    const requestGeneration = generation;
    preparing = (async () => {
      try {
        error = ''; status('Comprobando notificaciones…');
        config = await rpc('student_push_config', {});
        if (requestGeneration !== generation || !config?.enabled || !config.publicKey) { status('Las notificaciones no están disponibles ahora. Vuelve a intentarlo más tarde.'); return; }
        registration = await navigator.serviceWorker.register(new URL('../chat-worker.js', import.meta.url), { scope:new URL('../', import.meta.url).href, updateViaCache:'none' });
        const ready = await navigator.serviceWorker.ready;
        if (requestGeneration !== generation) return;
        registration = ready;
        subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
          await rpc('student_push_subscribe', { p_subscription:subscription.toJSON() });
          active = requestGeneration === generation;
        }
      } catch { error = 'No pudimos preparar los avisos. Cierra y abre la campana para reintentar.'; }
      finally { preparing = null; paint(); if (requestGeneration !== generation && context) prepare(); }
    })();
    return preparing;
  }
  async function activate() {
    if (busy || !context || !signedIn() || !config?.enabled || !registration || availability() !== 'available') return;
    const requestGeneration = generation;
    busy = true; error = ''; paint();
    try {
      // Invoke before any await: Safari requires the activation gesture.
      const permission = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      if (await permission !== 'granted') { error = 'No activaste los avisos. Puedes seguir usando el chat.'; return; }
      if (requestGeneration !== generation || !signedIn()) return;
      const next = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
      if (requestGeneration !== generation || !signedIn()) { await next.unsubscribe(); return; }
      subscription = next;
      await rpc('student_push_subscribe', {p_subscription:next.toJSON()});
      active = requestGeneration === generation;
    } catch {
      active = false;
      error = 'No se activaron los avisos. Comprueba el permiso y la conexión y vuelve a intentarlo.';
    } finally { busy = false; paint(); }
  }
  async function deactivate() {
    if (busy) return;
    busy = true; paint();
    try {
      if (subscription && signedIn()) await rpc('student_push_unsubscribe', {p_endpoint:subscription.endpoint});
      if (subscription) await subscription.unsubscribe();
      subscription = null; active = false; error = 'Notificaciones desactivadas en este dispositivo.';
    } catch { error = 'No pudimos desactivar los avisos. Revisa tu conexión y vuelve a intentarlo.'; }
    finally { busy = false; paint(); }
  }
  return {
    mount(container) {
      host = container;
      const title = document.createElement('h3'); title.textContent = 'Avisos del equipo';
      const text = document.createElement('p'); text.textContent = 'La notificación indica que llegó un mensaje. Su contenido queda dentro del chat.';
      state = document.createElement('p'); state.className = 'notification-state'; state.setAttribute('role', 'status');
      enable = document.createElement('button'); enable.type = 'button'; enable.className = 'button primary'; enable.textContent = 'Activar notificaciones';
      disable = document.createElement('button'); disable.type = 'button'; disable.className = 'button secondary'; disable.textContent = 'Desactivar en este dispositivo';
      enable.addEventListener('click', activate); disable.addEventListener('click', deactivate);
      host.append(title, text, state, enable, disable);
      host.parentElement?.addEventListener('toggle', () => { if (host.parentElement.open) prepare(); });
      paint();
    },
    setContext(next) {
      if (context?.courseId === next?.courseId && context?.topicId === next?.topicId) return;
      context = next; ++generation;
      if (next) prepare(); else { active = false; config = null; paint(); }
    },
    async logout() {
      ++generation; context = null;
      try {
        const current = subscription || await registration?.pushManager.getSubscription();
        if (current) {
          // Dispatch revocation while the old session is still available. Also
          // revoke at the browser provider, which remains valid after sign-out.
          if (signedIn()) rpc('student_push_unsubscribe', {p_endpoint:current.endpoint}).catch(() => {});
          await current.unsubscribe();
        }
      }
      catch { /* Browser settings remain available if the provider is offline. */ }
      subscription = null; active = false; paint();
    }
  };
}
