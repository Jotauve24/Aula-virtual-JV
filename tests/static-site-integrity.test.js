import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {dirname,join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const assetRoot=join(root,'assets');
const htmlPages=['index.html','live.html','docente.html','docente-sala.html'];
const walk=directory=>readdirSync(directory).flatMap(name=>{
  const path=join(directory,name);
  return statSync(path).isDirectory()?walk(path):[path];
});
const files=walk(assetRoot).filter(path=>extname(path)==='.js');
const stripQuery=path=>path.split(/[?#]/)[0];
test('all relative imports in production modules resolve to existing assets',()=>{
  let checked=0;
  for(const file of files){
    const source=readFileSync(file,'utf8');
    const imports=[...source.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/g)];
    for(const found of imports){
      const reference=found[1];
      if(!reference.startsWith('.'))continue;
      const target=resolve(dirname(file),stripQuery(reference));
      assert.ok(existsSync(target),'Missing import: '+file+' -> '+reference);
      checked++;
    }
  }
  assert.ok(checked>=15,'Unexpectedly few module imports inspected');
});
test('static pages have unique element IDs and valid local JS/CSS resources',()=>{
  for(const html of htmlPages){
    const source=readFileSync(join(root,html),'utf8');
    const ids=[...source.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
    assert.deepEqual(duplicates,[],html+' has duplicate IDs');
    const references=[...source.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="(\.[^"]+)"[^>]*>/g)];
    for(const m of references){
      const location=resolve(root,stripQuery(m[1]));
      assert.ok(existsSync(location),html+' has missing resource '+m[1]);
    }
    assert.ok(ids.length>=10,html+' has unexpectedly few UI controls');
  }
});
test('public runtime does not include a server-side Supabase secret key',()=>{
  for(const file of files){
    const code=readFileSync(file,'utf8');
    assert.doesNotMatch(code,/sb_secret_[A-Za-z0-9_-]{12,}/,
      'Secret API key leaked into '+file);
    assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+/,
      'Service role token leaked into '+file);
  }
});
test('student, teacher and ZombieAdmin pages retain independent entry points',()=>{
  const student=readFileSync(join(root,'live.html'),'utf8');
  const teacher=readFileSync(join(root,'docente.html'),'utf8');
  const simulator=readFileSync(join(root,'docente-sala.html'),'utf8');
  assert.match(student,/assets\/live\.js/);
  assert.match(teacher,/assets\/teacher\.js/);
  assert.match(simulator,/assets\/teacher-view\.js/);
  assert.doesNotMatch(student,/src="[^"]*teacher\.js/);
  assert.doesNotMatch(simulator,/src="[^"]*live\.js/);
});
