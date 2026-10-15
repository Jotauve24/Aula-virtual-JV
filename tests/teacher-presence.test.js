import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherPresenceStats } from '../assets/teacher-live-model.js';

const courses=[
  {id:'course-a',student_count:7,topic_count:4},
  {id:'course-b',student_count:1,topic_count:3},
  {id:'course-c',student_count:18,topic_count:7}
];

test('shows enrolled count separately from connected students',()=>{
  const value=buildTeacherPresenceStats(courses,[
    {course_id:'course-a',online_count:2},
    {course_id:'course-b',online_count:0},
    {course_id:'course-c',online_count:5}
  ]);
  assert.equal(value.courses,3);
  assert.equal(value.enrolled,26);
  assert.equal(value.online,7);
  assert.deepEqual([...value.byCourse.values()],[2,0,5]);
});
test('courses absent from response still display zero online and zero is valid',()=>{
  const value=buildTeacherPresenceStats(courses,[{course_id:'course-a',online_count:0}]);
  assert.equal(value.online,0);
  assert.equal(value.byCourse.get('course-b'),0);
  assert.equal(value.byCourse.get('course-c'),0);
});
test('does not introduce unknown courses into another teacher dashboard',()=>{
  const value=buildTeacherPresenceStats(courses,[
    {course_id:'other-teacher-course',online_count:100},
    {course_id:'course-c',online_count:1}
  ]);
  assert.equal(value.online,1);
  assert.equal(value.byCourse.has('other-teacher-course'),false);
});
test('invalid and duplicate presence reports are rejected rather than displayed as zero',()=>{
  for(const rows of [null, {}, [{course_id:'course-a',online_count:-1}],
    [{course_id:'course-a',online_count:'2'}],
    [{course_id:'course-a',online_count:NaN}],
    [{course_id:'course-a',online_count:2},{course_id:'course-a',online_count:2}]]){
    assert.throws(()=>buildTeacherPresenceStats(courses,rows));
  }
});
test('no active courses means all indicators are zero',()=>{
  const summary=buildTeacherPresenceStats([],[]);
  assert.equal(summary.courses,0);
  assert.equal(summary.enrolled,0);
  assert.equal(summary.online,0);
});
