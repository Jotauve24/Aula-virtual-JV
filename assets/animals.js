import { findPath, isWalkable, canWalkSegment } from './world-layout.js?v=0.24.0';

// Ambient animals walk on the student collision map. Only the explicit table
// jumps leave that floor, so roaming never lets them pass through a wall.
export const ANIMAL_SPECIES = [
  { id: 'ocelot', speed: 27, stride: 145, pause: 2600, offset: 4100 },
  { id: 'panda', speed: 19, stride: 220, pause: 5600, offset: 21300 },
  { id: 'goat', speed: 25, stride: 170, pause: 3400, offset: 44800 },
  { id: 'cat', speed: 32, stride: 135, pause: 3200, offset: 15300 },
  { id: 'dog', speed: 29, stride: 150, pause: 4100, offset: 3800 }
];
const routeCache = new WeakMap();
const playCache = new WeakMap();

function freePoint(point, layout) {
  if (isWalkable(point.x, point.y, layout)) return { ...point };
  for (let radius = 10; radius <= 100; radius += 10) {
    for (const [dx, dy] of [[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const nearby = { x: point.x + dx * radius, y: point.y + dy * radius };
      if (isWalkable(nearby.x, nearby.y, layout)) return nearby;
    }
  }
  return { ...layout.spawn };
}
function direction(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
function floorPath(from, goal, layout, cache = new Map()) {
  const key = `${from.x},${from.y}:${goal.x},${goal.y}`;
  if (cache.has(key)) return cache.get(key);
  let points;
  if (canWalkSegment(from, goal, layout)) points = [from, goal];
  else {
    // Connect exact arrivals to reachable grid nodes without searching the
    // entire map for a target between nodes.
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const point = { x: Math.round(goal.x / 10) * 10 + dx * 10, y: Math.round(goal.y / 10) * 10 + dy * 10 };
      if (isWalkable(point.x, point.y, layout) && canWalkSegment(point, goal, layout)) candidates.push(point);
    }
    candidates.sort((a, b) => Math.hypot(a.x - goal.x, a.y - goal.y) - Math.hypot(b.x - goal.x, b.y - goal.y));
    points = [from, ...findPath(from, candidates[0] || goal, layout)];
    if (canWalkSegment(points.at(-1), goal, layout)) points.push(goal);
  }
  cache.set(key, points);
  if (Math.hypot(points.at(-1).x - goal.x, points.at(-1).y - goal.y) < 1)
    cache.set(`${goal.x},${goal.y}:${from.x},${from.y}`, [...points].reverse());
  return points;
}
function prepareRoutes(layout) {
  if (routeCache.has(layout)) return routeCache.get(layout);
  const firstY = layout.rooms[0]?.y || 40;
  const floorPaths = new Map();
  const homes = [{ x: 375, y: firstY + 196 }, { x: 424, y: firstY + 204 },
    { x: 410, y: layout.height - 66 }, { x: 415, y: firstY + 205 }, { x: 435, y: firstY + 196 }];
  const routes = ANIMAL_SPECIES.map((species, index) => {
    const home = freePoint(homes[index], layout);
    const route = { species, segments: [], motions: [], duration: 0, distance: 0 };
    let from = home, facing = 'down';
    function move(to, mode = 'floor', roomIndex = -1, speed = species.speed, event = '') {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance < .01) return;
      const duration = mode.startsWith('jump') ? 850 : distance / speed * 1000;
      facing = direction(from, to);
      const part = { from, to, facing, mode, roomIndex, event, moving: true,
        start: route.duration, end: route.duration + duration, duration,
        startDistance: route.distance, endDistance: route.distance + distance, distance };
      route.segments.push(part); route.motions.push(part);
      route.duration += duration; route.distance += distance; from = to;
    }
    function walk(to, speed = species.speed, event = '') {
      const points = floorPath(from, freePoint(to, layout), layout, floorPaths);
      for (const point of points) move(point, 'floor', -1, speed, event);
    }
    function pause(duration = species.pause, mode = 'floor', roomIndex = -1) {
      route.segments.push({ from, to: from, facing, mode, roomIndex, moving: false,
        start: route.duration, end: route.duration + duration, duration,
        startDistance: route.distance, endDistance: route.distance, distance: 0 });
      route.duration += duration;
    }
    const rooms = layout.rooms.map((room, roomIndex) => ({ room, roomIndex }));
    if (index === 2 || species.id === 'dog') rooms.reverse();
    else if (rooms.length && index < 3) rooms.push(...rooms.splice(0, index % rooms.length));
    for (const { room, roomIndex } of rooms) {
      walk(room.arrival);
      const front = { x: room.desk.x + 52, y: room.desk.y + room.desk.h + 11 };
      walk(front);
      // The front edge is a real take-off and landing point, not a teleport.
      if (Math.hypot(from.x-front.x, from.y-front.y) < 1) {
        const top = { x: room.desk.x + 52, y: room.desk.y + 24 };
        const restingX = [21,45,117,93,71][index];
        move(top, 'jump-up', roomIndex);
        move({ x: room.desk.x + restingX, y: top.y }, 'table', roomIndex, 18);
        pause(species.pause, 'table', roomIndex);
        move(top, 'table', roomIndex, 22);
        move(front, 'jump-down', roomIndex);
      }
      walk(room.arrival);
      if (species.id === 'cat') {
        walk({ x: room.x + 214, y: room.y + 190 });
        walk({ x: room.x + 93, y: room.y + 199 });
        walk(room.arrival); pause(2800);
      } else if (species.id === 'dog') {
        walk({ x: room.x + 62, y: room.y + 191 });
        pause(2100);
        walk({ x: room.x + 227, y: room.y + 185 });
        walk(room.arrival); pause(1600);
      } else pause(1400);
    }
    if (!rooms.length) {
      const points = species.id === 'dog' ? [{ x: 490, y: 180 }, { x: 350, y: 230 }, { x: 425, y: 275 }]
        : [{ x: 330, y: 172 }, { x: 455, y: 210 }, { x: 408, y: 280 }];
      for (const point of points) { walk(point); pause(); }
    }
    for(const area of layout.commons||[]){
      walk({x:area.x+150,y:area.y+190});pause(1800);
      walk({x:area.x+160,y:area.y+40});pause(1200);
    }
    walk(home); pause(2400);
    return route;
  });
  // A shared repeat boundary lets brief encounters interrupt two otherwise
  // independent tours without changing either animal's own path or speed.
  const pairDuration = Math.max(routes[3].duration, routes[4].duration);
  for (const route of routes.slice(3)) if (route.duration < pairDuration) {
    const last = route.segments.at(-1);
    route.segments.push({ ...last, start: route.duration, end: pairDuration, duration: pairDuration - route.duration });
    route.duration = pairDuration;
  }
  routeCache.set(layout, routes);
  return routes;
}

function partAt(parts, value, key) {
  let low = 0, high = parts.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (value < parts[mid][key]) high = mid; else low = mid + 1;
  }
  return parts[low];
}
function frameFor(species, part, fraction, clock, layout, moving, running = false, waitElapsed = 0) {
  const x = part.from.x + (part.to.x - part.from.x) * fraction;
  const y = part.from.y + (part.to.y - part.from.y) * fraction;
  const jump = part.mode.startsWith('jump');
  const table = part.mode === 'table';
  const aboveTable = table || (part.mode === 'jump-up' ? fraction > .45 : part.mode === 'jump-down' && fraction < .55);
  return { id: species.id, x, y, mode: part.mode, roomIndex: part.roomIndex,
    elevation: jump ? Math.sin(fraction * Math.PI) * 14 : 0,
    depth: aboveTable ? layout.rooms[part.roomIndex].desk.y + 47 : y,
    direction: part.facing, moving, running, waitElapsed,
    action: jump ? 'jump' : moving ? (running ? species.id === 'dog' ? 'chase' : 'run' : 'walk')
      : species.id === 'panda' ? 'sit' : species.id === 'ocelot' || species.id === 'cat' ? 'sniff' : 'look',
    step: moving ? ((Math.floor(clock / (species.stride * (running ? .55 : 1))) % 4) + 4) % 4 : 0,
    fidget: ((Math.floor(clock / 650 + species.offset / 650) % 4) + 4) % 4,
    blink: Math.floor(clock / 120 + species.offset) % 41 === 0 };
}

