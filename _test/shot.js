/* 截图：headless Edge 直接截全屏，用来看年月下拉的实际排版 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2];
const out = process.argv[3];
const size = process.argv[4] || '1280,1600';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-shot-'));
const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--user-data-dir=' + dir, '--window-size=' + size, '--virtual-time-budget=5000',
  '--screenshot=' + out, url]);
p.stderr.on('data', () => {});
p.on('close', () => { console.log(fs.existsSync(out) ? 'ok ' + fs.statSync(out).size : 'fail'); });
