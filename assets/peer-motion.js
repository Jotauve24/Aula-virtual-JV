import { canWalkSegment, findPath, isWalkable } from './world-layout.js?v=0.27.8';

// The server owns membership and positions. This only fills in the visible
// journey between authorized snapshots; animation never sends network requests.
export function createPeerMotion() {
  const actors = new Map();
  let geometry = null;
  function advance(actor, now) {
    // A slow frame must not consume the whole route in one visible jump.
    let distance = Math.min(.05,Math.max(0, now - actor.at) / 1000) * actor.speed;
    actor.at = now;
    while (actor.route.length) {
      const next = actor.route[0], dx = next.x - actor.x, dy = next.y - actor.y;
      const gap = Math.hypot(dx,dy);
      if (gap < 1e-7) { actor.x=next.x; actor.y=next.y; actor.route.shift(); continue; }
      actor.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (distance + 1e-7 < gap) {
        actor.x += dx / gap * distance; actor.y += dy / gap * distance; break;
      }
      actor.x = next.x; actor.y = next.y; distance = Math.max(0,distance-gap); actor.route.shift();
    }
    if (!actor.route.length) actor.direction = actor.data.direction || actor.direction;
  }
  function reset() { actors.clear(); geometry = null; }
  return {
    reset,
    update(rows, layout, now) {
      if (geometry !== layout) { reset(); geometry = layout; }
      const present = new Set();
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || present.has(row.id) || !isWalkable(row.x,row.y,layout)) continue;
        present.add(row.id);
        let actor = actors.get(row.id);
        if (!actor) {
          actors.set(row.id,{data:{...row},x:row.x,y:row.y,direction:row.direction || 'down',route:[],
            target:{x:row.x,y:row.y},at:now,packetAt:now,speed:135,offset:0,offsetTarget:0,offsetAt:now});
          continue;
        }
        advance(actor,now); actor.data = { ...row };
        if (Math.hypot(row.x-actor.target.x,row.y-actor.target.y) > .25) {
          const route = findPath(actor,row,layout);
          const last = route.at(-1);
          if (last && Math.hypot(last.x-row.x,last.y-row.y) < 1) {
            let from = actor, length = 0;
            for (const point of route) { length += Math.hypot(point.x-from.x,point.y-from.y); from = point; }
            const seconds = Math.max(.25,Math.min(1.1,(now-actor.packetAt)/1000));
            actor.route = route; actor.speed = Math.max(45,Math.min(210,length/seconds));
            actor.target = {x:row.x,y:row.y};
          }
        }
        actor.packetAt = now;
      }
      for (const id of actors.keys()) if (!present.has(id)) actors.delete(id);
    },
    sample(now, player = null) {
      const occupied = player ? [{x:player.x,y:player.y}] : [];
      const result = [];
      // Stable order prevents changing network response order from shuffling avatars.
      for (const [id,actor] of [...actors].sort(([a],[b])=>a.localeCompare(b))) {
        advance(actor,now);
        let targetOffset = 0;
        for (const offset of [0,actor.offsetTarget,-32,32,-64,64,-96,96]) {
          const point = {x:actor.x+offset,y:actor.y};
          if (canWalkSegment(actor,point,geometry) &&
            !occupied.some(other=>Math.abs(other.x-point.x)<27 && Math.abs(other.y-point.y)<45)) {
            targetOffset = offset; break;
          }
        }
        actor.offsetTarget = targetOffset;
        occupied.push({x:actor.x+targetOffset,y:actor.y});
        const budget = Math.min(.05,Math.max(0,now-actor.offsetAt) / 1000) * 120;
        actor.offset += Math.max(-budget,Math.min(budget,targetOffset-actor.offset));
        actor.offsetAt = now;
        // Visual separation may not put a companion across a wall or a desk.
        while (Math.abs(actor.offset)>.1 && !canWalkSegment(actor,{x:actor.x+actor.offset,y:actor.y},geometry)) actor.offset /= 2;
        result.push({...actor.data,id,x:actor.x+actor.offset,y:actor.y,direction:actor.direction,
          walking:actor.route.length>0,smoothPosition:true});
      }
      return result;
    },
    moving() { return [...actors.values()].some(actor=>actor.route.length || Math.abs(actor.offsetTarget-actor.offset)>.25); }
  };
}
