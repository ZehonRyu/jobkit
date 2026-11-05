/* ============================================================
   求职工坊 · AI 助手模块
   依赖 app.js 的全局：profile / jd / saveProfile / saveJd / toast / esc / $ / $$
   ============================================================ */

const AI_KEY = 'jobkit.ai.v1';
let ai = {
  mode: 'build',
  busy: false,
  configured: false,
  msgs: { build: [], polish: [], mock: [] },
  applied: {}
};
(function loadAI() {
  try {
    const v = JSON.parse(localStorage.getItem(AI_KEY) || 'null');
    if (v && v.msgs) { ai.msgs = v.msgs; ai.mode = v.mode || 'build'; }
  } catch (e) { }
})();
function saveAI() {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify({ mode: ai.mode, msgs: ai.msgs }));
  } catch (e) { }
}

/* ---------- 上下文摘要 ---------- */
function truthTag(t) { return t === 'yes' ? '真做过' : t === 'partial' ? '参与/设计' : '仅了解'; }

function profileBrief() {
  const p = profile;
  const L = [];
  const head = [p.name, p.years ? p.years + ' 年经验' : '', p.city, p.target].filter(Boolean).join(' · ');
  if (head) L.push('【基本信息】' + head);
  if (p.edu && p.edu.school) L.push('【教育】' + [p.edu.school, p.edu.major, p.edu.degree, p.edu.year].filter(Boolean).join(' · '));
  if ((p.works || []).length) {
    L.push('【工作】' + p.works.map(w => [w.company, w.title, w.time].filter(Boolean).join(' ')).join('；'));
  }
  if ((p.skills || []).length) {
    L.push('【技能】' + p.skills.slice(0, 24).map(s => `${s.n}(${truthTag(s.truth)})`).join('、'));
  }
  (p.projects || []).forEach((pj, i) => {
    L.push(`【项目${i + 1}】${pj.name || '(未命名)'}${pj.time ? ' / ' + pj.time : ''}${pj.role ? ' / 角色:' + pj.role : ''}`);
    if (pj.background) L.push('  背景：' + pj.background);
    if ((pj.tech || []).length) L.push('  技术：' + pj.tech.join('、'));
    (pj.actions || []).forEach(a => L.push('  动作：' + a));
    if (pj.result) L.push('  结果：' + pj.result);
  });
  if (jd.analysis) L.push('【目标岗位】' + [jd.company, jd.title].filter(Boolean).join(' ') + '｜' + jd.text.slice(0, 600));
  return L.join('\n');
}

function missingItems() {
  const miss = [];
  if (!profile.name) miss.push('姓名');
  if (!profile.phone && !profile.email) miss.push('联系方式');
  if (!profile.target) miss.push('求职意向');
  if (!profile.years) miss.push('工作年限');
  if (!profile.edu.school) miss.push('学校专业');
  (profile.projects || []).forEach(p => {
    if (!p.time) miss.push(`「${p.name || '未命名项目'}」的时间`);
    if (!p.result) miss.push(`「${p.name || '未命名项目'}」的量化结果`);
  });
  return miss;
}

