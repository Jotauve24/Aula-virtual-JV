import { configured, signedIn, signOut, sendCode, googleAvailable, signInWithGoogle,
  signInTeacherWithPassword, resetTeacherPassword, teacherRecoveryPending,
  teacherCallbackError, updateTeacherPassword, teacherAuthError } from './supabase-client.js?v=0.27.0';

// Teacher credentials stay separate from student identities, including recovery.
export function initTeacherAuth({ show, onSignedIn, onNotice }) {
  const $ = selector => document.querySelector(selector);
  const login = $('#login'), passwordForm = $('#teacher-password-form');
  let generation = 0, pending = null, passwordMode = 'recovery';
  const error = (id, message = '') => {
    $(id).textContent = message; $(id).hidden = !message;
  };
  function clearPasswords() {
    for (const id of ['#teacher-password','#teacher-new-password','#teacher-confirm-password']) {
      $(id).value = ''; $(id).type = 'password';
    }
    for (const button of document.querySelectorAll('[data-password-toggle]')) {
      button.setAttribute('aria-pressed','false'); button.setAttribute('aria-label','Mostrar contraseña');
    }
  }
  async function attempt(form, button, label, action, errorId = '#teacher-auth-error') {
    if (pending) return;
    error(errorId);
    const currentGeneration = generation, request = {};
    const controls = [...form.querySelectorAll('input,button')].map(control => [control, control.disabled]);
    const originalLabel = button.innerHTML;
    request.restore = () => {
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      button.innerHTML = originalLabel; form.setAttribute('aria-busy','false');
    };
    pending = request;
    controls.forEach(([control]) => { control.disabled = true; });
    button.textContent = label; form.setAttribute('aria-busy','true');
    try { await action(() => currentGeneration === generation); }
    catch (failure) {
      if (currentGeneration === generation) error(errorId, teacherAuthError(failure));
    } finally {
      if (pending === request) {
        pending = null;
        request.restore();
      }
    }
  }
  function emailValue() {
    const field = $('#teacher-email');
    if (!field.reportValidity()) return null;
    return field.value.trim().toLowerCase();
  }
  function showPassword(mode) {
    passwordMode = mode; clearPasswords(); error('#teacher-password-error');
    $('#teacher-password-title').textContent = mode === 'recovery' ? 'Crea tu nueva contraseña.' : 'Cambia tu contraseña.';
    $('#teacher-password-help').textContent = 'Usa al menos 8 caracteres. Combina letras, números y símbolos para proteger tu cuenta docente.';
    show('password');
  }
  login.addEventListener('submit', event => {
    event.preventDefault();
    const email = emailValue(), field = $('#teacher-password');
    if (!email || !field.reportValidity()) return;
    const password = field.value;
    void attempt(login, $('#teacher-login-submit'), 'Entrando…', async current => {
      await signInTeacherWithPassword(email, password);
      if (!current()) return;
      clearPasswords(); await onSignedIn();
    });
  });
  for (const [id, recovery] of [['#teacher-recover-password',true],['#teacher-email-link',false]]) {
    $(id).addEventListener('click', () => {
      const email = emailValue(); if (!email) return;
      void attempt(login, $(id), 'Enviando…', async current => {
        await (recovery ? resetTeacherPassword(email) : sendCode(email));
        if (!current()) return;
        clearPasswords();
        $('#verify-title').textContent = 'Revisa tu correo.';
        $('#verify-message').textContent = recovery
          ? 'Si el correo tiene una cuenta, recibirás un enlace para crear o cambiar tu contraseña. Ábrelo y guarda la nueva contraseña para entrar desde cualquier dispositivo.'
          : 'Si el correo tiene una cuenta, recibirás un enlace de acceso. Ábrelo para volver al panel docente.';
        show('verify');
      });
    });
  }
  $('#teacher-verify-back').addEventListener('click', () => { show('login'); error('#teacher-auth-error'); });
  $('#google-login').addEventListener('click', () => { if (!pending) signInWithGoogle(); });
  if (configured) googleAvailable().then(available => { $('#google-login').hidden = !available; }).catch(() => {});
  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    button.addEventListener('click', () => {
      const field = $('#' + button.dataset.passwordToggle), visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }
  $('#open-teacher-password').addEventListener('click', () => { if (!pending) showPassword('account'); });
  passwordForm.addEventListener('submit', event => {
    event.preventDefault();
    const field = $('#teacher-new-password'), confirmation = $('#teacher-confirm-password');
    if (!field.reportValidity() || !confirmation.reportValidity()) return;
    if (field.value !== confirmation.value) {
      error('#teacher-password-error','Las contraseñas no coinciden. Escríbelas nuevamente.'); confirmation.focus(); return;
    }
    const password = field.value;
    void attempt(passwordForm, $('#teacher-password-save'), 'Guardando…', async current => {
      await updateTeacherPassword(password);
      if (!current()) return;
      clearPasswords();
      // Reloading the panel is independent of the completed password change.
      try { await onSignedIn(); }
      catch { show('login'); }
      if (current()) onNotice('Contraseña guardada. Ya puedes entrar con tu correo y contraseña desde otro dispositivo.');
    }, '#teacher-password-error');
  });
  $('#teacher-password-cancel').addEventListener('click', () => {
    if (pending) return;
    clearPasswords();
    if (passwordMode === 'account') void attempt(passwordForm, $('#teacher-password-cancel'), 'Volviendo…', onSignedIn, '#teacher-password-error');
    else { leave(); show('login'); }
  });
  function leave() {
    generation++; pending?.restore(); pending = null;
    clearPasswords(); error('#teacher-auth-error'); error('#teacher-password-error'); signOut();
  }
  if (!configured) { show('login'); login.hidden = true; $('#setup').hidden = false; }
  else if (teacherRecoveryPending()) showPassword('recovery');
  else {
    show('login'); error('#teacher-auth-error', teacherCallbackError());
    if (signedIn()) void (async () => {
      const currentGeneration = generation;
      try { await onSignedIn(); }
      catch (failure) { if (currentGeneration === generation) error('#teacher-auth-error', teacherAuthError(failure)); }
    })();
  }
  return { signOut: leave };
}
