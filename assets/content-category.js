// Decorative category symbols. Names always remain visible beside them.
const paths = Object.freeze({
  note: '<path d="M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8M8 12h5"/>',
  infographic: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16v-4m5 4V8m5 8v-6M7 7h1"/>',
  document: '<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 11h7M9 15h7M9 19h4"/>',
  presentation: '<path d="M3 4h18v13H3zM8 22l4-5 4 5M8 13V9m4 4V7m4 6v-3"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2m0-16c4-3 8-2 10-1v15c-3-1-7-1-10 2V5Z"/>',
  video: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  digital_tool: '<rect x="2" y="3" width="20" height="16" rx="2"/><path d="M2 8h20M6 5.5h.01M9 5.5h.01m1 5 8 5-4 1-1 4z"/>'
});
const overview = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
const markers = new WeakMap();
function knownKind(value) { return Object.hasOwn(paths, value) ? value : ''; }
function drawIcon(node, kind) {
  node.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
    (paths[knownKind(kind)] || overview) + '</svg>';
}
export function categoryIcon(kind, root = document) {
  const node = root.createElement('span'); node.className = 'content-category-icon'; node.setAttribute('aria-hidden', 'true');
  drawIcon(node, kind); return node;
}
export function decorateCategoryLabel(node, kind, root = document) {
  node.setAttribute('data-category', knownKind(kind)); node.append(categoryIcon(kind, root)); return node;
}
export function decorateCategorySelect(container, kind, root = document) {
  if (!markers.has(container)) {
    const icon = categoryIcon(kind, root); container.append(icon); markers.set(container, icon);
    container.className = ((container.className || '') + ' content-category-select').trim();
  }
  container.setAttribute('data-category', knownKind(kind)); drawIcon(markers.get(container), kind);
}
