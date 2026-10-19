import { findPath, isWalkable, canWalkSegment } from './world-layout.js?v=0.5.0';

// One ambient character with two independent silhouettes: chicken + baby zombie.
// It does not join a team, use Supabase, or change the room collision map.
// Both characters keep moving when separated. The zombie wanders independently
// and catches the chicken at its FUTURE position after roughly 16 seconds.
export const JOCKEY_MOUNTED_MS = 52000;
export const JOCKEY_UNMOUNTED_MS = 16000;
export const JOCKEY_MOUNT_CYCLE = JOCKEY_MOUNTED_MS + JOCKEY_UNMOUNTED_MS;
export const JOCKEY_SCALE = 0.38; // A mounted pair is about 20px tall, like the other pets.
const SPEED = 31; // Chicken units/second, close to the other ambient animals.
const ZOMBIE_SPEED = 54;
const ZOMBIE_EXPLORE_MS = 7000; // Wander first; then look for the MOVING chicken.
const routeCache = new WeakMap();
const excursionCache = new WeakMap();

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
function chickenPosition(route, time) {
  const phase=((time%route.duration)+route.duration)%route.duration;
  const part=segmentAt(route.segments,phase);
  const ratio=!part.moving?0:Math.max(0,Math.min(1,(phase-part.start)/(part.end-part.start)));
  return {x:part.from.x+(part.to.x-part.from.x)*ratio,
    y:part.from.y+(part.to.y-part.from.y)*ratio,part};
}

// Real pathfinding, not a straight-line animation: either character may
// round desks, cross a doorway, or walk through the public hall safely.
function safePath(start,goal,layout) {
  if(!isWalkable(start.x,start.y,layout)||!isWalkable(goal.x,goal.y,layout))return null;
  const nodes=canWalkSegment(start,goal,layout)?[goal]:findPath(start,goal,layout);
  if(!nodes?.length)return null;
  let from=start,length=0;
  const segments=[];
  for(const to of nodes){
    if(!canWalkSegment(from,to,layout))return null;
    const distance=Math.hypot(to.x-from.x,to.y-from.y);
    if(distance>.005){
      segments.push({from,to,start:length,end:length+distance,length:distance});
      length+=distance;
    }
    from=to;
  }
  // A partial A* result isn't a path to the desired reunion point.
  if(Math.hypot(from.x-goal.x,from.y-goal.y)>.5)return null;
  return {start,goal,segments,length};
}
function atDistance(plan,distance){
  if(!plan?.segments.length)return {...plan.start};
  const dist=Math.max(0,Math.min(plan.length,distance));
  const part=segmentAt(plan.segments,dist);
  const fraction=Math.max(0,Math.min(1,(dist-part.start)/part.length));
  return {x:part.from.x+(part.to.x-part.from.x)*fraction,
    y:part.from.y+(part.to.y-part.from.y)*fraction};
}
function pointOnPath(plan,elapsed,duration){
  if(!plan)return null;
  if(!duration||elapsed<=0)return {...plan.start};
  if(elapsed>=duration)return {...plan.goal};
  return atDistance(plan,plan.length*elapsed/duration);
}
function pursuitFor(layout,cycleIndex,route) {
  const saved=excursionCache.get(layout);
  if(saved?.cycleIndex===cycleIndex)return saved;

  const startTime=cycleIndex*JOCKEY_MOUNT_CYCLE+JOCKEY_MOUNTED_MS;
  const finishTime=(cycleIndex+1)*JOCKEY_MOUNT_CYCLE;
  const chickenAtStart=chickenPosition(route,startTime);
  const chickenAtFinish=chickenPosition(route,finishTime);
  const chickenAtExplore=chickenPosition(route,startTime+ZOMBIE_EXPLORE_MS);
  const from={x:chickenAtStart.x,y:chickenAtStart.y};
  const meeting={x:chickenAtFinish.x,y:chickenAtFinish.y};
  const deltas=[[0,-125],[0,125],[-125,0],[125,0],
    [-110,-75],[110,75],[-75,110],[75,-110],
    [0,-85],[0,85],[-85,0],[85,0]];
  const rotate=((cycleIndex%4)+4)%4;
  let best=null,bestScore=-Infinity;
  for(let i=0;i<deltas.length;i++){
    const [dx,dy]=deltas[(i+rotate)%deltas.length];
    const goal={x:from.x+dx,y:from.y+dy};
    if(!isWalkable(goal.x,goal.y,layout))continue;
    const outbound=safePath(from,goal,layout);
    if(!outbound||outbound.length>190)continue;
    const pursuit=safePath(goal,meeting,layout);
    if(!pursuit)continue;
    const separation=Math.hypot(goal.x-chickenAtExplore.x,goal.y-chickenAtExplore.y);
    const distance=Math.hypot(goal.x-from.x,goal.y-from.y);
    if(distance<65)continue;
    // The baby should explore an appreciable distance from the chicken,
    // then have sufficient time to chase its future moving position.
    const score=separation+distance*.35-Math.max(0,pursuit.length-480)*1.4;
    if(score>bestScore){
      best={outbound,pursuit,goal};bestScore=score;
    }
  }
  if(!best){
    // Narrow maps: use any small walkable excursion with a safe rendezvous.
    for(const radius of [60,45,30,15]){
      for(const [dx,dy] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
        const goal={x:from.x+dx,y:from.y+dy};
        const outbound=safePath(from,goal,layout);
        const pursuit=outbound&&safePath(goal,meeting,layout);
        if(outbound&&pursuit){best={outbound,pursuit,goal};break;}
      }
      if(best)break;
    }
  }
  if(!best){
    // Even if no detour is possible, take a verified direct route to where
    // the chicken WILL BE, not where it was when the zombie jumped off.
    const direct=safePath(from,meeting,layout);
    best={outbound:{start:from,goal:from,segments:[],length:0},
      pursuit:direct||{start:from,goal:from,segments:[],length:0},goal:from};
  }
  const plan={cycleIndex,...best,meeting};
  excursionCache.set(layout,plan);
  return plan;
}