/* ---------- 提示词 ---------- */
function sysBuild() {
  return `你是「求职工坊」的简历访谈员。目标：通过对话把用户的真实经历整理成结构化档案。

规则：
1. 每轮最多问 2 个问题，问题要具体，一句话能回答。禁止问"还有什么要补充的"这类空问题。
2. 收集优先级：① 姓名/城市/求职意向/年限/学历 ② 每段经历的：公司、岗位、起止时间、背景（要解决什么问题）、具体动作（3-5 条）、结果（真实数字）。
3. 用户回答模糊时追问一次具体化（"大概多少 QPS""团队几个人""这个指标原来是多少"），同一个点最多追两次。
4. 绝对不要替用户编造数字、技术栈、职责。用户没说的一律不写。
5. 用户说的动词比事实大时（如"负责整个系统"但只做了一个模块），直接提醒并记录真实边界。
6. 当某段经历信息足够（有背景 + 至少 2 条动作），在回复末尾追加一个 json 代码块，格式严格如下：

\`\`\`json
{"type":"patch","profile":{"name":"","city":"","target":"","years":0},"edu":{"school":"","major":"","degree":"","year":""},"project":{"name":"","role":"","time":"","background":"","tech":["Python"],"actions":["..."],"result":""}}
\`\`\`

只写你确认过的字段，未确认的字段直接省略（不写空字符串占位）。years 填数字。技术栈用短词。
时间一律写成「年.月」，精确到月、不写日：「2024.03 - 2025.06」，还在做的写「2024.03 - 至今」；毕业时间写「2021.06」。
7. 括号里的待补信息不要编造；用户说"记不清"，就把该字段留空并在回复里标注"待补"。
8. 输出档案块后继续问下一项，不要停下来等确认。
9. 全程中文，语气像懂技术的朋友，不要客套，不要重复用户的话。

当前档案（可能不完整）：
${profileBrief()}

还缺：${missingItems().join('、') || '基本齐了，可以做质检'}`;
}

function sysPolish() {
  /* JD 感知：贴了 JD 就带着目标岗位改写，没贴就明说只能通用润色 */
  const jdPart = (jd.analysis && jd.text)
    ? `【目标岗位】${[jd.company, jd.title].filter(Boolean).join(' ') || '（未填公司/岗位名）'}
JD 关键词（按出现强度）：${jd.analysis.skills.slice(0, 15).map(s => s.n).join('、') || '（未抽出）'}
JD 摘录：${jd.text.slice(0, 500)}`
    : '【目标岗位】还没贴 JD——先去「② JD 分析」贴一份再回来改写会定向得多，现在只能做通用润色。';

  return `你是简历改写顾问。用户给你一段项目描述，你只优化措辞，严禁改变事实。

${jdPart}

铁律：
1. 不新增任何事实——不能出现原文没有的技术、数字、职责或级别。JD 里有但原文没做的技术，绝对不能借机加进去。
2. 不升级动词——原文"参与"不能改成"负责"，"协助"不能改成"主导"。
3. 不编造数字。原文没有量化就保持没有，在 why 里提示"建议补真实数字"。
4. 结合上面的目标岗位定向改写（事实不变的前提下）：
   - 原文本來就有、JD 也看重的能力，改用 JD 的标准叫法并放到句子显眼位置（JD 写"RAG"就别写"检索问答"）；
   - 与 JD 无关的修饰语可以删，给重点让路；
   - 每条 why 要点出这条和 JD 的哪项要求有关；实在无关才写通用理由（删冗余/压字数之类）。
5. 其他可以做的：把"做了什么"改成"做了什么 + 怎么做的 + 带来什么变化"；删空话（如"有效提升了效率"）；统一术语；单条压到 45 字以内；被动改主动。
6. 一条原文对应一条改写，不要合并、不要拆分、不要新增条目。

输出严格为一个 json 代码块：
\`\`\`json
{"type":"polish","items":[{"from":"原文","to":"改写后","why":"改动理由，20 字内"}]}
\`\`\`
不要输出任何 json 以外的解释文字。`;
}

function sysMock() {
  const t = jd.title || profile.target || '技术岗';
  return `你是一位资深技术面试官，正在面试「${t}」这个岗位。

规则：
1. 一次只问一个问题，问完等对方回答。
2. 优先从容易露馅的地方问：模糊的量化、过大的动词、JD 要求但简历空白的技能、时间对不上的经历。
3. 对方回答后按这个结构回复：**点评**（好在哪 / 哪里空 / 再追一层会死在哪）→ **更好的答法**（一句话示范）→ 下一个问题。
4. 追问最多两层，别把人问死；但该问透的必须问透（比如"你们怎么验证有效"）。
5. 不评价简历排版，只关心事实和逻辑。语气专业但不刻薄。
6. 中文，简洁，不要长篇大论。

候选人档案：
${profileBrief()}`;
}

