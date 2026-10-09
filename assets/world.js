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
