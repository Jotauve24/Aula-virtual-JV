import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../',import.meta.url),version=JSON.parse(readFileSync(new URL('package.json',root))).version;
const read=file=>readFileSync(new URL(file,root),'utf8');
const manifest=JSON.parse(read('manifest.webmanifest'));
test('installed app has the exact requested name and a stable private-data-free entry point',()=>{
 assert.equal(manifest.name,'AulavirtualJV');assert.equal(manifest.short_name,'AulavirtualJV');assert.equal(manifest.display,'standalone');
 const base='https://jotauve24.github.io/Aula-virtual-JV/';
 for(const field of ['id','scope','start_url'])assert.equal(new URL(manifest[field],base).href,base);
 assert.ok(manifest.icons.some(icon=>icon.purpose.includes('maskable')));
});
test('all app entry points provide the same install identity and versioned Apple icon',()=>{
 for(const file of ['index.html','live.html','docente.html','docente-sala.html']){
  const html=read(file);assert.match(html,/<meta name="application-name" content="AulavirtualJV">/);
  assert.match(html,/<meta name="apple-mobile-web-app-title" content="AulavirtualJV">/);
  const link=html.match(/<link rel="manifest" href="([^"]+)"/)[1];assert.equal(new URL(link,root).searchParams.get('v'),version);
  assert.equal(new URL(link,root).pathname,new URL('manifest.webmanifest',root).pathname);
  assert.match(html,/<link rel="apple-touch-icon" sizes="180x180"/);
 }
});
test('install icons are actual square PNGs at the declared sizes',()=>{
 const assets=manifest.icons.map(icon=>[icon.src,Number(icon.sizes.split('x')[0])]);assets.push(['./assets/icons/apple-touch-icon.png?v='+version,180],['./assets/icons/favicon-32.png?v='+version,32]);
 for(const [src,size] of assets){
  const url=new URL(src,root);assert.equal(url.searchParams.get('v'),version);url.search='';
  const bytes=readFileSync(url);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 }
});
