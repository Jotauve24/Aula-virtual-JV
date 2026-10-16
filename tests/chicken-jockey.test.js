import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomLayout,isWalkable,canWalkSegment} from '../assets/world-layout.js';
import {chickenJockeyFrame,chickenJockeyCycleDuration,drawChickenJockey,
  JOCKEY_MOUNTED_MS,JOCKEY_MOUNT_CYCLE} from '../assets/chicken-jockey.js';
import {drawWorld} from '../assets/world.js';

test('chicken baby-zombie jockey walks only on real paths in different room layouts',()=>{
  for(const count of [0,1,3,8,40]){
    const layout=createRoomLayout(count);
    const original=JSON.stringify(layout);
    const length=chickenJockeyCycleDuration(layout);
    assert.ok(length>1000,'a roaming path exists');
    let last=chickenJockeyFrame(layout,0);
    const maxTime=Math.min(length,170000);
    let movement=0;
    for(let time=400;time<=maxTime;time+=400){
      const next=chickenJockeyFrame(layout,time);
      assert.equal(next.id,'chicken-jockey');
      assert.ok(isWalkable(next.x,next.y,layout),count+' rooms: chicken walked into an obstacle');
      if(!next.mounted)assert.ok(isWalkable(next.zombieX,next.zombieY,layout),
        'the baby zombie stays on a walkable tile when dismounted');
      const distance=Math.hypot(next.x-last.x,next.y-last.y);
      assert.ok(distance<31*.4+0.2,'animal moves smoothly, without teleporting');
      if(distance>0.1)movement++;
      if(distance>0.05)assert.ok(canWalkSegment(last,next,layout),
        'two positions on the same 400 ms interval must not cut through walls');
      last=next;
    }
    assert.ok(movement>8, 'chicken explores the classroom ('+count+' groups, '+movement+' moving samples)');
    assert.equal(JSON.stringify(layout),original,'scene remains unchanged');
  }
});
test('baby zombie rides for more than 80% of the time and hops down occasionally',()=>{
  assert.ok(JOCKEY_MOUNTED_MS/JOCKEY_MOUNT_CYCLE>=0.8);
  const layout=createRoomLayout(4);
  let mounted=0,dismounted=0,remounted=false;
  for(let t=0;t<JOCKEY_MOUNT_CYCLE*2;t+=100){
    const f=chickenJockeyFrame(layout,t);
    if(f.mounted)mounted++;else dismounted++;
    if(t>JOCKEY_MOUNT_CYCLE&&f.mounted)remounted=true;
    assert.ok(['left','right','up','down'].includes(f.direction));
  }
  assert.ok(mounted>0.8*(mounted+dismounted));
  assert.ok(dismounted>0);
  assert.ok(remounted);
});
test('motion-reduced room shows a still, mounted jockey regardless of the clock',()=>{
  const layout=createRoomLayout(3);
  const fixed=chickenJockeyFrame(layout,0,true);
  assert.equal(fixed.mounted,true);
  assert.equal(fixed.moving,false);
  for(const time of [12000,9999999,1792000000000]){
    assert.deepEqual(chickenJockeyFrame(layout,time,true),fixed);
  }
});
test('four directional pixel sprites always have finite positive rectangles',()=>{
  const layout=createRoomLayout(0);
  for(const facing of ['up','down','left','right']){
    for(const mounted of [true,false]){
      const pixels=[];
      const ctx={fillStyle:'',fillRect(x,y,w,h){pixels.push([x,y,w,h,this.fillStyle]);}};
      drawChickenJockey(ctx,{
        ...chickenJockeyFrame(layout,1300),direction:facing,
        mounted,x:210,y:165,zombieX:mounted?210:225,zombieY:165,
        fidget:1,step:2,moving:true
      });
      assert.ok(pixels.length>24,'sprite draws both characters ('+pixels.length+' pixel blocks)');
      assert.ok(pixels.every(pixel=>pixel.slice(0,4).every(Number.isFinite)
        &&pixel[2]>0&&pixel[3]>0),'no invalid sprite geometry');
      assert.ok(pixels.some(pixel=>pixel[4]==='#07979d'),'teal zombie shirt');
      assert.ok(pixels.some(pixel=>pixel[4]==='#d74537'),'red chicken wattle');
    }
  }
});
test('student and teacher renderer both include the ambient jockey',()=>{
  const layout=createRoomLayout(2);
  const pixels=[];
  const ctx={fillStyle:'',fillRect(x,y,w,h){pixels.push([x,y,w,h,this.fillStyle]);}};
  const canvas={width:0,height:0,getContext:()=>ctx};
  drawWorld(canvas,{layout,ambientTime:1300});
  assert.ok(pixels.some(p=>p[4]==='#07979d'),'zombie shirt is drawn in the shared world');
  assert.ok(pixels.some(p=>p[4]==='#f5d66a'),'chicken feet drawn in shared world');
});
