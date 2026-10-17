import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrade } from '../grade.js';

test('raw grade conversion matches every school threshold and hundredth below it', () => {
  const boundaries = [[97.5,1,1.25],[94.5,1.25,1.5],[91.5,1.5,1.75],[88.5,1.75,2],[85.5,2,2.25],[82.5,2.25,2.5],[79.5,2.5,2.75],[76.5,2.75,3],[74.5,3,5]];
  for (const [raw, grade, below] of boundaries) {
    assert.equal(evaluateGrade({rawGrade:raw}).grade, grade.toFixed(2));
    assert.equal(evaluateGrade({rawGrade:(raw-.01).toFixed(2)}).grade, below.toFixed(2));
  }
  assert.deepEqual(evaluateGrade({rawGrade:0}),{rawGrade:'0.00',grade:'5.00',remark:'failed'});
  assert.deepEqual(evaluateGrade({rawGrade:100}),{rawGrade:'100.00',grade:'1.00',remark:'passed'});
  assert.equal(evaluateGrade({rawGrade:74.50}).remark,'passed');
  assert.equal(evaluateGrade({rawGrade:74.49}).remark,'failed');
});

test('grade input rejects ambiguous, contradictory, and out-of-range results', () => {
  for (const row of [{rawGrade:100.01},{rawGrade:-1},{rawGrade:'74.499'},{grade:4},{grade:0},{grade:'1e0'}, {grade:5,remark:'passed'},{grade:3,remark:'failed'},{rawGrade:90,grade:1},{rawGrade:80,remark:'not_taken'},{remark:'incomplete'},{remark:'passed'},{remark:'failed'}]) assert.throws(()=>evaluateGrade(row));
  assert.deepEqual(evaluateGrade({remark:'Not taken'}),{rawGrade:'',grade:'',remark:'not_taken'});
  assert.deepEqual(evaluateGrade({grade:'2.75',remark:'Passed'}),{rawGrade:'',grade:'2.75',remark:'passed'});
});
