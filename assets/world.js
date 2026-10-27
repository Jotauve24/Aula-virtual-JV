import { avatarXFrame, drawAvatarX } from './avatar-x.js?v=0.16.0';
import { SKINS, SHIRTS } from './model.js?v=0.16.0';
import { animalFrames, drawAnimal, drawAnimalHeart } from './animals.js?v=0.16.0';
import { chickenJockeyFrame, drawChickenJockey } from './chicken-jockey.js?v=0.16.0';
import { canWalkSegment } from './world-layout.js?v=0.16.0';

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 560;
// A room's place in the teacher's group order always keeps the same scenery.
// The first ten have their own palette and workstation; later groups get a
// fresh palette as well, since a course may have up to forty groups.
export const ROOM_THEMES = [
  { id: 'bosque', accent: '#4a7e4d', floor: '#e8efd9', tile: '#acc38d', rug: '#a3bf83', surface: '#eaca96', edge: '#8d7958', chair: '#6a985b', pop: '#edbc69', card: '#f2f7e9' },
  { id: 'oceano', accent: '#4c8da6', floor: '#e6f1e9', tile: '#9cc7c2', rug: '#9bc9ce', surface: '#eddaad', edge: '#80948c', chair: '#6ba6b5', pop: '#ecc57f', card: '#eff8f5' },
  { id: 'arte', accent: '#bb7d62', floor: '#f6ead8', tile: '#d8b797', rug: '#d8ad95', surface: '#f1d3a4', edge: '#a38367', chair: '#c18d72', pop: '#ebbe72', card: '#fcf4e8' },
  { id: 'cosmos', accent: '#8c78b3', floor: '#eeebf4', tile: '#b4a8cc', rug: '#b6a9d2', surface: '#7e88a2', edge: '#626b83', chair: '#9a8bbd', pop: '#efcf87', card: '#f6f1fa' },
  { id: 'biblioteca', accent: '#805f36', floor: '#e9e2d3', tile: '#bba783', rug: '#ad9474', surface: '#dbc59f', edge: '#7a644b', chair: '#99754f', pop: '#c49d54', card: '#f8f4eb' },
  { id: 'laboratorio', accent: '#286e67', floor: '#dfece6', tile: '#8db5a8', rug: '#7aa79a', surface: '#e1eee3', edge: '#647f78', chair: '#408f83', pop: '#8ac9ba', card: '#eff7f3' },
  { id: 'musica', accent: '#735367', floor: '#e8e0e5', tile: '#aa92a3', rug: '#967c92', surface: '#564a60', edge: '#735c70', chair: '#876578', pop: '#c6a76c', card: '#f5f0f4' },
  { id: 'tecnologia', accent: '#325f82', floor: '#e0e8ef', tile: '#92acc3', rug: '#6b8da8', surface: '#3b5774', edge: '#4a6479', chair: '#4c7fa0', pop: '#86bfc7', card: '#f0f5f9' },
  { id: 'cafe', accent: '#8b5d43', floor: '#ede1d3', tile: '#c5a68c', rug: '#af8e7a', surface: '#e1c49b', edge: '#7e604c', chair: '#ad7655', pop: '#cea060', card: '#faf3ec' },
  { id: 'arquitectura', accent: '#4c6c69', floor: '#e1e8e4', tile: '#9bb6ae', rug: '#859e98', surface: '#d1e0d7', edge: '#637b70', chair: '#698e7f', pop: '#cab174', card: '#f0f5f1' }
];
export function roomTheme(index) {
  const theme = ROOM_THEMES[index % ROOM_THEMES.length];
  if (index < ROOM_THEMES.length) return theme;
  const hue = (index * 47 + 33) % 360;
  return { ...theme, accent: `hsl(${hue} 34% 30%)`, floor: `hsl(${hue} 14% 91%)`,
    tile: `hsl(${hue} 20% 69%)`, rug: `hsl(${hue} 22% 59%)`,
    chair: `hsl(${hue} 32% 42%)`, pop: `hsl(${(hue + 60) % 360} 44% 61%)`,
    card: `hsl(${hue} 24% 96%)` };
}
const obstacles = [
  { x: 129, y: 130, w: 155, h: 88 }, { x: 500, y: 130, w: 155, h: 88 },
  { x: 500, y: 371, w: 155, h: 88 }, { x: 97, y: 357, w: 171, h: 95 },
  { x: 67, y: 62, w: 37, h: 48 }, { x: 696, y: 62, w: 37, h: 48 },
  { x: 696, y: 463, w: 37, h: 48 }, { x: 67, y: 463, w: 37, h: 48 },
];

