import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarXFrame, AVATAR_X_HEIGHT } from '../assets/avatar-x.js';
import { createRoomLayout, isWalkable } from '../assets/world-layout.js';

test('avatar X walks only on the floor without teleporting across route boundaries', () => {
  assert.equal(AVATAR_X_HEIGHT,26);
  for(const count of [0,1,4,10,40]) {
    const layout=createRoomLayout(count), original=JSON.stringify(layout);
    let previous=avatarXFrame(layout,0), walking=0;
    for(let time=100;time<600000;time+=100){
      const frame=avatarXFrame(layout,time);
      assert.ok(isWalkable(frame.x,frame.y,layout));
      assert.ok(Math.hypot(frame.x-previous.x,frame.y-previous.y)<=2.50001);
      if(frame.moving) walking++;
      previous=frame;
    }
    assert.ok(walking>100);
    assert.equal(JSON.stringify(layout),original);
    assert.deepEqual(avatarXFrame(layout,9000,true),avatarXFrame(layout,0,true));
  }
});
