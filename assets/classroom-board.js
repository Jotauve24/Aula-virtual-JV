// Read-only views of the notice and presence data already authorized for this aula.
// Opening a preview never confirms a notice or changes a student's team.
export function createClassroomBoard({ root = document, avatar, onOpenNotices, onLocate }) {
  const host = root.querySelector('#classroom-board');
  const node = (tag, text = '', className = '') => {
    const value = root.createElement(tag); value.textContent = text; value.className = className; return value;
  };
  const notices = node('section', '', 'classroom-board-section');
  const noticeHeading = node('h2', 'Avisos del docente'); noticeHeading.id = 'board-notices-heading';
  notices.setAttribute('aria-labelledby', noticeHeading.id);
  const noticeState = node('p', '', 'board-caption'); noticeState.setAttribute('role','status');
  const noticeTitle = node('h3', '', 'board-notice-title');
  const noticeBody = node('p', '', 'board-notice-body');
  const openNotices = node('button', 'Ver avisos →', 'board-text-button');
  openNotices.type = 'button'; openNotices.setAttribute('aria-haspopup','dialog');
  openNotices.addEventListener('click', () => onOpenNotices(openNotices));
  notices.append(noticeHeading,noticeState,noticeTitle,noticeBody,openNotices);

  const people = node('section', '', 'classroom-board-section');
  const peopleHeading = node('h2', 'En el aula ahora'); peopleHeading.id = 'board-people-heading';
  people.setAttribute('aria-labelledby', peopleHeading.id);
  const peopleState = node('p', '', 'board-caption'); peopleState.setAttribute('role','status');
  const list = node('ul', '', 'board-people'); list.id = 'board-people-list'; list.tabIndex = -1;
  const hint = node('p', 'Pulsa un avatar para encontrarlo en el mapa.', 'board-hint');
  const more = node('button', '', 'board-text-button'); more.type = 'button';
  more.setAttribute('aria-controls',list.id);
  people.append(peopleHeading,peopleState,list,hint,more);
  host.replaceChildren(notices,people);
  let rows = [], expanded = false, signature = '', noticeSignature = '', selected = '';

  function renderPeople() {
    const focused = root.activeElement?.dataset?.boardPerson;
    list.replaceChildren(...(expanded ? rows : rows.slice(0,3)).map(person => {
      const item = node('li'), button = node('button', '', 'board-person'); button.type = 'button';
      button.dataset.boardPerson = person.id;
      button.setAttribute('aria-label', `Encontrar a ${person.name}${person.mine ? ' (tú)' : ''} en el mapa`);
      button.setAttribute('aria-pressed',String(person.id === selected));
      const picture = node('span', '', 'board-person-avatar'); picture.setAttribute('aria-hidden','true');
      // Only the existing bounded pixel renderer supplies markup; names stay text.
      picture.innerHTML = avatar(person.avatar);
      const text = node('span', '', 'board-person-text');
      text.append(node('strong',person.name + (person.mine ? ' · Tú' : '')), node('small',person.team));
      const locate = node('span', '↗', 'board-person-locate'); locate.setAttribute('aria-hidden','true');
      button.append(picture,text,locate);
      button.addEventListener('click', () => onLocate(person.id));
      item.append(button); return item;
    }));
    more.hidden = rows.length <= 3;
    more.textContent = expanded ? 'Ver menos' : `Ver todos (${rows.length})`;
    more.setAttribute('aria-expanded',String(expanded));
    list.dataset.expanded = String(expanded);
    if (focused) {
      const replacement = [...list.children].map(item=>item.children[0]).find(button=>button.dataset.boardPerson===focused);
      (replacement || (more.hidden ? list : more)).focus({preventScroll:true});
    }
  }
  more.addEventListener('click', () => { expanded = !expanded; renderPeople(); });
  function setSelected(id = '') {
    selected = id;
    for (const item of list.children) {
      const button = item.children[0]; button.setAttribute('aria-pressed',String(button.dataset.boardPerson===id));
    }
  }
  function reset() {
    rows = []; expanded = false; signature = noticeSignature = ''; selected = ''; host.hidden = true;
    noticeTitle.textContent = noticeBody.textContent = noticeState.textContent = '';
    noticeTitle.hidden = noticeBody.hidden = true; openNotices.disabled = true;
    peopleState.textContent = 'Comprobando conexión…'; list.replaceChildren(); more.hidden = hint.hidden = true;
    notices.dataset.pending = 'false';
  }
  reset();
  return {
    reset, setSelected,
    setNotices({ state, rows: noticesForStudent = [], pendingCount = 0 }) {
      if (state === 'hidden') { reset(); return; }
      host.hidden = false;
      const latest = [...noticesForStudent].filter(row=>!row.retiredAt)
        .sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0))[0];
      const nextSignature = JSON.stringify([state,pendingCount,latest]);
      if (noticeSignature === nextSignature) return;
      noticeSignature = nextSignature;
      noticeState.textContent = state === 'loading' ? 'Comprobando avisos…'
        : state === 'unavailable' ? 'Sin actualizar · revisa tu conexión'
        : pendingCount ? `${pendingCount} ${pendingCount===1 ? 'aviso por confirmar' : 'avisos por confirmar'}`
        : latest ? 'Lectura confirmada' : 'Tu docente todavía no ha publicado avisos para ti.';
      notices.dataset.pending = String(state === 'ready' && pendingCount > 0);
      const excerpt = Array.from(latest?.body || '');
      noticeTitle.textContent = latest?.title || '';
      noticeBody.textContent = excerpt.slice(0,180).join('').trimEnd() + (excerpt.length>180 ? '…' : '');
      noticeTitle.hidden = noticeBody.hidden = !latest;
      openNotices.hidden = state === 'ready' && !latest;
      openNotices.disabled = state === 'loading';
      openNotices.textContent = state === 'unavailable' ? 'Comprobar avisos →' : 'Ver avisos →';
    },
    setPresence({ self, peers = [], topics = [], state }) {
      if (!self?.id) return;
      host.hidden = false;
      const groups = new Map(topics.flatMap(topic=>(topic.members||[]).map(member=>[member.id,topic.name])));
      const unique = new Map();
      for (const person of [self,...peers]) {
        if (!person || typeof person.id !== 'string' || unique.has(person.id)) continue;
        unique.set(person.id,{
          id:person.id, name:person.name || 'Compañero', mine:person.id===self.id,
          avatar:person.role==='teacher' ? {character:'zombie'} : {...person.avatar},
          team:person.role==='teacher' ? 'Docente' : groups.get(person.id) || 'Sin equipo'
        });
      }
      const next = state === 'live' ? [...unique.values()].sort((a,b)=>Number(b.mine)-Number(a.mine)||a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id)) : [];
      const nextSignature = JSON.stringify([state,next]);
      if (signature === nextSignature) return;
      signature = nextSignature; rows = next;
      if (!rows.some(person=>person.id===selected)) selected='';
      peopleState.textContent = state === 'live' ? `${rows.length} ${rows.length===1 ? 'persona conectada' : 'personas conectadas'}`
        : state === 'reconnecting' ? 'No pudimos actualizar quién está en el aula.' : 'Comprobando conexión…';
      hint.textContent = state !== 'live' ? 'La lista volverá al recuperar la conexión.'
        : rows.length === 1 ? 'Tus compañeros aparecerán aquí cuando entren.' : 'Pulsa un avatar para encontrarlo en el mapa.';
      hint.hidden = false; renderPeople();
    }
  };
}