/* ---------- 渲染 ---------- */
function mdLite(s) {
  let h = esc(s);
  h = h.replace(/```[\s\S]*?```/g, '');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^[-*]\s+(.+)$/gm, '<span class="ai-li">· $1</span>');
  h = h.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  return '<p>' + h + '</p>';
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function fieldLabel(k) {
  return ({
    name: '姓名', phone: '手机', email: '邮箱', city: '城市', target: '求职意向', years: '工作年限',
    school: '学校', major: '专业', degree: '学历', year: '毕业时间',
    role: '角色', time: '时间', background: '背景', tech: '技术栈', actions: '动作', result: '结果'
  })[k] || k;
}

function diffPatch(patch) {
  const rows = [];
  const push = (label, oldV, newV) => {
    const o = Array.isArray(oldV) ? oldV.join(' / ') : (oldV || '');
    const n = Array.isArray(newV) ? newV.join(' / ') : (newV || '');
    if (!String(n).trim()) return;
    if (String(o).trim() === String(n).trim()) return;
    rows.push({ label, oldV: o, newV: n });
  };
  if (patch.profile) Object.keys(patch.profile).forEach(k => push(fieldLabel(k), profile[k], patch.profile[k]));
  if (patch.edu) Object.keys(patch.edu).forEach(k => push(fieldLabel(k), profile.edu[k], patch.edu[k]));
  if (patch.project && patch.project.name) {
    const ex = profile.projects.find(x => x.name === patch.project.name);
    Object.keys(patch.project).forEach(k => {
      if (k === 'name') return;
      push((ex ? '' : '新项目 · ') + fieldLabel(k), ex ? ex[k] : '', patch.project[k]);
    });
  }
  return rows;
}

function patchCard(patch, id) {
  const rows = diffPatch(patch);
  if (!rows.length) return '';
  const body = rows.map(r => `
    <div class="ai-diff">
      <div class="ai-diff-k">${esc(r.label)}</div>
      <div class="ai-diff-v"><span class="old">${esc(r.oldV) || '（空）'}</span>${r.oldV ? ' → ' : ''}<span class="new">${esc(r.newV)}</span></div>
    </div>`).join('');
  const done = ai.applied[id];
  return `<div class="ai-card">
    <div class="ai-card-head"><b>${patch.project && patch.project.name && !profile.projects.some(p => p.name === patch.project.name) ? '新增项目' : '档案更新'} · ${rows.length} 项</b>
      <button class="btn small ${done ? '' : 'primary'}" data-apply="${id}" ${done ? 'disabled' : ''}>${done ? '已写入' : '写入档案'}</button>
    </div>
    ${body}
  </div>`;
}

function applyPatch(patch, id) {
  if (!patch) return;
  if (patch.profile) {
    Object.keys(patch.profile).forEach(k => {
      let v = patch.profile[k];
      if (v === '' || v == null) return;
      if (k === 'years') v = Number(v) || 0;
      profile[k] = v;
    });
  }
  if (patch.edu) {
    Object.keys(patch.edu).forEach(k => {
      if (!patch.edu[k]) return;
      profile.edu[k] = k === 'year' ? standardizeTime(patch.edu[k]) : patch.edu[k];
    });
  }
  if (patch.project && patch.project.name) {
    let pj = profile.projects.find(x => x.name === patch.project.name);
    if (!pj) {
      pj = { name: patch.project.name, role: '', time: '', background: '', tech: [], actions: [], result: '' };
      profile.projects.push(pj);
    }
    ['role', 'background', 'result'].forEach(k => { if (patch.project[k]) pj[k] = patch.project[k]; });
    // 时间统一成「2024.03 - 2025.06」，否则档案里的年月下拉框显示不出来
    if (patch.project.time) pj.time = standardizeTime(patch.project.time);
    if (patch.project.tech && patch.project.tech.length) pj.tech = uniq((pj.tech || []).concat(patch.project.tech));
    if (patch.project.actions && patch.project.actions.length) {
      pj.actions = uniq((pj.actions || []).concat(patch.project.actions)).filter(Boolean);
    }
  }
  saveProfile();
  renderProfile();
  ai.applied[id] = true;
  saveAI();
  toast('已写入档案');
  renderAI();
}

