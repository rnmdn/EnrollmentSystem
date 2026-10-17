// Conversion supplied by the school grading table in the project brief.
const bands = [[97.5,1],[94.5,1.25],[91.5,1.5],[88.5,1.75],[85.5,2],[82.5,2.25],[79.5,2.5],[76.5,2.75],[74.5,3],[0,5]];
const invalid = message => { throw Object.assign(new Error(message), { status: 422 }); };
export function evaluateGrade(input) {
  const raw = String(input.rawGrade ?? '').trim();
  const transmuted = String(input.grade ?? '').trim();
  const requested = String(input.remark ?? '').trim().toLowerCase().replaceAll(' ', '_');
  if (requested && !['passed','failed','not_taken'].includes(requested)) invalid('Choose Passed, Failed, or Not taken.');
  let grade = '';
  if (raw) {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw) || Number(raw) > 100) invalid('Raw grade must be from 0 to 100 with at most two decimal places.');
    grade = bands.find(([minimum]) => Number(raw) >= minimum)[1].toFixed(2);
    if (transmuted && Number(transmuted) !== Number(grade)) invalid('Transmuted grade does not match the raw grade.');
  } else if (transmuted) {
    if (!/^\d(\.\d{1,2})?$/.test(transmuted) || !bands.some(([,value]) => value === Number(transmuted))) invalid('Use a transmuted grade from 1.00 to 3.00 in 0.25 steps, or 5.00.');
    grade = Number(transmuted).toFixed(2);
  }
  const remark = grade ? (Number(grade) === 5 ? 'failed' : 'passed') : requested;
  if (!remark) invalid('Enter a raw or transmuted grade, or choose Not taken.');
  if (grade && requested && requested !== remark) invalid('The result remark conflicts with the numeric grade.');
  if (!grade && remark !== 'not_taken') invalid('Enter a grade for a Passed or Failed result.');
  return { rawGrade: raw ? Number(raw).toFixed(2) : '', grade, remark };
}
