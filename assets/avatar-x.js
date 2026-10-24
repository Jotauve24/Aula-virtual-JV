import { findPath, isWalkable, canWalkSegment } from './world-layout.js?v=0.11.0';

// Decorative guest: floor-only route, no student identity or database access.
export const AVATAR_X_HEIGHT = 26;
const SPEED = 25;
const routeCache = new WeakMap();
function visiblePoint(target, layout) {
  if (isWalkable(target.x, target.y, layout)) return { ...target };
  for (let radius = 10; radius <= 90; radius += 10) {
    for (const [dx, dy] of [[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const point = {x:target.x+dx*radius,y:target.y+dy*radius};
      if (isWalkable(point.x,point.y,layout)) return point;
    }
  }
  return {...layout.spawn};
}
function heading(from, to) {
  const dx=to.x-from.x,dy=to.y-from.y;
  return Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
}
function prepareRoute(layout) {
  if (routeCache.has(layout)) return routeCache.get(layout);
  const home=visiblePoint(layout.spawn,layout);
  const segments=[];
  let position=home, duration=0, facing='down';
  const move=(target)=>{
    const goal=visiblePoint(target,layout);
    const path=canWalkSegment(position,goal,layout)?[goal]:findPath(position,goal,layout);
    for (const next of path) {
      if (!isWalkable(next.x,next.y,layout) ||
          !canWalkSegment(position,next,layout)) break;
      const length=Math.hypot(next.x-position.x,next.y-position.y);
      if (length<0.01) continue;
      const ms=length/SPEED*1000;
      facing=heading(position,next);
      segments.push({from:position,to:next,start:duration,end:duration+ms,
        facing,moving:true});
      duration+=ms;position=next;
    }
  };
  const pause=(ms)=>{
    segments.push({from:position,to:position,start:duration,end:duration+ms,
      facing,moving:false});
    duration+=ms;
  };
  const rooms=layout.rooms||[];
  if (rooms.length) {
    // Visit the groups via their real walkable entrances. Never cross a wall.
    for (const room of rooms) { move(room.arrival); pause(550); }
    for (const room of [...rooms].reverse()) { move(room.arrival); pause(380); }
  } else {
    const base=layout.height-125;
    for (const goal of [{x:360,y:Math.min(190,base)},{x:445,y:Math.min(235,base)},
      {x:420,y:Math.max(195,base)}]) {move(goal);pause(450);}
  }
  move(home);pause(1800);
  const route={segments,duration:Math.max(duration,1)};
  routeCache.set(layout,route);
  return route;
}
function segmentAt(segments,phase) {
  let a=0,b=segments.length-1;
  while (a<b) {
    const middle=(a+b)>>1;
    if (phase<segments[middle].end)b=middle;
    else a=middle+1;
  }
  return segments[a];
}
function routePosition(route, time) {
  const phase=((time%route.duration)+route.duration)%route.duration;
  const part=segmentAt(route.segments,phase);
  const ratio=!part.moving?0:Math.max(0,Math.min(1,(phase-part.start)/(part.end-part.start)));
  return {x:part.from.x+(part.to.x-part.from.x)*ratio,
    y:part.from.y+(part.to.y-part.from.y)*ratio,part};
}


export function avatarXFrame(layout, time = 0, reducedMotion = false) {
  if (!layout) return null;
  const clock = Number.isFinite(time) ? time : 0;
  const route = prepareRoute(layout);
  const frame = routePosition(route, reducedMotion ? 0 : clock + 19000);
  return { x: frame.x, y: frame.y, direction: frame.part.facing,
    moving: !reducedMotion && frame.part.moving,
    step: reducedMotion ? 0 : Math.floor(clock / 180) % 4 };
}
let sprite;
function getSprite() {
  if (!sprite && typeof Image !== 'undefined') {
    sprite = new Image();
    sprite.src = new URL('./avatar-x.png', import.meta.url).href;
  }
  return sprite;
}
export function drawAvatarX(ctx, frame) {
  const image = getSprite();
  if (!frame || !image?.complete || !image.naturalWidth) return;
  const cell = image.naturalWidth / 4;
  const column = { left: 0, right: 1, down: 2, up: 3 }[frame.direction] ?? 2;
  const height = AVATAR_X_HEIGHT / .88;
  const width = height * cell / image.naturalHeight;
  const x = Math.round(frame.x - width / 2);
  const y = Math.round(frame.y - height * .94);
  const bob = frame.moving && frame.step % 2 ? -1 : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3a514726'; ctx.fillRect(Math.round(frame.x - 7), Math.round(frame.y + 1), 14, 2);
  // Split below the hoodie so the boots alternate while the helmet stays steady.
  const split = Math.round(image.naturalHeight * .73);
  const topHeight = height * split / image.naturalHeight;
  ctx.drawImage(image, column * cell, 0, cell, split, x, y + bob, width, topHeight);
  const legWidth = cell / 2, legHeight = image.naturalHeight - split;
  for (let leg = 0; leg < 2; leg++) {
    const lift = frame.moving ? (leg === 0 ? [0,-1,0,1] : [0,1,0,-1])[frame.step] : 0;
    ctx.drawImage(image, column * cell + leg * legWidth, split, legWidth, legHeight,
      x + leg * width / 2, y + topHeight + lift, width / 2, height - topHeight);
  }
  ctx.restore();
}
