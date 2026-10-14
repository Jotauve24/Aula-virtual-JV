import { SKINS, SHIRTS } from './model.js?v=20261013g';

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 560;
// A room's place in the teacher's group order always keeps the same scenery.
// The first ten have their own palette and workstation; later groups get a
// fresh palette as well, since a course may have up to forty groups.
export const ROOM_THEMES = [
  { id: 'bosque', accent: '#126447', floor: '#c0f0a3', tile: '#47b883', rug: '#42a975', surface: '#ffe199', edge: '#81574b', chair: '#278e65', pop: '#ffcd43', card: '#e9ffe0' },
  { id: 'oceano', accent: '#115e88', floor: '#aff0f2', tile: '#32b7cc', rug: '#359fc2', surface: '#fff0bb', edge: '#536d85', chair: '#1684b5', pop: '#ffd568', card: '#e3fbff' },
  { id: 'arte', accent: '#9b315d', floor: '#ffd5b8', tile: '#f18589', rug: '#dc6d91', surface: '#fff0bd', edge: '#a86062', chair: '#c04485', pop: '#ffcd4b', card: '#fff0e6' },
  { id: 'cosmos', accent: '#493994', floor: '#cfb8f9', tile: '#826ad0', rug: '#554fa1', surface: '#48588f', edge: '#373d78', chair: '#8c65c5', pop: '#ffe078', card: '#f2eaff' },
  { id: 'biblioteca', accent: '#7b4c24', floor: '#ffe0a4', tile: '#d9a66a', rug: '#bc8a63', surface: '#ffdc9c', edge: '#855c49', chair: '#bd7252', pop: '#f8cd58', card: '#fff7df' },
  { id: 'laboratorio', accent: '#126e65', floor: '#b6f4df', tile: '#45c8ad', rug: '#40a9a0', surface: '#e2ffe9', edge: '#5b9187', chair: '#128e80', pop: '#69e7cf', card: '#e5fff1' },
  { id: 'musica', accent: '#8c296d', floor: '#f9c4e3', tile: '#d96db8', rug: '#a65caa', surface: '#614170', edge: '#75476c', chair: '#c34d9b', pop: '#ffcf5b', card: '#fff0fa' },
  { id: 'tecnologia', accent: '#20528c', floor: '#bfdbff', tile: '#62a5ed', rug: '#517cbd', surface: '#294f88', edge: '#375b82', chair: '#288dc0', pop: '#70edee', card: '#e9f6ff' },
  { id: 'cafe', accent: '#904533', floor: '#f9d4b6', tile: '#d8896b', rug: '#b57573', surface: '#ffe4ad', edge: '#805345', chair: '#ce705d', pop: '#ffc462', card: '#fff0e3' },
  { id: 'arquitectura', accent: '#3c6570', floor: '#d7efcf', tile: '#76b7ae', rug: '#699899', surface: '#e9f7cc', edge: '#55776e', chair: '#439c88', pop: '#f6ca58', card: '#f1fff0' }
];
export function roomTheme(index) {
  const theme = ROOM_THEMES[index % ROOM_THEMES.length];
  if (index < ROOM_THEMES.length) return theme;
  const hue = (index * 47 + 33) % 360;
  return { ...theme, accent: `hsl(${hue} 48% 29%)`, floor: `hsl(${hue} 38% 86%)`,
    tile: `hsl(${hue} 32% 74%)`, rug: `hsl(${hue} 34% 68%)`,
    chair: `hsl(${hue} 52% 42%)`, pop: `hsl(${(hue + 60) % 360} 78% 62%)`,
    card: `hsl(${hue} 65% 96%)` };
}
const obstacles = [
  { x: 129, y: 130, w: 155, h: 88 }, { x: 500, y: 130, w: 155, h: 88 },
  { x: 500, y: 371, w: 155, h: 88 }, { x: 97, y: 357, w: 171, h: 95 },
  { x: 67, y: 62, w: 37, h: 48 }, { x: 696, y: 62, w: 37, h: 48 },
  { x: 696, y: 463, w: 37, h: 48 }, { x: 67, y: 463, w: 37, h: 48 },
];

