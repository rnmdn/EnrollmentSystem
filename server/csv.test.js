import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResultCSV } from '../csv.js';

test('academic CSV supports BOM, quoted commas, escaped quotes, and embedded newlines', () => {
  assert.deepEqual(parseResultCSV('\uFEFFcode,title,raw_grade,remark,term_id\r\nEX101,"Example, ""Foundations""\nPart 1",74.50,passed,2026-1\r\n'), [{code:'EX101',title:'Example, "Foundations"\nPart 1',rawGrade:'74.50',remark:'passed',termId:'2026-1'}]);
  assert.deepEqual(parseResultCSV('code,grade\nEX101,5.00'),[{code:'EX101',grade:'5.00'}]);
});

test('academic CSV rejects malformed quotes, mismatched columns, duplicate and unknown headers, and oversized imports', () => {
  for (const csv of ['code,grade\n"EX101,5','code,grade\nEX"101,5','code,grade\n"EX101"oops,5','code,grade\nEX101,5,extra','code,code,grade\nEX101,EX101,5','code,unsupported\nEX101,5','code,grade','code,grade\n'+Array.from({length:201},()=> 'EX101,5').join('\n')]) assert.throws(()=>parseResultCSV(csv));
});
