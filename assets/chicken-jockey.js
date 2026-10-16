import { findPath, isWalkable, canWalkSegment } from './world-layout.js?v=20261014m';

// One ambient character with two independent silhouettes: chicken + baby zombie.
// It does not join a team, use Supabase, or change the room collision map.
export const JOCKEY_MOUNT_CYCLE = 14000;
export const JOCKEY_MOUNTED_MS = 11750; // 84% of the time riding the chicken.
const SPEED = 31; // World units/second, close to the other ambient animals.
const routeCache = new WeakMap();

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
export function chickenJockeyFrame(layout,time=0,reducedMotion=false) {
  if (!layout) return null;
  const route=prepareRoute(layout);
  const clock=Number.isFinite(time)?Math.max(0,time):0;
  const phase=reducedMotion?0:clock%route.duration;
  const part=segmentAt(route.segments,phase);
  const fraction=reducedMotion||!part.moving?0:
    Math.max(0,Math.min(1,(phase-part.start)/(part.end-part.start)));
  const x=part.from.x+(part.to.x-part.from.x)*fraction;
  const y=part.from.y+(part.to.y-part.from.y)*fraction;
  const cycle=reducedMotion?0:clock%JOCKEY_MOUNT_CYCLE;
  const mounted=reducedMotion||cycle<JOCKEY_MOUNTED_MS;
  const dismount=cycle-JOCKEY_MOUNTED_MS;
  const jump=mounted?Math.max(0,1-cycle/310):
    Math.max(0,Math.min(1,dismount/340,(JOCKEY_MOUNT_CYCLE-cycle)/370));
  const offset=mounted?0:(12+4*Math.sin(dismount/230))*jump;
  const side=part.facing==='left'?-1:1;
  const wantedX=x+side*offset;
  const zombieX=mounted?x:
    isWalkable(wantedX,y,layout)?wantedX:
    isWalkable(x-side*offset,y,layout)?x-side*offset:x;
  return {
    id:'chicken-jockey',x,y,depth:y,direction:part.facing,
    moving:!reducedMotion&&part.moving,mounted,
    zombieX,zombieY:y,step:reducedMotion?0:Math.floor(clock/145)%4,
    fidget:reducedMotion?0:Math.floor(clock/280)%4,
    mountBounce:mounted&&!reducedMotion&&cycle<310?Math.sin(cycle/310*Math.PI)*4:0
  };
}
export function chickenJockeyCycleDuration(layout) {
  return layout?prepareRoute(layout).duration:0;
}

function rect(ctx,x,y,w,h,color) {
  if (w<=0||h<=0)return;
  ctx.fillStyle=color;
  ctx.fillRect(Math.round(x),Math.round(y),w,h);
}
export function drawChickenJockey(ctx,frame) {
  if (!frame) return;
  const {x,y,mounted,moving,direction,fidget,step,zombieX,zombieY}=frame;
  const left=direction==='left', side=left||direction==='right';
  const back=direction==='up';
  const stride=moving?[0,1,0,-1][step]:0;
  const bounce=moving&&(step===1||step===3)?-1:0;
  const p=(cx,cy,dx,dy,w,h,color,mirror=left)=>
    rect(ctx,cx+(mirror?-dx-w:dx),cy+dy,w,h,color);

  // A soft translucent floor shadow, shared by the rider and chicken.
  rect(ctx,x-13,y+2,26,2,'#394d5525');
  rect(ctx,x-8,y+4,16,1,'#394d551a');

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
    const px=(dx,dy,w,h,col)=>p(cx,base,dx,dy-fidgetHop,w,h,col);
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
    if(side){
      px(3,-25,3,3,eye);
      px(4,-24,1,1,'#c3d3a0');
    }else if(!back){
      px(-6,-25,4,3,eye);
      px(2,-25,4,3,eye);
      px(-5,-26,2,1,'#9bc783');
      px(3,-26,2,1,'#9bc783');
    }else{
      px(-5,-28,10,2,hair);
      px(-4,-23,8,2,shadow);
    }
  };

  chicken(x,y);
  // One sprite pair while mounted; the tiny zombie wanders briefly beside
  // the chicken and jumps back on. Both remain part of one ambient actor.
  zombie(zombieX,zombieY,mounted);
}
