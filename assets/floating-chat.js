import { participantAvatar } from './chat-ui.js?v=0.27.1';

const node = (tag, css = '', text = '') => {
  const result = document.createElement(tag);
  result.className = css;
  if (text) result.textContent = text;
  return result;
};
const paths = {
  back: 'm15 18-6-6 6-6', minimize: 'M5 12h14', close: 'm6 6 12 12M6 18 18 6',
  expand: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4',
  restore: 'M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  attach: 'm8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
  send: 'm4 4 17 8-17 8 3-8-3-8Zm3 8h14'
};
export function chatIcon(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[kind]); svg.append(path); return svg;
}
function iconButton(kind, label, css = '') {
  const button = node('button', 'floating-chat-control ' + css);
  button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
  button.append(chatIcon(kind)); return button;
}
export function decorateChatForm(form) {
  const input = form.querySelector('[name="message"]');
  if (input) { input.autocomplete = 'off'; input.placeholder = 'Escribe a tu equipo…'; }
  const attach = form.querySelector('.chat-attach');
  if (attach) { attach.setAttribute('aria-label', 'Adjuntar un archivo'); attach.title = 'Adjuntar un archivo'; attach.replaceChildren(chatIcon('attach')); }
  const send = form.querySelector('[type="submit"]');
  if (send) { send.setAttribute('aria-label', 'Enviar mensaje'); send.title = 'Enviar mensaje'; send.replaceChildren(chatIcon('send')); }
}

