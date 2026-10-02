const legacyPattern = /^STU-(\d{4})-(\d+)$/;

export function migrateLegacyStudentNumbers(data) {
  const used = new Set(data.students.filter(student => !legacyPattern.test(student.id)).map(student => student.id));
  const changes = new Map();
  for (const student of data.students) {
    const match = legacyPattern.exec(student.id);
    if (!match) continue;
    const year = match[1].slice(-2);
    let sequence = Number(match[2]);
    let replacement = `${year}-${String(sequence).padStart(5, '0')}`;
    while (used.has(replacement)) {
      sequence += 1;
      replacement = `${year}-${String(sequence).padStart(5, '0')}`;
    }
    used.add(replacement);
    changes.set(student.id, replacement);
    student.id = replacement;
  }
  if (changes.size) {
    for (const enrollment of data.enrollments) {
      enrollment.studentId = changes.get(enrollment.studentId) || enrollment.studentId;
    }
  }
  return changes.size > 0;
}