function shade(color, amount) {
  const hex = String(color).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  return '#' + [0, 2, 4].map(i => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + amount)).toString(16).padStart(2, '0')).join('');
}
function zombieRects(direction, step = 0) {
  const pixels=[];
  const add=(x,y,w,h,color)=>pixels.push([x,y,w,h,color]);
  add(8,4,18,18,'#527e46');add(10,3,14,3,'#729e5b');
  add(6,8,3,12,'#456b3b');add(26,8,3,12,'#456b3b');
  if(direction==='up') add(12,9,10,5,'#426b3e');
  else {
    add(11,12,4,4,'#eff9d4');add(20,12,4,4,'#eff9d4');
    add(12,13,2,2,'#253c1f');add(21,13,2,2,'#253c1f');
    add(15,19,6,2,'#304d2b');
  }
  add(13,21,8,3,'#527e46');
  add(8,24,18,14,'#2b9794');add(5,25,4,12,'#2b9794');add(26,25,4,12,'#2b9794');
  add(5,36,4,4,'#527e46');add(26,36,4,4,'#527e46');
  add(10,38,6,8-step,'#424575');add(19,38,6,8+step,'#424575');
  add(9,45-step,8,3,'#222d43');add(18,45+step,8,3,'#222d43');
  return pixels;
}
function spriteRects(avatar, step = 0, seated = false) {
  if (avatar?.character === 'zombie') return zombieRects(avatar.direction, step);
  const skin = SKINS[avatar.skin] || SKINS[1];
  const outfit = Number.isInteger(avatar.outfit) && avatar.outfit >= 0 && avatar.outfit < SHIRTS.length
    ? avatar.outfit : avatar.shirt;
  const shirt = SHIRTS[outfit] || SHIRTS[0];
  const hair = '#594735';
  const r = [];
  const add = (x, y, w, h, c) => r.push([x, y, w, h, c]);
  if (avatar.hair === 'long') {
    // Back layer falls past the shoulders instead of disappearing beneath the shirt.
    add(4, 5, 25, 31, hair); add(3, 14, 5, 22, hair); add(26, 14, 5, 22, hair);
  }
  add(8, 5, 16, 15, skin); add(6, 6, 2, 11, skin); add(24, 6, 2, 11, skin);
  add(9, 17, 14, 3, shade(skin, -24)); add(10, 8, 3, 3, shade(skin, 15));
  add(8, 3, 16, 5, hair); add(6, 6, 4, 5, hair);
  if (avatar.hair === 'curly') { add(5, 2, 21, 6, '#3e3732'); add(3, 5, 5, 10, '#3e3732'); add(24, 5, 5, 10, '#3e3732'); }
  if (avatar.direction !== 'up') { add(12, 12, 2, 2, '#35352d'); add(21, 12, 2, 2, '#35352d'); }
  else add(8, 6, 16, 9, hair);
  if (avatar.direction !== 'up') add(16, 17, 3, 1, '#9e6752');
  add(13, 20, 7, 3, skin); add(8, 23, 17, 14, shirt); add(4, 25, 5, 8, shirt); add(25, 25, 5, 8, shirt);
  add(9, 24, 2, 11, shade(shirt, 22)); add(22, 25, 3, 12, shade(shirt, -28));
  add(13, 23, 7, 2, shade(shirt, -23)); add(10, 35, 13, 2, shade(shirt, -18));
  add(4, 33, 5, 5, skin); add(25, 33, 5, 5, skin);
  if (seated) {
    add(8, 36, 19, 6, '#465552'); add(5, 41, 11, 4, '#465552');
    add(19, 41, 11, 4, '#465552');
  } else { add(9, 37, 7, 9 - step, '#465552'); add(19, 37, 7, 9 + step, '#465552'); }
  if (avatar.presentation === 'mujer') {
    add(9, 34, 15, 4, shirt); add(7, 38, 19, 4, shirt); add(5, 42, 23, 3, shirt);
  }
  if (avatar.hair === 'long') {
    add(3, 12, 5, 25, hair); add(26, 12, 5, 25, hair);
    add(4, 37, 4, 4, hair); add(26, 37, 4, 4, hair);
    add(6, 18, 2, 12, '#765c46'); add(26, 18, 2, 12, '#765c46');
  }
  if (seated) { add(4, 44, 12, 4, '#34403d'); add(19, 44, 12, 4, '#34403d'); }
  else { add(8, 44 - step, 8, 4, '#34403d'); add(19, 44 + step, 8, 4, '#34403d'); }
  return r;
}
export function avatarSVG(avatar, className = '', label = '') {
  return `<svg class="${className}" viewBox="0 0 34 52" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} shape-rendering="crispEdges">${spriteRects(avatar).map(([x,y,w,h,c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('')}</svg>`;
}
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function avatar(ctx, x, y, look, step = 0, seated = false, seatColor = '#596e84') {
  ctx.fillStyle = '#3e513129'; ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (seated) officeChair(ctx, x, y + 4, seatColor);
  spriteRects(look, step, seated).forEach(([a,b,w,h,c]) => rect(ctx, x - 17 + a, y - 48 + b, w, h, c));
  if (seated) { rect(ctx, x - 18, y - 12, 7, 4, '#354753'); rect(ctx, x + 11, y - 12, 7, 4, '#354753'); }
}
function pixelShadow(ctx, x, y, w, h) {
  rect(ctx,x+4,y+3,w-4,h,'#263e5429');rect(ctx,x+8,y+h+3,w-12,3,'#263e5418');
}
function plankFloor(ctx, x, y, w, h, color = '#e8ddca') {
  rect(ctx,x,y,w,h,color);
  for(let row=0;row<h;row+=16){
    rect(ctx,x,y+row,w,1,'#cab89d66');rect(ctx,x,y+row+1,w,1,'#fff8ea66');
    for(let col=(row/16%2)*36;col<w;col+=72){
      rect(ctx,x+col,y+row,1,Math.min(16,h-row),'#c5b39966');
      if(col+26<w)rect(ctx,x+col+9,y+row+8,17,1,'#d7c4a64d');
    }
  }
}
function officeChair(ctx, x, y, color) {
  rect(ctx,x-13,y-2,27,3,'#2a3c4929');rect(ctx,x-2,y-14,4,13,'#40525f');
  rect(ctx,x-12,y-2,24,2,'#3e505b');rect(ctx,x-2,y-4,4,7,'#3e505b');
  rect(ctx,x-13,y-29,26,19,'#394b59');rect(ctx,x-10,y-32,20,24,'#394b59');
  rect(ctx,x-10,y-29,20,16,color);rect(ctx,x-8,y-30,16,3,shade(color,25));
  rect(ctx,x-7,y-25,14,9,shade(color,10));rect(ctx,x-1,y-24,2,7,shade(color,-22));
  rect(ctx,x-12,y-12,24,6,'#394b59');rect(ctx,x-10,y-12,20,3,shade(color,17));
  rect(ctx,x-17,y-18,5,9,'#3d505e');rect(ctx,x+12,y-18,5,9,'#3d505e');
  rect(ctx,x-18,y-19,7,3,'#6f8190');rect(ctx,x+11,y-19,7,3,'#6f8190');
  rect(ctx,x-13,y,4,3,'#293b46');rect(ctx,x+9,y,4,3,'#293b46');
}
function seatedDeskAvatar(ctx, x, y, look, chairColor) {
  // The chair, body and backrest share one anchor;
  // the rear view keeps the legs behind the desk instead of splaying them out.
  const skin = SKINS[look.skin] || SKINS[1];
  const outfit = Number.isInteger(look.outfit) && look.outfit >= 0 && look.outfit < SHIRTS.length
    ? look.outfit : look.shirt;
  const shirt = SHIRTS[outfit] || SHIRTS[0];
  const hair = look.hair === 'curly' ? '#3e3732' : '#594735';
  const p = (dx,dy,w,h,color) => rect(ctx,x+dx,y+dy,w,h,color);

  // Chair base and cushion sit behind the student.
  p(-13,-2,27,3,'#2a3c4929');p(-2,-14,4,13,'#40525f');
  p(-12,-2,24,2,'#3e505b');p(-2,-4,4,7,'#3e505b');
  p(-13,0,4,3,'#293b46');p(9,0,4,3,'#293b46');
  p(-12,-12,24,6,'#394b59');p(-10,-12,20,3,shade(chairColor,17));

  // Shoulders and bent forearms reach toward the keyboard.
  p(-8,-30,16,17,shirt);p(-11,-29,22,6,shirt);
  p(-7,-29,3,12,shade(shirt,20));p(5,-28,3,11,shade(shirt,-24));
  p(-14,-31,5,9,shade(shirt,-12));p(9,-31,5,9,shade(shirt,-20));
  p(-13,-33,4,5,skin);p(9,-33,4,5,skin);
  p(-12,-33,3,1,shade(skin,18));p(9,-33,3,1,shade(skin,18));
  p(-3,-33,6,4,skin);p(-4,-29,8,2,shade(shirt,-24));

  // Foreground backrest hides the lower torso, giving the seated pose depth.
  p(-10,-25,20,2,'#394b59');p(-12,-23,24,12,'#394b59');
  p(-10,-23,20,10,chairColor);p(-8,-23,16,2,shade(chairColor,25));
  p(-7,-20,14,5,shade(chairColor,10));p(-1,-19,2,5,shade(chairColor,-22));
  p(-16,-20,4,10,'#3d505e');p(12,-20,4,10,'#3d505e');
  p(-17,-21,7,3,'#6f8190');p(10,-21,7,3,'#6f8190');

  // A smaller head and distinct rear hairstyles match the furniture scale.
  p(-7,-43,14,12,skin);p(-9,-39,2,4,skin);p(7,-39,2,4,skin);
  if (look.hair === 'long') {
    p(-7,-46,14,2,hair);p(-9,-44,18,15,hair);p(-8,-29,16,5,hair);
    p(-8,-24,5,3,hair);p(4,-24,4,2,hair);
    p(-6,-42,2,15,'#765c46');p(-4,-44,9,2,'#765c46');
    p(5,-39,2,13,'#493a2e');
  } else if (look.hair === 'curly') {
    p(-6,-46,12,2,hair);p(-8,-44,16,10,hair);p(-6,-34,12,2,hair);
    p(-10,-42,3,5,hair);p(7,-42,3,5,hair);
    [[-5,-43],[-1,-45],[4,-43],[-7,-38],[2,-38]].forEach(([dx,dy])=>p(dx,dy,3,2,'#625349'));
  } else {
    p(-6,-45,12,2,hair);p(-8,-43,16,9,hair);p(-6,-34,12,2,hair);
    p(-5,-43,8,2,'#765c46');p(-6,-40,2,4,'#765c46');
    p(5,-41,2,7,'#493a2e');
  }
}
function plant(ctx, x, y) {
  pixelShadow(ctx,x-13,y+2,29,12);
  rect(ctx,x-12,y-10,25,20,'#5d6b6b');rect(ctx,x-10,y-8,21,17,'#a28a70');
  rect(ctx,x-7,y-6,6,14,'#c3aa87');rect(ctx,x+5,y-5,5,13,'#806d5d');
  rect(ctx,x-14,y-12,29,6,'#596b63');rect(ctx,x-11,y-11,22,3,'#a6b59b');
  rect(ctx,x-2,y-38,4,29,'#547558');
  const leaves=[[-12,-34,12,12],[-20,-24,15,10],[-5,-45,14,15],[7,-38,13,12],[5,-24,15,11],[-9,-17,11,9]];
  leaves.forEach(([dx,dy,w,h],i)=>{
    rect(ctx,x+dx+2,y+dy,w-4,h,'#3c7058');rect(ctx,x+dx,y+dy+3,w,h-6,'#4b9668');
    rect(ctx,x+dx+3,y+dy+2,w-7,4,i%2?'#93c784':'#77b376');
    rect(ctx,x+dx+Math.floor(w/2),y+dy+5,2,h-5,'#5dab76');
  });
}
function pixelWindow(ctx,x,y,w=82,h=31){
  pixelShadow(ctx,x,y,w,h);rect(ctx,x,y,w,h,'#526d7b');rect(ctx,x+3,y+3,w-6,h-7,'#aadadd');
  rect(ctx,x+4,y+4,w-8,3,'#d8f1e8');rect(ctx,x+4,y+h-14,w-8,8,'#9ecaa3');
  const panes=Math.max(1,Math.floor((w-8)/21));
  for(let i=0;i<panes;i++){rect(ctx,x+4+i*21,y+h-18-(i%2)*3,15,7,'#83bfa0');rect(ctx,x+7+i*21,y+6,4,8,'#effcff88');}
  rect(ctx,x+Math.floor(w/2)-1,y+3,3,h-6,'#638a95');rect(ctx,x+3,y+Math.floor(h/2),w-6,2,'#638a95');
  rect(ctx,x-2,y+h-4,w+4,5,'#879b9f');rect(ctx,x-2,y+h-4,w+4,2,'#c8d4cb');
}
function windowView(ctx, x, y, w, h, view) {
  const night = view === 'night';
  rect(ctx,x,y,w,h,night?'#243851':'#c5e3e5');
  if (night) {
    [[.14,.23],[.36,.65],[.62,.16],[.84,.53]].forEach(([dx,dy],i)=>
      rect(ctx,x+Math.floor(w*dx),y+Math.floor(h*dy),i%2?1:2,2,'#e7d7a8'));
    rect(ctx,x+w-14,y+4,7,7,'#efdbad');rect(ctx,x+w-11,y+3,5,6,'#243851');
  } else if (view === 'sea') {
    rect(ctx,x,y+h-11,w,11,'#6ca7b6');rect(ctx,x,y+h-11,w,2,'#a9d2d2');
    for(let i=0;i<3;i++)rect(ctx,x+5+i*21,y+h-6+(i%2)*2,12,1,'#d6e5dc');
    rect(ctx,x+Math.floor(w*.58),y+h-12,12,2,'#7d6c54');
    rect(ctx,x+Math.floor(w*.58)+5,y+3,1,h-14,'#677d81');
    for(let i=0;i<4;i++)rect(ctx,x+Math.floor(w*.58)+6,y+4+i*2,2+i*2,2,'#f5efe0');
  } else if (view === 'city') {
    for(let i=0;i<6;i++) {
      const height=7+(i%3)*4, dx=x+Math.floor(i*w/6);
      rect(ctx,dx,y+h-height,Math.ceil(w/6)-2,height,i%2?'#91aeb7':'#7c9da9');
      rect(ctx,dx+3,y+h-height+3,2,3,'#dcebdc');
    }
  } else if (view === 'frosted') {
    rect(ctx,x,y+h-9,w,9,'#aacbc7');
    for(let i=0;i<4;i++)rect(ctx,x+4+i*17,y+3,5,h-7,'#e5f3ea66');
  } else {
    rect(ctx,x,y+h-8,w,8,'#a7c6a2');
    for(let i=0;i<4;i++) {
      const dx=x+5+Math.floor(i*(w-14)/4), height=7+(i%2)*5;
      rect(ctx,dx+2,y+h-height-4,7,height,'#75a885');
      rect(ctx,dx,y+h-height,11,height-3,'#86b695');
    }
  }
  if (!night) rect(ctx,x+4,y+2,Math.min(13,w-8),2,'#eff8f188');
}
function roomWindow(ctx, room, theme) {
  // Windows stay above the team card; the centered room keeps its upper door clear.
  const x=room.x+(room.center?176:153), y=room.y+7, w=room.center?70:92;
  const p=(dx,dy,ww,hh,color)=>rect(ctx,x+dx,y+dy,ww,hh,color);
  const frame=(dx,dy,ww,hh,color,view)=>{
    pixelShadow(ctx,x+dx,y+dy,ww,hh);
    p(dx,dy,ww,hh,color);windowView(ctx,x+dx+3,y+dy+3,ww-6,hh-6,view);
    p(dx+1,dy+1,ww-2,1,shade(color,34));
  };
  switch(theme.id) {
    case 'bosque':
      frame(3,1,w-6,27,'#8c775e','garden');
      p(Math.floor(w/2),3,3,22,'#8c775e');p(6,14,w-12,2,'#b4a38a');
      [0,w-9].forEach(dx=>{p(dx,0,9,25,'#b9c3a7');p(dx+2,2,2,21,'#d9ddbd');p(dx+1,17,7,3,'#8b9c7e');});
      p(0,28,w,3,'#a08b70');p(1,28,w-2,1,'#e1d1ac');break;
    case 'oceano':
      frame(0,3,w,24,'#637f8a','sea');
      [1,2].forEach(i=>p(Math.floor(w*i/3),6,2,18,'#819fa8'));
      p(-2,27,w+4,4,'#a6b7b6');p(-2,27,w+4,1,'#e5e8d9');break;
    case 'arte': {
      const pane=Math.floor((w-13)/2);
      [2,pane+10].forEach((dx,i)=>{
        frame(dx,i?2:0,pane,29,'#947967','frosted');
        ['#c8b890','#9bbfb5','#d2a58e'].forEach((color,n)=>p(dx+4+n*Math.floor((pane-8)/3),5+i,Math.floor((pane-8)/3)-1,11,color));
        p(dx+3,18+i,pane-6,2,'#947967');p(dx+Math.floor(pane/2),4+i,2,21,'#947967');
      });break;
    }
    case 'cosmos': {
      const ww=w-18, dx=9;
      [12,6,2,0].forEach((inset,i)=>p(dx+inset,i*3,ww-inset*2,3,'#52667e'));
      p(dx,12,ww,18,'#52667e');windowView(ctx,x+dx+4,y+12,ww-8,14,'night');
      p(dx+7,8,ww-14,4,'#243851');p(dx+14,5,ww-28,3,'#243851');
      p(Math.floor(w/2),10,2,17,'#8a9baf');p(dx-3,30,ww+6,3,'#aab7bf');break;
    }
    case 'biblioteca': {
      const pane=Math.floor((w-10)/3);
      for(let i=0;i<3;i++) {
        const dx=3+i*(pane+2);
        frame(dx,3+(i===1?0:2),pane,26-(i===1?0:2),'#8b7052','garden');
        p(dx+3,16,pane-6,2,'#bda27b');p(dx+Math.floor(pane/2),7,1,17,'#bda27b');
      }
      p(0,29,w,3,'#a18762');p(1,29,w-2,1,'#e0caa0');break;
    }
    case 'laboratorio':
      frame(0,2,w,26,'#869b99','frosted');
      for(let i=0;i<4;i++){p(3,5+i*5,w-6,2,'#c7d9d2');p(3,7+i*5,w-6,1,'#f0f5e7');}
      p(w-9,5,2,20,'#758b89');p(-1,28,w+2,3,'#aabcb3');break;
    case 'musica':
      frame(8,2,w-16,27,'#75687b','garden');p(Math.floor(w/2),5,2,20,'#9a91a0');
      [0,w-14].forEach(dx=>{p(dx,0,14,30,'#8d8295');p(dx+2,2,3,24,'#b0a3b1');p(dx+9,3,2,22,'#756d85');p(dx+1,21,12,3,'#cab28a');});
      p(-1,0,w+2,2,'#655a6f');break;
    case 'tecnologia':
      frame(0,6,w,20,'#425d74','city');
      [1,2,3].forEach(i=>p(Math.floor(w*i/4),9,2,14,'#6e8c9d'));
      p(0,0,w,5,'#a4b2b9');p(2,1,w-4,1,'#d4ded9');p(w-4,2,1,26,'#697f91');
      p(w-5,26,3,3,'#c5d4d0');p(-1,26,w+2,3,'#7694a3');break;
    case 'cafe':
      frame(2,5,w-4,23,'#94765e','city');p(Math.floor(w/2),8,3,17,'#94765e');
      for(let i=0;i<8;i++){const ww=Math.ceil(w/8);p(i*ww,0,Math.min(ww,w-i*ww),6,i%2?'#c39978':'#e4d4b6');p(i*ww,6,Math.min(ww,w-i*ww),2,i%2?'#9c775d':'#c8b797');}
      p(0,29,w,3,'#a28b70');break;
    case 'arquitectura':
      frame(4,0,w-8,30,'#718a89','city');
      [1,2,3].forEach(i=>p(7,3+i*6,w-14,1,'#98b1ab'));
      [1,2,3].forEach(i=>p(4+Math.floor((w-8)*i/4),3,1,24,'#98b1ab'));
      p(1,30,w-2,2,'#b1c1b7');p(7,2,w-14,1,'#eaf2e4');break;
  }
}
function palm(ctx, x, y, variant = 0) {
  pixelShadow(ctx,x-16,y-5,34,18);
  rect(ctx,x-15,y-11,30,17,'#697c7d');rect(ctx,x-12,y-9,24,13,'#c4b296');
  rect(ctx,x-9,y-7,4,9,'#e7d4b2');rect(ctx,x+7,y-7,3,9,'#a7957e');
  rect(ctx,x-16,y-13,32,5,'#99a79b');rect(ctx,x-12,y-12,24,2,'#d5d9be');
  rect(ctx,x-8,y-10,16,2,'#746b52');
  rect(ctx,x-3,y-50,6,39,'#8e795c');rect(ctx,x-2,y-48,2,35,'#bba174');
  for(let i=0;i<6;i++)rect(ctx,x-3,y-44+i*5,6,1,'#6d7051');
  const tip=y-51, greens=variant?['#4f7f67','#6c9d77','#90b88a']:['#3f795e','#5b976d','#84b57a'];
  // Stepped fronds give the palm a separate silhouette from the leafy room plants.
  for(const direction of [-1,1]) {
    for(let i=0;i<6;i++) {
      rect(ctx,x+direction*(5+i*5)-(direction<0?7:0),tip-7+i*2,8,4,greens[0]);
      rect(ctx,x+direction*(5+i*5)-(direction<0?7:0),tip-8+i*2,7,2,greens[1]);
      if(i>2)rect(ctx,x+direction*(5+i*5)-(direction<0?3:0),tip-3+i*3,3,6,greens[0]);
    }
    for(let i=0;i<4;i++)rect(ctx,x+direction*(4+i*3)-(direction<0?4:0),tip-15+i*2,5,4,greens[1]);
  }
  rect(ctx,x-3,tip-13,6,13,greens[0]);rect(ctx,x-1,tip-16,3,13,greens[2]);
}
function gardenBench(ctx, x, y, w) {
  pixelShadow(ctx,x,y+10,w,20);
  [8,w-13].forEach(dx=>{rect(ctx,x+dx,y+7,5,21,'#566c74');rect(ctx,x+dx-3,y+27,10,2,'#465c66');});
  for(let i=0;i<3;i++){rect(ctx,x,y+i*4,w,3,'#a98c68');rect(ctx,x+1,y+i*4,w-2,1,'#d8b98b');}
  rect(ctx,x-2,y+14,w+4,7,'#816e59');rect(ctx,x,y+14,w,4,'#c8a57d');
  rect(ctx,x-3,y+8,4,10,'#5f7278');rect(ctx,x+w-1,y+8,4,10,'#5f7278');
}
function flowerPlanter(ctx, x, y, w) {
  pixelShadow(ctx,x,y+1,w,15);rect(ctx,x,y,w,14,'#8d7c68');
  rect(ctx,x+2,y+2,w-4,10,'#bb9f7d');rect(ctx,x+3,y+3,w-6,2,'#d6bc93');
  rect(ctx,x-1,y-2,w+2,4,'#8e9a7c');
  for(let i=0;i<Math.floor(w/10);i++) {
    const dx=x+4+i*10, yy=y-7-(i%2)*3;
    rect(ctx,dx+2,yy,2,7+(i%2)*3,'#527f60');rect(ctx,dx,yy+2,6,3,'#7ba16c');
    rect(ctx,dx+1,yy-2,4,4,i%2?'#d5b66f':'#c98b78');rect(ctx,dx+2,yy-1,2,2,'#f1dba0');
  }
}
function pixelMonitor(ctx,x,y,accent='#66b9c2'){
  pixelShadow(ctx,x,y,31,24);rect(ctx,x,y,31,20,'#314659');rect(ctx,x+2,y+2,27,15,'#466b84');
  rect(ctx,x+4,y+4,23,11,'#9dccd2');rect(ctx,x+5,y+5,7,8,accent);
  rect(ctx,x+15,y+6,10,2,'#e8f5ea');rect(ctx,x+15,y+10,7,2,'#6397ab');
  rect(ctx,x+12,y+20,6,4,'#5c6f7d');rect(ctx,x+8,y+24,15,2,'#859ba7');
  rect(ctx,x+1,y+28,26,5,'#6d8492');rect(ctx,x+3,y+29,22,2,'#cedbe0');
  for(let i=0;i<6;i++)rect(ctx,x+4+i*3,y+29,1,2,'#869ca9');rect(ctx,x+30,y+27,4,6,'#718997');
}
function pixelLaptop(ctx,x,y,accent='#8db5c6'){
  pixelShadow(ctx,x-2,y,33,27);rect(ctx,x,y,29,18,'#354c5b');rect(ctx,x+2,y+2,25,14,'#c2dadd');
  rect(ctx,x+3,y+3,23,4,accent);rect(ctx,x+5,y+10,12,1,'#789cac');rect(ctx,x+5,y+13,17,1,'#789cac');
  rect(ctx,x-2,y+18,33,8,'#8ca1b0');rect(ctx,x,y+19,29,4,'#cddae0');
  for(let i=0;i<8;i++)rect(ctx,x+2+i*3,y+20,1,2,'#758b99');rect(ctx,x+11,y+24,7,1,'#607d8e');
}
function pixelNotebook(ctx,x,y,w=28,h=21){
  rect(ctx,x,y,w,h,'#ae9576');rect(ctx,x+1,y+1,w-2,h-3,'#f0e6ce');
  const mid=Math.floor(w/2);rect(ctx,x+mid,y+2,1,h-5,'#b6aa91');
  for(let i=0;i<3;i++){rect(ctx,x+4,y+5+i*4,mid-7,1,'#96a7a2');rect(ctx,x+mid+4,y+5+i*4,w-mid-7,1,'#a5b0a6');}
  rect(ctx,x+1,y+h-2,w-2,1,'#d2c3a5');
}
function deskPlant(ctx,x,y){
  rect(ctx,x+1,y+7,10,9,'#9b7259');rect(ctx,x+2,y+8,3,6,'#c2a077');
  rect(ctx,x-1,y+6,14,3,'#c4b28b');rect(ctx,x+5,y-5,2,12,'#427c5e');
  rect(ctx,x,y-3,6,6,'#70ab74');rect(ctx,x+7,y-6,5,8,'#5e996a');rect(ctx,x+2,y-1,3,2,'#a3ce87');
}
function pixelLamp(ctx,x,y){
  rect(ctx,x-3,y-2,8,3,'#726a60');rect(ctx,x,y-17,3,16,'#8e7862');
  rect(ctx,x-7,y-24,16,8,'#e0b977');rect(ctx,x-4,y-28,10,5,'#efd59e');
  rect(ctx,x-8,y-17,18,3,'#a98a57');rect(ctx,x-5,y-22,7,4,'#fff0c3');
}
function pixelSofa(ctx,x,y,w=90,h=40,color='#c98b69'){
  pixelShadow(ctx,x,y,w,h);rect(ctx,x+4,y+h-3,6,7,'#686465');rect(ctx,x+w-10,y+h-3,6,7,'#686465');
  rect(ctx,x,y+3,w,h-4,'#775f59');rect(ctx,x+3,y,w-6,h-6,'#775f59');
  rect(ctx,x+5,y+3,w-10,Math.floor(h/2),color);rect(ctx,x+6,y+4,w-12,3,shade(color,30));
  rect(ctx,x+6,y+Math.floor(h/2),w-12,Math.ceil(h/2)-5,shade(color,12));
  [1,2].forEach(i=>rect(ctx,x+Math.floor(w/3)*i,y+5,2,h-11,shade(color,-26)));
  for(let bx=x+18;bx<x+w-12;bx+=17)for(let by=y+9;by<y+h-7;by+=9){rect(ctx,bx,by,2,2,shade(color,-24));rect(ctx,bx+2,by+1,1,1,shade(color,25));}
  rect(ctx,x+1,y+10,8,h-12,shade(color,5));rect(ctx,x+w-9,y+10,8,h-12,shade(color,-12));
  rect(ctx,x+14,y+8,13,10,'#e6cda2');rect(ctx,x+w-28,y+8,13,10,'#bdc9bd');
  rect(ctx,x+15,y+9,10,2,'#f4e3bf');
}
function pixelRoundTable(ctx,x,y,w=49,h=31){
  pixelShadow(ctx,x+2,y+8,w,h-4);rect(ctx,x+9,y+h-3,6,9,'#8b705d');rect(ctx,x+w-15,y+h-3,6,9,'#8b705d');
  [w-22,w-10,w-4,w,w,w-4,w-10,w-22].forEach((size,i)=>rect(ctx,x+(w-size)/2,y+i*4,size,4,'#856c58'));
  [w-22,w-10,w-4,w-4,w-4,w-4,w-10].forEach((size,i)=>rect(ctx,x+(w-size)/2,y+2+i*4,size,4,'#dec096'));
  rect(ctx,x+12,y+5,w-24,2,'#f1d8ae');rect(ctx,x+21,y+11,8,8,'#ecf1e5');rect(ctx,x+23,y+12,4,3,'#81a395');
}
function desk(ctx, x, y, occupants = []) {
  pixelShadow(ctx,x,y,138,53);rect(ctx,x+6,y+38,7,17,'#52636b');rect(ctx,x+123,y+38,7,17,'#52636b');
  rect(ctx,x-2,y-2,140,47,'#657d87');rect(ctx,x,y,136,40,'#e7eceb');
  rect(ctx,x+1,y+1,134,3,'#fffdf3');rect(ctx,x,y+39,136,6,'#8fa4ad');
  rect(ctx,x+2,y+40,132,1,'#bdcdd1');rect(ctx,x+3,y+42,130,2,'#728b98');
  pixelMonitor(ctx,x+14,y+5,'#63aeb7');pixelMonitor(ctx,x+86,y+5,'#7aa6c1');
  pixelLamp(ctx,x+65,y+20);coffee(ctx,x+66,y+34);
  rect(ctx,x+49,y+28,10,9,'#d5b183');rect(ctx,x+50,y+29,8,6,'#f5e7c8');rect(ctx,x+54,y+30,1,5,'#a5b2ab');
  [31,106].forEach((dx,i)=>{
    if(occupants[i]) seatedDeskAvatar(ctx,x+dx,y+71,occupants[i],'#59798a');
    else officeChair(ctx,x+dx,y+71,'#59798a');
  });
}
function shelf(ctx,x,y) {
  pixelShadow(ctx,x,y,80,35);rect(ctx,x,y,80,32,'#687988');rect(ctx,x+3,y+3,74,25,'#344d5e');
  const colors=['#729fa2','#c39869','#ac6d63','#6e8baa','#c9b68c'];
  for(let i=0;i<11;i++){const yy=y+8-(i%3)*2;rect(ctx,x+6+i*6,yy,4,19+(i%3)*2,colors[i%5]);rect(ctx,x+7+i*6,yy+2,1,16,'#ffffff55');rect(ctx,x+6+i*6,y+21,4,1,'#e7e3cf');}
  rect(ctx,x,y+28,80,4,'#8d9da7');rect(ctx,x+1,y+29,78,1,'#c2cdd1');
  rect(ctx,x+3,y+32,4,3,'#536675');rect(ctx,x+73,y+32,4,3,'#536675');
}
function board(ctx,x,y,accent) {
  rect(ctx,x+4,y+5,86,53,'#33484355');rect(ctx,x,y,86,51,'#485b5b');
  rect(ctx,x+5,y+5,76,38,'#e4e9db');rect(ctx,x+9,y+10,23,20,accent);
  for(let i=0;i<3;i++){rect(ctx,x+38,y+12+i*8,29-i*4,3,'#94aca3');rect(ctx,x+11+i*16,y+34,9,4,'#b0c69e');}
  rect(ctx,x+39,y+44,8,7,'#9b8967');
}
function screen(ctx,x,y,accent) {
  pixelMonitor(ctx,x+3,y+5,accent);
}
function coffee(ctx,x,y){
  rect(ctx,x-8,y+2,17,7,'#54463744');rect(ctx,x-10,y-4,19,8,'#f6f1db');
  rect(ctx,x-7,y-6,14,7,'#d7dbcf');rect(ctx,x+8,y-3,5,4,'#d7dbcf');
  rect(ctx,x-4,y-5,9,4,'#9b704b');
}
function detail(ctx) {
  // Original pixel-art furnishings echo a busy shared workspace.
  for(let y=62;y<492;y+=18) for(let x=57;x<741;x+=18) {
    if((Math.floor(x/18)+Math.floor(y/18))%2===0) rect(ctx,x,y,18,18,'#ffffff0b');
    rect(ctx,x,y+17,17,1,'#50654d14');
  }
  [[78,123,223,112,'#89ad91'],[455,123,228,112,'#88aebb'],[455,363,228,113,'#c1a287']].forEach(([x,y,w,h,c])=>{
    rect(ctx,x+5,y+6,w,h,'#33453f24');rect(ctx,x,y,w,h,c);
    for(let ry=y+8;ry<y+h-8;ry+=12)for(let rx=x+8;rx<x+w-8;rx+=12){rect(ctx,rx,ry,7,2,'#ffffff22');rect(ctx,rx+6,ry+2,2,5,'#ffffff22');}
  });
  board(ctx,293,65,'#97b89b');board(ctx,548,67,'#8bb4ae');board(ctx,549,309,'#caa580');
  screen(ctx,72,178,'#7ab4b4');screen(ctx,691,176,'#9ec3a8');
  rect(ctx,370,70,58,35,'#8b9e92');rect(ctx,376,73,46,27,'#263f4a');
  rect(ctx,381,79,20,4,'#82bbaa');rect(ctx,381,87,35,3,'#a2babb');
  rect(ctx,390,107,18,4,'#899e90');
  [141,209,512,585].forEach((x,i)=>coffee(ctx,x,i<2?196:193));coffee(ctx,592,432);
  // Low shelves, books and a tiny arcade cabinet in the common room.
  rect(ctx,291,386,43,46,'#758a82');rect(ctx,297,390,31,28,'#344c57');
  rect(ctx,303,396,19,13,'#84b3ad');rect(ctx,309,412,4,4,'#e7aa74');
  rect(ctx,298,423,30,4,'#536765');
  for(let i=0;i<6;i++){rect(ctx,460+i*13,321,10,25,['#7f9a8a','#a89d83','#c0a078'][i%3]);}
  rect(ctx,73,331,50,23,'#b48e67');rect(ctx,78,328,40,4,'#ddba80');
  rect(ctx,307,469,39,14,'#97a87e');rect(ctx,310,464,33,6,'#b9ca9d');
}
function sign(ctx, x, y, label, color) {
  rect(ctx,x-48,y-12,96,25,'#fafbf4');rect(ctx,x-48,y+13,96,3,'#26382316');
  ctx.fillStyle=color;ctx.font='600 11px system-ui, sans-serif';ctx.textAlign='center';ctx.fillText(label,x,y+5);
}
function nameTag(ctx,x,y,text,color='#4d6551') {
  ctx.font='11px system-ui, sans-serif'; const width=ctx.measureText(text).width+15;
  x=Math.max(width/2+8,Math.min(WORLD_WIDTH-width/2-8,x));
  if (ctx.roundRect) {
    ctx.fillStyle='#fffef4';ctx.beginPath();ctx.roundRect(x-width/2,y,width,19,6);ctx.fill();
  } else rect(ctx,x-width/2,y,width,19,'#fffef4');
  ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,x,y+13);
}
export function drawWorld(canvas, options = {}) {
  if (options.layout) return drawRoomWorld(canvas, options);
  const ctx=canvas.getContext('2d'); if (!ctx) return;
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,800,560);
  rect(ctx,36,42,730,474,'#32475b20');rect(ctx,30,32,730,474,'#87999f');plankFloor(ctx,34,28,730,474);
  rect(ctx,34,28,730,12,'#f7f6ea');rect(ctx,34,40,730,9,'#c4c9ad');
  // Cada espacio conserva su propio suelo, mobiliario y rótulo.
  rect(ctx,56,58,300,200,'#e8e9dc55');rect(ctx,434,58,306,200,'#d9e8ea55');
  rect(ctx,56,309,300,184,'#ece2d155');rect(ctx,434,309,306,184,'#e5dfd855');
  detail(ctx);
  for(let y=58;y<495;y+=24) for(let x=56;x<740;x+=24) {
    rect(ctx,x,y,1,22,'#66785108');rect(ctx,x,y+22,23,1,'#66785108');
  }
  // Muros bajos y aperturas hacia el pasillo central.
  [[56,259,235,7],[326,259,30,7],[434,259,34,7],[514,259,226,7],[56,300,100,7],[207,300,149,7],[434,300,37,7],[516,300,224,7]].forEach(([x,y,w,h])=>{rect(ctx,x,y,w,h,'#adbca0');rect(ctx,x,y-4,w,4,'#f7f8ee');});
  shelf(ctx,121,67);shelf(ctx,622,67);shelf(ctx,623,462);
  const previewLooks=options.actors===false?[]:[
    {skin:1,shirt:3,hair:'short'}, {skin:0,shirt:1,hair:'long'}, {skin:2,shirt:2,hair:'curly'}
  ];
  desk(ctx,139,140,[previewLooks[0]]);desk(ctx,510,140,[previewLooks[1]]);
  desk(ctx,510,381,[null,previewLooks[2]]);
  // Illustrated lobby: lounge seating and a textured shared reading corner.
  pixelShadow(ctx,96,351,207,129);rect(ctx,94,348,207,129,'#9caeaf');
  for(let yy=356;yy<470;yy+=12)for(let xx=102;xx<295;xx+=12){rect(ctx,xx,yy,7,1,'#dfe7d655');rect(ctx,xx+6,yy+1,1,6,'#dfe7d655');}
  pixelSofa(ctx,111,363,151,43,'#cc9e7d');pixelRoundTable(ctx,173,420,50,31);
  officeChair(ctx,136,461,'#678faa');officeChair(ctx,259,459,'#789a90');
  plant(ctx,85,95);plant(ctx,718,96);plant(ctx,718,484);plant(ctx,85,484);plant(ctx,335,346);
  // Ventanas, cuadros y alfombra de bienvenida.
  [275,489].forEach(x=>pixelWindow(ctx,x,24,50,24));
  rect(ctx,367,462,60,38,'#9eaf8c');for(let i=0;i<5;i++)rect(ctx,369,468+i*6,56,1,'#b6c5a0');
  if(options.labels!==false) {sign(ctx,217,114,'ARQUITECTURA','#58714e');sign(ctx,587,114,'REDES','#547471');sign(ctx,587,354,'SEGURIDAD','#7e7150');sign(ctx,207,333,'PUNTO DE ENCUENTRO','#8b765a');}
  const t=options.time||0;
  const shift=options.decorative?Math.sin(t/1800)*18:0;
  if(options.actors!==false){
    avatar(ctx,320,294+shift,{skin:0,shirt:2,hair:'long'});
    avatar(ctx,404+shift,374,{skin:2,shirt:1,hair:'short'});
  }
  if(options.decorative){avatar(ctx,407,276,{skin:1,shirt:0,hair:'curly'},Math.sin(t/180)*1.2);nameTag(ctx,407,286,'Tú');nameTag(ctx,320,307+shift,'¡Hola!');}
  if(options.player){avatar(ctx,options.player.x,options.player.y,options.player,options.walking?Math.sin(t/85)*2:0);nameTag(ctx,options.player.x,options.player.y+8,'Tú', '#28594c');}
}

