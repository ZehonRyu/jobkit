const { spawn } = require('child_process');
const fs = require('fs');
const exe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const out = process.argv[3];
const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=6000', '--dump-dom', url]);
const bufs = [];
p.stdout.on('data', d => bufs.push(d));
p.stderr.on('data', () => {});
p.on('close', () => {
  const b = Buffer.concat(bufs);
  fs.writeFileSync(out, b);
  console.log('bytes=' + b.length);
});