function spriteRects(avatar, step = 0, seated = false) {
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
  add(8, 3, 16, 5, hair); add(6, 6, 4, 5, hair);
  if (avatar.hair === 'curly') { add(5, 2, 21, 6, '#3e3732'); add(3, 5, 5, 10, '#3e3732'); add(24, 5, 5, 10, '#3e3732'); }
  if (avatar.direction !== 'up') { add(12, 12, 2, 2, '#35352d'); add(21, 12, 2, 2, '#35352d'); }
  else add(8, 6, 16, 9, hair);
  add(13, 20, 7, 3, skin); add(8, 23, 17, 14, shirt); add(4, 25, 5, 8, shirt); add(25, 25, 5, 8, shirt);
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
function avatar(ctx, x, y, look, step = 0, seated = false) {
  ctx.fillStyle = '#3e513129'; ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (seated) { rect(ctx, x - 15, y - 22, 30, 20, '#43556c'); rect(ctx, x - 11, y - 18, 22, 13, '#6b819a'); }
  spriteRects(look, step, seated).forEach(([a,b,w,h,c]) => rect(ctx, x - 17 + a, y - 48 + b, w, h, c));
}
function plant(ctx, x, y) {
  rect(ctx,x-11,y-8,22,15,'#b88360');rect(ctx,x-8,y+7,16,5,'#94654c');
  rect(ctx,x-3,y-32,6,25,'#51724a');rect(ctx,x-17,y-25,13,13,'#75956a');rect(ctx,x+3,y-30,14,16,'#68865c');
  rect(ctx,x-11,y-39,12,18,'#5d7e51');rect(ctx,x+1,y-42,10,17,'#86a16e');
}
function desk(ctx, x, y) {
  rect(ctx,x+3,y+45,137,8,'#79634833');rect(ctx,x+5,y+39,8,17,'#a18562');rect(ctx,x+120,y+39,8,17,'#a18562');
  rect(ctx,x-2,y-2,140,47,'#a18b66');rect(ctx,x,y,136,40,'#d7bb85');rect(ctx,x,y,136,4,'#e7ce9d');rect(ctx,x,y+39,136,5,'#b29a71');
  [x+15,x+85].forEach(dx=>{rect(ctx,dx,y+5,31,18,'#3f5551');rect(ctx,dx+3,y+8,25,11,'#c6d8cc');rect(ctx,dx+11,y+24,9,4,'#6c8177');rect(ctx,dx+5,y+30,27,5,'#f0e7cd');});
  rect(ctx,x+59,y+16,8,13,'#ded9c1');rect(ctx,x+58,y+15,10,3,'#638566');
  [x+18,x+92].forEach(dx=>{rect(ctx,dx,y+52,26,9,'#4b6862');rect(ctx,dx-2,y+42,30,16,'#8ba696');rect(ctx,dx+1,y+40,24,5,'#abc0ad');rect(ctx,dx+12,y+61,3,7,'#5c7066');});
}
function shelf(ctx,x,y) {
  rect(ctx,x,y,80,32,'#a58d66');rect(ctx,x+4,y+4,72,24,'#d5bd8c');
  const colors=['#829b74','#d0a264','#a17562','#7d959e','#d9c7a0'];
  for(let i=0;i<11;i++) rect(ctx,x+7+i*6,y+9-(i%2)*2,5,17+(i%2)*2,colors[i%5]);
  rect(ctx,x,y+29,80,4,'#947e5c');
}
function board(ctx,x,y,accent) {
  rect(ctx,x+4,y+5,86,53,'#33484355');rect(ctx,x,y,86,51,'#485b5b');
  rect(ctx,x+5,y+5,76,38,'#e4e9db');rect(ctx,x+9,y+10,23,20,accent);
  for(let i=0;i<3;i++){rect(ctx,x+38,y+12+i*8,29-i*4,3,'#94aca3');rect(ctx,x+11+i*16,y+34,9,4,'#b0c69e');}
  rect(ctx,x+39,y+44,8,7,'#9b8967');
}
function screen(ctx,x,y,accent) {
  rect(ctx,x+3,y+5,30,26,'#293a42');rect(ctx,x+6,y+8,24,16,accent);
  rect(ctx,x+9,y+11,11,2,'#d9e5c6');rect(ctx,x+9,y+16,16,2,'#abc6b5');
  rect(ctx,x+15,y+31,6,4,'#52676c');rect(ctx,x+8,y+35,21,3,'#879592');
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
  [[78,123,223,112,'#65be87'],[455,123,228,112,'#5cb9d1'],[455,363,228,113,'#e9a16e']].forEach(([x,y,w,h,c])=>{
    rect(ctx,x+5,y+6,w,h,'#33453f24');rect(ctx,x,y,w,h,c);
    for(let i=x+8;i<x+w-8;i+=16) rect(ctx,i,y+6,1,h-12,'#ffffff20');
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
  rect(ctx,x-width/2,y,width,19,'#fcfcf4');ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,x,y+13);
}
export function drawWorld(canvas, options = {}) {
  if (options.layout) return drawRoomWorld(canvas, options);
  const ctx=canvas.getContext('2d'); if (!ctx) return;
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,800,560);
  rect(ctx,36,42,730,474,'#252e5a40');rect(ctx,30,32,730,474,'#586396');rect(ctx,34,28,730,474,'#fff4d8');
  rect(ctx,34,28,730,12,'#f7f6ea');rect(ctx,34,40,730,9,'#c4c9ad');
  // Cada espacio conserva su propio suelo, mobiliario y rótulo.
  rect(ctx,56,58,300,200,'#b8edb4');rect(ctx,434,58,306,200,'#b2e7ee');
  rect(ctx,56,309,300,184,'#ffddaf');rect(ctx,434,309,306,184,'#f9c9ce');
  detail(ctx);
  for(let y=58;y<495;y+=24) for(let x=56;x<740;x+=24) {
    rect(ctx,x,y,1,22,'#66785108');rect(ctx,x,y+22,23,1,'#66785108');
  }
  // Muros bajos y aperturas hacia el pasillo central.
  [[56,259,235,7],[326,259,30,7],[434,259,34,7],[514,259,226,7],[56,300,100,7],[207,300,149,7],[434,300,37,7],[516,300,224,7]].forEach(([x,y,w,h])=>{rect(ctx,x,y,w,h,'#adbca0');rect(ctx,x,y-4,w,4,'#f7f8ee');});
  shelf(ctx,121,67);shelf(ctx,622,67);shelf(ctx,623,462);
  desk(ctx,139,140);desk(ctx,510,140);desk(ctx,510,381);
  // Espacio común con sillones y mesa de centro.
  rect(ctx,103,358,164,97,'#c3b696');rect(ctx,108,363,154,87,'#d8cfac');
  rect(ctx,113,368,40,67,'#6f8574');rect(ctx,117,372,32,54,'#9aab8f');rect(ctx,115,370,7,60,'#839a7f');
  rect(ctx,225,370,31,65,'#6f8574');rect(ctx,229,374,23,54,'#9aab8f');
  rect(ctx,172,384,34,33,'#ae9068');rect(ctx,170,382,34,29,'#dec497');rect(ctx,179,385,9,15,'#eef0db');
  rect(ctx,187,389,9,8,'#94b0a4');
  plant(ctx,85,95);plant(ctx,718,96);plant(ctx,718,484);plant(ctx,85,484);plant(ctx,335,346);
  // Ventanas, cuadros y alfombra de bienvenida.
  [275,489].forEach(x=>{rect(ctx,x,26,50,20,'#9ead94');rect(ctx,x+3,26,44,15,'#e9f3df');rect(ctx,x+25,26,3,15,'#a9b99e');});
  rect(ctx,367,462,60,38,'#9eaf8c');for(let i=0;i<5;i++)rect(ctx,369,468+i*6,56,1,'#b6c5a0');
  if(options.labels!==false) {sign(ctx,217,114,'ARQUITECTURA','#58714e');sign(ctx,587,114,'REDES','#547471');sign(ctx,587,354,'SEGURIDAD','#7e7150');sign(ctx,207,333,'PUNTO DE ENCUENTRO','#8b765a');}
  const actors=[{x:161,y:223,skin:1,shirt:3,hair:'short',direction:'up'}, {x:532,y:223,skin:0,shirt:1,hair:'long',direction:'up'}, {x:603,y:465,skin:2,shirt:2,hair:'curly',direction:'up'}];
  if(options.actors!==false) actors.forEach(p=>avatar(ctx,p.x,p.y,p));
  const t=options.time||0;
  const shift=options.decorative?Math.sin(t/1800)*18:0;
  if(options.actors!==false){
    avatar(ctx,320,294+shift,{skin:0,shirt:2,hair:'long'});
    avatar(ctx,404+shift,374,{skin:2,shirt:1,hair:'short'});
  }
  if(options.decorative){avatar(ctx,407,276,{skin:1,shirt:0,hair:'curly'},Math.sin(t/180)*1.2);nameTag(ctx,407,286,'Tú');nameTag(ctx,320,307+shift,'¡Hola!');}
  if(options.player){avatar(ctx,options.player.x,options.player.y,options.player,options.walking?Math.sin(t/85)*2:0);nameTag(ctx,options.player.x,options.player.y+8,'Tú', '#28594c');}
}
export { isWalkable, findPath } from './world-layout.js?v=20261014a';

function roomPattern(ctx, room, theme) {
  const x = room.x, y = room.y;
  // Pattern stays on the floor; all furniture still uses the original
  // collision map, so decoration never changes where students can walk.
  for (let n = 0; n < 7; n++) {
    const px = x + 21 + n * 37, py = y + 75 + (n % 3) * 42;
    switch (theme.id) {
      case 'bosque':
        rect(ctx, px, py, 8, 3, theme.tile); rect(ctx, px + 3, py - 3, 3, 9, theme.tile); break;
      case 'oceano':
        rect(ctx, px, py, 13, 2, theme.tile); rect(ctx, px + 4, py + 3, 13, 2, theme.tile);
        rect(ctx, px + 18, py - 6, 3, 3, '#f6fbef'); break;
      case 'arte':
        rect(ctx, px, py, 5, 5, ['#df5371','#ffd75d','#42a5ce'][n % 3]);
        rect(ctx, px + 11, py + 7, 3, 8, theme.tile); break;
      case 'cosmos':
        rect(ctx, px + 3, py - 3, 2, 10, theme.pop); rect(ctx, px - 1, py + 1, 10, 2, theme.pop);
        rect(ctx, px + 17, py + 9, 3, 3, theme.tile); break;
      case 'biblioteca':
        rect(ctx, px, py, 26, 2, theme.tile); rect(ctx, px + 12, py + 2, 2, 13, theme.tile); break;
      case 'laboratorio':
        rect(ctx, px, py, 5, 5, theme.tile); rect(ctx, px + 11, py + 8, 5, 5, theme.tile);
        rect(ctx, px + 5, py + 5, 8, 2, theme.tile); break;
      case 'musica':
        rect(ctx, px, py, 25, 2, theme.tile); rect(ctx, px, py + 5, 25, 2, theme.tile);
        rect(ctx, px + 18, py - 5, 2, 13, theme.pop); rect(ctx, px + 13, py + 5, 6, 4, theme.pop); break;
      case 'tecnologia':
        rect(ctx, px, py, 19, 2, theme.tile); rect(ctx, px + 17, py - 7, 2, 9, theme.tile);
        rect(ctx, px + 14, py - 10, 7, 4, theme.pop); break;
      case 'cafe':
        rect(ctx, px, py, 15, 15, theme.tile); rect(ctx, px + 15, py + 15, 10, 10, theme.tile); break;
      case 'arquitectura':
        rect(ctx, px, py, 24, 1, theme.tile); rect(ctx, px, py + 10, 24, 1, theme.tile);
        rect(ctx, px + 10, py - 5, 1, 25, theme.tile); break;
    }
  }
}
function themeProp(ctx, x, y, theme) {
  const dark = theme.accent, light = '#f7f5e9';
  switch (theme.id) {
    case 'bosque':
      rect(ctx,x,y,24,24,'#eee4c8');rect(ctx,x+3,y+4,18,16,'#9ac785');
      rect(ctx,x+11,y+5,2,15,dark);rect(ctx,x+5,y+8,6,3,dark);rect(ctx,x+13,y+11,7,3,dark); break;
    case 'oceano':
      rect(ctx,x,y,24,24,'#e9f8f2');rect(ctx,x+3,y+5,18,3,dark);
      rect(ctx,x+6,y+12,14,2,theme.tile);rect(ctx,x+2,y+17,18,2,theme.tile); break;
    case 'arte':
      rect(ctx,x,y,24,24,'#fff7e8');
      ['#d97267','#e5ba60','#6394aa'].forEach((c,i)=>rect(ctx,x+4+i*6,y+5+i*3,5,12,c)); break;
    case 'cosmos':
      rect(ctx,x,y,24,24,'#263457');rect(ctx,x+5,y+4,3,3,light);
      rect(ctx,x+12,y+11,7,7,'#eac486');rect(ctx,x+18,y+3,2,2,light); break;
    case 'biblioteca':
      rect(ctx,x,y,24,24,'#d1ad76');rect(ctx,x+3,y+3,18,17,'#f3dfb2');
      [0,1,2].forEach(i=>rect(ctx,x+5+i*5,y+7,4,10,['#9f6557','#67877b','#a47d4e'][i])); break;
    case 'laboratorio':
      rect(ctx,x,y,24,24,'#e8f9ee');rect(ctx,x+9,y+3,6,8,dark);
      rect(ctx,x+5,y+12,14,9,'#68b5a7');rect(ctx,x+7,y+10,10,3,dark); break;
    case 'musica':
      rect(ctx,x,y,24,24,'#fff1f8');rect(ctx,x+4,y+9,16,2,dark);
      rect(ctx,x+15,y+4,2,12,dark);rect(ctx,x+10,y+14,6,4,dark); break;
    case 'tecnologia':
      rect(ctx,x,y,24,24,'#d9eef8');rect(ctx,x+3,y+3,18,17,dark);
      rect(ctx,x+6,y+7,7,2,'#a8d5dc');rect(ctx,x+6,y+11,12,2,'#b5da91'); break;
    case 'cafe':
      rect(ctx,x,y,24,24,'#f6e7d1');rect(ctx,x+5,y+9,12,9,'#fff8eb');
      rect(ctx,x+17,y+11,4,4,'#fff8eb');rect(ctx,x+9,y+4,2,4,dark); break;
    case 'arquitectura':
      rect(ctx,x,y,24,24,'#f5f6e7');rect(ctx,x+4,y+4,16,16,'#9db5ab');
      rect(ctx,x+7,y+8,10,2,light);rect(ctx,x+7,y+13,10,2,light); break;
  }
}
function themedRug(ctx, room, theme) {
  const x = room.x + 58, y = room.y + 64;
  if (['oceano','cosmos','cafe'].includes(theme.id)) {
    // Stepped ovals make a very different silhouette from the square mats.
    [76,112,148,180,180,148,112,76].forEach((width,i)=>{
      rect(ctx,x+(184-width)/2+3,y+i*14+3,width,14,'#263d4930');
      rect(ctx,x+(184-width)/2,y+i*14,width,14,theme.rug);
    });
    rect(ctx,x+13,y+54,158,4,theme.pop);
    return;
  }
  rect(ctx,x-4,y+3,192,118,'#263d4930');
  rect(ctx,x,y,184,113,theme.rug);
  if (theme.id === 'arte' || theme.id === 'musica') {
    for (let i=0;i<9;i++) {
      rect(ctx,x+6+i*20,y+4,11,5,i%2?theme.pop:theme.accent);
      rect(ctx,x+6+i*20,y+105,11,5,i%2?theme.accent:theme.pop);
    }
  } else if (theme.id === 'laboratorio' || theme.id === 'tecnologia') {
    for (let i=0;i<5;i++) {
      rect(ctx,x+11+i*34,y+7,2,99,'#ffffff52');
      rect(ctx,x+8,y+10+i*22,169,2,'#ffffff52');
    }
  } else {
    rect(ctx,x+4,y+4,176,4,theme.accent);
    rect(ctx,x+4,y+105,176,4,theme.pop);
  }
}
function themedShelf(ctx, x, y, theme) {
  rect(ctx,x,y,80,32,theme.edge);
  rect(ctx,x+4,y+3,72,24,theme.card);
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
  rect(ctx,x,y+39,136,5,theme.edge);
  const ink=theme.accent;
  switch (theme.id) {
    case 'bosque':
      [16,87].forEach(dx=>{rect(ctx,x+dx,y+7,30,24,'#f3e6b7');rect(ctx,x+dx+5,y+12,15,2,ink);
        rect(ctx,x+dx+7,y+17,12,2,theme.chair);});
      rect(ctx,x+63,y+7,11,14,theme.chair);rect(ctx,x+65,y+3,7,7,'#7ab975');break;
    case 'oceano':
      [15,85].forEach(dx=>{rect(ctx,x+dx,y+7,34,24,'#e4f5ec');rect(ctx,x+dx+4,y+11,22,3,theme.chair);
        rect(ctx,x+dx+6,y+18,18,2,ink);rect(ctx,x+dx+18,y+16,2,9,ink);});
      rect(ctx,x+62,y+8,14,14,'#f4e2b4');rect(ctx,x+68,y+6,2,18,ink);break;
    case 'arte':
      rect(ctx,x+14,y+6,35,28,'#fff4df');rect(ctx,x+86,y+6,35,28,'#fff4df');
      ['#d46c67','#e6bf5f','#6fa7aa','#8d80b6'].forEach((c,i)=>{rect(ctx,x+19+i*6,y+13,5,10,c);rect(ctx,x+90+i*6,y+10+i*3,5,5,c);});
      rect(ctx,x+65,y+7,9,20,ink);rect(ctx,x+67,y+5,5,4,'#f4d0a4');break;
    case 'cosmos':
      [14,84].forEach(dx=>{rect(ctx,x+dx,y+6,36,26,'#263457');rect(ctx,x+dx+5,y+11,2,2,'#e8e5c7');
        rect(ctx,x+dx+20,y+15,7,7,'#e6bd8c');rect(ctx,x+dx+29,y+9,2,2,'#d4e6f3');});
      rect(ctx,x+63,y+7,10,18,'#adb0d2');rect(ctx,x+67,y+5,2,22,ink);break;
    case 'biblioteca':
      [13,86].forEach(dx=>{rect(ctx,x+dx,y+7,35,25,'#f1d8a6');rect(ctx,x+dx+16,y+8,2,22,ink);
        rect(ctx,x+dx+4,y+14,10,2,'#aa7954');rect(ctx,x+dx+21,y+14,10,2,'#aa7954');});
      rect(ctx,x+63,y+8,11,12,'#f6e8b9');rect(ctx,x+67,y+4,3,14,ink);break;
    case 'laboratorio':
      [15,85].forEach(dx=>{rect(ctx,x+dx,y+7,34,27,'#eaf7e8');rect(ctx,x+dx+3,y+9,28,3,ink);
        rect(ctx,x+dx+7,y+17,6,11,'#65b6a8');rect(ctx,x+dx+19,y+15,7,13,'#87c8ca');});
      rect(ctx,x+64,y+8,10,17,'#f3f4df');rect(ctx,x+67,y+5,4,5,ink);break;
    case 'musica':
      rect(ctx,x+15,y+7,103,25,'#2e3446');rect(ctx,x+18,y+11,96,18,'#f3ebdc');
      for(let k=0;k<14;k++){rect(ctx,x+18+k*7,y+11,1,18,'#7e7276');if(k%2)rect(ctx,x+21+k*7,y+11,3,10,'#34374b');}
      break;
    case 'tecnologia':
      [14,84].forEach(dx=>{rect(ctx,x+dx,y+5,38,26,'#253b53');rect(ctx,x+dx+3,y+8,32,18,'#477895');
        rect(ctx,x+dx+7,y+12,15,2,'#b9e3cc');rect(ctx,x+dx+7,y+17,22,2,'#afd4de');
        rect(ctx,x+dx+13,y+31,12,3,'#bad0d1');});
      rect(ctx,x+64,y+10,8,12,'#86ced0');break;
    case 'cafe':
      [15,85].forEach(dx=>{rect(ctx,x+dx,y+7,31,25,'#f9ead0');rect(ctx,x+dx+4,y+13,20,2,ink);
        rect(ctx,x+dx+4,y+20,16,2,'#ba9272');});
      rect(ctx,x+61,y+13,13,12,'#fdf9e8');rect(ctx,x+74,y+16,5,5,'#fdf9e8');
      rect(ctx,x+67,y+7,2,4,ink);break;
    case 'arquitectura':
      [14,84].forEach(dx=>{rect(ctx,x+dx,y+5,38,29,'#e4eee3');rect(ctx,x+dx+5,y+10,26,1,ink);
        rect(ctx,x+dx+5,y+10,1,18,ink);rect(ctx,x+dx+9,y+18,18,1,theme.chair);
        rect(ctx,x+dx+20,y+14,1,13,theme.chair);});
      rect(ctx,x+62,y+8,13,3,'#f8df9a');rect(ctx,x+62,y+11,3,16,'#f8df9a');break;
  }
  // Chairs retain the old footprint and remain legible over every palette.
  [18,92].forEach(dx=>{rect(ctx,x+dx,y+52,26,9,theme.edge);
    rect(ctx,x+dx-2,y+42,30,16,theme.chair);rect(ctx,x+dx+2,y+41,22,4,'#ffffff70');
    rect(ctx,x+dx+12,y+61,3,7,theme.edge);});
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

function drawRoomWorld(canvas, options) {
  const { layout } = options;
  if (canvas.width !== layout.width) canvas.width = layout.width;
  if (canvas.height !== layout.height) canvas.height = layout.height;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, layout.width, layout.height, '#263456');
  rect(ctx, 18, 18, layout.width - 36, layout.height - 36, '#6466a3');
  for (let y = 20; y < layout.height - 20; y += 20) {
    rect(ctx, 350, y, 100, 1, '#d4d2f133');
    rect(ctx, 399, y, 1, 20, '#b8bcfa70');
    if (y % 80 === 20) { rect(ctx, 381, y + 7, 3, 3, '#ffe284'); rect(ctx, 418, y + 7, 3, 3, '#78e4db'); }
  }
  layout.rooms.forEach((room, i) => {
    const theme = roomTheme(i);
    rect(ctx, room.x, room.y, room.w, room.h, theme.tile);
    rect(ctx, room.x + 6, room.y + 6, room.w - 12, room.h - 12, theme.floor);
    rect(ctx, room.x + 6, room.y + 6, room.w - 12, 7, theme.accent);
    roomPattern(ctx, room, theme);
    themedRug(ctx, room, theme);
    themedDesk(ctx, room.desk.x + 2, room.desk.y + 2, theme);
    themedShelf(ctx, room.shelf.x, room.shelf.y, theme);
    cornerFurnishing(ctx, room.plant.x, room.plant.y, theme);
    themeProp(ctx, room.x + 25, room.y + 154, theme);
    themeProp(ctx, room.x + 249, room.y + 87, theme);
    room.walls.forEach(w => { rect(ctx, w.x, w.y, w.w, w.h, theme.tile); rect(ctx, w.x, w.y - 3, w.w, 3, '#fffaf0'); });
    if (room.center) {
      rect(ctx, room.x + 130, room.y - 3, 40, 10, '#6466a3');
      rect(ctx, room.x + 130, room.y + 7, 40, 4, theme.pop);
      rect(ctx, room.x + 130, room.y + 213, 40, 10, '#6466a3');
      rect(ctx, room.x + 130, room.y + 209, 40, 4, theme.pop);
    } else {
      const doorX = room.right ? room.x : room.x + room.w;
      rect(ctx, doorX - 9, room.y + 135, 18, 59, '#6466a3');
      rect(ctx, doorX - 9, room.y + 135, 18, 5, theme.pop);
    }
  });
  rect(ctx, 369, layout.height - 51, 62, 24, '#80e7bf');
  if (!layout.rooms.length) sign(ctx, 400, 155, 'BIENVENIDO', '#28594c');
  for (const member of options.seated || []) {
    const theme = roomTheme(member.themeIndex);
    avatar(ctx, member.x, member.y, { ...member.avatar, direction: 'down' }, 0, true);
    rect(ctx, member.x + 10, member.y - 23, 9, 6, theme.accent);
    rect(ctx, member.x + 12, member.y - 21, 5, 2, theme.pop);
    nameTag(ctx, member.x, member.y + 8, member.name, theme.accent);
  }
  const occupied = options.player ? [{ x: options.player.x, y: options.player.y }] : [];
  for (const peer of options.peers || []) {
    let x = peer.x;
    // Nearby people stand side by side on screen, even if their saved coordinates overlap.
    for (const offset of [0, -32, 32, -64, 64, -96, 96]) {
      const candidate = Math.max(32, Math.min(layout.width - 32, peer.x + offset));
      if (!occupied.some(other => Math.abs(other.x - candidate) < 27 && Math.abs(other.y - peer.y) < 45)) {
        x = candidate; break;
      }
    }
    occupied.push({ x, y: peer.y });
    avatar(ctx, x, peer.y, peer.avatar || {});
    nameTag(ctx, x, peer.y + 8, peer.name || 'Compañero', '#4c315c');
  }
  if (options.player) { avatar(ctx, options.player.x, options.player.y, options.player, options.walking ? Math.sin((options.time || 0)/85)*2 : 0); nameTag(ctx, options.player.x, options.player.y + 8, 'Tú', '#28594c'); }
}