function roomArtwork(ctx, x, y, theme) {
  const dark = theme.accent, light = '#f7f5e9';
  const tall=['bosque','musica','cafe'].includes(theme.id), wide=['oceano','arquitectura'].includes(theme.id);
  const w=wide?31:24, h=tall?30:wide?21:24;
  pixelShadow(ctx,x-3,y-3,w+6,h+6);rect(ctx,x-3,y-3,w+6,h+6,theme.edge);
  rect(ctx,x-2,y-2,w+4,1,shade(theme.edge,40));rect(ctx,x-1,y-1,w+2,h+2,'#e7d8b8');
  rect(ctx,x,y,w,h,light);
  switch (theme.id) {
    case 'bosque':
      rect(ctx,x+11,y+5,2,21,dark);
      [[5,6],[13,9],[4,14],[13,18]].forEach(([dx,dy])=>{rect(ctx,x+dx,y+dy,7,4,'#70966b');rect(ctx,x+dx+1,y+dy,5,1,'#a5be85');});
      rect(ctx,x+5,y+27,14,1,'#b4b59b');break;
    case 'oceano':
      rect(ctx,x,y,w,10,'#b5d4d5');rect(ctx,x,y+10,w,h-10,'#658f9f');
      rect(ctx,x+23,y+3,4,4,'#ecd5a3');rect(ctx,x+4,y+13,15,1,'#d6e5d7');
      rect(ctx,x+16,y+17,11,1,'#a9c7cb');rect(ctx,x+10,y+8,1,7,'#466777');
      [0,1,2].forEach(i=>rect(ctx,x+11,y+6+i*2,2+i*2,2,'#f5ecce'));break;
    case 'arte':
      rect(ctx,x+3,y+3,8,12,'#c5806c');rect(ctx,x+12,y+6,9,9,'#a8b5a2');
      rect(ctx,x+7,y+15,11,5,'#d1ae73');rect(ctx,x+14,y+3,4,3,'#698c9a');break;
    case 'cosmos':
      rect(ctx,x,y,w,h,'#293d58');
      [[4,6],[9,4],[13,9],[18,7],[17,17]].forEach(([dx,dy])=>rect(ctx,x+dx,y+dy,2,2,'#ead4a1'));
      rect(ctx,x+5,y+6,5,1,'#708ba6');rect(ctx,x+10,y+5,1,5,'#708ba6');
      rect(ctx,x+11,y+9,7,1,'#708ba6');rect(ctx,x+17,y+10,1,7,'#708ba6');break;
    case 'biblioteca':
      rect(ctx,x+4,y+5,16,14,'#d3bd91');rect(ctx,x+5,y+4,7,13,'#efe4c9');rect(ctx,x+13,y+4,6,13,'#e7d4ac');
      rect(ctx,x+12,y+5,1,12,dark);[0,1,2].forEach(i=>{rect(ctx,x+6,y+7+i*3,4,1,'#ada38d');rect(ctx,x+14,y+7+i*3,4,1,'#ada38d');});break;
    case 'laboratorio':
      for(let i=0;i<5;i++){rect(ctx,x+5+i*3,y+3+i*4,3,2,dark);rect(ctx,x+17-i*3,y+3+i*4,3,2,'#b8a16f');rect(ctx,x+8+i*2,y+4+i*4,8-i*2,1,'#8db9ac');}break;
    case 'musica':
      for(let i=0;i<5;i++)rect(ctx,x+3,y+9+i*3,18,1,'#bdb5b3');
      rect(ctx,x+15,y+5,2,14,dark);rect(ctx,x+10,y+18,6,4,dark);
      rect(ctx,x+7,y+12,2,12,dark);rect(ctx,x+3,y+23,5,3,dark);break;
    case 'tecnologia':
      rect(ctx,x+7,y+7,10,10,dark);rect(ctx,x+9,y+9,6,6,'#86aeb0');
      for(let i=0;i<3;i++){rect(ctx,x+3,y+8+i*3,4,1,'#809f9d');rect(ctx,x+17,y+8+i*3,4,1,'#809f9d');rect(ctx,x+8+i*3,y+3,1,4,'#809f9d');rect(ctx,x+8+i*3,y+17,1,4,'#809f9d');}break;
    case 'cafe':
      rect(ctx,x+4,y+12,13,10,'#b28b68');rect(ctx,x+16,y+14,5,6,'#b28b68');rect(ctx,x+18,y+16,2,2,light);
      rect(ctx,x+3,y+23,17,2,'#d1b690');[6,11,15].forEach((dx,i)=>{rect(ctx,x+dx,y+4+i%2,1,6,'#b6aba0');rect(ctx,x+dx+1,y+3+i%2,2,1,'#b6aba0');});break;
    case 'arquitectura':
      rect(ctx,x,y,w,h,'#d9e6df');
      for(let i=0;i<5;i++)rect(ctx,x+3+i*6,y+2,1,h-4,'#bccfc4');
      rect(ctx,x+7,y+5,18,12,dark);rect(ctx,x+9,y+7,14,8,'#d9e6df');
      rect(ctx,x+16,y+7,1,8,dark);rect(ctx,x+9,y+11,7,1,dark);break;
  }
}
function roomArtifact(ctx, x, y, theme) {
  const p=(dx,dy,w,h,color)=>rect(ctx,x+dx,y+dy,w,h,color);
  pixelShadow(ctx,x,y+20,28,12);
  switch(theme.id) {
    case 'bosque':
      p(3,18,21,13,'#9e8568');p(5,19,5,9,'#c5ac83');p(1,16,25,4,'#b4b58e');
      [0,1,2,3,4].forEach(i=>{p(12,2+i*3,3,16-i*3,'#557d60');p(3+i*2,3+i*3,10,3,'#7ca570');p(15,5+i*3,9-i,3,'#65966a');});break;
    case 'oceano':
      p(11,23,4,6,'#806d58');p(4,29,22,3,'#8d7f68');p(5,2,18,21,'#577d8d');
      p(3,6,22,13,'#689da4');p(7,4,14,17,'#83b8bc');p(9,7,6,8,'#a2b589');
      p(16,12,5,6,'#a2b589');p(13,3,1,19,'#557d8d');p(5,12,19,1,'#557d8d');break;
    case 'arte':
      p(5,9,3,23,'#8d7057');p(20,9,3,23,'#8d7057');p(12,0,3,27,'#a38b67');
      p(2,3,25,20,'#b49774');p(4,5,21,15,'#f0e6cc');p(7,8,7,8,'#b98369');
      p(12,12,9,6,'#8da69d');p(1,23,27,3,'#8d7057');break;
    case 'cosmos':
      p(12,17,3,15,'#6f8490');p(7,22,3,10,'#6f8490');p(18,22,3,10,'#6f8490');
      [0,1,2].forEach(i=>p(3+i*6,12-i*4,10,7,'#6d8a9d'));
      p(0,13,6,7,'#40576d');p(21,0,6,11,'#40576d');p(21,1,5,2,'#b5c7c9');break;
    case 'biblioteca':
      p(2,5,3,24,'#7c7565');p(23,5,3,24,'#7c7565');p(1,15,26,3,'#9a8464');p(1,27,26,3,'#9a8464');
      ['#9b6e5b','#738f86','#c0a475','#6e899a'].forEach((c,i)=>{p(5+i*4,6+(i%2)*2,3,9-(i%2)*2,c);p(5+i*4,20,3,7,c);});
      p(3,31,4,2,'#445a63');p(21,31,4,2,'#445a63');break;
    case 'laboratorio':
      p(3,27,23,4,'#768e91');p(12,6,4,22,'#647e83');p(10,4,12,5,'#93afb1');
      p(17,7,5,10,'#486b79');p(8,18,15,3,'#b1c4b7');p(6,22,10,3,'#658c95');
      p(2,8,5,13,'#bad4c8');p(3,13,3,7,'#75aba0');break;
    case 'musica':
      p(8,31,14,2,'#4f6170');p(13,3,3,26,'#98755e');p(12,0,6,4,'#725e51');
      p(9,15,12,5,'#c3a373');p(6,21,18,9,'#c3a373');p(8,19,14,9,'#d4b581');
      p(12,22,5,5,'#665342');p(14,4,1,20,'#e9d4a0');p(10,29,10,2,'#8e7155');break;
    case 'tecnologia':
      p(3,0,22,32,'#455e72');p(5,2,18,27,'#6e8593');
      for(let i=0;i<3;i++){p(7,5+i*8,14,5,'#344d65');p(8,6+i*8,6,1,'#8ba6b7');p(18,7+i*8,2,2,'#96c7a0');}
      p(5,30,3,3,'#334b5e');p(21,30,3,3,'#334b5e');break;
    case 'cafe':
      p(1,26,27,6,'#a08569');p(3,8,22,19,'#6e7f83');p(5,6,18,6,'#a6b4ae');
      p(6,13,16,9,'#3e5562');p(8,23,5,4,'#f0e7cc');p(17,23,5,4,'#f0e7cc');
      p(5,9,4,2,'#d5dace');p(17,9,3,2,'#d4b776');p(3,28,23,1,'#d6bb8e');break;
    case 'arquitectura':
      p(0,22,28,9,'#8ba29b');p(2,23,24,2,'#b8cac0');p(4,10,20,13,'#e4e5d5');
      p(7,7,14,3,'#bba886');p(10,3,8,4,'#cdd4c3');
      p(7,13,4,6,'#8aa9ac');p(17,13,4,6,'#8aa9ac');p(12,17,4,6,'#7e968f');break;
  }
}
function themedRug(ctx, room, theme) {
  const x=room.x+44,y=room.y+60,w=212,h=133;
  pixelShadow(ctx,x,y,w,h);
  rect(ctx,x,y,w,h,shade(theme.rug,-27));rect(ctx,x+3,y+3,w-6,h-6,theme.rug);
  rect(ctx,x+4,y+4,w-8,1,shade(theme.rug,35));rect(ctx,x+4,y+h-5,w-8,1,shade(theme.rug,-13));
  for(let ry=9;ry<h-9;ry+=14)for(let rx=9;rx<w-9;rx+=14){
    const c=shade(theme.rug,(Math.floor(rx/14)+Math.floor(ry/14))%2?9:-6);
    if(['bosque','cafe','biblioteca'].includes(theme.id)){
      rect(ctx,x+rx,y+ry,8,2,c);rect(ctx,x+rx+6,y+ry+2,2,6,c);
    }else if(['cosmos','oceano'].includes(theme.id)){
      if((rx+ry)%3===0){rect(ctx,x+rx,y+ry,3,2,c);rect(ctx,x+rx+2,y+ry+2,3,2,c);}
    }else if(['arte','musica'].includes(theme.id)){
      rect(ctx,x+rx+4,y+ry,2,3,c);rect(ctx,x+rx+2,y+ry+3,6,2,c);rect(ctx,x+rx+4,y+ry+5,2,3,c);
    }else{
      rect(ctx,x+rx,y+ry,8,1,c);rect(ctx,x+rx,y+ry,1,8,c);
    }
  }
  for(let edge=8;edge<w-8;edge+=9){rect(ctx,x+edge,y-2,4,2,'#ded8c4');rect(ctx,x+edge,y+h,4,2,'#ded8c4');}
}

