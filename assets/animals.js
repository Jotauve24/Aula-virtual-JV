import { findPath, isWalkable } from './world-layout.js?v=20261014h';

// Small ambient companions: their feet use the classroom collision map, while
// a shared clock gives everyone in the same layout the same quiet choreography.
export const ANIMAL_SPECIES = [
  { id: 'ocelot', speed: 27, stride: 145, pause: 2600, offset: 4100 },
  { id: 'panda', speed: 17, stride: 220, pause: 6200, offset: 12300 },
  { id: 'goat', speed: 23, stride: 170, pause: 3400, offset: 19800 }
];
const routeCache = new WeakMap();

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
function prepareRoutes(layout) {
  if (routeCache.has(layout)) return routeCache.get(layout);
  const first = layout.rooms[0], second = layout.rooms[1] || first, last = layout.rooms.at(-1);
  const pandaStops = first?.center ? [
    { x: first.arrival.x - 35, y: first.arrival.y + 15 },
    { x: first.arrival.x + 32, y: first.arrival.y + 10 }, first.arrival,
    { x: first.arrival.x - 8, y: first.arrival.y + 19 }
  ] : [{ x: 430, y: (second?.y || 40) + 193 }, { x: 441, y: (second?.y || 40) + 166 },
    { x: 422, y: (second?.y || 40) + 128 }, { x: 413, y: (second?.y || 40) + 207 }];
  const goals = [
    [first?.center ? { x: first.arrival.x - 58, y: first.arrival.y + 7 } : { x: 378, y: 84 },
      first?.arrival || { x: 330, y: 172 },
      first?.center ? { x: first.arrival.x + 52, y: first.arrival.y + 9 } : { x: 372, y: (first?.y || 40) + 180 },
      { x: 398, y: 270 }],
    pandaStops,
    [{ x: 444, y: layout.height - 64 }, last?.center ? last.arrival : { x: 416, y: (last?.y || 40) + 188 },
      { x: 424, y: layout.height - 98 }, { x: 360, y: layout.height - 63 }]
  ];
  const routes = ANIMAL_SPECIES.map((species, index) => {
    const stops = goals[index].map(point => freePoint(point, layout));
    const segments = [];
    let from = stops[0], facing = 'down', duration = 0;
    for (const goal of [...stops.slice(1), stops[0]]) {
      const points = findPath(from, goal, layout);
      for (const to of points) {
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        if (distance < .01) continue;
        const length = distance / species.speed * 1000;
        facing = direction(from, to);
        segments.push({ from, to, facing, start: duration, duration: length, moving: true });
        duration += length; from = to;
      }
      segments.push({ from, to: from, facing, start: duration, duration: species.pause, moving: false });
      duration += species.pause;
    }
    const route = { species, segments, duration };
    return route;
  });
  routeCache.set(layout, routes);
  return routes;
}

export function animalFrames(layout, time = 0, reducedMotion = false) {
  if (!layout) return [];
  const clock = Number.isFinite(time) ? time : 0;
  return prepareRoutes(layout).map(route => {
    const { species, segments, duration } = route;
    const phase = ((clock + species.offset) % duration + duration) % duration;
    const segment = reducedMotion ? segments.find(part => !part.moving)
      : segments.find(part => phase < part.start + part.duration) || segments.at(-1);
    const fraction = reducedMotion || !segment.moving ? 0 : Math.max(0, (phase - segment.start) / segment.duration);
    const moving = !reducedMotion && segment.moving;
    return {
      id: species.id,
      x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
      y: segment.from.y + (segment.to.y - segment.from.y) * fraction,
      direction: segment.facing, moving,
      action: moving ? 'walk' : species.id === 'panda' ? 'sit' : species.id === 'ocelot' ? 'sniff' : 'look',
      step: moving ? ((Math.floor(clock / species.stride) % 4) + 4) % 4 : 0,
      fidget: reducedMotion ? 0 : ((Math.floor(clock / 650 + species.offset / 650) % 4) + 4) % 4,
      blink: !reducedMotion && Math.floor(clock / 120 + species.offset) % 41 === 0
    };
  });
}

function paint(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
export function drawAnimal(ctx, animal) {
  const { id, x, y, direction: facing, moving, step, fidget, blink } = animal;
  const stride = [0, 1, 0, -1][step];
  const bob = moving && (step === 1 || step === 3) ? -1 : 0;
  const left = facing === 'left';
  const side = facing === 'left' || facing === 'right';
  const rear = facing === 'up';
  const p = (dx, dy, w, h, color) => paint(ctx,x+(left?-dx-w:dx),y+dy+bob,w,h,color);
  paint(ctx,x-10,y+1,20,2,'#3a514726');paint(ctx,x-7,y+3,14,1,'#3a514718');
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
}
