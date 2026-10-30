const media = name => new URL('./tutorial/' + name + '?v=0.26.1', import.meta.url).href;

const GUIDES = {
  student: {
    title: 'Tu aula, paso a paso',
    description: 'Del código de tu materia a tu equipo y su chat.',
    video: 'estudiantes.mp4', mobile: 'estudiantes-vertical.mp4',
    poster: 'estudiantes.jpg', mobilePoster: 'estudiantes-vertical.jpg',
    captions: 'estudiantes.vtt',
    steps: [
      'Escribe el código de la materia que te compartió tu docente.',
      'Completa tu registro con tus datos, edad y documento. Si ya tienes un perfil, recupera tu cuenta para conservar tu avatar y equipo.',
      'Personaliza tu avatar y guarda tu personaje.',
      'Recorre el aula, revisa los cupos y elige un equipo. Confirma tu lugar para unirte.',
      'Abre «Mi equipo» para ver a tus compañeros. Tu correo es visible para tu equipo; tú decides si compartes también tu teléfono.',
      'Usa el chat de tu equipo para conversar y compartir archivos.'
    ]
  },
  teacher: {
    title: 'Tu panel, paso a paso',
    description: 'Crea materias y da seguimiento a tus equipos.',
    video: 'docentes.mp4', poster: 'docentes.jpg', captions: 'docentes.vtt',
    steps: [
      'Entra con tu cuenta docente autorizada. En «Mis materias», escribe el nombre de la sección, la cantidad de grupos y los cupos. Pulsa «Crear materia y código».',
      'Copia el código y compártelo con tu clase. Puedes editar el nombre de la materia sin cambiar el código que ya enviaste.',
      'En «Mesas y temas», edita temas y cupos o bloquea el ingreso a un grupo. En «Estudiantes y equipos», asigna o mueve integrantes; puedes autorizar una excepción si el grupo está lleno.',
      'El triángulo rojo marca «Matrícula por verificar». Es un aviso de seguimiento: confirma la matrícula en tu plataforma institucional y retira el aviso cuando corresponda.',
      'Crea el grupo de trabajo en tu plataforma institucional y después marca el check aquí. La campanita señala los grupos completos que aún no tienen esa marca.',
      'Descarga el listado para consultar documentos, edades, contactos y seguimiento de equipos.'
    ]
  }
};

// The player is created only after requesting help. No video is downloaded on entry.
export function mountVideoGuide(doc = document, win = window) {
  let dialog = null, video = null, trigger = null, currentKind = '';

  function notify(open) {
    if (open) doc.documentElement.dataset.aulaGuideOpen = 'true';
    else delete doc.documentElement.dataset.aulaGuideOpen;
    doc.dispatchEvent(new win.CustomEvent('aulajv:guide-visibility', { detail: { open } }));
  }

  function create() {
    dialog = doc.createElement('dialog');
    dialog.id = 'aula-guide-dialog';
    dialog.className = 'aula-guide-dialog';
    dialog.setAttribute('aria-labelledby', 'aula-guide-title');
    dialog.setAttribute('aria-describedby', 'aula-guide-description');
    dialog.innerHTML = '<div class="aula-guide-body"><div class="aula-guide-heading"><div>' +
      '<h2 id="aula-guide-title"></h2><p id="aula-guide-description"></p></div>' +
      '<button type="button" class="aula-guide-close" aria-label="Cerrar tutorial" title="Cerrar tutorial">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="aula-guide-screen"><video controls playsinline preload="none" aria-label="Tutorial con narración y subtítulos en español"><track kind="captions" srclang="es" label="Español" default></video></div>' +
      '<p class="aula-guide-error" role="status" hidden>No se pudo cargar el video. Puedes abrirlo aparte o leer los pasos aquí abajo.</p>' +
      '<div class="aula-guide-actions"><p>Pulsa reproducir para escuchar la guía.</p><a class="aula-guide-open-file" target="_blank" rel="noopener">Abrir video aparte ↗</a><a class="aula-guide-mobile-file" download="AulavirtualJV-tutorial-celular.mp4">Descargar para celular</a></div>' +
      '<details class="aula-guide-transcript"><summary>Leer los pasos</summary><ol></ol></details>' +
      '<p class="aula-guide-credit">Voz generada por IA · Datos de ejemplo</p></div>';
    doc.body.append(dialog);
    video = dialog.querySelector('video');
    const close = () => { video.pause(); dialog.close(); };
    dialog.querySelector('.aula-guide-close').addEventListener('click', close);
    dialog.addEventListener('cancel', () => video.pause());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    dialog.addEventListener('close', () => {
      video.pause();
      notify(false);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    video.addEventListener('error', () => { dialog.querySelector('.aula-guide-error').hidden = false; });
    // Leave playback paused after returning from another tab or browser history.
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) video.pause(); });
    win.addEventListener('pagehide', () => { video.pause(); if (dialog.open) dialog.close(); });
  }

  function open(kind, source) {
    const guide = GUIDES[kind];
    if (!guide || dialog?.open) return;
    trigger = source;
    if (!dialog) create();
    const portrait = !!guide.mobile && win.matchMedia('(max-width: 600px)').matches;
    const choice = kind + (portrait ? '-portrait' : '');
    if (currentKind !== choice) {
      video.pause();
      dialog.querySelector('#aula-guide-title').textContent = guide.title;
      dialog.querySelector('#aula-guide-description').textContent = guide.description;
      video.classList.toggle('is-portrait', portrait);
      video.poster = media(portrait ? guide.mobilePoster : guide.poster);
      video.querySelector('track').src = media(guide.captions);
      video.src = media(portrait ? guide.mobile : guide.video);
      const transcript = dialog.querySelector('.aula-guide-transcript');
      transcript.open = false;
      const list = transcript.querySelector('ol');
      list.replaceChildren(...guide.steps.map(text => {
        const item = doc.createElement('li'); item.textContent = text; return item;
      }));
      dialog.querySelector('.aula-guide-open-file').href = video.src;
      const mobile = dialog.querySelector('.aula-guide-mobile-file');
      mobile.hidden = !guide.mobile;
      if (guide.mobile) mobile.href = media(guide.mobile);
      dialog.querySelector('.aula-guide-error').hidden = true;
      currentKind = choice;
    } else if (video.ended) video.currentTime = 0;
    dialog.showModal();
    notify(true);
    dialog.querySelector('.aula-guide-close').focus({ preventScroll: true });
  }

  doc.addEventListener('click', event => {
    const button = event.target.closest?.('[data-guide-open]');
    if (!button) return;
    event.preventDefault();
    open(button.dataset.guideOpen, button);
  });
  return { open };
}

if (typeof document !== 'undefined') mountVideoGuide();
