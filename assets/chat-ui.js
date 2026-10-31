import { fileSizeLabel } from './attachments.js?v=0.27.7';
import { avatarSVG } from './world.js?v=0.27.7';
// Stable student IDs distinguish participants who share a display name.
// Share one palette between the roster and the conversation, scoped to a team.
const TONES = [
  ['var(--accent)', 'var(--accent-soft)', 'var(--opal)'],
  ['var(--red)', 'var(--red-soft)', 'var(--salmon)'],
  ['var(--warning-ink)', 'var(--warning-soft)', 'var(--peach)'],
  ['var(--positive)', 'var(--positive-soft)', 'var(--sage)'],
  ['var(--deep)', 'var(--champagne)', 'var(--opal)'],
  ['#315d59', '#e8f0ee', 'var(--seafoam)'],
  ['#823a46', '#f8e7e5', 'var(--salmon)'],
  ['#5a5438', '#f4efdf', 'var(--champagne)'],
  ['#3c595f', '#e9efef', 'var(--opal)'],
  ['#794a36', '#fbeddf', 'var(--peach)'],
  ['#476044', '#edf1e8', 'var(--sage)'],
  ['#4a4941', '#f0ede3', 'var(--champagne)']
];

function nameKey(name) {
  return String(name || 'Integrante').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function createParticipantPalette(members = []) {
  const colors = new Map();
  const occupied = new Set();
  function colorFor(name) {
    const key = nameKey(name);
    if (!colors.has(key)) {
      let hash = 0;
      for (const character of key) hash = (Math.imul(hash, 31) + character.codePointAt(0)) >>> 0;
      let index = hash % TONES.length;
      if (colors.size < TONES.length) {
        while (occupied.has(index)) index = (index + 1) % TONES.length;
        occupied.add(index);
      }
      // Larger teams keep distinct shades within the same palette families.
      const hue = [187, 351, 24, 118, 201, 166][colors.size % 6];
      const lightness = 24 + (Math.floor(colors.size / 6) % 20) * .5;
      const tone = colors.size < TONES.length ? TONES[index]
        : [`hsl(${hue.toFixed(2)} 28% ${lightness}%)`, `hsl(${hue.toFixed(2)} 32% 94%)`, `hsl(${hue.toFixed(2)} 24% 74%)`];
      colors.set(key, { accent: tone[0], background: tone[1], border: tone[2] });
    }
    return colors.get(key);
  }
  // Sorting makes the first assignment independent of the roster's API order.
  [...new Set(members.map(member => nameKey(member.id || member.name)))].sort().forEach(colorFor);
  return colorFor;
}

export function applyParticipantColor(node, color) {
  node.style.setProperty('--chat-accent', color.accent);
  node.style.setProperty('--chat-background', color.background);
  node.style.setProperty('--chat-border', color.border);
}

export function participantAvatar(name, look) {
  const words = String(name || 'Integrante').trim().split(/\s+/);
  const avatar = document.createElement('span');
  avatar.className = 'chat-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  if (look && typeof look === 'object') {
    avatar.classList.add('has-pixel-avatar');
    // avatarSVG uses the existing bounded pixel-avatar renderer, not user HTML.
    avatar.innerHTML = avatarSVG(look);
    return avatar;
  }
  avatar.textContent = (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toLocaleUpperCase('es');
  return avatar;
}

export function chatMessage(msg, color, downloadAttachment) {
  const entry = document.createElement('div');
  entry.className = 'chat-message' + (msg.mine ? ' mine' : '');
  entry.dataset.messageId = String(msg.id);
  applyParticipantColor(entry, color);
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  const meta = document.createElement('div');
  meta.className = 'chat-message-meta';
  const sender = document.createElement('strong');
  sender.className = 'chat-sender';
  sender.textContent = msg.name;
  if (msg.mine) {
    const you = document.createElement('span');
    you.className = 'chat-you';
    you.textContent = 'Tú';
    sender.append(you);
  }
  const time = document.createElement('time');
  const when = new Date(msg.createdAt);
  time.dateTime = msg.createdAt;
  time.textContent = when.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' });
  time.title = when.toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' });
  const body = document.createElement('p');
  body.className = 'chat-message-body';
  body.textContent = msg.body;
  meta.append(sender, time);
  bubble.append(meta);
  if (msg.body) bubble.append(body);
  if (msg.attachment) {
    const file = document.createElement('button'); file.type = 'button'; file.className = 'chat-file';
    const title = document.createElement('strong'); title.textContent = msg.attachment.name;
    const detail = document.createElement('span'); detail.textContent = fileSizeLabel(msg.attachment.size) + ' · Descargar';
    file.append(title, detail);
    file.addEventListener('click', async () => {
      file.disabled = true; detail.textContent = 'Descargando…';
      try { await downloadAttachment(msg.attachment); detail.textContent = fileSizeLabel(msg.attachment.size) + ' · Descargar de nuevo'; }
      catch(error) { detail.textContent = error.message + ' · Reintentar'; }
      finally { file.disabled = false; }
    });
    bubble.append(file);
  }
  entry.append(participantAvatar(msg.name, msg.avatar), bubble);
  return entry;
}

