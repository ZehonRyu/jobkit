/* JD 感知改写提示词自测：确认 sysPolish 会带 JD 上下文，且没贴 JD 时有降级提示 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const base = path.join(__dirname, '..', 'assets');
const noop = () => {};
const fakeEl = { innerHTML: '', value: '', textContent: '', classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, querySelectorAll: () => [], style: {}, dataset: {} };
const ctx = {
  console, setTimeout, clearTimeout,
  Date, Math, JSON,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener: noop, createElement: () => fakeEl, body: { appendChild: noop } },
  window: {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Blob: class {}, navigator: { clipboard: { writeText: async () => {} } },
  FileReader: class { readAsText() {} }, confirm: () => true,
  fetch: async () => ({ ok: false, json: async () => ({}) })
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['data.js', 'app.js', 'ai.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), ctx, { filename: f }));

const out = [];
const withJd = vm.runInContext(`
  jd = { company: '测试科技', title: 'AI 应用工程师', text: '负责 RAG 检索增强链路，熟悉 vLLM 推理部署', analysis: { skills: [{ n: 'RAG', cnt: 2 }, { n: 'vLLM 推理服务', cnt: 1 }] } };
  sysPolish();
`, ctx);
out.push(withJd.includes('【目标岗位】测试科技 AI 应用工程师') ? 'PASS 带 JD：公司岗位入提示词' : 'FAIL 带 JD :: ' + withJd.slice(0, 80));
out.push(withJd.includes('RAG') && withJd.includes('vLLM') ? 'PASS 带 JD：关键词入提示词' : 'FAIL 关键词');
out.push(withJd.includes('负责 RAG 检索增强链路') ? 'PASS 带 JD：正文摘录入提示词' : 'FAIL 摘录');
out.push(/不新增任何事实/.test(withJd) && /绝对不能借机加进去/.test(withJd) ? 'PASS 铁律保留（防借 JD 加戏）' : 'FAIL 铁律');

const noJd = vm.runInContext(`
  jd = { company: '', title: '', text: '', analysis: null };
  sysPolish();
`, ctx);
out.push(noJd.includes('还没贴 JD') ? 'PASS 无 JD：降级提示' : 'FAIL 无 JD :: ' + noJd.slice(0, 80));

fs.writeFileSync(path.join(__dirname, 'polish-prompt-result.txt'), out.join('\n'), 'utf8');
console.log(out.some(l => l.startsWith('FAIL')) ? 'HAS FAIL' : 'ALL PASS');
