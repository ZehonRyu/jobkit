/* 逻辑自测：不开浏览器，直接跑纯函数，验证关键词抽取 / 打分 / 简历生成 / 出题 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const base = path.join(__dirname, '..', 'assets');
const dataSrc = fs.readFileSync(path.join(base, 'data.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(base, 'app.js'), 'utf8');

const noop = () => {};
const fakeEl = { innerHTML: '', value: '', textContent: '', classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, querySelectorAll: () => [], style: {} };
const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: {
    querySelector: () => fakeEl,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: () => fakeEl,
    body: { appendChild: noop }
  },
  window: {},
  URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Blob: class {},
  navigator: { clipboard: { writeText: async () => {} } },
  FileReader: class { readAsText() {} },
  confirm: () => true
};
ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(dataSrc, ctx, { filename: 'data.js' });
vm.runInContext(appSrc, ctx, { filename: 'app.js' });

const SAMPLE_JD = `岗位职责：
1. 负责大模型应用的设计与开发，包括 Prompt 工程、RAG 检索增强链路搭建；
2. 负责领域模型的监督微调（SFT/LoRA），并建立模型评测体系，跟踪 Precision / Recall 等指标；
3. 负责 Agent 多步工作流的编排与工程落地，与业务 API 解耦；
4. 参与后端服务开发，熟悉 Python、RESTful 接口设计，有高并发场景经验者优先。

任职要求：
1. 本科及以上学历，3 年以上后端或算法工程经验；
2. 熟悉 PyTorch / Transformers，了解 vLLM 等推理框架；
3. 有医疗、金融行业数据合规经验加分；
4. 熟悉 Docker、Kubernetes 者优先。`;

const test = `
const a = analyzeJD(SAMPLE_JD_TEXT);
jd = { company: '示例科技', title: 'AI 应用工程师', text: SAMPLE_JD_TEXT, analysis: a };
const sc = scoreAll();
const html = buildResumeHtml({ style: 'auto', projCount: 3 });
const qs = buildQuestions(12, 'auto');
const md = mdFromResume ? 'skip' : 'skip';
JSON.stringify({
  topSkills: a.skills.slice(0, 10).map(s => s.n + ':' + s.cnt),
  skillCount: a.skills.length,
  years: a.years,
  degree: a.degree,
  duties: a.duties.length,
  hints: a.hints.map(h => h.v),
  flags: a.flags.map(f => f.v),
  total: sc.total,
  grade: sc.grade,
  parts: [Math.round(sc.skillScore), Math.round(sc.projScore), sc.bonus],
  gaps: sc.gaps.map(g => g.n),
  resumeLen: html.length,
  resumeHasLi: (html.match(/<li>/g) || []).length,
  qCount: qs.length,
  qDims: qs.map(q => q.dim),
  qFirst: qs[0].q
}, null, 2);
`;

ctx.SAMPLE_JD_TEXT = SAMPLE_JD;
const out = vm.runInContext(test, ctx, { filename: 'test' });
fs.writeFileSync(path.join(__dirname, 'out.json'), out, 'utf8');
console.log('ok');
