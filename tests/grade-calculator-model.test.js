import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGrade, validateGradeActivities, normalizeGradeDraft, calculateGrades, projectPendingGrades, DEFAULT_GRADE_ACTIVITIES } from '../assets/grade-calculator-model.js';

const plan = [{ id: 'a', name: 'Actividad', weight: 30 }, { id: 'b', name: 'Proyecto', weight: 70 }];
test('what-if shows 69.5 with 80 and 71 with 86 while preserving the original grades', () => {
  const activities=[{id:'done',name:'Notas ingresadas',weight:75},{id:'unit',name:'Unidad VI',weight:20},{id:'forum',name:'Foro VI',weight:5}];
  const values={done:66,unit:'',forum:''},before=structuredClone(values);
  const low=projectPendingGrades(activities,values,71,80),met=projectPendingGrades(activities,values,71,86);
  assert.equal(low.base.earned,49.5);assert.equal(low.projected.earned,69.5);assert.equal(low.projected.missing,1.5);
  assert.equal(met.projected.earned,71);assert.equal(met.projected.status,'complete-met');
  assert.deepEqual(values,before);assert.deepEqual(met.projected.grades,{done:66,unit:86,forum:86});
});
test('what-if preserves recorded zeroes, decimal precision and genuine impossible targets', () => {
  const rows=[{id:'zero',name:'Con nota cero',weight:10},{id:'done',name:'Con nota',weight:65},{id:'pending',name:'Pendiente',weight:25}];
  const trial=projectPendingGrades(rows,{zero:0,done:'76,15'},71,'86,01');
  assert.equal(trial.projected.grades.zero,0);assert.equal(trial.projected.grades.done,76.15);assert.equal(trial.assumedGrade,86.01);
  assert.equal(trial.projected.earned,71);
  assert.equal(projectPendingGrades(plan,{a:0},71,100).projected.status,'complete-missed');
  for(const value of ['','101','oops','-1'])assert.throws(()=>projectPendingGrades(plan,{},71,value));
  assert.throws(()=>projectPendingGrades(plan,{a:101},71,80));
});
test('blank grades stay pending, while zero is a real completed grade', () => {
  const empty = calculateGrades(plan, {}, 71);
  assert.equal(empty.average, null); assert.equal(empty.remainingWeight, 100);
  assert.equal(empty.required, 71);
  const zero = calculateGrades(plan, { a: 0 }, 71);
  assert.equal(zero.average, 0); assert.equal(zero.completedWeight, 30);
  assert.equal(zero.status, 'unreachable'); assert.equal(zero.maximum, 70);
});
test('weighted results and the common minimum account for all pending work', () => {
  const result = calculateGrades(plan, { a: 80 }, 71);
  assert.equal(result.earned, 24); assert.equal(result.average, 80);
  assert.equal(result.required, 67.15); assert.equal(result.maximum, 94);
  assert.ok(calculateGrades(plan, { a: 80, b: result.required }, 71).earned >= 71);
  assert.ok(calculateGrades(plan, { a: 80, b: result.required - .01 }, 71).earned < 71);
});
test('the suggested minimum covers all pending activities together', () => {
  const rows = [{ id: 'a', name: 'A', weight: 50 }, { id: 'b', name: 'B', weight: 50 }];
  const result = calculateGrades(rows, {}, 71);
  assert.equal(result.required, 71);
  assert.equal(calculateGrades(rows, { a: result.required, b: result.required }, 71).earned, 71);
});
test('70 accumulated points need one final point, supplied by 3.34 in each pending activity', () => {
  const activities=[{id:'done',name:'Actividades con nota',weight:70},{id:'foro5',name:'Foro Unidad V',weight:5},{id:'u6',name:'Unidad VI',weight:20},{id:'foro6',name:'Foro Unidad VI',weight:5}];
  const result=calculateGrades(activities,{done:100},71);
  assert.equal(result.earned,70);assert.equal(result.missing,1);assert.equal(result.required,3.34);
  assert.equal(result.remainingWeight,30);assert.equal(result.pending.length,3);
  assert.equal(calculateGrades(activities,{done:100,foro5:3.34,u6:3.34,foro6:3.34},71).earned,71.002);
  assert.equal(calculateGrades(activities,{done:100,foro5:3.33,u6:3.33,foro6:3.33},71).earned,70.999);
});
test('complete, already covered, impossible and exact boundary targets', () => {
  assert.equal(calculateGrades(plan, { a: 100 }, 30).status, 'covered');
  assert.equal(calculateGrades(plan, { a: 100 }, 30).required, 0);
  assert.equal(calculateGrades(plan, { a: 100, b: 100 }, 100).status, 'complete-met');
  assert.equal(calculateGrades(plan, { a: 100, b: 0 }, 71).status, 'complete-missed');
  const decimal = [{ id: 'a', name: 'A', weight: 33.33 }, { id: 'b', name: 'B', weight: 66.67 }];
  assert.equal(calculateGrades(decimal, { a: 100 }, 100).required, 100);
  assert.equal(calculateGrades(decimal, { a: 99.99 }, 100).status, 'unreachable');
});
test('invalid input never turns into a zero or a misleading total', () => {
  for (const value of ['-1', '101', 'NaN', 'Infinity', '1e2', '0x10', '4.123', '1,2,3', '']) {
    assert.throws(() => parseGrade(value));
  }
  assert.equal(parseGrade('71,25'), 71.25); assert.equal(parseGrade(' 0 '), 0);
  assert.equal(parseGrade('', { optional: true }), null);
  assert.throws(() => calculateGrades(plan, { a: 'oops' }, 71));
});
test('activity schemes require distinct stable IDs and exactly 100 percent', () => {
  assert.equal(validateGradeActivities(DEFAULT_GRADE_ACTIVITIES).length, 7);
  assert.throws(() => validateGradeActivities([]));
  assert.throws(() => validateGradeActivities([{ id: 'a', name: 'A', weight: 99.99 }]));
  assert.throws(() => validateGradeActivities([{ id: 'a', name: 'A', weight: 50 }, { id: 'a', name: 'B', weight: 50 }]));
  assert.throws(() => validateGradeActivities([{ id: 'a', name: 'A', weight: 0 }, { id: 'b', name: 'B', weight: 100 }]));
  assert.throws(() => validateGradeActivities([{ id: 'a', name: ' '.repeat(3), weight: 100 }]));
});
test('retired activities are removed on load and explicit zero grades survive', () => {
  assert.deepEqual(normalizeGradeDraft(plan, { a: 0, b: '', retired: 80 }), { a: 0 });
  assert.deepEqual(normalizeGradeDraft([{id:'constructor',name:'Proyecto',weight:100}], {}), {});
});
test('rounded-up minimum always reaches the goal across decimal weights and grades', () => {
  for (let weight = 1; weight < 100; weight += 7) {
    const activities = [{ id: 'a', name: 'A', weight }, { id: 'b', name: 'B', weight: 100 - weight }];
    for (let grade = 0; grade <= 100; grade += 11) {
      const result = calculateGrades(activities, { a: grade }, 71.23);
      if (result.status === 'pending') {
        assert.ok(calculateGrades(activities, { a: grade, b: result.required }, 71.23).earned >= 71.23);
      }
    }
  }
});