function themedShelf(ctx, x, y, theme) {
  pixelShadow(ctx,x,y,80,35);
  rect(ctx,x,y,80,32,theme.edge);
  rect(ctx,x+4,y+3,72,24,theme.card);
  rect(ctx,x+1,y+1,78,2,shade(theme.edge,35));rect(ctx,x+3,y+4,74,2,shade(theme.edge,-22));
  switch (theme.id) {
    case 'bosque':
      for(let i=0;i<5;i++){rect(ctx,x+7+i*14,y+14,10,11,'#b57d5e');
        rect(ctx,x+10+i*14,y+5,5,12,i%2?'#429565':'#62b77b');}break;
    case 'oceano':
      rect(ctx,x+7,y+7,66,18,'#48b9d0');
      for(let i=0;i<4;i++){rect(ctx,x+13+i*16,y+12+(i%2)*5,7,3,'#f4d576');
        rect(ctx,x+18+i*16,y+11+(i%2)*5,2,2,'#f8fbeb');}break;
    case 'arte':
      ['#ec5c75','#f4be46','#5db8d0','#9176b6','#65bd81'].forEach((c,i)=>
        rect(ctx,x+8+i*13,y+7,9,18,c));break;
    case 'cosmos':
      rect(ctx,x+7,y+6,66,19,'#293351');
      for(let i=0;i<6;i++)rect(ctx,x+12+i*10,y+9+(i%2)*6,3,3,i%2?theme.pop:'#f5e8dd');break;
    case 'biblioteca':
      for(let i=0;i<11;i++)rect(ctx,x+7+i*6,y+7-(i%2)*2,5,18+(i%2)*2,
        ['#936858','#3b8176','#dfb85e'][i%3]);break;
    case 'laboratorio':
      for(let i=0;i<5;i++){rect(ctx,x+9+i*13,y+7,6,5,theme.accent);
        rect(ctx,x+7+i*13,y+12,10,12,i%2?'#5abcc8':'#76d0a6');}break;
    case 'musica':
      [0,1,2].forEach(i=>{rect(ctx,x+7+i*23,y+6,19,19,'#343b55');
        rect(ctx,x+13+i*23,y+12,7,7,theme.pop);});break;
    case 'tecnologia':
      [0,1,2,3].forEach(i=>{rect(ctx,x+7+i*17,y+5,14,21,'#304768');
        rect(ctx,x+10+i*17,y+8,8,3,theme.pop);rect(ctx,x+11+i*17,y+18,3,3,'#88d7a6');});break;
    case 'cafe':
      [0,1,2,3].forEach(i=>{rect(ctx,x+9+i*16,y+8,11,16,i%2?'#fff3d6':'#cf7c67');
        rect(ctx,x+11+i*16,y+4,7,4,theme.pop);});break;
    case 'arquitectura':
      [0,1,2,3].forEach(i=>{rect(ctx,x+8+i*17,y+8,13,16,'#b2c9bd');
        rect(ctx,x+10+i*17,y+11,9,2,theme.accent);});break;
  }
  rect(ctx,x,y+29,80,4,theme.accent);
  rect(ctx,x+2,y+29,76,1,shade(theme.accent,34));rect(ctx,x+3,y+33,4,3,theme.edge);rect(ctx,x+73,y+33,4,3,theme.edge);
}
function themedDesk(ctx, x, y, theme) {
  rect(ctx,x+3,y+47,137,8,'#303d3c33');
  rect(ctx,x+5,y+40,8,16,theme.edge);rect(ctx,x+121,y+40,8,16,theme.edge);
  if (theme.id === 'cafe' || theme.id === 'oceano') {
    rect(ctx,x+12,y-2,112,46,theme.edge);rect(ctx,x+3,y+5,130,33,theme.edge);
    rect(ctx,x+12,y,112,40,theme.surface);rect(ctx,x+5,y+7,126,27,theme.surface);
    rect(ctx,x+16,y+1,104,4,'#fff5dc70');
  } else if (theme.id === 'cosmos' || theme.id === 'musica' || theme.id === 'tecnologia') {
    rect(ctx,x+2,y-4,132,48,theme.edge);rect(ctx,x-2,y+4,140,37,theme.edge);
    rect(ctx,x+4,y-2,128,41,theme.surface);rect(ctx,x,y+6,136,31,theme.surface);
    rect(ctx,x+5,y,126,2,'#ffffff39');
  } else if (theme.id === 'arte' || theme.id === 'arquitectura') {
    rect(ctx,x+7,y-4,122,48,theme.edge);rect(ctx,x-2,y+3,140,38,theme.edge);
    rect(ctx,x+9,y-2,118,42,theme.surface);rect(ctx,x,y+5,136,33,theme.surface);
    rect(ctx,x+10,y,116,3,'#fff5dc70');
  } else {
    rect(ctx,x-2,y-2,140,46,theme.edge);rect(ctx,x,y,136,40,theme.surface);
    rect(ctx,x,y,136,4,'#fff5dc70');
  }
  rect(ctx,x,y+39,136,5,theme.edge);rect(ctx,x+3,y+40,130,1,shade(theme.edge,35));
  rect(ctx,x+5,y+42,126,1,shade(theme.edge,-16));
  const ink=theme.accent;
  switch (theme.id) {
    case 'bosque':
      pixelLaptop(ctx,x+14,y+5,'#74a789');pixelNotebook(ctx,x+89,y+8,30,23);
      deskPlant(ctx,x+65,y+9);coffee(ctx,x+115,y+31);break;
    case 'oceano':
      pixelNotebook(ctx,x+14,y+9,32,22);pixelMonitor(ctx,x+87,y+3,'#5a9fb4');
      rect(ctx,x+62,y+12,15,15,'#c0aa78');rect(ctx,x+65,y+15,9,9,'#e9e3cb');
      rect(ctx,x+69,y+12,1,15,'#476f86');rect(ctx,x+62,y+19,15,1,'#476f86');break;
    case 'arte':
      rect(ctx,x+13,y+6,36,27,'#9c826e');rect(ctx,x+15,y+7,32,24,'#f5ebd5');
      rect(ctx,x+20,y+12,10,8,'#d49c77');rect(ctx,x+27,y+18,14,8,'#8eafab');
      rect(ctx,x+83,y+6,38,27,'#b7b3a5');rect(ctx,x+85,y+8,34,23,'#ece9de');
      rect(ctx,x+91,y+13,19,1,'#6d909d');rect(ctx,x+98,y+11,1,17,'#6d909d');
      rect(ctx,x+62,y+14,13,14,'#748d91');rect(ctx,x+63,y+12,11,3,'#afc0b7');
      [0,1,2].forEach(i=>{rect(ctx,x+64+i*4,y+3+i,2,12,['#a97962','#d0b779','#668c9d'][i]);});break;
    case 'cosmos':
      pixelMonitor(ctx,x+13,y+3,'#677fa7');pixelLaptop(ctx,x+88,y+7,'#799cb5');
      rect(ctx,x+18,y+8,20,8,'#314a74');rect(ctx,x+23,y+10,2,2,'#e2d0a0');rect(ctx,x+32,y+13,3,2,'#b4cdd7');
      rect(ctx,x+63,y+9,13,15,'#839cac');rect(ctx,x+65,y+6,9,7,'#a7bec4');
      rect(ctx,x+66,y+8,6,2,'#588c96');rect(ctx,x+63,y+26,14,2,'#304b62');break;
    case 'biblioteca':
      pixelNotebook(ctx,x+13,y+10,34,24);pixelNotebook(ctx,x+89,y+10,31,22);
      pixelLamp(ctx,x+68,y+24);rect(ctx,x+54,y+30,11,5,'#6b959c');rect(ctx,x+54,y+28,11,2,'#cfdecf');break;
    case 'laboratorio':
      pixelMonitor(ctx,x+86,y+3,'#73aa9f');
      rect(ctx,x+18,y+7,5,17,'#718995');rect(ctx,x+21,y+7,15,5,'#91a8af');
      rect(ctx,x+28,y+12,5,9,'#557e8c');rect(ctx,x+19,y+25,20,5,'#5d7e8a');rect(ctx,x+23,y+21,12,3,'#abc7c6');
      [0,1,2].forEach(i=>{rect(ctx,x+53+i*8,y+15,5,16,'#afd4c7');rect(ctx,x+53+i*8,y+17,5,2,'#719f98');rect(ctx,x+54+i*8,y+20,2,9,'#6cafac');});
      rect(ctx,x+51,y+31,26,3,'#778f97');break;
    case 'musica':
      rect(ctx,x+16,y+9,103,25,'#344756');rect(ctx,x+19,y+12,97,18,'#f0e8d7');
      for(let k=0;k<14;k++){rect(ctx,x+19+k*7,y+12,1,18,'#8996a0');if(k%2)rect(ctx,x+22+k*7,y+12,3,10,'#384b5e');}
      [7,121].forEach(dx=>{rect(ctx,x+dx,y+6,9,25,'#425b6b');rect(ctx,x+dx+2,y+10,5,5,'#8fa5b5');rect(ctx,x+dx+2,y+21,5,5,'#738d9f');});
      rect(ctx,x+58,y+2,22,3,'#8a9eac');rect(ctx,x+56,y+4,4,8,'#395061');rect(ctx,x+78,y+4,4,8,'#395061');break;
    case 'tecnologia':
      pixelMonitor(ctx,x+13,y+3,'#78b9c5');pixelMonitor(ctx,x+85,y+3,'#7a9db9');
      [16,88].forEach(dx=>{rect(ctx,x+dx,y+7,24,10,'#33516b');rect(ctx,x+dx+3,y+9,11,1,'#a2d5b7');rect(ctx,x+dx+3,y+12,17,1,'#8ab9c7');});
      deskPlant(ctx,x+63,y+13);break;
    case 'cafe':
      pixelLaptop(ctx,x+14,y+6,'#a59c88');pixelNotebook(ctx,x+85,y+8,31,23);
      coffee(ctx,x+61,y+24);coffee(ctx,x+119,y+31);rect(ctx,x+66,y+28,11,6,'#b38559');rect(ctx,x+67,y+29,9,3,'#e3c394');break;
    case 'arquitectura':
      rect(ctx,x+12,y+6,39,28,'#dce7e2');rect(ctx,x+16,y+10,30,1,'#8cabad');
      rect(ctx,x+16,y+10,1,20,'#8cabad');rect(ctx,x+22,y+15,21,1,'#618e99');rect(ctx,x+22,y+15,1,12,'#618e99');
      rect(ctx,x+33,y+15,1,12,'#618e99');rect(ctx,x+22,y+25,21,1,'#618e99');
      pixelLaptop(ctx,x+88,y+6,'#78a1ae');
      rect(ctx,x+61,y+17,14,14,'#95aaa9');rect(ctx,x+64,y+12,8,5,'#dce6d6');rect(ctx,x+63,y+19,3,5,'#dbe8e1');rect(ctx,x+69,y+19,3,5,'#dbe8e1');break;
  }
  // Accessory details and upholstery share the same light direction.
  rect(ctx,x+1,y+1,134,1,'#fffff066');rect(ctx,x+2,y+38,132,1,shade(theme.surface,-25));
  if(['bosque','biblioteca','cafe','arquitectura'].includes(theme.id)){
    rect(ctx,x+52,y+4,7,1,shade(theme.surface,-24));rect(ctx,x+54,y+29,19,1,shade(theme.surface,-17));
  }
  if(theme.id==='tecnologia'){
    [14,84].forEach(dx=>{rect(ctx,x+dx+1,y+36,30,3,'#a6bac5');for(let k=0;k<8;k++)rect(ctx,x+dx+3+k*3,y+36,1,2,'#5b7186');});
  }else if(theme.id==='arte'){
    rect(ctx,x+58,y+29,14,6,'#657989');rect(ctx,x+60,y+30,3,3,'#d78972');rect(ctx,x+65,y+30,3,3,'#87afae');
  }else if(theme.id==='laboratorio'){
    rect(ctx,x+56,y+31,21,4,'#819fa3');rect(ctx,x+57,y+31,19,1,'#b3d3d0');
  }else if(theme.id==='oceano'){
    rect(ctx,x+53,y+30,23,5,'#6c8f9e');rect(ctx,x+55,y+31,19,2,'#a6cdd2');
  }else if(theme.id==='bosque'){
    rect(ctx,x+54,y+31,20,5,'#607f76');rect(ctx,x+55,y+31,18,2,'#a2c5b1');
  }
}
function themedSeats(ctx, x, y, theme, occupants, seatCount) {
  const seats = seatCount <= 2 ? [31,106] : seatCount === 3 ? [20,68,116]
    : seatCount === 4 ? [10,49,88,127] : [-6,31,68,105,142];
  seats.forEach((dx,i)=>{
    const member=occupants.find(person=>person.seatIndex===i);
    if(member)seatedDeskAvatar(ctx,x+dx,y+71,member.avatar||{},theme.chair);
    else officeChair(ctx,x+dx,y+71,theme.chair);
  });
}
function cornerFurnishing(ctx, x, y, theme) {
  if (theme.id === 'bosque' || theme.id === 'cafe') {
    plant(ctx, x + 14, y + 15);
    if (theme.id === 'cafe') rect(ctx,x+11,y-6,7,6,'#ee9b79');
    return;
  }
  rect(ctx,x+1,y+3,27,24,theme.edge);
  rect(ctx,x+4,y+6,21,17,theme.surface);
  switch (theme.id) {
    case 'oceano':
      rect(ctx,x+6,y+9,17,11,'#39abc6');rect(ctx,x+9,y+14,5,3,'#f5ca6d');
      rect(ctx,x+17,y+9,3,3,'#effaf6');break;
    case 'arte':
      ['#eb5876','#f4c446','#42a4d0'].forEach((c,i)=>rect(ctx,x+7+i*6,y+8,5,12,c));break;
    case 'cosmos':
      rect(ctx,x+6,y+9,17,12,'#2e355c');rect(ctx,x+13,y+10,6,6,theme.pop);
      rect(ctx,x+8,y+17,3,2,'#f8f6e2');break;
    case 'biblioteca':
      ['#8f5b5a','#427b76','#e2ba61'].forEach((c,i)=>rect(ctx,x+7+i*5,y+9,4,11,c));break;
    case 'laboratorio':
      rect(ctx,x+7,y+9,4,10,'#5ac9be');rect(ctx,x+14,y+8,6,12,'#5ab8cc');
      rect(ctx,x+6,y+18,16,3,theme.pop);break;
    case 'musica':
      rect(ctx,x+7,y+9,14,11,'#313b54');rect(ctx,x+11,y+12,6,6,theme.pop);break;
    case 'tecnologia':
      rect(ctx,x+7,y+8,15,13,'#213b57');rect(ctx,x+10,y+11,9,2,theme.pop);
      rect(ctx,x+10,y+16,7,2,'#a8e1db');break;
    case 'arquitectura':
      rect(ctx,x+9,y+8,11,12,'#eef2d9');rect(ctx,x+12,y+5,5,4,theme.pop);
      rect(ctx,x+6,y+18,16,2,theme.accent);break;
  }
}