function renderAI() {
  const box = $('#ai-chat');
  if (!box) return;
  const list = ai.msgs[ai.mode] || [];
  if (!list.length) {
    box.innerHTML = emptyHint();
    bindEmpty();
    return;
  }
  box.innerHTML = list.map((m, i) => {
    const id = ai.mode + '-' + i;
    const patch = m.role === 'assistant' ? extractJson(m.content || '') : null;
    let card = '';
    if (patch && patch.type === 'patch') card = patchCard(patch, id);
    if (patch && patch.type === 'polish') card = polishCard(patch, id);
    const text = m.role === 'assistant' ? (m.content || '').replace(/```json[\s\S]*?```/g, '').trim() : (m.content || '');
    return `<div class="ai-msg ${m.role}">
      <div class="ai-bubble">${mdLite(text || (card ? '已整理出以下内容：' : ''))}${card}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-apply]').forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.apply.split('-')[1];
      const patch = extractJson(ai.msgs[ai.mode][idx].content);
      applyPatch(patch, b.dataset.apply);
    };
  });
  box.querySelectorAll('[data-adopt]').forEach(b => {
    b.onclick = () => adoptPolish(b.dataset.adopt);
  });
  box.scrollTop = box.scrollHeight;
}

function emptyHint() {
  if (location.protocol === 'file:') {
    return `<div class="note bad">AI 功能需要一个本地服务：在项目目录运行 <code>python serve.py</code>，然后打开 <code>http://127.0.0.1:8770</code>。直接双击 html 打不开 AI。</div>`;
  }
  if (!ai.configured) {
    return `<div class="note warn">还没配置模型 Key。点右上角「配置 Key」，粘贴 DeepSeek 的 key（platform.deepseek.com 申请，几块钱能用很久）。</div>`;
  }
  const tips = {
    build: '我们从你的经历开始。点下面「开始访谈」，它会一个问题一个问题问，你答完它自动整理成档案。',
    polish: '先在「② JD 分析」贴好 JD，再点「改写」选项目——它会把每条动作往岗位要求的方向聚焦，但只改措辞，不新增事实。',
    mock: '贴好 JD 后进来，它会扮演面试官，专挑你简历里站不住的地方问，每题给点评和更好的答法。'
  };
  return `<div class="ai-empty">
    <div class="ai-empty-t">${{ build: '对话建档案', polish: '改写简历', mock: '模拟面试' }[ai.mode]}</div>
    <div class="ai-empty-d">${tips[ai.mode]}</div>
    <button class="btn primary" id="ai-start">开始</button>
  </div>`;
}

function bindEmpty() {
  const b = $('#ai-start');
  if (b) b.onclick = startMode;
}

/* ---------- 对话 ---------- */
function pushMsg(role, content) {
  ai.msgs[ai.mode].push({ role, content });
  saveAI();
  renderAI();
}

async function callModel(messages, onDelta) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  if (!res.ok) {
    let msg = '请求失败';
    try { msg = (await res.json()).error || msg; } catch (e) { }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) { full += delta; onDelta(full); }
      } catch (e) { }
    }
  }
  return full;
}

