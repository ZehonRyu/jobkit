const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
function grab(id, term) {
  const i = html.indexOf('id="' + id + '"');
  if (i < 0) return '(not found)';
  const start = html.indexOf('>', i) + 1;
  let end = term ? html.indexOf(term, start) : html.indexOf('</div>', start);
  if (end < 0) end = html.length;
  return html.slice(start, end);
}
let r = grab('resume-preview', 'class="note no-print"')
  .replace(/<li>/g, '\n  · ')
  .replace(/<div class="r-sec"><h3>/g, '\n\n## ')
  .replace(/<h3>/g, '')
  .replace(/<div class="r-item-head"><b>/g, '\n### ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n');
let q = grab('resume-quality').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ');
fs.writeFileSync(process.argv[3], '===== 质检 =====\n' + q.trim() + '\n\n===== 简历 =====\n' + r.trim(), 'utf8');
console.log('ok');