export function chickenJockeyFrame(layout,time=0,reducedMotion=false) {
  if(!layout)return null;
  const clock=reducedMotion?0:Math.max(0,Number.isFinite(time)?time:0);
  const cycleIndex=Math.floor(clock/JOCKEY_MOUNT_CYCLE);
  const phase=clock%JOCKEY_MOUNT_CYCLE;
  const route=prepareRoute(layout);
  // Crucially, the chicken's clock NEVER stops during the dismount interval.
  const chicken=chickenPosition(route,clock);
  const {x,y,part}=chicken;
  const mounted=reducedMotion||phase<JOCKEY_MOUNTED_MS;
  let zombieX=x,zombieY=y,zombieDirection=part.facing,zombieMoving=false;
  let action='mounted';
  if(!mounted){
    const elapsed=phase-JOCKEY_MOUNTED_MS;
    const plan=pursuitFor(layout,cycleIndex,route);
    const exploring=elapsed<ZOMBIE_EXPLORE_MS;
    const path=exploring?plan.outbound:plan.pursuit;
    const localElapsed=exploring?elapsed:elapsed-ZOMBIE_EXPLORE_MS;
    const window=exploring?ZOMBIE_EXPLORE_MS:JOCKEY_UNMOUNTED_MS-ZOMBIE_EXPLORE_MS;
    const point=pointOnPath(path,localElapsed,window);
    zombieX=point.x;zombieY=point.y;
    action=exploring?'exploring':'chasing-chicken';
    zombieMoving=!reducedMotion&&path.length>0;
    const next=pointOnPath(path,Math.min(window,localElapsed+50),window);
    const prev=pointOnPath(path,Math.max(0,localElapsed-50),window);
    if(Math.hypot(next.x-prev.x,next.y-prev.y)>.01)
      zombieDirection=heading(prev,next);
  }
  return {
    id:'chicken-jockey',x,y,depth:y,direction:part.facing,
    moving:!reducedMotion&&part.moving,mounted,action,
    zombieX,zombieY,zombieDirection,zombieMoving,
    step:reducedMotion?0:Math.floor(clock/145)%4,
    fidget:reducedMotion?0:Math.floor(clock/280)%4,
    mountBounce:mounted&&!reducedMotion&&phase<310?Math.sin(phase/310*Math.PI)*3:0
  };
}
export function chickenJockeyCycleDuration(layout) {
  return layout?prepareRoute(layout).duration:0;
}
export function chickenJockeyRouteIsSafe(layout) {
  if(!layout)return false;
  return prepareRoute(layout).segments.every(segment =>
    isWalkable(segment.from.x,segment.from.y,layout) &&
    isWalkable(segment.to.x,segment.to.y,layout) &&
    canWalkSegment(segment.from,segment.to,layout)
  );
}