function roomSunlight(ctx, room) {
  // Light is painted on the floor only: furniture, routes and hit targets keep
  // their real positions. Minimal non-browser drawing contexts can skip it.
  if (!ctx.createLinearGradient || !ctx.moveTo) return;
  const x = room.x + (room.center ? 176 : 153), y = room.y + 32;
  const light = ctx.createLinearGradient(x + 40, y, x - 20, y + 160);
  light.addColorStop(0, '#fffbd5a0');
  light.addColorStop(1, '#fffbd500');
  ctx.save();ctx.fillStyle=light;ctx.beginPath();
  ctx.moveTo(x,y);ctx.lineTo(x+84,y);ctx.lineTo(x+39,y+157);ctx.lineTo(x-74,y+157);ctx.closePath();ctx.fill();ctx.restore();
}

function drawRoomWorld(canvas, options) {
  const { layout }=options;
  if(canvas.width!==layout.width)canvas.width=layout.width;
  if(canvas.height!==layout.height)canvas.height=layout.height;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.imageSmoothingEnabled=false;
  rect(ctx,0,0,layout.width,layout.height,'#468189');
  plankFloor(ctx,18,18,layout.width-36,layout.height-36);
  rect(ctx,18,18,layout.width-36,5,'#f4e9cd');
  const layers=[],names=[];
  const add=(depth,draw)=>layers.push({depth,draw});
  const connectedIds=new Set([options.player?.id,...(options.peers||[]).map(peer=>peer.id)].filter(Boolean));
  const seatedByRoom=layout.rooms.map(()=>[]);
  for(const member of options.seated||[]){
    if(!connectedIds.has(member.id)&&Number.isInteger(member.roomIndex)&&seatedByRoom[member.roomIndex])
      seatedByRoom[member.roomIndex].push(member);
  }
  layout.rooms.forEach((room,i)=>{
    const theme=roomTheme(i),x=room.x,y=room.y;
    if(['cosmos','musica','tecnologia'].includes(theme.id)){
      rect(ctx,x+6,y+6,room.w-12,room.h-12,theme.floor);
      for(let ry=12;ry<room.h-10;ry+=9)for(let rx=12;rx<room.w-10;rx+=9)
        rect(ctx,x+rx,y+ry,3,2,'#ffffff20');
    }else if(theme.id==='laboratorio'){
      rect(ctx,x+6,y+6,room.w-12,room.h-12,'#e3eae5');
      for(let ry=8;ry<room.h-8;ry+=24){rect(ctx,x+6,y+ry,room.w-12,1,'#bfcdc6');
        for(let rx=8;rx<room.w-8;rx+=24)rect(ctx,x+rx,y+6,1,room.h-12,'#bfcdc644');}
    }else plankFloor(ctx,x+6,y+6,room.w-12,room.h-12,theme.floor);
    themedRug(ctx,room,theme);
    roomSunlight(ctx,room);
    room.walls.forEach(w=>{
      rect(ctx,w.x+3,w.y+5,w.w,w.h,'#30485525');
      rect(ctx,w.x,w.y,w.w,w.h,'#9dbebb');rect(ctx,w.x,w.y-3,w.w,3,'#f4e9cd');
      if(w.h<10)rect(ctx,w.x,w.y+w.h-2,w.w,2,'#468189');
    });
    roomWindow(ctx,room,theme);
    rect(ctx,x+178,y+39,46,14,'#fffff01f');
    add(room.shelf.y+35,()=>themedShelf(ctx,room.shelf.x,room.shelf.y,theme));
    add(room.plant.y+28,()=>cornerFurnishing(ctx,room.plant.x,room.plant.y,theme));
    const seatCount=Math.min(5,Math.max(2,options.seatCounts?.[i]||2));
    add(room.desk.y+44,()=>themedDesk(ctx,room.desk.x+2,room.desk.y+2,theme));
    add(room.desk.y+74,()=>themedSeats(ctx,room.desk.x+2,room.desk.y+2,theme,seatedByRoom[i],seatCount));
    const extraMembers=seatedByRoom[i].filter(member=>member.seatIndex>=5).length;
    if(extraMembers)names.push(()=>nameTag(ctx,x+150,y+158,`+${extraMembers} sin conexión`,'#647789'));
    add(room.artifact.y+room.artifact.h,()=>roomArtifact(ctx,room.artifact.x,room.artifact.y,theme));
    add(y+122,()=>roomArtwork(ctx,x+249,y+87,theme));
    if(room.center){
      rect(ctx,x+130,y-3,40,10,'#e8ddca');rect(ctx,x+130,y+7,40,3,theme.pop);
      rect(ctx,x+130,y+213,40,10,'#e8ddca');rect(ctx,x+130,y+209,40,3,theme.pop);
    }else{
      const dx=room.right?x:x+room.w;
      rect(ctx,dx-9,y+135,18,59,'#e8ddca');rect(ctx,dx-9,y+135,18,3,theme.pop);
    }
  });
  for(const area of layout.commons||[]){
    rect(ctx,area.x+7,area.y+64,179,140,'#666e8730');
    rect(ctx,area.x+5,area.y+61,179,140,area.kind==='reading'?'#9ea6b1':'#99ada8');
    for(let yy=area.y+68;yy<area.y+195;yy+=12)for(let xx=area.x+12;xx<area.x+177;xx+=12){
      rect(ctx,xx,yy,6,1,'#ffffff29');rect(ctx,xx+5,yy+1,1,5,'#ffffff29');
    }
    sign(ctx,area.x+95,area.y+53,area.kind==='reading'?'LECTURA':'ENCUENTRO','#415d71');
    for(const object of area.objects)add(object.y+object.h,()=>{
      if(object.kind==='sofa')pixelSofa(ctx,object.x,object.y,object.w,object.h,area.kind==='reading'?'#c99876':'#899baf');
      else if(object.kind==='table')pixelRoundTable(ctx,object.x,object.y,object.w,object.h);
      else if(object.kind==='shelf')shelf(ctx,object.x,object.y);
      else if(object.kind==='plant')plant(ctx,object.x+object.w/2,object.y+object.h-10);
    });
  }
  // Stone tiles and planting belong to the shared entrance outside the rooms.
  const entryY=layout.height-87;
  rect(ctx,24,entryY,layout.width-48,69,'#e3ece8');
  rect(ctx,24,entryY,layout.width-48,2,'#9dbebb');
  for(let yy=entryY+3;yy<layout.height-18;yy+=17) {
    rect(ctx,24,yy,layout.width-48,1,'#cddbd5');
    for(let xx=24+(Math.floor((yy-entryY)/17)%2)*23;xx<layout.width-24;xx+=46)
      rect(ctx,xx,yy,1,Math.min(17,layout.height-18-yy),'#cddbd5');
  }
  for(const [i,object] of (layout.exterior||[]).entries())add(object.y+object.h,()=>{
    if(object.kind==='palm')palm(ctx,object.x+object.w/2,object.y+object.h-3,i%2);
    else if(object.kind==='bench')gardenBench(ctx,object.x,object.y,object.w);
    else if(object.kind==='flowers')flowerPlanter(ctx,object.x,object.y,object.w);
  });
  rect(ctx,369,layout.height-51,62,24,'#77aca2');
  for(let i=0;i<4;i++)rect(ctx,371,layout.height-47+i*5,58,1,'#9dbebb');
  if(!layout.rooms.length)sign(ctx,400,155,'BIENVENIDO','#28594c');
  const animals=animalFrames(layout,options.ambientTime ?? options.time ?? 0,options.reducedMotion);
  for(const animal of animals)add(animal.depth,()=>drawAnimal(ctx,animal));
  const jockey=chickenJockeyFrame(layout,options.ambientTime ?? options.time ?? 0,options.reducedMotion);
  if(jockey) {
    // Keep independent depth ordering when the zombie explores a distant room.
    add(jockey.y,()=>drawChickenJockey(ctx,jockey,'chicken'));
    add(jockey.zombieY+.01,()=>drawChickenJockey(ctx,jockey,'zombie'));
  }
  const guest=avatarXFrame(layout,options.ambientTime ?? options.time ?? 0,options.reducedMotion);
  if(guest)add(guest.y,()=>drawAvatarX(ctx,guest));
  const occupied=options.player?[{x:options.player.x,y:options.player.y}]:[];
  for(const peer of options.peers||[]){
    let x=peer.x;
    for(const offset of [0,-32,32,-64,64,-96,96]){
      const candidate=Math.max(32,Math.min(layout.width-32,peer.x+offset));
      if(canWalkSegment(peer,{x:candidate,y:peer.y},layout)&&
        !occupied.some(other=>Math.abs(other.x-candidate)<27&&Math.abs(other.y-peer.y)<45)){x=candidate;break;}
    }
    occupied.push({x,y:peer.y});
    const look = peer.role === 'teacher' ? { character:'zombie', direction:peer.direction } : { ...peer.avatar, direction:peer.direction };
    add(peer.y,()=>avatar(ctx,x,peer.y,look));
    if(peer.role !== 'teacher') names.push(()=>nameTag(ctx,x,peer.y+8,peer.name||'Compañero','#38586f'));
  }
  if(options.player){
    const p=options.player;
    add(p.y,()=>avatar(ctx,p.x,p.y,p,options.walking?Math.sin((options.time||0)/85)*2:0));
    if(!options.hidePlayerName) names.push(()=>nameTag(ctx,p.x,p.y+8,options.playerName||'Tú',options.playerName?'#245e89':'#28594c'));
  }
  layers.sort((a,b)=>a.depth-b.depth).forEach(layer=>layer.draw());
  animals.forEach(animal=>{if(animal.heart)drawAnimalHeart(ctx,animal.heart);});
  names.forEach(draw=>draw());
}
