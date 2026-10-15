import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarSVG, drawWorld } from '../assets/world.js';
import { createRoomLayout } from '../assets/world-layout.js';

test('the teacher uses one consistent zombie pixel sprite', () => {
  const front = avatarSVG({ character: 'zombie', direction: 'down' });
  const back = avatarSVG({ character: 'zombie', direction: 'up' });
  assert.match(front, /#527e46/);
  assert.match(front, /#2b9794/);
  assert.match(front, /#eff9d4/);
  assert.notEqual(front, back);
  assert.doesNotMatch(front, /Jotauve/);
});

test('the student sees an anonymous teacher zombie without hiding student names', () => {
  const labels=[], colors=[];
  const ctx={
    fillStyle:'',
    fillRect(x,y,w,h){colors.push(this.fillStyle);},
    beginPath(){},ellipse(){},fill(){},
    measureText(value){return {width:String(value).length*7};},
    fillText(value){labels.push(value);}
  };
  const canvas={width:0,height:0,getContext(){return ctx;}};
  drawWorld(canvas,{layout:createRoomLayout(0),
    player:{x:400,y:280,id:'student',skin:1,shirt:0},
    peers:[
      {id:'teacher:owner',name:'Jotauve',role:'teacher',x:370,y:265,direction:'down'},
      {id:'student-ana',name:'Ana',x:430,y:265,direction:'down',avatar:{skin:1,shirt:2}}
    ]});
  assert.ok(labels.includes('Ana'));
  assert.ok(labels.includes('Tú'));
  assert.ok(!labels.includes('Jotauve'));
  assert.ok(colors.includes('#527e46'));
  assert.ok(colors.includes('#2b9794'));
});

test('the owner avatar has no floating name in the teacher view', () => {
  const labels=[];
  const ctx={fillRect(){},beginPath(){},ellipse(){},fill(){},
    measureText:value=>({width:String(value).length*7}),
    fillText:value=>labels.push(value)};
  drawWorld({width:0,height:0,getContext:()=>ctx},{
    layout:createRoomLayout(0),
    player:{x:400,y:280,id:'teacher-local',character:'zombie',direction:'down'},
    hidePlayerName:true
  });
  assert.ok(!labels.includes('Tú'));
  assert.ok(!labels.includes('Jotauve'));
});
