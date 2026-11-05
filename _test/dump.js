const { spawn } = require('child_process');
const fs = require('fs');
const exe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = 'file:///C:/Users/123/AppData/Local/Temp/jobkit/test.html';
const out = process.argv[2];
const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=6000', '--dump-dom', url]);
const bufs = [];
p.stdout.on('data', d => bufs.push(d));
p.stderr.on('data', () => {});
p.on('close', () => {
  fs.writeFileSync(out, Buffer.concat(bufs));
  console.log('bytes=' + Buffer.concat(bufs).length);
});