async function send(text) {
  if (ai.busy) return;
  if (text) pushMsg('user', text);
  ai.busy = true;
  setBusy(true);

  const sysMap = { build: sysBuild, polish: sysPolish, mock: sysMock };
  const history = ai.msgs[ai.mode].map(m => ({ role: m.role, content: m.content }));
  const payload = [{ role: 'system', content: sysMap[ai.mode]() }].concat(history);
  ai.msgs[ai.mode].push({ role: 'assistant', content: '' });
  const idx = ai.msgs[ai.mode].length - 1;

  try {
    await callModel(payload, full => {
      ai.msgs[ai.mode][idx].content = full;
      const box = $('#ai-chat');
      const bubbles = box.querySelectorAll('.ai-msg.assistant .ai-bubble');
      const last = bubbles[bubbles.length - 1];
      if (last) last.innerHTML = mdLite(full.replace(/```json[\s\S]*?```/g, ''));
      box.scrollTop = box.scrollHeight;
    });
  } catch (e) {
    ai.msgs[ai.mode][idx].content = '⚠️ ' + e.message;
  }
  saveAI();
  ai.busy = false;
  setBusy(false);
  renderAI();
}

function setBusy(b) {
  const s = $('#ai-send');
  if (s) { s.disabled = b; s.textContent = b ? '生成中…' : '发送'; }
}

/* ---------- 三种模式的入口 ---------- */
function startMode() {
  if (ai.mode === 'build') {
    const miss = missingItems();
    const intro = miss.length
      ? `档案我看了，还缺这些：${miss.slice(0, 6).join('、')}。\n\n先从最近的一段经历开始：公司、岗位、起止时间分别是什么？`
      : `档案基本齐了。想补强哪一块？还是我们直接过一遍项目细节，把模糊的地方问实？`;
    pushMsg('assistant', intro);
    return;
  }
  if (ai.mode === 'polish') { renderPolishPick(); return; }
  if (ai.mode === 'mock') {
    send('开始面试。请直接问第一个问题，不要自我介绍。');
    return;
  }
}

function renderPolishPick() {
  const box = $('#ai-chat');
  const opts = (profile.projects || []).map((p, i) => `<option value="${i}">${esc(p.name || '未命名项目 ' + (i + 1))}</option>`).join('');
  if (!opts) { box.innerHTML = `<div class="note warn">档案里还没有项目，先去「① 我的档案」加一个。</div>`; return; }
  box.innerHTML = `<div class="ai-empty">
    <div class="ai-empty-t">选一个项目来改写</div>
    <div class="ai-empty-d">只改措辞，不新增事实；${jd.analysis ? '会按当前 JD 调整每条动作的侧重。' : '贴好 JD（②标签页）后改写会更有针对性。'}结果逐条给你看，你决定采不采用。</div>
    ${jd.analysis ? '' : '<div class="note warn" style="text-align:left">还没分析过 JD——现在改写只能通用润色，不会往岗位方向聚焦。建议先去「② JD 分析」贴一份再回来。</div>'}
    <div style="display:flex;gap:8px;margin-top:10px">
      <select id="ai-proj-pick" style="flex:1;padding:7px 9px;border:1px solid var(--line);border-radius:8px">${opts}</select>
      <button class="btn primary" id="ai-polish-go">改写</button>
    </div>
  </div>`;
  $('#ai-polish-go').onclick = () => doPolish(+$('#ai-proj-pick').value);
}

async function doPolish(i) {
  const p = profile.projects[i];
  if (!p) return;
  ai.msgs.polish = [];
  const input = [
    `项目：${p.name}`,
    p.role ? `角色：${p.role}` : '',
    p.background ? `背景：${p.background}` : '',
    (p.tech || []).length ? `技术栈：${p.tech.join('、')}` : '',
    '动作：',
    (p.actions || []).map((a, k) => `${k + 1}. ${a}`).join('\n'),
    p.result ? `结果：${p.result}` : ''
  ].filter(Boolean).join('\n');
  ai.polishTarget = i;
  await send(input);
}

