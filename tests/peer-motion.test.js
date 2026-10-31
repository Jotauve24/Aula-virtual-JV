import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerMotion } from '../assets/peer-motion.js';
import { createRoomLayout, canWalkSegment, isWalkable } from '../assets/world-layout.js';
import { drawWorld } from '../assets/world.js';

const peer=(x=380,y=330,extra={})=>({id:'ana',name:'Ana',x,y,direction:'right',avatar:{skin:1,shirt:0},...extra});

test('un compañero recorre posiciones intermedias entre dos respuestas del servidor',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer()],layout,0);motion.sample(0);
  motion.update([peer(420)],layout,750);
  assert.equal(motion.sample(750)[0].x,380,'receiving a new position must not jump there');
  for(let time=780;time<1125;time+=25)motion.sample(time);
  const middle=motion.sample(1125)[0];assert.ok(middle.x>380&&middle.x<420);assert.equal(middle.walking,true);
  for(let time=1150;time<1500;time+=25)motion.sample(time);
  const end=motion.sample(1500)[0];assert.equal(end.x,420);assert.equal(end.walking,false);
});
test('actualizar una ruta en marcha conserva exactamente la posición visible',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer(400,500)],layout,0);motion.update([peer(400,420)],layout,750);
  const before=motion.sample(1100)[0];motion.update([peer(400,340)],layout,1100);const after=motion.sample(1100)[0];
  assert.equal(before.x,after.x);assert.equal(before.y,after.y);assert.equal(after.walking,true);
  assert.ok(motion.sample(1200)[0].y<after.y);
});
test('los pasos remotos rodean paredes y muebles por suelo transitable',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer(190,100)],layout,0);motion.update([peer(610,100)],layout,750);
  let previous=motion.sample(750)[0];
  for(let time=790;time<=8750;time+=40){
    const point=motion.sample(time)[0];assert.ok(isWalkable(point.x,point.y,layout));
    assert.ok(canWalkSegment(previous,point,layout),'intermediate movement cannot cut across a wall');
    assert.ok(Math.hypot(point.x-previous.x,point.y-previous.y)<10,'a frame cannot teleport to the next room');previous=point;
  }
  assert.equal(previous.x,610);assert.equal(previous.y,100);
});
test('la separación entre personas en el mismo lugar es gradual y estable',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4),player={x:400,y:330};
  const rows=[peer(400,330),peer(400,330,{id:'luis',name:'Luis'})];motion.update(rows,layout,0);
  const first=motion.sample(0,player);assert.deepEqual(first.map(p=>p.x),[400,400]);
  const later=motion.sample(250,player);assert.ok(later[0].x<400&&later[1].x>400);
  assert.ok(later.every(p=>Math.abs(p.x-400)<=30));
  motion.update([...rows].reverse(),layout,500);const stable=motion.sample(500,player);
  assert.deepEqual(stable.map(p=>p.id),['ana','luis']);assert.ok(stable[0].x<400&&stable[1].x>400);
});
test('respuestas idénticas no reinician el recorrido y las desconexiones retiran al actor',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer()],layout,0);motion.update([peer(420)],layout,750);
  for(let time=775;time<=1100;time+=25)motion.sample(time);
  motion.update([peer(420)],layout,1100);
  for(let time=1125;time<1500;time+=25)motion.sample(time);
  assert.equal(motion.sample(1500)[0].x,420);
  motion.update([],layout,1600);assert.deepEqual(motion.sample(1700),[]);assert.equal(motion.moving(),false);
  motion.update([peer()],layout,1800);motion.reset();assert.deepEqual(motion.sample(1900),[]);
});
test('un fotograma lento no teletransporta al compañero ni cambia de golpe su separación',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer(400,500)],layout,0);motion.update([peer(400,200)],layout,750);
  const before=motion.sample(750)[0],after=motion.sample(6000)[0];
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<=10.5);assert.equal(after.walking,true);
});
test('una nueva geometría no conserva rutas viejas ni acepta posiciones inválidas',()=>{
  const motion=createPeerMotion(),layout=createRoomLayout(4);
  motion.update([peer()],layout,0);motion.update([peer(420)],layout,750);
  const next=createRoomLayout(2);motion.update([peer(400,260)],next,800);
  assert.equal(motion.sample(800)[0].y,260);assert.equal(motion.sample(800)[0].walking,false);
  motion.update([peer(NaN),peer(1),peer(120,120)],next,900);assert.deepEqual(motion.sample(900),[]);
});

test('el lienzo anima las piernas del estudiante local y las de su compañero',()=>{
  function frame(time,reducedMotion=false){
    const rects=[];const ctx={fillStyle:'',fillRect(x,y,w,h){rects.push([x,y,w,h,this.fillStyle]);},
      beginPath(){},ellipse(){},fill(){},measureText:value=>({width:String(value).length*7}),fillText(){}};
    drawWorld({width:0,height:0,getContext:()=>ctx},{layout:createRoomLayout(0),actors:false,ambientTime:0,time,reducedMotion,
      player:{id:'local',x:380,y:65,skin:1,shirt:0},walking:true,
      peers:[peer(430,65,{walking:true,smoothPosition:true})]});
    return {local:rects.filter(([x,y])=>x>=360&&x<=400&&y>=40&&y<=65),remote:rects.filter(([x,y])=>x>=410&&x<=450&&y>=40&&y<=65)};
  }
  const still=frame(0),step=frame(134);assert.notDeepEqual(still.local,step.local);assert.notDeepEqual(still.remote,step.remote);
  assert.deepEqual(frame(0,true).remote,frame(134,true).remote,'reduced motion suppresses decorative leg swings');
});
