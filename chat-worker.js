// Notifications only: no offline caching or interception of classroom requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const badgeUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badgeKey = data => badgeUUID.test(data?.courseId || '') && badgeUUID.test(data?.topicId || '')
  ? data.courseId + '/' + data.topicId : '';
let badgeDatabase, badgeTasks = Promise.resolve(), pendingBadges = new Map();
function openBadgeDatabase() {
  if (!self.indexedDB) return Promise.resolve(null);
  if (!badgeDatabase) badgeDatabase = new Promise((resolve, reject) => {
    const request = self.indexedDB.open('aula-chat-badges', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', {keyPath:'key'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Badge storage unavailable'));
  }).catch(() => null);
  return badgeDatabase;
}
const messageId = value => /^\d{1,19}$/.test(String(value || '')) ? String(value) : '0';
const newerId = (a,b) => BigInt(messageId(a)) > BigInt(messageId(b)) ? messageId(a) : messageId(b);
function changePending(map, key, unread, reset, data) {
  const now = Date.now();
  if (reset) map.clear();
  else if (key) {
    const previous = map.get(key) || {};
    const seen = newerId(previous.seenId,data.lastSeenId);
    const newest = newerId(previous.messageId,unread ? data.messageId || data.lastMessageId : '0');
    // A late response must not dismiss a push for a newer message. Retaining
    // the read watermark also prevents a delayed push from restoring its badge.
    const pending = newest === '0' ? !!unread : BigInt(newest) > BigInt(seen);
    map.set(key,{unread:pending,messageId:newest,seenId:seen,updatedAt:now});
  }
  for (const [id, value] of map) if (value.updatedAt < now - 90 * 86400000) map.delete(id);
  if (map.size > 200) for (const [id] of [...map].sort((a,b) => a[1].updatedAt-b[1].updatedAt).slice(0,map.size-200)) map.delete(id);
  return map;
}
async function storePending(key, unread, reset, data) {
  const db = await openBadgeDatabase();
  if (db) try {
    pendingBadges = await new Promise((resolve, reject) => {
      const transaction = db.transaction('pending', 'readwrite'), store = transaction.objectStore('pending');
      let values;
      const request = store.getAll();
      request.onsuccess = () => {
        values = changePending(new Map(request.result.map(row => [row.key,row])),key,unread,reset,data);
        store.clear(); for (const [id, value] of values) store.put({key:id,...value});
      };
      transaction.oncomplete = () => resolve(values);
      transaction.onerror = transaction.onabort = () => reject(new Error('Badge storage unavailable'));
    });
  } catch { changePending(pendingBadges,key,unread,reset,data); }
  else changePending(pendingBadges,key,unread,reset,data);
}
async function closeReadNotifications(data, reset) {
  if (!self.registration.getNotifications) return;
  try {
    for (const notice of await self.registration.getNotifications()) {
      if (reset && String(notice.tag || '').startsWith('aula-team-') ||
          !reset && notice.data?.courseId === data.courseId && notice.data?.topicId === data.topicId &&
          BigInt(messageId(notice.data.messageId)) <= BigInt(messageId(data.lastSeenId))) notice.close();
    }
  } catch { /* Dismissing a system notification is best effort. */ }
}
function updateBadge(data, unread, reset = false) {
  const key = badgeKey(data);
  if (!key && !reset) return Promise.resolve();
  const task = badgeTasks.then(async () => {
    await storePending(key,unread,reset,data);
    if (!unread || reset) await closeReadNotifications(data,reset);
    try {
      if ([...pendingBadges.values()].some(value => value.unread)) await self.navigator?.setAppBadge?.();
      else if (self.navigator?.clearAppBadge) await self.navigator.clearAppBadge();
      else await self.navigator?.setAppBadge?.(0);
    } catch { /* The user or OS may disable app-icon indicators. */ }
  });
  badgeTasks = task.catch(() => {});
  return badgeTasks;
}
self.addEventListener('message', event => {
  let source;
  try { source = new URL(event.source?.url); } catch { return; }
  const scope = new URL(self.registration.scope);
  if (source.origin !== scope.origin || !source.pathname.startsWith(scope.pathname)) return;
  if (event.data?.type === 'aula:chat-badge' && typeof event.data.unread === 'boolean')
    event.waitUntil(updateBadge(event.data,event.data.unread));
  else if (event.data?.type === 'aula:chat-badge-reset') event.waitUntil(updateBadge({},false,true));
});

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
  const data = {courseId:String(message.courseId || ''),topicId:String(message.topicId || ''),messageId:messageId(message.messageId)};
  const notification = self.registration.showNotification('AulavirtualJV', {
    body:'Tienes un mensaje nuevo de tu equipo. Abre el chat para leerlo.',
    icon:new URL('assets/icons/app-icon-192.png', self.registration.scope).href,
    badge:new URL('assets/icons/notification-badge.png', self.registration.scope).href,
    tag:'aula-team-' + data.topicId,
    renotify:true, data
  });
  // A badge accompanies the required visible notification; it never replaces it.
  event.waitUntil(Promise.allSettled([notification,updateBadge(data,true)]));
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