export function animalCycleDuration(layout) {
  const routes = prepareRoutes(layout);
  return Math.max(...routes.map(route => route.duration), preparePlay(layout, routes).duration);
}

function routeFrame(route, time, clock, layout, reducedMotion = false) {
  const { species, segments, duration } = route;
  const phase = ((time + species.offset) % duration + duration) % duration;
  const part = reducedMotion ? segments.find(segment => !segment.moving) : partAt(segments, phase, 'end');
  const fraction = reducedMotion || !part.moving ? 0 : Math.max(0, (phase - part.start) / part.duration);
  const moving = !reducedMotion && part.moving;
  return frameFor(species, part, fraction, clock, layout, moving, false, moving || reducedMotion ? 0 : phase - part.start);
}

function floorTrail(points, speed) {
  const motions = []; let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i], length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < .01) continue;
    motions.push({ from, to, facing: direction(from, to), mode: 'floor', roomIndex: -1,
      startDistance: distance, endDistance: distance + length, distance: length });
    distance += length;
  }
  return { motions, point: points[0], distance, speed, duration: distance / speed * 1000 };
}
function trailFrame(trail, species, distance, clock, layout, moving, running = false, waiting = 0) {
  const part = trail.motions.length ? partAt(trail.motions, distance, 'endDistance')
    : { from: trail.point, to: trail.point, facing: 'down', mode: 'floor', roomIndex: -1, startDistance: 0, distance: 1 };
  const fraction = Math.min(1, Math.max(0, (distance - part.startDistance) / part.distance));
  return frameFor(species, part, fraction, clock, layout, moving, running, waiting);
}
function escapeTrail(cat, dog, layout, encounter) {
  const offsets = [[0,0],[-96,0],[96,0],[0,-96],[0,96],[-48,0],[48,0],[0,-48],[0,48],
    [-72,-48],[72,-48],[-72,48],[72,48],[-48,-72],[48,-72],[-48,72],[48,72]];
  const candidates = offsets.map(([dx,dy]) => ({ x: cat.x + dx, y: cat.y + dy }))
    .filter(point => isWalkable(point.x, point.y, layout));
  const points = [{ x: cat.x, y: cat.y }]; let length = 0;
  for (let step = 0; step < 8 && length < 280; step++) {
    const from = points.at(-1), previous = points.at(-2);
    let best, score = -Infinity;
    for (const [index, point] of candidates.entries()) {
      const distance = Math.hypot(point.x - from.x, point.y - from.y);
      if (distance < 40 || distance > 150 || !canWalkSegment(from, point, layout)) continue;
      const away = step === 0 ? ((point.x - from.x) * (cat.x - dog.x) + (point.y - from.y) * (cat.y - dog.y)) / Math.hypot(cat.x - dog.x, cat.y - dog.y) : 0;
      const backtrack = previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1 ? 65 : 0;
      const value = distance + away * .7 - backtrack + (index + encounter * 3 + step * 5) % candidates.length;
      if (value > score) { best = point; score = value; }
    }
    if (!best) break;
    length += Math.hypot(best.x - from.x, best.y - from.y); points.push(best);
  }
  return length >= 260 ? floorTrail(points, 72) : null;
}
function preparePlay(layout, routes) {
  if (playCache.has(layout)) return playCache.get(layout);
  const baseDuration = routes[3].duration, events = [];
  let extra = 0, nextEncounter = 8000;
  // Detect meetings on the independent tours. Cache a bounded, repeatable
  // timeline so wall-clock seeks and reopening the aula need no simulation.
  for (let time = 8000; time < baseDuration - 8000; time += 400) {
    if (time < nextEncounter) continue;
    if (events.length && time > baseDuration + events[0].baseTime - 45000) break;
    const cat = routeFrame(routes[3], time, time, layout), dog = routeFrame(routes[4], time, time, layout);
    const gap = Math.hypot(cat.x - dog.x, cat.y - dog.y);
    if (cat.mode !== 'floor' || dog.mode !== 'floor' || gap < 26 || gap > 86 || !canWalkSegment(dog, cat, layout)) continue;
    const catTrail = escapeTrail(cat, dog, layout, events.length);
    if (!catTrail) continue;
    const catPoints = [catTrail.motions[0].from, ...catTrail.motions.map(part => part.to)];
    const dogTrail = floorTrail([{ x: dog.x, y: dog.y }, ...catPoints], 92);
    const dogEndDistance = gap + catTrail.distance - 22;
    const catEnd = trailFrame(catTrail, routes[3].species, catTrail.distance, time, layout, false);
    const dogEnd = trailFrame(dogTrail, routes[4].species, dogEndDistance, time, layout, false);
    const returns = [catEnd, dogEnd].map((from, index) => floorTrail(floorPath(from, index ? dog : cat, layout), routes[index + 3].species.speed));
    if (returns.some((trail, index) => {
      const goal = index ? dog : cat, end = trail.motions.at(-1)?.to || trail.point;
      return Math.hypot(end.x - goal.x, end.y - goal.y) > .01;
    })) continue;
    const chaseDuration = Math.max(catTrail.duration, dogEndDistance / dogTrail.speed * 1000);
    const duration = chaseDuration + 2600 + Math.max(...returns.map(trail => trail.duration));
    events.push({ baseTime: time, start: time + extra, end: time + extra + duration,
      catTrail, dogTrail, gap, dogEndDistance, chaseDuration, returns });
    extra += duration; nextEncounter = time + 45000;
  }
  const play = { events, duration: baseDuration + extra };
  playCache.set(layout, play); return play;
}
function pairFrames(layout, routes, clock) {
  const play = preparePlay(layout, routes), phase = ((clock % play.duration) + play.duration) % play.duration;
  const event = play.events.length ? partAt(play.events, phase, 'end') : null;
  if (!event || phase < event.start || phase >= event.end) {
    const completed = !event ? 0 : phase >= event.end ? event.end - event.baseTime : event.start - event.baseTime;
    return routes.slice(3).map(route => routeFrame(route, phase - completed, clock, layout));
  }
  const elapsed = phase - event.start;
  let animals;
  if (elapsed < event.chaseDuration) {
    const catDistance = Math.min(event.catTrail.distance, elapsed * event.catTrail.speed / 1000);
    const dogDistance = Math.min(elapsed * event.dogTrail.speed / 1000, Math.max(0, event.gap + catDistance - 22));
    animals = [trailFrame(event.catTrail, routes[3].species, catDistance, clock, layout, catDistance < event.catTrail.distance, true),
      trailFrame(event.dogTrail, routes[4].species, dogDistance, clock, layout, dogDistance < event.dogEndDistance, true)];
  } else if (elapsed < event.chaseDuration + 2600) {
    animals = [trailFrame(event.catTrail, routes[3].species, event.catTrail.distance, clock, layout, false),
      trailFrame(event.dogTrail, routes[4].species, event.dogEndDistance, clock, layout, false)];
    const [cat, dog] = animals;
    cat.direction = direction(cat, dog); dog.direction = direction(dog, cat); cat.action = dog.action = 'greet';
    cat.heart = { x: (cat.x + dog.x) / 2, y: Math.min(cat.y, dog.y) - 23,
      phase: (elapsed - event.chaseDuration) % 1800 / 1800, pair: ['cat', 'dog'] };
  } else {
    const returning = elapsed - event.chaseDuration - 2600;
    animals = event.returns.map((trail, index) => trailFrame(trail, routes[index + 3].species,
      Math.min(trail.distance, returning * trail.speed / 1000), clock, layout, returning < trail.duration, false, Math.max(0, returning - trail.duration)));
  }
  return animals;
}