// One mounted conversation: hiding the window never recreates its form or file.
export function createFloatingChat({ host, launcher, onRead = () => {}, onOpen = () => {}, settings, demo = false }) {
  const mobile = matchMedia('(max-width: 650px)');
  let conversation = null, enabled = false, mode = 'minimized', expanded = false, unread = 0, messageCount = null;
  let returnFocus = null, readFrame = 0;
  const dialog = node('dialog', 'floating-chat'); dialog.id = 'floating-team-chat';
  dialog.setAttribute('aria-labelledby', 'floating-chat-title');
  dialog.setAttribute('aria-describedby', 'floating-chat-privacy');
  const header = node('header', 'floating-chat-header');
  const back = iconButton('back', 'Volver al aula', 'floating-chat-back');
  const avatars = node('span', 'floating-chat-avatars'); avatars.setAttribute('aria-hidden', 'true');
  const heading = node('div', 'floating-chat-heading');
  const title = node('h2', '', 'Chat del equipo'); title.id = 'floating-chat-title';
  const presence = node('p', 'floating-chat-presence', 'Solo tu equipo');
  heading.append(title, presence);
  const minimize = iconButton('minimize', 'Minimizar chat');
  const expand = iconButton('expand', 'Ampliar chat', 'floating-chat-expand'); expand.setAttribute('aria-pressed', 'false');
  const close = iconButton('close', 'Cerrar chat');
  header.append(back, avatars, heading, minimize, expand, close);
  const tools = node('div', 'floating-chat-tools');
  const privacy = node('span', '', demo ? 'Demostración · mensajes ficticios' : 'Conversación privada del equipo');
  privacy.id = 'floating-chat-privacy';
  const preferences = node('details', 'chat-notification-settings');
  const summary = node('summary'); summary.title = 'Notificaciones del chat'; summary.setAttribute('aria-label', 'Notificaciones del chat');
  summary.append(chatIcon('bell'));
  const settingsBody = node('div', 'chat-notification-settings-body');
  preferences.append(summary, settingsBody);
  if (settings) settings.mount(settingsBody);
  else settingsBody.append(node('p', '', 'Los avisos de esta demostración aparecen en la burbuja del chat. No se envían notificaciones reales.'));
  tools.append(privacy, preferences);
  const empty = node('p', 'floating-chat-empty', 'Elige un equipo en «Aula y temas» para conversar y compartir archivos.');
  const latest = node('button', 'floating-chat-latest', 'Ver mensajes nuevos ↓'); latest.type = 'button'; latest.hidden = true;
  dialog.append(header, tools, empty, host, latest);
  const bubble = node('button', 'floating-chat-bubble'); bubble.type = 'button'; bubble.hidden = true;
  bubble.setAttribute('aria-haspopup', 'dialog'); bubble.setAttribute('aria-controls', dialog.id);
  const bubbleAvatars = node('span', 'floating-chat-bubble-avatars'); bubbleAvatars.setAttribute('aria-hidden', 'true');
  const count = node('span', 'floating-chat-count'); count.hidden = true; count.setAttribute('aria-hidden', 'true');
  bubble.append(bubbleAvatars, count);
  const announcement = node('span', 'screen-reader-only'); announcement.setAttribute('role', 'status');
  document.body.append(dialog, bubble, announcement);
  launcher.setAttribute('aria-controls', dialog.id); launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  const box = () => host.querySelector('.chat-messages');
  const atEnd = () => { const list = box(); return !list || list.scrollHeight - list.scrollTop - list.clientHeight < 55; };
  const covered = () => document.documentElement.dataset.aulaGuideOpen === 'true' ||
    [...document.querySelectorAll('dialog[open]')].some(other => other !== dialog && other.matches(':modal'));
  const isReading = () => enabled && mode === 'open' && dialog.open && !document.hidden && !covered() && atEnd();
  function readIfVisible() { if (conversation && isReading()) onRead(); }
  function fitPreferences() {
    if (!preferences.open) return;
    const rect = summary.getBoundingClientRect(), view = window.visualViewport;
    const top = view?.offsetTop || 0, bottom = top + (view?.height || window.innerHeight);
    const above = Math.max(0, rect.top - top - 12), below = Math.max(0, bottom - rect.bottom - 12);
    const upward = below < 260 && above > below;
    preferences.classList.toggle('opens-up', upward);
    settingsBody.style.setProperty('--chat-notification-max-height', Math.max(44, upward ? above : below) + 'px');
  }
  preferences.addEventListener('toggle', fitPreferences);
  function viewport() {
    const view = window.visualViewport;
    dialog.style.setProperty('--chat-viewport-height', (view?.height || window.innerHeight) + 'px');
    dialog.style.setProperty('--chat-viewport-top', (view?.offsetTop || 0) + 'px');
    fitPreferences();
  }
  function paint() {
    const open = enabled && mode === 'open';
    if (!open && dialog.open) dialog.close();
    if (open && !dialog.open) {
      viewport();
      if (mobile.matches && !covered()) dialog.showModal(); else dialog.show();
    }
    dialog.classList.toggle('is-expanded', expanded);
    dialog.classList.toggle('is-mobile', mobile.matches);
    dialog.classList.toggle('is-empty-conversation', !conversation || messageCount === 0);
    empty.hidden = !!conversation;
    bubble.hidden = !enabled || !conversation || mode !== 'minimized';
    launcher.setAttribute('aria-expanded', String(open));
    latest.hidden = !open || !unread || atEnd();
  }
  function focusBack() {
    const target = !bubble.hidden ? bubble : returnFocus?.isConnected ? returnFocus : launcher;
    target.focus({ preventScroll: true });
  }
  function hide(next) { mode = next; preferences.open = false; paint(); focusBack(); }
  function open() {
    if (!enabled) return;
    returnFocus = document.activeElement; mode = 'open'; onOpen(); paint();
    const list = box();
    if (list && (!list.dataset.opened || unread)) { list.dataset.opened = 'true'; list.scrollTop = list.scrollHeight; }
    // Focus a header control on phones so opening does not summon the keyboard.
    (mobile.matches ? back : minimize).focus({ preventScroll: true });
    readIfVisible();
  }
  bubble.addEventListener('click', open);
  minimize.addEventListener('click', () => hide('minimized'));
  back.addEventListener('click', () => hide('minimized'));
  close.addEventListener('click', () => hide('closed'));
  expand.addEventListener('click', () => {
    expanded = !expanded;
    expand.setAttribute('aria-pressed', String(expanded));
    const label = expanded ? 'Restaurar tamaño del chat' : 'Ampliar chat';
    expand.title = label; expand.setAttribute('aria-label', label);
    expand.replaceChildren(chatIcon(expanded ? 'restore' : 'expand')); paint();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); hide('minimized'); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide('minimized'); }
    // The classroom's movement shortcuts must never consume keys in the chat.
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) event.stopPropagation();
  });
  dialog.addEventListener('close', () => { if (!dialog.open && mode === 'open' && enabled) { mode = 'minimized'; paint(); } });
  host.addEventListener('scroll', () => {
    if (readFrame) return;
    readFrame = requestAnimationFrame(() => { readFrame = 0; readIfVisible(); paint(); });
  }, true);
  latest.addEventListener('click', () => { const list = box(); if (list) list.scrollTop = list.scrollHeight; readIfVisible(); paint(); });
  mobile.addEventListener('change', () => {
    // Reopen the same dialog in the appropriate native modal mode.
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    if (dialog.open) dialog.close();
    paint(); if (focused?.isConnected && mode === 'open') focused.focus({ preventScroll: true });
  });
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  document.addEventListener('visibilitychange', readIfVisible);
  document.addEventListener('aulajv:guide-visibility', event => {
    if (!event.detail?.open) {
      if (mobile.matches && dialog.open && !dialog.matches(':modal')) { dialog.close(); paint(); }
      readIfVisible();
    }
  });
  return {
    open, isReading,
    setEnabled(value) { enabled = !!value; paint(); },
    setMessageCount(value) {
      const next = Number.isInteger(value) && value >= 0 ? value : null;
      const changed = messageCount !== next;
      messageCount = next; paint();
      if (changed && preferences.open) requestAnimationFrame(fitPreferences);
    },
    setConversation(team) {
      const nextId = team?.key || team?.id || null;
      if (nextId !== conversation?.id) { mode = 'minimized'; expanded = false; unread = 0; messageCount = null; preferences.open = false; }
      conversation = team ? { ...team, id: nextId } : null;
      title.textContent = team?.name || 'Chat del equipo'; title.title = title.textContent;
      const members = team?.members || [];
      const faces = members.slice(0, 3).map(member => participantAvatar(member.name, member.avatar));
      avatars.replaceChildren(...faces);
      bubbleAvatars.replaceChildren(...members.slice(0, 2).map(member => participantAvatar(member.name, member.avatar)));
      if (!members.length) bubbleAvatars.append(chatIcon('bell'));
      bubble.setAttribute('aria-label', 'Abrir chat de ' + title.textContent + (unread ? `, ${unread} mensaje${unread === 1 ? '' : 's'} sin leer` : ''));
      paint();
    },
    setPresence(text, live = false) { presence.textContent = text; presence.dataset.live = String(live); },
    setUnread(value) {
      const before = unread; unread = Math.max(0, Number(value) || 0);
      count.hidden = !unread; count.textContent = unread > 99 ? '99+' : String(unread);
      bubble.setAttribute('aria-label', 'Abrir chat de ' + title.textContent + (unread ? `, ${unread} mensaje${unread === 1 ? '' : 's'} sin leer` : ''));
      if (unread > before) {
        if (mode === 'closed') mode = 'minimized';
        announcement.textContent = unread === 1 ? 'Tienes un mensaje nuevo de tu equipo.' : `Tienes ${unread} mensajes nuevos de tu equipo.`;
      }
      paint();
    },
    reset() { conversation = null; mode = 'minimized'; expanded = false; unread = 0; messageCount = null; enabled = false; paint(); }
  };
}
