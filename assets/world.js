import { SKINS, SHIRTS } from './model.js';

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 560;
const obstacles = [
  { x: 129, y: 130, w: 155, h: 88 }, { x: 500, y: 130, w: 155, h: 88 },
  { x: 500, y: 371, w: 155, h: 88 }, { x: 97, y: 357, w: 171, h: 95 },
  { x: 67, y: 62, w: 37, h: 48 }, { x: 696, y: 62, w: 37, h: 48 },
  { x: 696, y: 463, w: 37, h: 48 }, { x: 67, y: 463, w: 37, h: 48 },
];

function spriteRects(avatar, step = 0) {
  const skin = SKINS[avatar.skin] || SKINS[1];
  const shirt = SHIRTS[avatar.shirt] || SHIRTS[0];
  const r = [];
  const add = (x, y, w, h, c) => r.push([x, y, w, h, c]);
  if (avatar.hair === 'long') add(6, 6, 20, 23, '#594735');
  add(8, 5, 16, 15, skin); add(6, 6, 2, 11, skin); add(24, 6, 2, 11, skin);
  add(8, 3, 16, 5, '#594735'); add(6, 6, 4, 5, '#594735');
  if (avatar.hair === 'curly') { add(5, 2, 21, 6, '#3e3732'); add(3, 5, 5, 10, '#3e3732'); add(24, 5, 5, 10, '#3e3732'); }
  if (avatar.direction !== 'up') { add(12, 12, 2, 2, '#35352d'); add(21, 12, 2, 2, '#35352d'); }
  else add(8, 6, 16, 9, '#594735');
  add(13, 20, 7, 3, skin); add(8, 23, 17, 14, shirt); add(4, 25, 5, 8, shirt); add(25, 25, 5, 8, shirt);
  add(4, 33, 5, 5, skin); add(25, 33, 5, 5, skin);
  add(9, 37, 7, 9 - step, '#465552'); add(19, 37, 7, 9 + step, '#465552');
  add(8, 44 - step, 8, 4, '#34403d'); add(19, 44 + step, 8, 4, '#34403d');
  return r;
}
export function avatarSVG(avatar, className = '', label = '') {
  return `<svg class="${className}" viewBox="0 0 34 52" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} shape-rendering="crispEdges">${spriteRects(avatar).map(([x,y,w,h,c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('')}</svg>`;
}
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function avatar(ctx, x, y, look, step = 0) {
  ctx.fillStyle = '#3e513129'; ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  spriteRects(look, step).forEach(([a,b,w,h,c]) => rect(ctx, x - 17 + a, y - 48 + b, w, h, c));
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
  [[78,123,223,112,'#9dad88'],[455,123,228,112,'#94b1ab'],[455,363,228,113,'#c2ab85']].forEach(([x,y,w,h,c])=>{
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
  const ctx=canvas.getContext('2d'); if (!ctx) return;
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,800,560);
  rect(ctx,36,42,730,474,'#37473113');rect(ctx,30,32,730,474,'#a9b49b');rect(ctx,34,28,730,474,'#e1dfc9');
  rect(ctx,34,28,730,12,'#f7f6ea');rect(ctx,34,40,730,9,'#c4c9ad');
  // Cada espacio conserva su propio suelo, mobiliario y rótulo.
  rect(ctx,56,58,300,200,'#d1d9be');rect(ctx,434,58,306,200,'#cbdcda');
  rect(ctx,56,309,300,184,'#e8d7bc');rect(ctx,434,309,306,184,'#ded4b8');
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
export function isWalkable(x, y) {
  return x>=55&&x<=745&&y>=85&&y<=487&&!obstacles.some(o=>x>=o.x-7&&x<=o.x+o.w+7&&y>=o.y-3&&y<=o.y+o.h+6);
}
export function findPath(from, to) {
  const start={x:Math.round(from.x/20),y:Math.round(from.y/20)};
  const end={x:Math.round(to.x/20),y:Math.round(to.y/20)};
  if(!isWalkable(end.x*20,end.y*20))return [];
  const key=p=>`${p.x},${p.y}`, queue=[start], parents=new Map([[key(start),null]]);
  for(let i=0;i<queue.length;i++){
    const current=queue[i];
    if(key(current)===key(end)){
      const path=[];let p=current;
      while(parents.get(key(p))){path.unshift({x:p.x*20,y:p.y*20});p=parents.get(key(p));}return path;
    }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:current.x+dx,y:current.y+dy};
      if(!parents.has(key(next))&&isWalkable(next.x*20,next.y*20)){parents.set(key(next),current);queue.push(next);}
    }
  }
  return [];
}
