import test from 'node:test';
import assert from 'node:assert/strict';
import {AMBIENT_VOLUME,EFFECT_VOLUME,SOUND_SOURCE,soundEnabled,
  shouldPlayAmbient,soundForAction} from '../assets/retro-audio-model.js';

test('the Mario reference stays very quiet while effects remain subtle',()=>{
  assert.ok(AMBIENT_VOLUME>0 && AMBIENT_VOLUME<=0.04);
  assert.ok(EFFECT_VOLUME>0 && EFFECT_VOLUME<=0.05);
  assert.match(SOUND_SOURCE,/^https:\/\/sonidosmp3gratis\.com\/sounds\/.*\.mp3$/);
});
test('sound preference starts enabled but respects an explicit mute',()=>{
  assert.equal(soundEnabled(null),true);
  assert.equal(soundEnabled('true'),true);
  assert.equal(soundEnabled('false'),false);
});
test('music only plays in a visible classroom when permitted',()=>{
  const conditions={enabled:true,stage:'room',hidden:false,pageHidden:false};
  assert.equal(shouldPlayAmbient(conditions),true);
  for(const key of ['enabled','stage','hidden','pageHidden']){
    const value=key==='stage'?'registration':!conditions[key];
    assert.equal(shouldPlayAmbient({...conditions,[key]:value}),false);
  }
});
test('only meaningful student actions produce sound effects',()=>{
  for(const [selector,expected] of [
    ['#next-question','step'],['#previous-question','step'],
    ['#finish-registration','finish'],
    ['#avatar-form button[type="submit"]','finish'],
    ['.join-confirm-actions .danger','join'],
    ['#team-chat-form button[type="submit"]','send'],
    ['#restart-demo','step']
  ]){
    const target={closest:query=>query.includes(selector)?{}:null};
    assert.equal(soundForAction(target),expected,selector);
  }
  assert.equal(soundForAction({closest:()=>null}),null);
  assert.equal(soundForAction(null),null);
});
