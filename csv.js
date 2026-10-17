// RFC-style quoted fields, including doubled quotes and embedded newlines.
export function parseResultCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const field = () => { row.push(cell); cell = ''; closed = false; };
  const line = () => { field(); if (row.some(value => value.trim())) rows.push(row); row = []; if (rows.length > 201) throw new Error('Upload at most 200 result rows.'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += char; }
    else if (char === ',') field();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; line(); }
    else if (char === '"') { if (cell || closed) throw new Error('Unexpected quote in CSV. Quote the entire field and double embedded quotes.'); quoted = true; }
    else { if (closed) { if (!/[ \t]/.test(char)) throw new Error('Unexpected text after a closing CSV quote.'); } else cell += char; }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell || row.length || closed) line();
  if (rows.length < 2) throw new Error('Include a header and at least one result row.');
  const names = { code: 'code', title: 'title', rawgrade: 'rawGrade', grade: 'grade', remark: 'remark', termid: 'termId' };
  const headers = rows.shift().map(value => names[value.trim().toLowerCase().replace(/[ _]/g, '')]);
  if (headers.some(value => !value) || new Set(headers).size !== headers.length || !headers.includes('code') || !headers.some(value => ['rawGrade','grade','remark'].includes(value))) throw new Error('Use unique headers: code, rawGrade or grade, remark, termId; title is optional.');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error('CSV row ' + (index + 2) + ' has a different number of fields from the header.');
    return Object.fromEntries(headers.map((key, position) => [key, values[position].trim()]));
  });
}
