import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SKINS, SHIRTS } from '../assets/model.js';

const source = readFileSync(new URL('../assets/world.js',import.meta.url),'utf8')
  .split('function rect(ctx')[0].replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const {spriteRects,avatarSVG} = vm.runInNewContext(source+'\n({spriteRects,avatarSVG})',{SKINS,SHIRTS});

test('every saved skin, outfit, hairstyle and presentation keeps its identity without changing profile data',()=>{
  for(let skin=0;skin<SKINS.length;skin++) for(let outfit=0;outfit<SHIRTS.length;outfit++)
    for(const hair of ['short','long','curly']) for(const presentation of ['hombre','mujer']) {
      const look=Object.freeze({skin,shirt:outfit<3?outfit:0,outfit,hair,presentation});
      const before=JSON.stringify(look),svg=avatarSVG(look);
      assert.ok(svg.includes('fill="'+SKINS[skin]+'"'));
      assert.ok(svg.includes('fill="'+SHIRTS[outfit]+'"'));
      assert.equal(JSON.stringify(look),before);
    }
});
test('all walking directions and seated poses fit the existing sprite box with valid pixel geometry',()=>{
  for(const hair of ['short','long','curly']) for(const presentation of ['hombre','mujer'])
    for(const direction of ['up','down','left','right']) for(const step of [-2,-1,0,1,2]) for(const seated of [false,true]) {
      const pixels=spriteRects({skin:2,outfit:6,hair,presentation,direction},step,seated);
      for(const [x,y,w,h,color] of pixels) {
        assert.ok([x,y,w,h].every(Number.isInteger));
        assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=34&&y+h<=52,
          JSON.stringify({hair,presentation,direction,step,seated,x,y,w,h}));
        assert.match(color,/^#[0-9a-f]{6}$/i);
      }
    }
});
test('front, back and both profiles are distinct while left mirrors the complete right-facing drawing',()=>{
  const look={skin:2,outfit:6,hair:'curly'};
  const front=spriteRects({...look,direction:'down'}),back=spriteRects({...look,direction:'up'});
  const right=spriteRects({...look,direction:'right'}),left=spriteRects({...look,direction:'left'});
  assert.equal(front.filter(p=>p[4]==='#fff6e4').length,2);
  assert.equal(back.filter(p=>p[4]==='#fff6e4').length,0);
  assert.equal(right.filter(p=>p[4]==='#fff6e4').length,1);
  assert.notEqual(JSON.stringify(front),JSON.stringify(right));
  assert.equal(JSON.stringify(left),JSON.stringify(right.map(([x,y,w,h,color])=>[34-x-w,y,w,h,color])));
  assert.notEqual(JSON.stringify(spriteRects(look,-2)),JSON.stringify(spriteRects(look,2)));
});
test('legacy avatars retain their shirt fallback, numeric-string choices and deterministic safe defaults',()=>{
  assert.equal(avatarSVG({skin:'2',shirt:'1',hair:'short'}),avatarSVG({skin:2,shirt:1,hair:'short'}));
  assert.equal(avatarSVG({skin:2,shirt:1,outfit:999,hair:'short'}),avatarSVG({skin:2,shirt:1,hair:'short'}));
  assert.equal(avatarSVG(null),avatarSVG({skin:1,shirt:0,hair:'short'}));
  assert.equal(avatarSVG({skin:'__proto__',shirt:'constructor',hair:'unknown'}),avatarSVG(null));
  for(const step of [-1000,1000,NaN,Infinity]) {
    for(const [x,y,w,h] of spriteRects({},step))assert.ok([x,y,w,h].every(Number.isFinite)&&w>0&&h>0);
  }
});
test('avatar labels remain accessible text and cannot inject attributes or markup into the SVG',()=>{
  const svg=avatarSVG({},'icon" onload="alert(1)','Ana <script> & "Prueba"');
  assert.match(svg,/role="img"/);
  assert.match(svg,/aria-label="Ana &lt;script&gt; &amp; &quot;Prueba&quot;"/);
  assert.doesNotMatch(svg,/<script>|" onload="/);
  assert.match(avatarSVG({}),/aria-hidden="true"/);
  assert.match(svg,/focusable="false"/);
});
