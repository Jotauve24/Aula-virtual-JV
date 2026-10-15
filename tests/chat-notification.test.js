import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncomingMessageTracker } from '../assets/chat-notification.js';

const team='course:student:team';
const msg=(id,mine=false)=>({id:String(id),mine});
test('initial unread backlog displays normally without a surprising sound',()=>{
  const tracker=createIncomingMessageTracker();
  assert.equal(tracker.check(team,[msg(1),msg(2)]),0);
  assert.equal(tracker.check(team,[msg(1),msg(2)]),0);
});
test('only new teammate messages notify, never ones sent by this student',()=>{
  const tracker=createIncomingMessageTracker();
  tracker.check(team,[msg(100)]);
  assert.equal(tracker.check(team,[msg(100),msg(101,true)]),0);
  assert.equal(tracker.check(team,[msg(100),msg(101,true),msg(102)]),1);
  assert.equal(tracker.check(team,[msg(100),msg(101,true),msg(102)]),0);
});
test('incoming batches produce one notification with a count instead of repeated pings',()=>{
  const tracker=createIncomingMessageTracker();
  tracker.check(team,[]);
  assert.equal(tracker.check(team,[msg(3),msg(4),msg(5,true)]),2);
  assert.equal(tracker.check(team,[msg(3),msg(4),msg(5,true)]),0);
});
test('switching team or returning on another course establishes a quiet baseline',()=>{
  const tracker=createIncomingMessageTracker();
  tracker.check(team,[msg(12)]);
  assert.equal(tracker.check('another-course:student:team',[msg(1),msg(2)]),0);
  assert.equal(tracker.check('another-course:student:team',[msg(1),msg(2),msg(3)]),1);
  tracker.reset();
  assert.equal(tracker.check('another-course:student:team',[msg(1),msg(2),msg(3),msg(4)]),0);
});
test('large database ids are exact and out-of-order results do not retrigger',()=>{
  const tracker=createIncomingMessageTracker();
  tracker.check(team,[msg('9223372036854775800')]);
  assert.equal(tracker.check(team,[msg('9223372036854775803'),msg('9223372036854775801')]),2);
  assert.equal(tracker.check(team,[msg('9223372036854775801')]),0);
});
test('invalid records are ignored and never trigger a false arrival',()=>{
  const tracker=createIncomingMessageTracker();
  assert.equal(tracker.check('',[msg(1)]),0);
  assert.equal(tracker.check(team,null),0);
  assert.equal(tracker.check(team,[{id:'invalid',mine:false}]),0);
  assert.equal(tracker.check(team,[{id:'invalid',mine:false},msg(1)]),1);
});
