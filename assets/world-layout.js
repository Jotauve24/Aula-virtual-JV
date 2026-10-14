// One geometry model drives the drawing, the click targets and every movement.
export function createRoomLayout(count = 0) {
  count = Math.max(0, Math.floor(Number(count) || 0));
  const rows = Math.max(1, Math.ceil(count / 2));
  const layout = { width: 800, height: rows * 240 + 80, rooms: [], commons: [], obstacles: [], spawn: { x: 400, y: rows * 240 + 40 } };
  for (let i = 0; i < count; i++) {
    const center = count % 2 === 1 && i === count - 1;
    const right = !center && i % 2 === 1;
    const x = center ? 250 : right ? 460 : 40, y = 40 + Math.floor(i / 2) * 240;
    const room = { x, y, w: 300, h: 220, right, center,
      label: { x: x + 150, y: y + 56 },
      desk: { x: x + 76, y: y + 76, w: 142, h: 74 },
      arrival: { x: x + 150, y: y + 182 },
      shelf: { x: x + 26, y: y + 12, w: 80, h: 32 },
      plant: { x: x + 256, y: y + 34, w: 28, h: 28 } };
    if (center) {
      // A centered final room bridges the hall above and the entrance below.
      // Both openings must be real gaps in the collision map, not just paint.
      room.walls = [
        { x, y, w: 130, h: 6 }, { x: x + 170, y, w: 130, h: 6 },
        { x, y: y + 214, w: 130, h: 6 }, { x: x + 170, y: y + 214, w: 130, h: 6 },
        { x, y, w: 6, h: 220 }, { x: x + 294, y, w: 6, h: 220 }
      ];
    } else {
      const doorX = right ? x : x + 294;
      room.walls = [
        { x, y, w: 300, h: 6 }, { x, y: y + 214, w: 300, h: 6 },
        { x: right ? x + 294 : x, y, w: 6, h: 220 },
        { x: doorX, y, w: 6, h: 130 }, { x: doorX, y: y + 200, w: 6, h: 20 }
      ];
    }
    layout.rooms.push(room);
    layout.obstacles.push(...room.walls, room.desk, room.shelf, room.plant);
  }
  if (count % 2) {
    const y = layout.rooms.at(-1).y;
    layout.commons = [
      { kind: 'reading', x: 40, y, objects: [
        { kind: 'shelf', x: 71, y: y + 18, w: 80, h: 35 },
        { kind: 'sofa', x: 55, y: y + 80, w: 118, h: 43 },
        { kind: 'table', x: 178, y: y + 142, w: 40, h: 31 },
        { kind: 'plant', x: 56, y: y + 159, w: 25, h: 25 }
      ] },
      { kind: 'lounge', x: 560, y, objects: [
        { kind: 'shelf', x: 590, y: y + 18, w: 80, h: 35 },
        { kind: 'sofa', x: 605, y: y + 130, w: 116, h: 43 },
        { kind: 'table', x: 623, y: y + 80, w: 50, h: 31 },
        { kind: 'plant', x: 714, y: y + 47, w: 28, h: 30 }
      ] }
    ];
    layout.obstacles.push(...layout.commons.flatMap(area => area.objects));
  }
  return layout;
}

// Assigned members have a stable place at their table, even when their browser
// is closed. These points also work as walkable positions when they return.
export function memberSeat(room, index) {
  const places = [
    [111, 170], [189, 170], [150, 192], [78, 190], [222, 190],
    [74, 165], [226, 165], [110, 193], [190, 193], [150, 170]
  ];
  const [dx, dy] = places[index % places.length];
  return { x: room.x + dx, y: room.y + dy };
}

const defaultLayout = createRoomLayout(3);
export function isWalkable(x, y, layout = defaultLayout) {
  const radius = 8;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 28 && x <= layout.width - 28 &&
    y >= 28 && y <= layout.height - 28 && !layout.obstacles.some(o =>
      x > o.x - radius && x < o.x + o.w + radius && y > o.y - radius && y < o.y + o.h + radius);
}

export function canWalkSegment(from, to, layout = defaultLayout) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, layout)) return false;
  }
  return true;
}

export function findPath(from, to, layout = defaultLayout) {
  if (!isWalkable(from.x, from.y, layout)) return [];
  const step = 10, cols = Math.ceil(layout.width / step), rows = Math.ceil(layout.height / step);
  const point = index => ({ x: index % cols * step, y: Math.floor(index / cols) * step });
  let start = -1, closest = Infinity;
  // Connect the current, possibly mid-animation position to a visible grid node.
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const p = { x: Math.round(from.x / step) * step + dx * step, y: Math.round(from.y / step) * step + dy * step };
    const distance = Math.hypot(p.x - from.x, p.y - from.y);
    if (distance < closest && canWalkSegment(from, p, layout)) {
      start = p.y / step * cols + p.x / step; closest = distance;
    }
  }
  if (start < 0) return [];
  const queue = [start], parents = new Map([[start, null]]);
  let best = start, bestDistance = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i], p = point(current);
    const distance = (p.x - to.x) ** 2 + (p.y - to.y) ** 2;
    if (distance < bestDistance) { best = current; bestDistance = distance; }
    if (distance < 1) break;
    for (const [dx, dy] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      if (next.x < 0 || next.x >= cols * step || next.y < 0 || next.y >= rows * step) continue;
      const key = next.y / step * cols + next.x / step;
      if (!parents.has(key) && canWalkSegment(p, next, layout)) { parents.set(key, current); queue.push(key); }
    }
  }
  const path = [];
  for (let p = best; p !== null; p = parents.get(p)) path.unshift(point(p));
  if (Math.hypot(path[0].x - from.x, path[0].y - from.y) < .1) path.shift();
  const last = path.at(-1) || from;
  if (canWalkSegment(last, to, layout) && Math.hypot(last.x - to.x, last.y - to.y) < step * 2) path.push(to);
  return path;
}

