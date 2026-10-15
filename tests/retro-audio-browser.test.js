import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Isolated browser simulation: verify the real controller, not just its policy.
const source=readFileSync(new URL('../assets/retro-audio.js',import.meta.url),'utf8')
  .replace(/^import \{[\s\S]*?\} from '[^']+';\s*/,'');
function start(saved=null){
  let controller;
  const events={},storage=new Map(saved===null?[]:[['aulajv-sound-enabled-v1',saved]]);
  const button={
    label:'',title:'',listeners:{},attributes:{},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(event,fn){this.listeners[event]=fn;},
    set textContent(value){this.label=value;}
  };
  const room={dataset:{stage:'registration'},hidden:false};
  const document={
    hidden:false,
    querySelector:s=>s==='#room'?room:s==='#retro-sound-toggle'?button:null,
    addEventListener:(name,fn)=>{events[name]=fn;}
  };
  const music=[];
  class Player{
    constructor(url){this.url=url;this.paused=true;this.plays=0;this.pauses=0;this.listeners={};music.push(this);}
    addEventListener(name,fn){this.listeners[name]=fn;}
    play(){this.paused=false;this.plays++;return Promise.resolve();}
    pause(){this.paused=true;this.pauses++;}
  }
  class Observer{constructor(fn){controller=fn;}observe(){}}
  class Engine{constructor(){this.state='running';}resume(){return Promise.resolve();}}
  const context=vm.createContext({
    document, window:{AudioContext:Engine,addEventListener(name,fn){events[name]=fn;}},
    Audio:Player,MutationObserver:Observer,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    SOUND_STORAGE_KEY:'aulajv-sound-enabled-v1',AMBIENT_VOLUME:0.035,
    EFFECT_VOLUME:0.035,SOUND_SOURCE:'https://sonidosmp3gratis.com/sounds/ringtones-super-mario-bros.mp3',
    soundEnabled:s=>s===null||s==='true',
    shouldPlayAmbient:({enabled,stage,hidden,pageHidden})=>enabled&&stage==='room'&&!hidden&&!pageHidden,
    soundForAction:()=>null,
    setTimeout,clearTimeout
  });
  vm.runInContext(source,context);
  return {room,button,document,events,music:music[0],update:()=>controller()};
}
test('music begins only after entering the room, at 3.5%, and stops outside',()=>{
  const app=start();
  assert.equal(app.music.plays,0);
  assert.equal(app.music.volume,0.035);
  app.room.dataset.stage='room';app.update();
  assert.equal(app.music.plays,1);
  app.room.dataset.stage='avatar';app.update();
  assert.equal(app.music.paused,true);
});
test('the student can mute all sound; preference persists and room stays usable',()=>{
  const app=start();
  app.room.dataset.stage='room';app.update();
  app.button.listeners.click();
  assert.equal(app.button.attributes['aria-pressed'],'false');
  assert.match(app.button.label,/Sin sonido/);
  assert.equal(app.music.paused,true);
  app.update();assert.equal(app.music.paused,true);
});
test('audio never starts for a returning student who has already muted it',()=>{
  const app=start('false');
  app.room.dataset.stage='room';app.update();
  assert.equal(app.music.plays,0);
  assert.equal(app.button.attributes['aria-pressed'],'false');
  app.button.listeners.click();
  assert.equal(app.button.attributes['aria-pressed'],'true');
  assert.equal(app.music.plays,1);
});
test('music stops when browser tab becomes hidden or teacher view is closed',()=>{
  const app=start();
  app.room.dataset.stage='room';app.update();
  app.document.hidden=true;app.events.visibilitychange();
  assert.equal(app.music.paused,true);
  app.document.hidden=false;app.room.hidden=true;app.update();
  assert.equal(app.music.paused,true);
});
