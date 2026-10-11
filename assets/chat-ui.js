// The existing chat API identifies senders by their full display name.
// Share one palette between the roster and the conversation, scoped to a team.
const TONES = [
  ['#1e5ab3', '#eaf2ff', '#a8c5ef'],
  ['#8a3aad', '#f5ebfc', '#d7b7e8'],
  ['#a04616', '#fff0e4', '#e7be99'],
  ['#23744b', '#eaf6ee', '#abd4b8'],
  ['#aa365f', '#fdebf2', '#eab1c5'],
  ['#136d80', '#e6f5f8', '#9bccd5'],
  ['#6850a1', '#f0edfc', '#c7bce4'],
  ['#886200', '#fff7da', '#deca81'],
  ['#405d89', '#eaf0f8', '#b3c4dd'],
  ['#974139', '#fdeeea', '#e4b5ad'],
  ['#636c27', '#f3f5e2', '#c9d39b'],
  ['#7d5140', '#f8eee5', '#d9c2aa']
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
      // Larger teams keep distinct hues instead of recycling the first colors.
      const hue = (colors.size * 137.508 + 19) % 360;
      const tone = colors.size < TONES.length ? TONES[index]
        : [`hsl(${hue.toFixed(2)} 55% 30%)`, `hsl(${hue.toFixed(2)} 70% 94%)`, `hsl(${hue.toFixed(2)} 42% 74%)`];
      colors.set(key, { accent: tone[0], background: tone[1], border: tone[2] });
    }
    return colors.get(key);
  }
  // Sorting makes the first assignment independent of the roster's API order.
  [...new Set(members.map(member => nameKey(member.name)))].sort().forEach(colorFor);
  return colorFor;
}

export function applyParticipantColor(node, color) {
  node.style.setProperty('--chat-accent', color.accent);
  node.style.setProperty('--chat-background', color.background);
  node.style.setProperty('--chat-border', color.border);
}

export function participantAvatar(name) {
  const words = String(name || 'Integrante').trim().split(/\s+/);
  const avatar = document.createElement('span');
  avatar.className = 'chat-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toLocaleUpperCase('es');
  return avatar;
}

export function chatMessage(msg, color) {
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
  bubble.append(meta, body);
  entry.append(participantAvatar(msg.name), bubble);
  return entry;
}
