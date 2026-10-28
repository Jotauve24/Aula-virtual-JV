import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherPresenceStats, presenceAgeLabel } from '../assets/teacher-live-model.js';

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

test('shows only recent students of the matching course with group and heartbeat time',()=>{
  const observed='2026-10-15T03:15:15.000Z';
  const rows=[
    {course_id:'course-a',online_count:2,observed_at:observed,students:[
      {id:'student-1',name:'Ana Pérez',group:'Grupo 1',seen_at:'2026-10-15T03:15:14.000Z'},
      {id:'student-2',name:'María Rodríguez',group:'Sin equipo',seen_at:'2026-10-15T03:15:10.000Z'}
    ]},
    {course_id:'course-b',online_count:0,observed_at:observed,students:[]},
    {course_id:'course-c',online_count:0,observed_at:observed,students:[]}
  ];
  const stats=buildTeacherPresenceStats(courses,rows);
  assert.equal(stats.online,2);
  assert.equal(stats.studentsByCourse.get('course-a')[0].name,'Ana Pérez');
  assert.equal(stats.studentsByCourse.get('course-a')[1].group,'Sin equipo');
  assert.deepEqual(stats.studentsByCourse.get('course-c'),[]);
  assert.equal(stats.observedAtByCourse.get('course-a'),observed);
});
test('rejects a missing or duplicated student and count/list disagreements',()=>{
  const one={id:'1',name:'Ana Pérez',group:'Grupo 1',seen_at:'2026-10-15T03:15:12.000Z'};
  for(const row of [
    {course_id:'course-a',online_count:2,students:[one]},
    {course_id:'course-a',online_count:2,students:[one,one]},
    {course_id:'course-a',online_count:1,students:[{...one,name:''}]},
    {course_id:'course-a',online_count:1,students:[{...one,seen_at:'tomorrow someday'}]},
    {course_id:'course-a',online_count:0,students:[],observed_at:'no-date'}
  ]) assert.throws(()=>buildTeacherPresenceStats(courses,[row]));
});
test('ignores another course roster in defense in depth',()=>{
  const stats=buildTeacherPresenceStats(courses,[
    {course_id:'unrelated-course',online_count:1,students:[
      {id:'different',name:'Otro alumno',group:'Otro',seen_at:'2026-10-15T03:15:15.000Z'}
    ]}
  ]);
  assert.equal(stats.online,0);
  assert.deepEqual([...stats.studentsByCourse.values()],[[],[],[]]);
});
test('formats last heartbeat time from server clock without trusting local time zone',()=>{
  const observed='2026-10-15T03:15:15.000Z';
  const fetched=10000;
  assert.equal(presenceAgeLabel('2026-10-15T03:15:14.000Z',observed,fetched,fetched),'Ahora mismo');
  assert.equal(presenceAgeLabel('2026-10-15T03:15:10.000Z',observed,fetched,fetched),'Hace 5 s');
  assert.equal(presenceAgeLabel('2026-10-15T03:15:10.000Z',observed,fetched,fetched+5000),'Hace 10 s');
  assert.equal(presenceAgeLabel('invalid',observed,fetched,fetched),'Señal reciente');
});

test('el seguimiento cuenta todas las marcas independientemente de la conexión',()=>{
  const stats=buildTeacherPresenceStats(courses,[{course_id:'course-a',online_count:0,students:[],
    student_count:29,topic_count:6,pending_work_group_count:4,ready_work_group_count:2,enrollment_review_count:3}]);
  assert.equal(stats.online,0);
  assert.deepEqual(stats.followUpByCourse.get('course-a'),{
    studentCount:29,topicCount:6,pendingWorkGroupCount:4,readyWorkGroupCount:2,enrollmentReviewCount:3
  });
  assert.equal(stats.followUpByCourse.get('course-b'),null);
});
test('cero pendientes es un dato válido y una respuesta sin seguimiento permanece desconocida',()=>{
  const zero={course_id:'course-a',online_count:0,student_count:0,topic_count:0,pending_work_group_count:0,ready_work_group_count:0,enrollment_review_count:0};
  assert.equal(buildTeacherPresenceStats(courses,[zero]).followUpByCourse.get('course-a').pendingWorkGroupCount,0);
  assert.equal(buildTeacherPresenceStats(courses,[{course_id:'course-a',online_count:0}]).followUpByCourse.get('course-a'),null);
});
test('el seguimiento inválido no se presenta como cero ni oculta la presencia válida',()=>{
  const row={course_id:'course-a',online_count:2,student_count:7,topic_count:4,pending_work_group_count:1,ready_work_group_count:0,enrollment_review_count:1};
  for(const patch of [{student_count:null},{topic_count:'4'},{pending_work_group_count:-1},
    {pending_work_group_count:5},{enrollment_review_count:8},{enrollment_review_count:NaN},{topic_count:1.5},
    {ready_work_group_count:undefined},{ready_work_group_count:null},{ready_work_group_count:-1},
    {ready_work_group_count:'1'},{ready_work_group_count:2},{ready_work_group_count:0.5}]) {
    const stats=buildTeacherPresenceStats(courses,[{...row,...patch}]);
    assert.equal(stats.followUpByCourse.get('course-a'),null);assert.equal(stats.online,2);
  }
  assert.equal(buildTeacherPresenceStats(courses,[{...row,course_id:'foreign'}]).followUpByCourse.has('foreign'),false);
});
