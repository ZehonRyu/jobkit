/* 自测：用示例档案（=用户材料）跑三种 JD，输出简历纯文本 + 打分 + 出题，供人工审读 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const base = path.join(__dirname, '..', 'assets');
const dataSrc = fs.readFileSync(path.join(base, 'data.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(base, 'app.js'), 'utf8');

const noop = () => {};
const fakeEl = { innerHTML: '', value: '', textContent: '', classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, querySelectorAll: () => [], style: {}, dataset: {} };
const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener: noop, createElement: () => fakeEl, body: { appendChild: noop } },
  window: {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
  Blob: class {}, navigator: { clipboard: { writeText: async () => {} } },
  FileReader: class { readAsText() {} }, confirm: () => true
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(dataSrc, ctx, { filename: 'data.js' });
vm.runInContext(appSrc, ctx, { filename: 'app.js' });

function toText(html) {
  return html
    .replace(/<div class="r-name">/g, '\n# ')
    .replace(/<div class="r-sec">/g, '\n')
    .replace(/<h3>/g, '\n## ')
    .replace(/<\/h3>/g, '\n')
    .replace(/<div class="r-item">/g, '\n')
    .replace(/<div class="r-item-head">/g, '\n### ')
    .replace(/<div class="r-item-sub">/g, '\n')
    .replace(/<div class="r-skill-row">/g, '\n')
    .replace(/<div class="r-contact">/g, '\n')
    .replace(/<li>/g, '\n- ')
    .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const JDS = {
  ai: `岗位职责：
1. 负责大模型应用的设计与开发，包括 Prompt 工程、RAG 检索增强链路的搭建与效果调优；
2. 负责领域模型的监督微调（SFT / LoRA），并建立模型评测体系，跟踪 Precision、Recall、F1 等指标；
3. 负责 Agent 多步工作流的编排与工程落地，与业务 API 解耦，保证线上稳定；
4. 参与后端服务开发，熟悉 Python、RESTful 接口设计，有高并发场景经验者优先。

任职要求：
1. 本科及以上学历，3 年以上后端或算法工程经验；
2. 熟悉 PyTorch / Transformers，了解 vLLM 等推理框架；
3. 有医疗、金融行业数据合规经验加分；
4. 熟悉 Docker、Kubernetes 者优先；
5. 具备良好的跨部门协作能力，能推动方案落地。`,
  backend: `岗位职责：
1. 负责支付、订单与权益类业务的后端服务开发与维护；
2. 负责接口性能优化与稳定性建设，参与线上问题排查；
3. 负责异步任务与消息链路的可靠性设计。

任职要求：
1. 3-5 年 Python 后端开发经验，熟悉 FastAPI / Flask；
2. 熟悉 MySQL 索引与事务，熟悉 Redis 缓存设计；
3. 有支付、订单、对账相关经验者优先；
4. 熟悉 Docker，了解 Kubernetes；
5. 沟通表达清晰，能独立负责模块。`,
  data: `岗位职责：
1. 负责非结构化文档（PDF / 扫描件）的解析、清洗与结构化入库；
2. 负责批量数据处理链路的内存与性能优化；
3. 负责数据质量校验规则建设与异常数据治理。

任职要求：
1. 3 年以上数据处理或后端开发经验，熟悉 Python、pandas；
2. 熟悉 SQL，了解 ETL 流程与数据仓库；
3. 有 OCR、文档解析经验者优先；
4. 本科及以上，2025 届及以前毕业均可。`
};

const out = {};
for (const k of Object.keys(JDS)) {
  const jdText = JDS[k];
  ctx.JDTEXT = jdText;
  ctx.JDNAME = k;
  const res = vm.runInContext(`
    (function(){
      const a = analyzeJD(JDTEXT);
      jd = { company: 'X', title: JDNAME, text: JDTEXT, analysis: a };
      const sc = scoreAll();
      const html = buildResumeHtml({ style: 'auto', projCount: 3 });
      const qs = buildQuestions(12, 'auto');
      return JSON.stringify({
        style: autoStyle(),
        topSkills: a.skills.slice(0, 12).map(s => s.n + ':' + s.cnt),
        years: a.years, degree: a.degree,
        gaps: sc.gaps.map(g => g.n + '(' + g.kind + ')'),
        total: sc.total, grade: sc.grade,
        parts: [Math.round(sc.skillScore), Math.round(sc.projScore), sc.bonus],
        html: html,
        qs: qs.map(q => q.dim + ' | ' + q.q)
      });
    })()
  `, ctx);
  const r = JSON.parse(res);
  r.resume = toText(r.html);
  delete r.html;
  out[k] = r;
}

/* 边界用例 */
ctx.EDGE = vm.runInContext(`
(function(){
  const y1 = parseYears('2025届毕业生，3年以上经验');
  const y2 = parseYears('工作年限：2024年至今，需2年经验');
  const y3 = parseYears('3-5年');
  const aliases = analyzeJD('熟悉 RAG 检索增强，做过模型评测，了解数据清洗').skills.map(s => s.n + ':' + s.cnt);
  const bak = profile;
  profile = { name: '', phone: '', email: '', city: '', target: '', years: 0, edu: { school: '', major: '', degree: '本科', year: '' }, skills: [], projects: [], works: [], extras: [] };
  jd = { company: '', title: '', text: '', analysis: null };
  let h = '', q = 0, err = '';
  try { h = buildResumeHtml({ style: 'auto', projCount: 3 }); } catch (e) { err = e.message; }
  try { q = buildQuestions(8, 'auto').length; } catch (e) { err += ' | q:' + e.message; }
  profile = bak;
  return JSON.stringify({ y1, y2, y3, aliases, empty: { len: h.length, err, qCount: q } });
})()
`, ctx);

fs.writeFileSync(path.join(__dirname, 'selfqa.json'), JSON.stringify({ out, edge: JSON.parse(ctx.EDGE) }, null, 2), 'utf8');
console.log('ok');
