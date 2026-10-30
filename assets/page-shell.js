// The outer document stays mounted while the four Aula pages navigate inside it.
// This file is intentionally a blocking, classic script: only the content frame
// executes the application modules, so sessions and presence are initialized once.
(() => {
  const scriptURL = document.currentScript.src;
  const baseURL = new URL('../', scriptURL);
  const pages = new Set(['', 'index.html', 'live.html', 'docente.html', 'docente-sala.html']);
  const isContent = (() => {
    try { return !!window.frameElement?.hasAttribute('data-aula-content'); }
    catch { return false; }
  })();

  function notifyHost() {
    window.parent.postMessage({ type: 'aula:location' }, location.origin);
  }

  async function startContent() {
    // Forward both full navigation and in-place callback/hash cleanup. No token
    // or URL is sent in a message; the host reads its own same-origin frame.
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method].bind(history);
      history[method] = (...args) => {
        const result = original(...args);
        notifyHost();
        return result;
      };
    }
    window.addEventListener('hashchange', notifyHost);
    window.addEventListener('popstate', notifyHost);
    window.addEventListener('pageshow', notifyHost);
    const title = document.querySelector('title');
    if (title && typeof MutationObserver === 'function')
      new MutationObserver(notifyHost).observe(title, { childList: true, subtree: true, characterData: true });

    try {
      for (const module of document.querySelectorAll('link[data-aula-module]'))
        await import(module.href);
      notifyHost();
    } catch {
      const notice = document.createElement('div');
      notice.className = 'aula-load-error';
      notice.setAttribute('role', 'alert');
      const text = document.createElement('p');
      text.textContent = 'No se pudo cargar el aula. Vuelve a intentarlo.';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Volver a cargar';
      retry.addEventListener('click', () => location.reload());
      notice.append(text, retry);
      document.body.append(notice);
    }
  }

  function startHost() {
    const frame = document.createElement('iframe');
    frame.id = 'aula-content-frame';
    frame.name = 'aula-content';
    frame.title = 'Contenido de AulavirtualJV';
    frame.setAttribute('data-aula-content', '');
    frame.setAttribute('data-aula-embedded', String(window.self !== window.top));
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.src = location.href;

    function syncLocation() {
      try {
        const next = new URL(frame.contentWindow.location.href);
        if (next.origin !== baseURL.origin || !next.pathname.startsWith(baseURL.pathname) ||
            !pages.has(next.pathname.slice(baseURL.pathname.length))) return;
        if (next.href !== location.href)
          history.replaceState(null, '', next.pathname + next.search + next.hash);
        document.title = frame.contentDocument.title || 'AulavirtualJV';
      } catch { /* An external authentication provider is never inspected. */ }
    }
    frame.addEventListener('load', syncLocation);
    window.addEventListener('message', event => {
      if (event.origin === location.origin && event.source === frame.contentWindow &&
          event.data?.type === 'aula:location') syncLocation();
    });
    if (typeof navigator !== 'undefined') navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type !== 'aula:chat-notification' ||
          event.source?.scriptURL !== new URL('chat-worker.js', baseURL).href) return;
      const { courseId, topicId } = event.data;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuid.test(courseId || '') || !uuid.test(topicId || '')) return;
      try {
        const current = new URL(frame.contentWindow.location.href);
        const sameCourse = frame.contentDocument.body.dataset.chatCourse === courseId;
        const sameTeam = frame.contentDocument.body.dataset.chatTopic === topicId;
        if (current.origin === baseURL.origin && current.pathname === new URL('live.html',baseURL).pathname && sameCourse && sameTeam) {
          frame.contentWindow.postMessage({type:'aula:chat-notification',courseId,topicId},baseURL.origin);
        } else {
          const target = new URL('live.html',baseURL);
          target.searchParams.set('resume_id',courseId);target.searchParams.set('chat',topicId);
          frame.src = target.href;
        }
      } catch { /* An external sign-in is never inspected or interrupted. */ }
    });
    document.body.replaceChildren(frame);
  }

  if (!isContent) document.documentElement.classList.add('aula-shell');
  const start = isContent ? startContent : startHost;
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
