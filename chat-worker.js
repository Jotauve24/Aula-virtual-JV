// Notifications only: no offline caching or interception of classroom requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function chatURL(courseId, topicId) {
  const url = new URL('live.html', self.registration.scope);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(courseId || '')) url.searchParams.set('resume_id', courseId);
  if (uuid.test(topicId || '')) url.searchParams.set('chat', topicId);
  return url.href;
}
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* A generic visible notice is always safe. */ }
  const data = {courseId:String(message.courseId || ''),topicId:String(message.topicId || '')};
  event.waitUntil(self.registration.showNotification('AulavirtualJV', {
    body:'Tienes un mensaje nuevo de tu equipo. Abre el chat para leerlo.',
    icon:new URL('assets/icons/app-icon-192.png', self.registration.scope).href,
    badge:new URL('assets/icons/notification-badge.png', self.registration.scope).href,
    tag:'aula-team-' + data.topicId,
    renotify:true, data
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const target = chatURL(data.courseId, data.topicId);
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => client.frameType === 'top-level' && client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      existing.postMessage({type:'aula:chat-notification',...data});
      // The active page handles matching conversations without reloading drafts.
      // A different page receives a safe, same-origin navigation request.
      return;
    }
    await self.clients.openWindow(target);
  })());
});