export function animalFrames(layout, time = 0, reducedMotion = false) {
  if (!layout) return [];
  const clock = reducedMotion ? 0 : Number.isFinite(time) ? time : 0;
  const routes = prepareRoutes(layout);
  const animals = reducedMotion ? routes.map(route => routeFrame(route, 0, 0, layout, true))
    : [...routes.slice(0, 3).map(route => routeFrame(route, clock, clock, layout)), ...pairFrames(layout, routes, clock)];
  if (reducedMotion) animals.forEach(animal => { animal.fidget = 0; animal.blink = false; });
  else {
    const paired = new Set(animals.flatMap((animal,index) => animal.action === 'greet' ? [index] : []));
    const pairs = animals.flatMap((_,i)=>animals.slice(i+1).map((__,j)=>[i,i+j+1]));
    // When three companions meet, alternate the greeting partner rather than
    // letting the dog and cat monopolize every encounter.
    const rotation=((Math.floor(clock/6000)%pairs.length)+pairs.length)%pairs.length;
    pairs.push(...pairs.splice(0,rotation));
    for (const [i,j] of pairs) {
      const a=animals[i], b=animals[j];
      if (paired.has(i) || paired.has(j) || a.moving || b.moving || a.waitElapsed < 350 || b.waitElapsed < 350 ||
        a.mode !== b.mode || (a.mode === 'table' && a.roomIndex !== b.roomIndex)) continue;
      const gap = Math.hypot(a.x-b.x,a.y-b.y);
      if(gap < 8 || gap > 36) continue;
      a.direction=direction(a,b); b.direction=direction(b,a); a.action=b.action='greet';
      a.heart={ x:(a.x+b.x)/2, y:Math.min(a.y-a.elevation,b.y-b.elevation)-(a.mode==='table'?14:23),
        phase:((clock%1800)+1800)%1800/1800, pair:[a.id,b.id] };
      paired.add(i);paired.add(j);
    }
  }
  return animals;
}

