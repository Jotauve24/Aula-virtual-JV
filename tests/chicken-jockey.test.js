import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomLayout,isWalkable,canWalkSegment} from '../assets/world-layout.js';
import {chickenJockeyFrame,chickenJockeyCycleDuration,drawChickenJockey,
  JOCKEY_MOUNTED_MS,JOCKEY_MOUNT_CYCLE,JOCKEY_UNMOUNTED_MS,JOCKEY_SCALE,chickenJockeyRouteIsSafe} from '../assets/chicken-jockey.js';
import {drawWorld} from '../assets/world.js';

test('chicken baby-zombie jockey walks only on real paths in different room layouts',()=>{
  for(const count of [0,1,3,8,40]){
    const layout=createRoomLayout(count);
    const original=JSON.stringify(layout);
    assert.ok(chickenJockeyRouteIsSafe(layout), 'every planned route segment avoids all obstacles');
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
      last=next;
    }
    assert.ok(movement>8, 'chicken explores the classroom ('+count+' groups, '+movement+' moving samples)');
    assert.equal(JSON.stringify(layout),original,'scene remains unchanged');
  }
});
test('baby zombie rides most of the time, then spends about 16 seconds away',()=>{
  assert.ok(JOCKEY_MOUNTED_MS/JOCKEY_MOUNT_CYCLE>0.7);
  assert.equal(JOCKEY_UNMOUNTED_MS,16000);
  const layout=createRoomLayout(4);
  let mounted=0,dismounted=0,remounted=false;
  for(let t=0;t<JOCKEY_MOUNT_CYCLE*2;t+=100){
    const f=chickenJockeyFrame(layout,t);
    if(f.mounted)mounted++;else dismounted++;
    if(t>JOCKEY_MOUNT_CYCLE&&f.mounted)remounted=true;
    assert.ok(['left','right','up','down'].includes(f.direction));
  }
  assert.ok(mounted>0.7*(mounted+dismounted));
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
      if(facing!=='up')assert.ok(pixels.some(pixel=>pixel[4]==='#d74537'),'visible red chicken wattle');
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

test('both chicken and zombie walk independently while apart and reunite in ~16 seconds',()=>{
  for(const count of [0,1,3,10,40]){
    const layout=createRoomLayout(count);
    const start=JOCKEY_MOUNTED_MS;
    let chickenDistance=0,zombieDistance=0,maxSeparation=0;
    let last=chickenJockeyFrame(layout,start);
    const actions=new Set();
    assert.equal(last.mounted,false);
    assert.ok(Math.hypot(last.x-last.zombieX,last.y-last.zombieY)<.01);
    for(let elapsed=100;elapsed<JOCKEY_UNMOUNTED_MS;elapsed+=100){
      const frame=chickenJockeyFrame(layout,start+elapsed);
      assert.equal(frame.mounted,false);
      actions.add(frame.action);
      assert.ok(isWalkable(frame.x,frame.y,layout),'chicken avoids obstacles in '+count+'-room layout');
      assert.ok(isWalkable(frame.zombieX,frame.zombieY,layout),'zombie avoids obstacles in '+count+'-room layout');
      const walkedChicken=Math.hypot(frame.x-last.x,frame.y-last.y);
      const walkedZombie=Math.hypot(frame.zombieX-last.zombieX,frame.zombieY-last.zombieY);
      chickenDistance+=walkedChicken;
      zombieDistance+=walkedZombie;
      maxSeparation=Math.max(maxSeparation,Math.hypot(frame.x-frame.zombieX,frame.y-frame.zombieY));
      assert.ok(walkedChicken<5,'chicken never teleports');
      assert.ok(walkedZombie<12,'zombie never teleports');
      last=frame;
    }
    assert.ok(chickenDistance>80,'chicken MUST continue roaming when zombie is away ('+count+' rooms: '+chickenDistance.toFixed(1)+')');
    assert.ok(zombieDistance>75,'zombie MUST keep wandering separately ('+count+' rooms: '+zombieDistance.toFixed(1)+')');
    assert.ok(maxSeparation>55,'independent roaming creates real separation ('+count+' rooms: '+maxSeparation.toFixed(1)+')');
    assert.deepEqual([...actions].sort(),['chasing-chicken','exploring']);
    const before=chickenJockeyFrame(layout,JOCKEY_MOUNT_CYCLE-1);
    const reunited=chickenJockeyFrame(layout,JOCKEY_MOUNT_CYCLE);
    assert.equal(reunited.mounted,true,'baby zombie returns to chicken after about 16s');
    assert.ok(Math.hypot(reunited.x-before.x,reunited.y-before.y)<.15,'chicken continues smoothly when zombie remounts');
    assert.ok(Math.hypot(reunited.zombieX-before.zombieX,reunited.zombieY-before.zombieY)<.25,'zombie actually catches up without a jump');
    assert.ok(Math.hypot(reunited.x-reunited.zombieX,reunited.y-reunited.zombieY)<.01);
  }
});
test('chicken and zombie keep moving in later wander cycles, not only the first',()=>{
  const layout=createRoomLayout(4);
  for(const cycle of [0,1,2]){
    const start=cycle*JOCKEY_MOUNT_CYCLE+JOCKEY_MOUNTED_MS;
    const first=chickenJockeyFrame(layout,start+500);
    const mid=chickenJockeyFrame(layout,start+4500);
    const pursuit=chickenJockeyFrame(layout,start+12000);
    const end=chickenJockeyFrame(layout,(cycle+1)*JOCKEY_MOUNT_CYCLE);
    assert.notDeepEqual([first.x,first.y],[mid.x,mid.y],'chicken still walks on later cycles');
    assert.notDeepEqual([first.zombieX,first.zombieY],[mid.zombieX,mid.zombieY],'zombie explores');
    assert.equal(pursuit.action,'chasing-chicken');
    assert.equal(end.mounted,true);
    assert.ok(isWalkable(end.x,end.y,layout));
  }
});
test('both sprite anchors scale independently and never exceed other animals in height',()=>{
  assert.ok(JOCKEY_SCALE<=0.4);
  function measuringCanvas(){
    const pixels=[],stack=[];let sx=1,sy=1,tx=0,ty=0;
    return {
      pixels,fillStyle:'',
      save(){stack.push([sx,sy,tx,ty]);},
      restore(){[sx,sy,tx,ty]=stack.pop();},
      translate(x,y){tx+=x*sx;ty+=y*sy;},
      scale(x,y){sx*=x;sy*=y;},
      fillRect(x,y,w,h){pixels.push({x:tx+x*sx,y:ty+y*sy,w:w*sx,h:h*sy,color:this.fillStyle});}
    };
  }
  const layout=createRoomLayout(1);
  for(const direction of ['left','right','up','down']){
    const mounted=chickenJockeyFrame(layout,1000);
    const ctx=measuringCanvas();
    drawChickenJockey(ctx,{...mounted,x:200,y:190,zombieX:200,zombieY:190,direction,zombieDirection:direction});
    const top=Math.min(...ctx.pixels.map(p=>p.y));
    const bottom=Math.max(...ctx.pixels.map(p=>p.y+p.h));
    assert.ok(bottom-top<=23,'mounted pair must be no taller than neighboring pets: '+(bottom-top));
    assert.ok(ctx.pixels.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.w>0&&p.h>0));
  }
  const ctx=measuringCanvas();
  const f=chickenJockeyFrame(layout,JOCKEY_MOUNTED_MS+5000);
  drawChickenJockey(ctx,{...f,x:200,y:190,zombieX:315,zombieY:190,mounted:false});
  const legs=ctx.pixels.filter(p=>p.color==='#f5d66a');
  const zombie=ctx.pixels.filter(p=>p.color==='#07979d');
  assert.ok(legs.length&&zombie.length);
  const zombieCenter=zombie.reduce((total,p)=>total+p.x+p.w/2,0)/zombie.length;
  assert.ok(zombieCenter>305,'scaling must preserve the distant zombie location');
});