/* ---------- 改写结果卡片 ---------- */
function polishCard(patch, id) {
  const items = patch.items || [];
  if (!items.length) return '';
  const rows = items.map((it, k) => {
    const key = id + '-' + k;
    const done = ai.applied[key];
    return `<div class="ai-pitem">
      <div class="ai-pfrom">${esc(it.from)}</div>
      <div class="ai-pto">${esc(it.to)}</div>
      <div class="ai-pfoot">
        <span class="ai-pwhy">${esc(it.why || '')}</span>
        <button class="btn small ${done ? '' : 'primary'}" data-adopt="${key}" ${done ? 'disabled' : ''}>${done ? '已采用' : '采用'}</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="ai-card">
    <div class="ai-card-head"><b>改写建议 · ${items.length} 条</b><span class="ai-phint">逐条采用，不覆盖原档</span></div>
    ${rows}
  </div>`;
}

function adoptPolish(key) {
  const parts = key.split('-');
  const k = +parts[parts.length - 1];
  const msgIdx = +parts[parts.length - 2];
  const idx = ai.polishTarget;
  const p = profile.projects[idx];
  if (!p) return;
  const patch = extractJson(ai.msgs.polish[msgIdx].content);
  const it = patch && patch.items && patch.items[k];
  if (!it) return;
  const at = (p.actions || []).findIndex(a => a.trim() === String(it.from).trim());
  if (at < 0) {
    toast('这条已经不在档案里了（可能改过），跳过');
    return;
  }
  p.actions[at] = it.to;
  saveProfile();
  renderProfile();
  ai.applied[key] = true;
  saveAI();
  toast('已替换第 ' + (at + 1) + ' 条');
  renderAI();
}

/* ---------- 配置与状态 ---------- */
async function checkStatus() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    const j = await r.json();
    ai.configured = !!j.configured;
    ai.model = j.model;
  } catch (e) {
    ai.configured = false;
    ai.offline = true;
  }
  const badge = $('#ai-badge');
  if (badge) {
    badge.textContent = ai.offline ? '未连接本地服务' : (ai.configured ? '已连接 ' + (ai.model || '') : '未配置 Key');
    badge.className = 'ai-badge ' + (ai.configured ? 'ok' : 'warn');
  }
  renderAI();
}

function openSetup() {
  const box = $('#ai-setup');
  box.classList.toggle('hidden');
  const st = $('#ai-key-state');
  if (st) st.textContent = ai.configured ? '当前已配置，重新填写会覆盖。' : '还没有配置。';
}

async function saveKey() {
  const k = $('#ai-key').value.trim();
  const base = $('#ai-base').value.trim() || 'https://api.deepseek.com';
  const model = $('#ai-model').value.trim() || 'deepseek-chat';
  if (!k) { toast('先把 key 贴上'); return; }
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: k, base_url: base, model })
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '保存失败');
    $('#ai-key').value = '';
    $('#ai-setup').classList.add('hidden');
    toast('已保存到本机 config.json');
    checkStatus();
  } catch (e) {
    toast('保存失败：' + e.message);
  }
}

/* ---------- 绑定 ---------- */
function bindAI() {
  if (!$('#ai-chat')) return;

  $$('#ai-modes button').forEach(b => {
    b.onclick = () => {
      if (ai.busy) { toast('等这一轮生成完'); return; }
      ai.mode = b.dataset.mode;
      $$('#ai-modes button').forEach(x => x.classList.toggle('active', x === b));
      saveAI();
      renderAI();
    };
  });

  $('#ai-send').onclick = () => {
    const t = $('#ai-input').value.trim();
    if (!t) { toast('先说点什么'); return; }
    $('#ai-input').value = '';
    send(t);
  };
  $('#ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#ai-send').click();
    }
  });
  $('#ai-config').onclick = openSetup;
  $('#ai-key-save').onclick = saveKey;
  $('#ai-clear').onclick = () => {
    if (!confirm('清空当前模式的对话记录？档案不受影响。')) return;
    ai.msgs[ai.mode] = [];
    ai.applied = {};
    saveAI();
    renderAI();
  };

  $$('#ai-modes button').forEach(x => x.classList.toggle('active', x.dataset.mode === ai.mode));
  checkStatus();
}

document.addEventListener('DOMContentLoaded', bindAI);