function paint(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
export function drawAnimal(ctx, animal) {
  const { id, x, y: groundY, direction: facing, moving, step, fidget, blink } = animal;
  const y = groundY - (animal.elevation || 0);
  const stride = [0, 1, 0, -1][step];
  const bob = moving && (step === 1 || step === 3) ? -1 : 0;
  const left = facing === 'left';
  const side = facing === 'left' || facing === 'right';
  const rear = facing === 'up';
  const p = (dx, dy, w, h, color) => paint(ctx,x+(left?-dx-w:dx),y+dy+bob,w,h,color);
  paint(ctx,x-10,groundY+1,20,2,'#3a514726');paint(ctx,x-7,groundY+3,14,1,'#3a514718');
  if (id === 'ocelot') {
    const gold='#c9a05b', light='#e6c47a', dark='#956b40', cream='#f0d7a0';
    if (side) {
      // Flexible striped tail, two pairs of feet and a low, spotted kitten body.
      const tail=!moving&&fidget===1?-2:0;
      p(-15,-8+tail,8,2,gold);p(-17,-10+tail,3,3,gold);p(-17,-10+tail,2,2,dark);
      p(-12,-8+tail,2,2,dark);p(-8,-5,3,5+stride,dark);p(2,-5,3,5-stride,dark);
      p(-8,-12,17,8,gold);p(-6,-13,13,3,light);p(-7,-5,14,2,'#b0844a');
      [[-5,-10],[1,-9],[5,-12],[-1,-6]].forEach(([dx,dy])=>p(dx,dy,2,2,dark));
      p(-5,-4,3,4-stride,light);p(5,-4,3,4+stride,light);
      const sniff=!moving&&fidget===2?2:0;
      p(6,-14+sniff,9,8,gold);p(7,-16+sniff,3,3,dark);p(12,-16+sniff,3,3,dark);
      p(8,-15+sniff,1,2,light);p(7,-13+sniff,7,2,light);
      p(11,-10+sniff,5,3,cream);p(14,-10+sniff,2,1,'#68523c');
      p(11,-12+sniff,2,blink?1:2,'#496e4b');p(12,-12+sniff,1,1,'#f4eed8');
    } else {
      p(-6,-13,12,10,gold);p(-5,-13,10,2,light);
      [[-4,-10],[2,-9],[-1,-5]].forEach(([dx,dy])=>p(dx,dy,2,2,dark));
      p(-5,-3,3,4+stride,light);p(2,-3,3,4-stride,light);
      const head=rear?-16:-11;
      p(-5,head,10,8,gold);p(-5,head-2,3,3,dark);p(2,head-2,3,3,dark);
      p(-3,head,6,2,light);
      if(rear) { p(-1,-3,2,6,gold);p(-1,1,2,2,dark); }
      else { p(-3,head+5,6,3,cream);p(-3,head+3,2,blink?1:2,'#496e4b');p(2,head+3,2,blink?1:2,'#496e4b');p(-1,head+5,2,1,'#68523c'); }
    }
  } else if (id === 'cat') {
    const white='#e8e8de', gray='#a1aaa7', orange='#c8985a', dark='#655e50';
    const tail=fidget===1?-2:0;
    if(side){
      p(-16,-10+tail,9,2,gray);p(-18,-13+tail,3,4,white);p(-13,-10+tail,3,2,dark);
      p(-8,-5,3,5+stride,gray);p(2,-5,3,5-stride,gray);
      p(-8,-12,17,8,white);p(-6,-13,13,3,'#faf2d9');p(-3,-12,6,7,orange);p(4,-12,4,6,dark);
      p(-7,-5,14,2,gray);p(-5,-4,3,4-stride,white);p(5,-4,3,4+stride,white);
      p(6,-14,9,8,white);p(7,-16,3,3,orange);p(12,-16,3,3,gray);p(7,-13,4,5,orange);
      p(12,-13,3,2,gray);p(11,-12,2,blink?1:2,'#39778d');p(12,-12,1,1,'#edf4e8');
      p(11,-9,5,3,white);p(15,-9,1,1,'#ba897d');
    }else{
      p(-6,-13,12,10,white);p(-4,-12,5,7,orange);p(2,-12,3,6,dark);
      p(-5,-3,3,4+stride,white);p(2,-3,3,4-stride,gray);
      const head=rear?-16:-11;
      p(-5,head,10,8,white);p(-5,head-2,3,3,orange);p(2,head-2,3,3,gray);p(-4,head+1,4,4,orange);
      if(rear){p(-1,-3,2,6,gray);p(-1,1,2,2,white);}
      else{p(-3,head+3,2,blink?1:2,'#39778d');p(2,head+3,2,blink?1:2,'#39778d');p(-1,head+5,2,1,'#ba897d');}
    }
  } else if (id === 'dog') {
    const gray='#a9b1af', light='#d9ddd3', shade='#7f8b89', dark='#485c62', red='#ad5c53';
    const wag=(fidget===1||fidget===2)?-2:0;
    if(side){
      p(-12,-13+wag,6,3,gray);p(-15,-16+wag,4,5,light);
      p(-8,-5,3,6+stride,shade);p(2,-5,3,6-stride,shade);
      p(-8,-13,17,9,gray);p(-6,-14,13,3,light);p(-7,-5,14,2,shade);p(-3,-10,4,3,'#bbc1b8');
      p(-5,-4,3,5-stride,light);p(5,-4,3,5+stride,light);p(-5,0-stride,3,1,dark);p(5,0+stride,3,1,dark);
      p(5,-13,3,10,red);p(6,-12,1,7,'#ce8a6d');
      p(6,-16,10,9,gray);p(6,-18,3,4,shade);p(13,-18,3,4,shade);p(7,-17,1,2,light);
      p(7,-15,8,2,light);p(11,-12,2,blink?1:2,dark);p(12,-12,1,1,'#eff2e8');
      p(12,-10,6,4,light);p(16,-10,2,2,dark);p(12,-7,5,1,shade);
      if(!moving&&fidget===2)p(14,-6,2,2,'#c29185');
    }else{
      p(-6,-14,12,11,gray);p(-5,-14,10,2,light);p(-5,-3,3,5+stride,light);p(2,-3,3,5-stride,light);
      p(-5,1+stride,3,1,dark);p(2,1-stride,3,1,dark);
      const head=rear?-17:-12;
      p(-5,head+8,10,2,red);p(-6,head,12,9,gray);p(-6,head-2,3,4,shade);p(3,head-2,3,4,shade);p(-4,head+1,8,2,light);
      if(rear){p(-1,-3,2,5,light);p(-1,-1+wag,3,2,light);}
      else{p(-3,head+4,2,blink?1:2,dark);p(2,head+4,2,blink?1:2,dark);p(-3,head+6,6,3,light);p(-1,head+6,2,2,dark);}
    }
  } else if (id === 'panda') {
    const white='#eeeee5', shade='#c4cec7', black='#35434a', highlight='#56616a';
    if (!moving) {
      // The cub pauses sitting upright, holding a tiny bamboo shoot.
      p(-6,-10,12,9,black);p(-4,-10,8,8,white);p(-7,-2,5,3,black);p(2,-2,5,3,black);
      p(-7,-17,14,10,white);p(-5,-19,4,4,black);p(3,-19,4,4,black);
      p(-6,-12,4,4,black);p(2,-12,4,4,black);p(-4,-11,1,blink?1:2,'#ecede0');p(3,-11,1,blink?1:2,'#ecede0');
      p(-1,-9,2,1,black);p(-5,-15,10,2,'#ffffff');p(-7,-6,4,4,black);p(3,-6,4,4,black);
      p(1,-7,1,7,'#709567');p(2,-6+(fidget===1?1:0),4,2,'#91b477');
    } else if (side) {
      p(-7,-4,3,5+stride,black);p(2,-4,3,5-stride,black);
      p(-9,-12,17,9,white);p(-7,-13,12,3,'#faf9ed');p(-8,-5,14,2,shade);
      p(-1,-12,6,9,black);p(-7,-3,4,3-stride,black);p(4,-3,4,3+stride,black);
      p(4,-15,10,10,white);p(4,-17,3,4,black);p(11,-17,3,4,black);
      p(8,-12,5,4,black);p(10,-11,1,blink?1:2,'#f2f1e8');p(12,-8,3,2,shade);p(14,-9,1,1,black);
      p(-10,-7,3,3,shade);p(5,-14,7,2,'#faf9ed');p(4,-3,3,1,highlight);
    } else {
      p(-7,-13,14,10,white);p(-6,-12,12,3,'#faf9ed');p(-7,-6,14,3,black);
      p(-6,-3,4,4+stride,black);p(2,-3,4,4-stride,black);
      const head=rear?-17:-12;
      p(-6,head,12,10,white);p(-7,head-2,4,4,black);p(3,head-2,4,4,black);
      p(-4,head+1,8,2,'#faf9ed');
      if(rear)p(-2,-5,4,3,shade);
      else {p(-5,head+4,4,3,black);p(1,head+4,4,3,black);p(-3,head+5,1,blink?1:2,'#f2f1e8');p(3,head+5,1,blink?1:2,'#f2f1e8');p(-1,head+7,2,1,black);}
    }
  } else if (id === 'goat') {
    const wool='#ede9dc', light='#fcf9ec', shade='#c6c5b5', hoof='#727a72', horn='#91836b';
    if(side) {
      p(-7,-5,3,5+stride,shade);p(2,-5,3,5-stride,shade);
      p(-9,-12,18,9,wool);p(-7,-13,13,3,light);p(-8,-5,14,2,shade);
      p(-9,-13,2,5,wool);p(-11,-15+(fidget===1?-1:0),3,3,light);
      p(-5,-4,3,5-stride,wool);p(5,-4,3,5+stride,wool);
      p(-5,0-stride,3,1,hoof);p(5,0+stride,3,1,hoof);
      const tilt=!moving&&fidget===2?1:0;
      p(5,-15+tilt,9,9,wool);p(7,-17+tilt,2,3,horn);p(11,-17+tilt,2,3,horn);
      p(4,-13+tilt,3,3,shade);p(13,-13+tilt,3,2,shade);p(6,-14+tilt,7,2,light);
      p(11,-9+tilt,4,3,shade);p(14,-9+tilt,1,1,hoof);p(11,-12+tilt,2,blink?1:2,'#50636b');
      p(8,-7+tilt,2,3,wool);
    } else {
      p(-6,-13,12,10,wool);p(-5,-13,10,2,light);p(-6,-5,12,2,shade);
      p(-5,-3,3,4+stride,wool);p(2,-3,3,4-stride,wool);p(-5,1+stride,3,1,hoof);p(2,1-stride,3,1,hoof);
      const head=rear?-16:-11;
      p(-4,head,8,9,wool);p(-4,head-3,2,4,horn);p(2,head-3,2,4,horn);
      p(-6,head+3,3,2,shade);p(3,head+3,3,2,shade);p(-2,head+1,4,2,light);
      if(rear)p(-1,-3,2,4,light);
      else {p(-3,head+6,6,3,shade);p(-3,head+4,1,blink?1:2,'#50636b');p(2,head+4,1,blink?1:2,'#50636b');p(-1,head+7,2,1,hoof);}
    }
  }
  if(animal.running && side && step%2===0){
    p(-20,0,3,1,'#b4aa9155');p(-24,-2,2,1,'#c9b99a55');
  }
}

export function drawAnimalHeart(ctx, heart) {
  for(let i=0;i<3;i++){
    const phase=(heart.phase+i*.28)%1, x=heart.x-9+i*8, y=heart.y-phase*8-(i%2)*3;
    const alpha=Math.round((1-phase)*210+35).toString(16).padStart(2,'0');
    const color=(i%2?'#d3909b':'#bd697b')+alpha;
    const p=(dx,dy,w,h)=>paint(ctx,x+dx,y+dy,w,h,color);
    p(1,0,2,1);p(4,0,2,1);p(0,1,7,2);p(1,3,5,1);p(2,4,3,1);p(3,5,1,1);
  }
}