function rect(ctx,x,y,w,h,color) {
  if (w<=0||h<=0)return;
  ctx.fillStyle=color;
  ctx.fillRect(Math.round(x),Math.round(y),w,h);
}
export function drawChickenJockey(ctx,frame,part='both') {
  if (!frame) return;
  const {x,y,mounted,moving,direction,fidget,step,zombieX,zombieY}=frame;
  const left=direction==='left', side=left||direction==='right';
  const back=direction==='up';
  const zombieFace=frame.zombieDirection||direction;
  const zombieLeft=zombieFace==='left',zombieSide=zombieLeft||zombieFace==='right';
  const zombieBack=zombieFace==='up';
  const stride=moving?[0,1,0,-1][step]:0;
  const bounce=moving&&(step===1||step===3)?-1:0;
  const p=(cx,cy,dx,dy,w,h,color,mirror=left)=>
    rect(ctx,cx+(mirror?-dx-w:dx),cy+dy,w,h,color);

  // Each sprite is scaled around its OWN floor anchor. Therefore their real
  // separation still reaches 80–125 world pixels, not 38% of that distance.
  function drawTiny(cx,cy,draw) {
    if (typeof ctx.save!=='function' || typeof ctx.scale!=='function') {
      draw();return; // Minimal test canvas fallback.
    }
    ctx.save();
    ctx.translate(cx,cy);
    ctx.scale(JOCKEY_SCALE,JOCKEY_SCALE);
    ctx.translate(-cx,-cy);
    draw();
    ctx.restore();
  }
  if(part!=='zombie')drawTiny(x,y,()=>{
    rect(ctx,x-13,y+2,26,2,'#394d5525');
    rect(ctx,x-8,y+4,16,1,'#394d551a');
  });

  const chicken=(cx,cy)=>{
    const white='#f2f3ee',cream='#ffffff',shade='#c8d1d0',light='#e2e6e3';
    const foot='#edc452',beak='#bb8638',dark='#24313b';
    // Alternating yellow feet and long legs, even when carrying the rider.
    p(cx,cy,-6,-5+stride,3,6,foot);
    p(cx,cy,4,-5-stride,3,6,foot);
    p(cx,cy,-9,0+stride,8,2,'#f5d66a');
    p(cx,cy,2,0-stride,9,2,'#e0b64b');
    p(cx,cy,-12,-22+bounce,23,16,white);
    p(cx,cy,-12,-22+bounce,23,3,cream);
    p(cx,cy,-10,-9+bounce,19,3,shade);
    // Rounded wings and small tail.
    p(cx,cy,side?-7:-8,-17+bounce,10,9,light);
    p(cx,cy,side?-7:-8,-9+bounce,10,3,shade);
    if(side){
      p(cx,cy,-16,-19+bounce,6,7,white);
      p(cx,cy,-17,-24+bounce,5,7,cream);
      p(cx,cy,5,-28+bounce,10,14,white);
      p(cx,cy,6,-28+bounce,8,3,cream);
      p(cx,cy,12,-23+bounce,4,2,dark);
      p(cx,cy,10,-23+bounce,2,1,cream);
      p(cx,cy,13,-18+bounce,7,5,beak);
      p(cx,cy,16,-13+bounce,4,5,'#d74537');
      p(cx,cy,15,-10+bounce,3,2,'#b52d30');
    } else {
      p(cx,cy,-8,-30+bounce,16,14,white);
      p(cx,cy,-8,-30+bounce,16,3,cream);
      if(!back){
        p(cx,cy,-5,-23+bounce,3,3,dark);
        p(cx,cy,3,-23+bounce,3,3,dark);
        p(cx,cy,-6,-19+bounce,12,5,beak);
        p(cx,cy,-2,-14+bounce,5,4,'#d74537');
      }else{
        p(cx,cy,-4,-23+bounce,8,7,shade);
        p(cx,cy,-2,-19+bounce,4,4,light);
      }
    }
  };

  const zombie=(cx,cy,riding)=>{
    const skin='#5d9455',highlight='#79ad68',shadow='#416d43',hair='#36582f';
    const shirt='#07979d',shading='#046e83',pants='#3e3b93',pantsHi='#554aad';
    const boot='#384454',eye='#22352c';
    const base=cy-(riding?19:0)-(riding?(frame.mountBounce||0):0);
    const fidgetHop=frame.fidget===2&&!riding?1:0;
    const px=(dx,dy,w,h,col)=>p(cx,base,dx,dy-fidgetHop,w,h,col,zombieLeft);
    // Torso and little blue sleeves.
    px(-6,-19,12,10,shirt);
    px(-6,-19,12,2,'#18b7b5');
    px(-6,-11,12,2,shading);
    if(riding){
      px(-7,-9,7,5,pants);px(1,-9,7,5,pantsHi);
      px(-8,-5,6,3,boot);px(2,-5,6,3,boot);
    }else{
      px(-6,-9,5,9+stride,pants);
      px(1,-9,5,9-stride,pantsHi);
      px(-7,0+stride,6,2,boot);
      px(1,0-stride,6,2,boot);
    }
    const wave=frame.fidget===1?-2:0;
    px(-11,-18+wave,5,9,skin);
    px(6,-18-wave,5,9,skin);
    px(-11,-18+wave,5,2,highlight);
    px(6,-18-wave,5,2,highlight);
    // Big angular baby-zombie head, matching the reference image palette.
    px(-9,-34,18,15,skin);
    px(-9,-34,18,3,hair);
    px(-9,-31,3,10,shadow);
    px(6,-31,3,10,shadow);
    px(-5,-29,6,2,highlight);
    px(2,-27,5,2,'#699f59');
    if(zombieSide){
      px(3,-25,3,3,eye);
      px(4,-24,1,1,'#c3d3a0');
    }else if(!zombieBack){
      px(-6,-25,4,3,eye);
      px(2,-25,4,3,eye);
      px(-5,-26,2,1,'#9bc783');
      px(3,-26,2,1,'#9bc783');
    }else{
      px(-5,-28,10,2,hair);
      px(-4,-23,8,2,shadow);
    }
  };

  if(part!=='zombie')drawTiny(x,y,()=>chicken(x,y));
  if(part!=='chicken')drawTiny(zombieX,zombieY,()=>zombie(zombieX,zombieY,mounted));
}
