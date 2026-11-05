/* ============================================================
   求职工坊 · 应用逻辑
   ============================================================ */

/* ---------- 基础工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uniq = arr => Array.from(new Set(arr));

const SKILL_MAP = {};
SKILLS.forEach(s => { SKILL_MAP[s.n] = s; });

const CATS = uniq(SKILLS.map(s => s.c));
const LEVELS = { 1: '了解概念', 2: '能读能改', 3: '能独立用', 4: '熟练', 5: '能带人/设计' };
const TRUTHS = { yes: '真做过', partial: '参与/设计', no: '只是了解' };

/* ============================================================
   年月选择器
   简历里的时间只精确到月，但自由文本会被写成「2024.3」「2024/03」
   「24 年 3 月」……下游的排序、时间线推导、排版全靠正则兜着，很容易漏。
   这里统一成「年 + 月」两个下拉，存储格式固定为三种：
     2024.03                          单点（毕业时间）
     2024.03 - 2025.06                区间
     2024.03 - 至今                   还在做
   ============================================================ */
const YM_MIN_YEAR = 2008;
const pad2 = n => String(n).padStart(2, '0');

function ymYearOpts(sel) {
  const cur = new Date().getFullYear();
  let h = '<option value="">年</option>';
  for (let y = cur + 1; y >= YM_MIN_YEAR; y--) {
    h += `<option value="${y}"${Number(sel) === y ? ' selected' : ''}>${y}</option>`;
  }
  return h;
}
function ymMonthOpts(sel) {
  let h = '<option value="">月</option>';
  for (let m = 1; m <= 12; m++) {
    const v = pad2(m);
    h += `<option value="${v}"${Number(sel) === m ? ' selected' : ''}>${v}</option>`;
  }
  return h;
}

function parseYm(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s) return null;
  const m = s.match(/(\d{4})\s*[.\-/年·]?\s*(\d{1,2})?/);
  if (!m) return null;
  return { y: Number(m[1]), m: m[2] ? clamp(Number(m[2]), 1, 12) : 1 };
}
function parseRange(str) {
  const s = String(str == null ? '' : str).trim();
  const now = /至今|现在|目前|present|now/i.test(s);
  const parts = s.split(/\s*(?:[-–—~〜]|至|到)\s*/).filter(Boolean);
  const start = parseYm(parts[0] || '');
  const end = now ? null : (parts[1] ? parseYm(parts[1]) : null);
  return { start, end, now };
}
const fmtYm = o => (o ? `${o.y}.${pad2(o.m)}` : '');
function fmtRange(r) {
  if (!r || !r.start) return '';
  const s = fmtYm(r.start);
  if (r.now) return s + ' - 至今';
  return r.end ? `${s} - ${fmtYm(r.end)}` : s;
}
/* 起止都写全才算「时间齐了」：只有开头一个年月，简历上看着像没写完 */
function hasRange(t) {
  const r = parseRange(t);
  return !!(r.start && (r.now || r.end));
}
/* 老存档 / AI 写入的时间统一成标准写法。带备注的（如「2024.03（试用期）」）不动，
   免得把用户自己加的字吃掉。 */
const YM_NOISE = /[^\d\s.\-/年月日至今到现在目前~〜—–]/;
function standardizeTime(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || YM_NOISE.test(s)) return v;
  const r = parseRange(s);
  return r.start ? fmtRange(r) : v;
}

function ymPair(prefix, y, m, disabled) {
  return `<select data-ym="${prefix}y" title="年"${disabled ? ' disabled' : ''}>${ymYearOpts(y)}</select>`
    + `<select data-ym="${prefix}m" title="月"${disabled ? ' disabled' : ''}>${ymMonthOpts(m)}</select>`;
}
function ymRangeHtml(attr, value) {
  const r = parseRange(value);
  return `<span class="ym-range" ${attr}>
    ${ymPair('s', r.start && r.start.y, r.start && r.start.m)}
    <span class="ym-sep">—</span>
    ${ymPair('e', r.end && r.end.y, r.end && r.end.m, r.now)}
    <button type="button" class="ym-now${r.now ? ' on' : ''}" data-ym-now title="现在还在做">至今</button>
  </span>`;
}
function ymSingleHtml(attr, value) {
  const r = parseYm(value) || {};
  return `<span class="ym-range ym-single" ${attr}>${ymPair('s', r.y, r.m)}</span>`;
}

function readYm(box, prefix) {
  const y = box.querySelector(`[data-ym="${prefix}y"]`);
  const m = box.querySelector(`[data-ym="${prefix}m"]`);
  return { y: y && y.value ? Number(y.value) : null, m: m && m.value ? Number(m.value) : null };
}
function readYmRange(box) {
  const s = readYm(box, 's');
  if (!s.y) return '';
  const btn = box.querySelector('[data-ym-now]');
  const now = !!(btn && btn.classList.contains('on'));
  const e = readYm(box, 'e');
  return fmtRange({
    start: { y: s.y, m: s.m || 1 },
    end: e.y ? { y: e.y, m: e.m || s.m || 1 } : null,
    now
  });
}
function readYmSingle(box) {
  const s = readYm(box, 's');
  return s.y ? fmtYm({ y: s.y, m: s.m || 1 }) : '';
}

/* 只选了年没选月 → 补个默认月，保证存下来一定是「年.月」，不留半截 */
function ymNormalize(box) {
  const g = k => box.querySelector(`[data-ym="${k}"]`);
  const sy = g('sy'), sm = g('sm'), ey = g('ey'), em = g('em');
  if (sy && !sy.value && sm) sm.value = '';
  if (ey && !ey.value && em) em.value = '';
  if (sy && sy.value && sm && !sm.value) sm.value = '01';
  if (ey && ey.value && em && !em.value) em.value = (sm && sy && sy.value) ? sm.value : '01';
}

function bindYmRange(box, onChange) {
  const btn = box.querySelector('[data-ym-now]');
  const eyEl = box.querySelector('[data-ym="ey"]'), emEl = box.querySelector('[data-ym="em"]');
  const lockEnd = on => {
    [eyEl, emEl].forEach(el => { if (el) { el.disabled = on; if (on) el.value = ''; } });
  };
  const fire = () => {
    ymNormalize(box);
    const s = readYm(box, 's'), e = readYm(box, 'e');
    const now = !!(btn && btn.classList.contains('on'));
    // 起止倒挂只提示不拦：有人确实要写跨到未来的区间
    const bad = !now && s.y && e.y && (e.y * 12 + (e.m || 1)) < (s.y * 12 + (s.m || 1));
    box.classList.toggle('bad', !!bad);
    if (bad) toast('结束时间早于开始时间，核对一下');
    onChange(readYmRange(box));
  };
  box.querySelectorAll('select').forEach(sel => sel.addEventListener('change', fire));
  if (btn) btn.addEventListener('click', () => {
    btn.classList.toggle('on');
    lockEnd(btn.classList.contains('on'));
    fire();
  });
}
function bindYmSingle(box, onChange) {
  const fire = () => { ymNormalize(box); onChange(readYmSingle(box)); };
  box.querySelectorAll('select').forEach(sel => sel.addEventListener('change', fire));
}

/* 「入职年月」起点：整个应用只有这一个，单独挂载 */
function mountStartPicker(value) {
  const box = $('#tl-start');
  if (!box) return;
  const r = parseYm(value) || parseYm(guessStart());
  box.innerHTML = ymPair('s', r && r.y, r && r.m);
  box.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', onStartChange);
  });
}
function setStartPicker(value) {
  const box = $('#tl-start');
  if (!box) return;
  const r = parseYm(value) || parseYm(guessStart());
  const y = box.querySelector('[data-ym="sy"]'), m = box.querySelector('[data-ym="sm"]');
  if (y) y.value = r ? String(r.y) : '';
  if (m) m.value = r ? pad2(r.m) : '';
}
function tlStartValue() {
  const box = $('#tl-start');
  if (!box) return guessStart();
  return readYmSingle(box) || guessStart();
}
/* 起点改了，之前「推定」的时间全部作废重排——留着旧值会和新起点打架 */
function onStartChange() {
  (profile.projects || []).forEach(p => { if (p.timeGuess) { p.time = ''; p.timeGuess = false; } });
  (profile.works || []).forEach(w => { if (w.timeGuess) { w.time = ''; w.timeGuess = false; } });
  saveProfile(); renderProjects(); renderTimeline(); renderCompleteness();
}

/* ---------- 存储 ---------- */
const KEY = {
  profile: 'jobkit.profile.v1', jd: 'jobkit.jd.v1', sessions: 'jobkit.sessions.v1',
  savedAt: 'jobkit.savedAt.v1'
};
function load(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('存储失败', e); } }

let profile = load(KEY.profile, null) || clone(DEFAULT_PROFILE);
let jd = load(KEY.jd, { company: '', title: '', channel: '', text: '', url: '', analysis: null });
let sessions = load(KEY.sessions, []);
let iv = { qs: [], i: 0, ratings: {}, timer: null, left: 0, meta: null };
let dirty = true;
let savedAt = load(KEY.savedAt, 0) || 0;

/* 保存反馈：所有写入都走这里，用户能看见「刚才存了没有」 */
function markSaved() {
  savedAt = Date.now();
  save(KEY.savedAt, savedAt);
  renderSaveState();
}
function renderSaveState() {
  const pill = $('#save-pill');
  if (!pill) return;
  if (!savedAt) { pill.textContent = '尚未保存'; pill.className = 'save-pill'; return; }
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  pill.textContent = `已自动保存 ${hh}:${mm}:${ss}`;
  pill.className = 'save-pill ok';
}
function flushAll(silent) {
  save(KEY.profile, profile);
  save(KEY.jd, jd);
  save(KEY.sessions, sessions);
  markSaved();
  if (!silent) toast('已保存到本机浏览器');
}

function saveProfile() { save(KEY.profile, profile); dirty = true; markSaved(); }
function saveJd() { save(KEY.jd, jd); dirty = true; markSaved(); }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
}

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.'); const last = ks.pop();
  const t = ks.reduce((a, k) => a[k], o); t[last] = v;
}

/* ============================================================
   ① 档案
   ============================================================ */
function renderBasic() {
  const el = $('#basic-form');
  const f = (path, label, ph, type) =>
    `<label class="f"><span>${label}</span><input type="${type || 'text'}" data-path="${path}" value="${esc(getPath(profile, path))}" placeholder="${ph || ''}"></label>`;
  el.innerHTML =
    f('name', '姓名', '张三') + f('phone', '手机', '13500000000') +
    f('email', '邮箱', 'you@example.com') + f('city', '所在城市', '广州') +
    f('target', '求职意向', 'AI 应用工程师 / Python 后端') +
    f('years', '工作年限（只填数字）', '3', 'number');
  el.querySelectorAll('[data-path]').forEach(inp => {
    inp.addEventListener('input', () => {
      const v = inp.type === 'number' ? (Number(inp.value) || 0) : inp.value;
      setPath(profile, inp.dataset.path, v);
      saveProfile();
    });
  });
}

function renderEdu() {
  const el = $('#edu-form');
  el.innerHTML =
    `<label class="f"><span>学校</span><input data-path="edu.school" value="${esc(profile.edu.school)}" placeholder="学校名称"></label>
     <label class="f"><span>专业</span><input data-path="edu.major" value="${esc(profile.edu.major)}" placeholder="计算机科学与技术"></label>
     <label class="f"><span>学历</span>
       <select data-path="edu.degree">
         ${['大专', '本科', '硕士', '博士', '其他'].map(d => `<option ${profile.edu.degree === d ? 'selected' : ''}>${d}</option>`).join('')}
       </select></label>
     <div class="f"><span>毕业时间（年 / 月）</span>
       <span class="time-row">${ymSingleHtml('data-year="edu"', profile.edu.year)}</span>
     </div>`;
  el.querySelectorAll('[data-path]').forEach(inp => {
    inp.addEventListener('input', () => { setPath(profile, inp.dataset.path, inp.value); saveProfile(); });
    inp.addEventListener('change', () => {
      setPath(profile, inp.dataset.path, inp.value); saveProfile(); renderCompleteness();
    });
  });
  el.querySelectorAll('[data-year]').forEach(box => {
    bindYmSingle(box, v => { profile.edu.year = v; saveProfile(); renderCompleteness(); });
  });
}

function renderSkills() {
  const el = $('#skill-wrap');
  if (!profile.skills.length) { el.innerHTML = '<div class="empty">还没有技能，点右上角添加</div>'; return; }
  let html = `<table class="skill-table"><thead><tr>
      <th style="width:34%">技能</th><th style="width:18%">分类</th>
      <th style="width:20%">熟练度</th><th style="width:20%">真实度</th><th style="width:40px"></th>
    </tr></thead><tbody>`;
  profile.skills.forEach((s, i) => {
    html += `<tr>
      <td><input data-i="${i}" data-k="n" value="${esc(s.n)}"></td>
      <td><select data-i="${i}" data-k="c">${CATS.map(c => `<option ${s.c === c ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td><select data-i="${i}" data-k="level">${[1, 2, 3, 4, 5].map(l => `<option value="${l}" ${Number(s.level) === l ? 'selected' : ''}>${l} · ${LEVELS[l]}</option>`).join('')}</select></td>
      <td><select data-i="${i}" data-k="truth" class="ts-${s.truth}">${Object.keys(TRUTHS).map(t => `<option value="${t}" ${s.truth === t ? 'selected' : ''}>${TRUTHS[t]}</option>`).join('')}</select></td>
      <td><button class="del" data-del="${i}" title="删除">×</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;

  el.querySelectorAll('[data-k]').forEach(inp => {
    const handler = () => {
      const i = +inp.dataset.i, k = inp.dataset.k;
      profile.skills[i][k] = (k === 'level') ? Number(inp.value) : inp.value;
      saveProfile();
    };
    inp.addEventListener('input', handler);
    inp.addEventListener('change', handler);
  });
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    profile.skills.splice(+b.dataset.del, 1); saveProfile(); renderSkills();
  }));
}

function renderProjects() {
  const el = $('#proj-wrap');
  if (!profile.projects.length) { el.innerHTML = '<div class="empty">还没有项目，点右上角添加</div>'; return; }
  el.innerHTML = profile.projects.map((p, i) => `
    <div class="proj" data-i="${i}">
      <div class="proj-head">
        <span class="idx">项目 ${i + 1}</span>
        <input data-p="name" value="${esc(p.name)}" placeholder="项目名称">
        <button class="btn small" data-delproj="${i}">删除</button>
      </div>
      <div class="grid2">
        <label class="f"><span>我的角色</span><input data-p="role" value="${esc(p.role)}" placeholder="后端 / Agent 编排"></label>
        <div class="f"><span>时间（年 / 月）${p.timeGuess ? '<i class="tag-guess" title="按工作年限推定的时间，核对后点 ✓ 确认">推定</i>' : ''}</span>
          <span class="time-row">
            ${ymRangeHtml('data-range="time"', p.time)}
            ${p.timeGuess ? `<button class="mini ok" data-oktime="${i}" title="这个时间是对的">✓</button>` : ''}
          </span>
        </div>
      </div>
      <label class="f"><span>背景 / 要解决的问题（1-2 句）</span>
        <textarea data-p="background" rows="2">${esc(p.background)}</textarea></label>
      <label class="f"><span>技术栈（逗号分隔，尽量用技能池里的标准名，JD 匹配更准）</span>
        <input data-p="tech" value="${esc((p.tech || []).join('、'))}" placeholder="Python、模型微调、结构化校验"></label>
      <label class="f acts"><span>我的动作（一行一条，不超过 6 条）</span>
        <textarea data-p="actions" rows="6">${esc((p.actions || []).join('\n'))}</textarea></label>
      <label class="f"><span>结果（真实的数字；没有就留空，别编）</span>
        <input data-p="result" value="${esc(p.result)}" placeholder="如：日均处理 1.2 万条，P95 从 8s 降到 3s"></label>
    </div>`).join('');

  el.querySelectorAll('.proj').forEach(card => {
    const i = +card.dataset.i;
    card.querySelectorAll('[data-range]').forEach(box => {
      bindYmRange(box, v => {
        const p = profile.projects[i];
        const prev = String(p.time || '').trim();
        p.time = v;
        // 手动选过时间 = 已核实。只摘标签不重绘，否则下拉框会失焦、重新选一遍
        if (v && v !== prev && p.timeGuess) {
          p.timeGuess = false;
          const label = box.closest('.f');
          if (label) {
            const tag = label.querySelector('.tag-guess'); if (tag) tag.remove();
            const ok = label.querySelector('.mini.ok'); if (ok) ok.remove();
          }
        }
        saveProfile();
        renderTimeline(); renderCompleteness();
      });
    });
    card.querySelectorAll('[data-p]').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.p;
        if (k === 'tech') profile.projects[i].tech = inp.value.split(/[、,，;；\n]/).map(x => x.trim()).filter(Boolean);
        else if (k === 'actions') profile.projects[i].actions = inp.value.split('\n').map(x => x.trim()).filter(Boolean);
        else profile.projects[i][k] = inp.value;
        saveProfile();
      });
    });
  });
  el.querySelectorAll('[data-oktime]').forEach(b => b.addEventListener('click', () => {
    profile.projects[+b.dataset.oktime].timeGuess = false;
    saveProfile(); renderProjects(); renderCompleteness();
    toast('已确认这个时间');
  }));
  el.querySelectorAll('[data-delproj]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('删除这个项目？')) return;
    profile.projects.splice(+b.dataset.delproj, 1); saveProfile(); renderProjects();
  }));
}

function renderWorks() {
  const el = $('#work-wrap');
  if (!profile.works.length) { el.innerHTML = '<div class="empty">还没有工作经历</div>'; }
  else {
    el.innerHTML = profile.works.map((w, i) => `
      <div class="proj" data-w="${i}">
        <div class="grid2">
          <label class="f"><span>公司</span><input data-wf="company" value="${esc(w.company)}"></label>
          <label class="f"><span>岗位</span><input data-wf="title" value="${esc(w.title)}"></label>
        </div>
        <div class="f"><span>时间（年 / 月）${w.timeGuess ? '<i class="tag-guess" title="推定的时间，核对后点 ✓ 确认">推定</i>' : ''}</span>
          <span class="time-row">
            ${ymRangeHtml('data-range="time"', w.time)}
            ${w.timeGuess ? `<button class="mini ok" data-okworktime="${i}" title="这个时间是对的">✓</button>` : ''}
          </span>
        </div>
        <label class="f"><span>一句话职责（简历上公司名后面跟的那行）</span><input data-wf="desc" value="${esc(w.desc)}" placeholder="负责什么，一句话说清"></label>
        <button class="btn small" data-delwork="${i}">删除这段</button>
      </div>`).join('');
    el.querySelectorAll('.proj').forEach(card => {
      const i = +card.dataset.w;
      card.querySelectorAll('[data-range]').forEach(box => {
        bindYmRange(box, v => {
          const w = profile.works[i];
          const prev = String(w.time || '').trim();
          w.time = v;
          if (v && v !== prev && w.timeGuess) {
            w.timeGuess = false;
            const label = box.closest('.f');
            if (label) {
              const tag = label.querySelector('.tag-guess'); if (tag) tag.remove();
              const ok = label.querySelector('.mini.ok'); if (ok) ok.remove();
            }
          }
          saveProfile();
          renderTimeline(); renderCompleteness();
        });
      });
      card.querySelectorAll('[data-wf]').forEach(inp => {
        inp.addEventListener('input', () => {
          profile.works[i][inp.dataset.wf] = inp.value; saveProfile();
        });
      });
    });
    el.querySelectorAll('[data-okworktime]').forEach(b => b.addEventListener('click', () => {
      profile.works[+b.dataset.okworktime].timeGuess = false;
      saveProfile(); renderWorks(); renderCompleteness();
      toast('已确认这个时间');
    }));
    el.querySelectorAll('[data-delwork]').forEach(b => b.addEventListener('click', () => {
      profile.works.splice(+b.dataset.delwork, 1); saveProfile(); renderWorks();
    }));
  }
  $('#extras').value = (profile.extras || []).join('\n');
  $('#extras').oninput = () => {
    profile.extras = $('#extras').value.split('\n').map(x => x.trim()).filter(Boolean);
    saveProfile();
  };
}

/* ============================================================
   时间线建议 + 档案完整度
   ============================================================ */
function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function ymNum(s) {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})/);
  if (!m) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}
function ymAdd(s, n) {
  const base = ymNum(s);
  if (base == null) return '';
  const t = base + n;
  return `${Math.floor(t / 12)}.${String(t % 12 + 1).padStart(2, '0')}`;
}
function monthsBetween(a, b) {
  const x = ymNum(a), y = ymNum(b);
  if (x == null || y == null) return 0;
  return y - x;
}
/* 起点：有「工作年限」就倒推，默认取 7 月（毕业季） */
function guessStart() {
  const yrs = Number(profile.years) || 0;
  const y = new Date().getFullYear() - (yrs || 3);
  return `${y}.07`;
}

function planTimeline() {
  const now = ymNow();
  const start = tlStartValue();
  const total = Math.max(12, monthsBetween(start, now));
  let cursor = 0;
  const rows = [];

  (profile.projects || []).forEach((p, i) => {
    const cur = String(p.time || '').trim();
    // 已经填过的：原样显示，不覆盖
    if (cur) {
      const m = cur.match(/(\d{4}\D\d{1,2})\s*[-–—~至]+\s*(至今|\d{4}\D\d{1,2})/);
      rows.push({
        i, name: p.name || `项目 ${i + 1}`, s: m ? m[1] : cur, e: m ? m[2] : '',
        src: p.timeGuess ? '推定' : '已填'
      });
      if (m && m[2] !== '至今') cursor = Math.max(cursor, monthsBetween(start, m[2]));
      else if (!m) cursor += 6;
      return;
    }
    // 空着的：先看示例档案里同名项目有没有值，再退回顺序排布
    const preset = (DEFAULT_PROFILE.projects.find(x => x.name === p.name) || {}).time || '';
    const pm = preset.match(/(\d{4}\D\d{1,2})\s*[-–—~至]+\s*(至今|\d{4}\D\d{1,2})/);
    if (pm) {
      rows.push({ i, name: p.name || `项目 ${i + 1}`, s: pm[1], e: pm[2], src: '建议' });
      if (pm[2] !== '至今') cursor = Math.max(cursor, monthsBetween(start, pm[2]));
      return;
    }
    const len = clamp(3 + Math.round((p.actions || []).length * 1.2), 4, 12);
    const s = ymAdd(start, cursor);
    let e = ymAdd(start, cursor + len - 1);
    if (monthsBetween(start, e) >= total) e = '至今';
    rows.push({ i, name: p.name || `项目 ${i + 1}`, s, e, src: '建议' });
    cursor += len;
  });

  // 工作经历也一起排
  (profile.works || []).forEach((w, i) => {
    const cur = String(w.time || '').trim();
    rows.push({
      i, work: true, name: (w.company || '工作经历') + (w.title ? ' · ' + w.title : ''),
      s: cur ? (cur.match(/(\d{4}\D\d{1,2})/) || [cur])[0] : start,
      e: cur && /至今/.test(cur) ? '至今' : (cur ? (cur.match(/[-–—~至]+\s*(\d{4}\D\d{1,2})\s*$/) || [, ''])[1] : '至今'),
      src: cur ? (w.timeGuess ? '推定' : '已填') : '建议'
    });
  });

  return { rows, start, now };
}

function applyTimelineRow(r) {
  if (!r || !r.s) return;
  const time = !r.e ? r.s : (r.e === '至今' ? `${r.s} - 至今` : `${r.s} - ${r.e}`);
  if (r.work) {
    const w = profile.works[r.i];
    if (!w) return;
    w.time = time; w.timeGuess = true;
  } else {
    const p = profile.projects[r.i];
    if (!p) return;
    p.time = time; p.timeGuess = true;
  }
}

function renderTimeline() {
  const box = $('#tl-plan');
  if (!box) return;

  const plan = planTimeline();
  if (!plan.rows.length) {
    box.innerHTML = '<div class="empty">还没有项目和经历，先添加再排时间线</div>';
    return;
  }
  const guessable = plan.rows.filter(r => r.src === '建议').length;
  const guessed = plan.rows.filter(r => r.src === '推定').length;
  const chipOf = src => src === '已填'
    ? '<span class="chip hit">已核实</span>'
    : src === '推定'
      ? '<span class="chip warn">推定待核</span>'
      : '<span class="chip miss">没有时间</span>';
  box.innerHTML = `
    <table class="tl-table"><thead><tr>
      <th style="width:44%">项目 / 经历</th><th style="width:26%">区间</th>
      <th style="width:16%">状态</th><th style="width:14%"></th>
    </tr></thead><tbody>
    ${plan.rows.map((r, idx) => `<tr>
      <td>${esc(r.name)}</td>
      <td>${r.e ? `<b>${esc(r.s)}</b> — <b>${esc(r.e)}</b>` : esc(r.s)}</td>
      <td>${chipOf(r.src)}</td>
      <td style="text-align:right">${r.src === '建议' ? `<button class="btn small" data-tlapply="${idx}">采用</button>` : ''}</td>
    </tr>`).join('')}
    </tbody></table>
    <div class="note ${guessable || guessed ? 'warn' : 'ok'}" style="margin-top:10px">
      ${guessable ? `还有 <b>${guessable}</b> 段没有时间，点「采用」或「全部采用」填入。` : ''}
      ${guessed ? `${guessable ? '另外' : ''}有 <b>${guessed}</b> 段是推定值，核对后在项目卡里点时间旁的 ✓。` : ''}
      ${!guessable && !guessed ? '全部时间都已核实，这一块可以不用管了。' : ''}
    </div>`;

  box.querySelectorAll('[data-tlapply]').forEach(b => b.addEventListener('click', () => {
    applyTimelineRow(plan.rows[+b.dataset.tlapply]);
    saveProfile(); renderProjects(); renderWorks(); renderTimeline(); renderCompleteness();
    toast('已采用，记得核对');
  }));
}

function completenessItems() {
  const proj = profile.projects || [];
  const works = profile.works || [];
  const withTime = proj.filter(p => hasRange(p.time)).length;
  const guess = proj.filter(p => p.timeGuess).length + works.filter(w => w.timeGuess).length;
  return [
    { k: '姓名', ok: !!String(profile.name || '').trim(), go: '#basic-form' },
    { k: '手机号', ok: !!String(profile.phone || '').trim(), go: '#basic-form' },
    { k: '邮箱', ok: !!String(profile.email || '').trim(), go: '#basic-form' },
    { k: '求职意向', ok: !!String(profile.target || '').trim(), go: '#basic-form' },
    { k: '工作年限', ok: Number(profile.years) > 0, go: '#basic-form' },
    { k: '学校与专业', ok: !!(profile.edu && profile.edu.school && profile.edu.major), go: '#edu-form' },
    { k: '毕业时间', ok: !!(profile.edu && profile.edu.year), go: '#edu-form' },
    { k: '项目时间', ok: proj.length > 0 && withTime === proj.length, note: `${withTime}/${proj.length}`, go: '#proj-wrap' },
    { k: '工作经历时间', ok: works.some(w => hasRange(w.time)), go: '#work-wrap' },
    { k: '岗位名称', ok: works.some(w => String(w.title || '').trim()), go: '#work-wrap' },
    { k: '项目结果数字', ok: proj.some(p => /\d/.test(p.result || '')), go: '#proj-wrap' },
    { k: '时间已核实', ok: guess === 0 && withTime > 0, note: guess ? `${guess} 处推定` : '', go: '#timeline-card' }
  ];
}

function renderCompleteness() {
  const box = $('#completeness-list');
  if (!box) return;
  const items = completenessItems();
  const ok = items.filter(i => i.ok).length;
  const pct = Math.round(ok / items.length * 100);
  $('#completeness-pct').textContent = `${ok}/${items.length} · ${pct}%`;
  const bar = $('#completeness-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 90 ? 'var(--green)' : pct >= 65 ? 'var(--accent)' : 'var(--amber)';
  box.innerHTML = items.map(i => `
    <button class="check-item ${i.ok ? 'ok' : 'miss'}" data-go="${i.go}" title="${i.ok ? '已填' : '点这里去填'}">
      <span class="mark">${i.ok ? '✓' : '!'}</span>
      <span>${esc(i.k)}</span>
      ${i.note ? `<span class="cnt">${esc(i.note)}</span>` : ''}
    </button>`).join('');
  box.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const t = document.querySelector(b.dataset.go);
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1200); }
  }));
}

function renderProfile() {
  renderBasic(); renderSkills(); renderProjects(); renderWorks(); renderEdu();
  renderTimeline(); renderCompleteness();
}

/* ============================================================
   ② JD 分析
   ============================================================ */
function aliasRe(alias) {
  const a = String(alias).trim();
  const e = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const latin = /^[a-z0-9+#./\-_ ]+$/i.test(a);
  return latin ? new RegExp('(^|[^a-z0-9])' + e + '(?![a-z0-9])', 'gi') : new RegExp(e, 'g');
}

function countOccur(text, alias) {
  try {
    const m = text.match(aliasRe(alias));
    return m ? m.length : 0;
  } catch (e) { return 0; }
}

/* 同一段文字可能被"标准名"和"别名"同时命中（如「模型微调」与「微调」），
   直接把次数相加会虚高。这里按字符区间去重，一个位置只算一次。 */
function countOccurMerged(text, aliases) {
  const spans = [];
  (aliases || []).forEach(al => {
    const a = String(al || '').trim();
    if (!a) return;
    let re;
    try { re = aliasRe(a); } catch (e) { return; }
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!m[0].length) { re.lastIndex++; continue; }
      spans.push([m.index, m.index + m[0].length]);
    }
  });
  if (!spans.length) return 0;
  spans.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
  let n = 0, end = -1;
  spans.forEach(([s, e]) => { if (s >= end) { n++; end = e; } });
  return n;
}

function parseYears(t) {
  const ok = n => n >= 0 && n <= 25;   // 超过 25 的多半是年份（2024 年），不是年限
  // 先扫区间：3-5 年 / 3~5年 / 3至5年
  let m;
  const rangeRe = /(\d+)\s*[-~—–至]\s*(\d+)\s*年/g;
  while ((m = rangeRe.exec(t)) !== null) {
    if (ok(+m[1]) && ok(+m[2])) return { min: +m[1], max: +m[2] };
  }
  // 再逐条扫"N 年"：跳过 2024 年这类日期，避免被第一个年份挡住
  const oneRe = /(\d+)\s*年(以上|及以上|左右|或以上|\+)?/g;
  while ((m = oneRe.exec(t)) !== null) {
    const n = +m[1];
    if (n >= 1900) continue;           // 年份不是年限
    if (!ok(n)) continue;
    return { min: n, max: n };
  }
  if (/应届|在校|实习|校招/.test(t)) return { min: 0, max: 1 };
  return null;
}

const DEG_RANK = { '大专': 1, '本科': 2, '硕士': 3, '博士': 4, '其他': 1 };
function parseDegree(t) {
  if (/博士/.test(t)) return '博士';
  if (/硕士|研究生/.test(t)) return '硕士';
  if (/本科|学士/.test(t)) return '本科';
  if (/大专|专科/.test(t)) return '大专';
  return null;
}

function analyzeJD(text) {
  const lower = text.toLowerCase();
  const skills = [];
  SKILLS.forEach(s => {
    const cnt = countOccurMerged(lower, [s.n].concat(s.a).map(x => String(x).toLowerCase()));
    if (cnt > 0) skills.push({ n: s.n, c: s.c, t: s.t, cnt, weight: cnt * s.w });
  });
  skills.sort((a, b) => b.weight - a.weight);

  const lines = text.split(/\n+/).map(l => l.replace(/^[\s•·\-*\d.、)）]+/, '').trim()).filter(l => l.length > 6);
  const duties = lines.filter(l => /负责|参与|独立|搭建|设计|开发|维护|优化|建设|落地|推动|支持|要求|熟悉|掌握|精通|了解|具备|有.*经验|加分/.test(l));

  const hints = HINTS.filter(h => h.k.some(k => lower.includes(k.toLowerCase())));
  const flags = REDFLAGS.filter(h => h.k.some(k => lower.includes(k.toLowerCase())));

  return {
    text, skills, duties: duties.slice(0, 14),
    years: parseYears(text), degree: parseDegree(text),
    hints, flags,
    eduOk: true
  };
}

function levelOf(name) {
  const s = profile.skills.find(x => x.n === name);
  if (!s) return 0;
  if (s.truth === 'no') return 0.2;
  if (s.truth === 'partial') return 0.6;
  return 1;
}

function projText(p) {
  return [p.name, p.role, p.background, (p.tech || []).join(' '), (p.actions || []).join(' '), p.result]
    .join(' ').toLowerCase();
}

function projAllText() {
  return (profile.projects || []).map(projText).join(' ');
}

/* 中文技能名常常拆开写：项目叫「性能与稳定性优化」，JD 写「性能优化」。
   整串对不上不代表没做过，两个半段都出现就算有证据。 */
function looseHit(text, name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (text.includes(n)) return true;
  if (/[\u4e00-\u9fa5]/.test(n) && n.length >= 4) {
    const mid = Math.floor(n.length / 2);
    return text.includes(n.slice(0, mid)) && text.includes(n.slice(mid));
  }
  return false;
}

/* 档案没登记 ≠ 没做过。项目正文里出现过，就至少能写"参与"，不该按 0 分惩罚。 */
function effectiveLevel(name) {
  const lv = levelOf(name);
  if (lv > 0) return lv;
  return projAllText().includes(String(name || '').toLowerCase()) ? 0.5 : 0;
}

function projScore(p, jdSkills) {
  if (!jdSkills.length) return 0.5;
  const t = projText(p);
  // 分母只算"档案能支撑的 JD 技能"：档案本身就没有的技能不该重复惩罚项目
  const supported = jdSkills.filter(s => levelOf(s.n) >= 0.5);
  if (!supported.length) return 0.2;
  let hit = 0, total = 0;
  supported.forEach(s => {
    total += s.weight;
    if (t.includes(s.n.toLowerCase())) hit += s.weight;
  });
  return total ? hit / total : 0;
}

function scoreAll() {
  const a = jd.analysis;
  if (!a) return null;
  const skills = a.skills;

  let tot = 0, got = 0;
  skills.forEach(s => { tot += s.weight; got += s.weight * effectiveLevel(s.n); });
  const skillScore = tot ? (got / tot) * 40 : 0;

  let best = 0;
  profile.projects.forEach(p => { best = Math.max(best, projScore(p, skills)); });
  const projScore40 = best * 40;

  const text = a.text;
  let bonus = 0;
  const myInds = profile.skills.filter(s => s.c === '行业与软技能').map(s => s.n);
  if (myInds.some(i => text.includes(i.replace('行业', '')))) bonus += 8;
  const fullHits = skills.filter(s => effectiveLevel(s.n) >= 0.9).length;
  if (fullHits >= 8) bonus += 6; else if (fullHits >= 4) bonus += 3;
  if (skills.length && effectiveLevel(skills[0].n) >= 0.9) bonus += 6;

  const total = Math.round(clamp(skillScore + projScore40 + bonus, 0, 100));
  const grade = total >= 75 ? 'A' : total >= 55 ? 'B' : 'C';

  // 缺口分三类：真没有 / 只是了解 / 项目里有但档案没登记（后者是登记问题，不是能力问题）
  const all = projAllText();
  const gaps = [], pending = [];
  skills.forEach(s => {
    if (s.c === '行业与软技能') return;          // 软技能不进技术缺口
    const lv = levelOf(s.n);
    if (lv === 0 && looseHit(all, s.n)) { pending.push(s.n); return; }
    if (lv <= 0.2) gaps.push({ n: s.n, kind: lv === 0.2 ? '仅了解，别写' : '完全没有', weight: s.weight });
  });

  return { total, grade, skillScore, projScore: projScore40, bonus, gaps, pending, best };
}

function renderJDResult() {
  const box = $('#jd-result');
  const a = jd.analysis;
  if (!a) { box.innerHTML = ''; return; }
  const sc = scoreAll();

  const chips = a.skills.slice(0, 18).map(s => {
    const lv = effectiveLevel(s.n);
    const cls = lv >= 0.9 ? 'hit' : lv >= 0.5 ? 'warn' : 'miss';
    return `<span class="chip ${cls}" title="${lv >= 0.9 ? '档案能支撑' : lv >= 0.5 ? '参与过／项目里出现过，只能写"参与"' : '档案没有'}">${esc(s.n)}${s.cnt > 1 ? ' ×' + s.cnt : ''}</span>`;
  }).join('');

  const yr = a.years;
  const yearOk = !yr || (profile.years >= yr.min);
  const degOk = !a.degree || DEG_RANK[profile.edu.degree] >= DEG_RANK[a.degree];

  const gapsHtml = sc.gaps.length
    ? `<div class="chips">${sc.gaps.map(g => `<span class="chip miss">${esc(g.n)} · ${g.kind}</span>`).join('')}</div>
       <div class="note warn" style="margin-top:8px">这些是 JD 要求但档案不支撑的。策略：<b>不写进简历</b>，面试被问到用"了解原理、没实操"句式；如果占比超过 40%，这个岗位可能不是最优目标。</div>`
    : `<div class="note ok">JD 要求的技术项都有对应经历，可以放心展开写。</div>`;

  const pendingHtml = sc.pending.length
    ? `<div class="note" style="margin-top:8px">下面几项在<b>项目描述里出现过</b>，但技能池没登记：<b>${sc.pending.map(esc).join('、')}</b>。如果是真做过，去「① 档案」补上真实度——不补的话简历不会主动写，分数也会被低估。</div>`
    : '';

  box.innerHTML = `
  <div class="card">
    <div class="result-head">
      <div class="score-ring" style="--p:${sc.total}"><span>${sc.total}<i>/100</i></span></div>
      <div style="flex:1;min-width:220px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span class="grade ${sc.grade}">${sc.grade} 档</span>
          <span style="font-size:13px;color:var(--text-2)">${sc.grade === 'A' ? '强匹配，值得重度定制' : sc.grade === 'B' ? '可投，中度定制即可' : '匹配偏弱，用通用版快速投'}</span>
        </div>
        <div class="kv" style="font-size:12.5px">
          <dt>技能覆盖</dt><dd>${sc.skillScore.toFixed(1)} / 40　<span style="color:var(--muted)">（JD 技能权重 × 你的真实度）</span></dd>
          <dt>项目相关</dt><dd>${sc.projScore.toFixed(1)} / 40　<span style="color:var(--muted)">（最相关项目的关键词重合）</span></dd>
          <dt>加分项</dt><dd>${sc.bonus} / 20</dd>
        </div>
      </div>
      <div style="min-width:200px">
        <div class="kv">
          <dt>年限要求</dt><dd>${yr ? (yr.min === yr.max ? yr.min + ' 年' : yr.min + '-' + yr.max + ' 年') : '未标注'}${yr && !yearOk ? ' <span style="color:var(--red)">（不足）</span>' : ''}</dd>
          <dt>学历要求</dt><dd>${a.degree || '未标注'}${!degOk ? ' <span style="color:var(--red)">（不满足）</span>' : ''}</dd>
          <dt>技能命中</dt><dd>${a.skills.filter(s => levelOf(s.n) >= 0.9).length} / ${a.skills.length}</dd>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2 style="margin-bottom:10px">关键词命中</h2>
    <div class="chips">${chips || '<span class="chip plain">未识别到技术关键词</span>'}</div>
    <div class="note" style="margin-top:10px">绿色=能写；黄色=只能写"参与/设计"；红色=不要写。气泡上的 ×N 是 JD 里出现的次数，次数越多越要放在简历靠前的位置。</div>
  </div>

  <div class="card">
    <h2 style="margin-bottom:10px">缺口与风险</h2>
    ${gapsHtml}
    ${pendingHtml}
    ${a.flags.length ? `<h3 style="font-size:12px;color:var(--muted);margin:14px 0 6px">红旗</h3>
      <div class="chips">${a.flags.map(f => `<span class="chip warn">${esc(f.v)}</span>`).join('')}</div>` : ''}
    ${a.hints.length ? `<h3 style="font-size:12px;color:var(--muted);margin:14px 0 6px">隐性偏好（从措辞读出来的）</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-2)">
        ${a.hints.map(h => `<li>「${esc(h.k[0])}」→ ${esc(h.v)}</li>`).join('')}
      </ul>` : ''}
  </div>

  <div class="card">
    <h2 style="margin-bottom:10px">职责条目</h2>
    ${a.duties.length ? `<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-2);line-height:1.9">
      ${a.duties.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '<div class="empty">没识别出条目，可能贴得太短</div>'}
  </div>

  <div class="card">
    <h2 style="margin-bottom:10px">建议打法</h2>
    ${strategyText(sc)}
  </div>`;
}

function strategyText(sc) {
  const a = jd.analysis;
  const ranked = profile.projects.map(p => ({ p, r: projScore(p, a.skills) })).sort((x, y) => y.r - x.r);
  const top = ranked.slice(0, 3).filter(x => x.r > 0);
  const lines = [];
  lines.push(`<div class="note">项目顺序建议：${top.map((x, i) => `<b>${i + 1}. ${esc(x.p.name)}</b>`).join('　')}</div>`);
  if (sc.gaps.length > a.skills.length * 0.4) {
    lines.push(`<div class="note warn">一半以上的技术项没有支撑，建议先用通用底稿海投，把精力放在匹配度 60 分以上的岗位。</div>`);
  }
  if (a.hints.length) {
    lines.push(`<div class="note">写摘要时把「${a.hints[0].k[0]}」对应的能力放到第一句。</div>`);
  }
  lines.push(`<div class="note">三查：① 每句话能否在自己的档案里找到出处 ② JD 前 10 个关键词命中几个 ③ 每个 bullet 被追问三层还答得上吗。</div>`);
  return lines.join('');
}

/* ============================================================
   ③ 简历生成
   ============================================================ */
const CN_DIM = { 技术: ['技术选型', '训练与实现', '评估', '工程与部署', '数据工程'], 项目: ['个人贡献', '业务理解'], 行为: ['行为与动机', '协作与反思'] };

function autoStyle() {
  const t = ((jd.analysis && jd.analysis.text) || jd.text || '').toLowerCase();
  const score = (arr) => arr.reduce((n, k) => n + countOccur(t, k), 0);
  const s = {
    ai: score(['大模型', 'llm', '微调', 'rag', 'agent', '算法', 'nlp', '模型', 'agentic']),
    backend: score(['后端', '服务端', '接口', '高并发', '微服务', 'java', 'python', 'go']),
    data: score(['数据', 'etl', '数仓', 'pandas', 'spark', '清洗', '数仓建设'])
  };
  const best = Object.keys(s).sort((x, y) => s[y] - s[x])[0];
  return s[best] > 0 ? best : 'generic';
}

function topJdSkills(n) {
  return (jd.analysis ? jd.analysis.skills : []).slice(0, n || 6).map(s => s.n);
}

function pickSkills() {
  const jdSkills = jd.analysis ? jd.analysis.skills : [];
  const inJd = n => jdSkills.some(s => s.n === n);
  let list = profile.skills.filter(s => {
    if (s.truth === 'no') return false;
    if (inJd(s.n)) return true;
    return s.truth === 'yes' && s.level >= 4;
  });
  list = list.sort((a, b) => (inJd(b.n) - inJd(a.n)) || (b.level - a.level)).slice(0, 18);
  return list;
}

function pickProjects(n) {
  const jdSkills = jd.analysis ? jd.analysis.skills : [];
  let list = profile.projects.map(p => ({ p, r: projScore(p, jdSkills) }));
  list.sort((a, b) => b.r - a.r);
  return list.slice(0, n).map(x => x.p);
}

function pickActions(p, max) {
  const jdSkills = jd.analysis ? jd.analysis.skills : [];
  const arr = (p.actions || []).map((t, i) => {
    const low = t.toLowerCase();
    let s = 0;
    jdSkills.forEach(k => { if (low.includes(k.n.toLowerCase())) s += k.weight; });
    return { t, s, i };
  });
  arr.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return arr.slice(0, max || 5).map(x => x.t);
}

function buildSummary(style, projs, skills) {
  const tpl = SUMMARY_TPL[style] || SUMMARY_TPL.generic;
  const yrs = profile.years ? profile.years : '';
  const jdOrder = (jd.analysis ? jd.analysis.skills : []).map(s => s.n);
  // 只取真正做过的技能，且避开前一句已经说过的词（不写"Python 后端……技术栈覆盖 Python"）
  const cand = skills
    .filter(s => s.truth !== 'partial' && s.c !== '行业与软技能' && !tpl.pre.includes(s.n))
    .sort((a, b) => {
      const ia = jdOrder.indexOf(a.n), ib = jdOrder.indexOf(b.n);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .slice(0, 4).map(s => s.n);
  const p = projs[0];
  const act = p ? (pickActions(p, 1)[0] || '') : '';
  const s1 = `${yrs}${tpl.pre}${cand.length ? '，熟悉' + cand.join('、') : ''}。`;
  const s2 = p && act ? `在「${p.name}」中，${act.replace(/[。；;]$/, '')}。` : '';
  return s1 + s2 + tpl.post.replace(/^。/, '');
}

const CAT_ORDER = ['语言与后端', 'AI 与 LLM', '数据处理', '工程与部署', '数据库', '前端', '行业与软技能'];
function sortCats(keys) {
  return keys.sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function isNum(s) { return /\d/.test(s); }

function buildResumeHtml(opt) {
  const style = opt.style === 'auto' ? autoStyle() : opt.style;
  const projs = pickProjects(opt.projCount);
  const skills = pickSkills();

  // 技能分两层：真做过的正常列；只参与/设计过的单独一行标明，既保留关键词又不撒谎
  const primary = skills.filter(s => s.truth !== 'partial');
  const secondary = skills.filter(s => s.truth === 'partial');
  const base = primary.length ? primary : secondary;
  const extra = primary.length ? secondary : [];
  const groups = {};
  base.forEach(s => { (groups[s.c] = groups[s.c] || []).push(s.n); });

  const intent = (jd.analysis && jd.title) ? jd.title : profile.target;
  const contact = [profile.phone, profile.email, profile.city, intent ? '求职意向：' + intent : '']
    .filter(Boolean).map(esc).join(' · ');

  const q = [];
  q.push(`<div class="r-name">${esc(profile.name || '（填写姓名）')}</div>`);
  q.push(`<div class="r-contact">${contact || '（填写联系方式）'}</div>`);

  q.push(`<div class="r-sec"><h3>个人简介</h3><p class="r-summary">${esc(buildSummary(style, projs, skills))}</p></div>`);

  q.push(`<div class="r-sec"><h3>技能清单</h3>${sortCats(Object.keys(groups)).map(c =>
    `<div class="r-skill-row"><b>${esc(c)}</b>${esc(groups[c].join('、'))}</div>`).join('')}
    ${extra.length ? `<div class="r-skill-row"><b>参与 / 设计过</b>${esc(extra.slice(0, 7).map(s => s.n).join('、'))}</div>` : ''}</div>`);

  if (profile.works.length) {
    q.push(`<div class="r-sec"><h3>工作经历</h3>${profile.works.map(w => `
      <div class="r-item">
        <div class="r-item-head"><b>${esc(w.company)}</b>${w.time ? `<span class="time">${esc(w.time)}</span>` : ''}</div>
        <div class="r-item-sub">${[w.title, w.desc].filter(Boolean).map(esc).join(' · ')}</div>
      </div>`).join('')}</div>`);
  }

  q.push(`<div class="r-sec"><h3>项目经历</h3>${projs.map(p => {
    const acts = pickActions(p, 5);
    return `<div class="r-item">
      <div class="r-item-head"><b>${esc(p.name)}</b>${p.time ? `<span class="time">${esc(p.time)}</span>` : ''}</div>
      ${p.role ? `<div class="r-item-sub">${esc(p.role)}</div>` : ''}
      <ul>${acts.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      ${p.result ? `<div class="r-item-sub" style="margin-top:3px"><b>结果：</b>${esc(p.result)}</div>` : ''}
    </div>`;
  }).join('')}</div>`);

  if (profile.edu.school) {
    q.push(`<div class="r-sec"><h3>教育经历</h3>
      <div class="r-item"><div class="r-item-head"><b>${esc(profile.edu.school)}</b>${profile.edu.year ? `<span class="time">${esc(profile.edu.year)}</span>` : ''}</div>
      <div class="r-item-sub">${esc(profile.edu.major)} · ${esc(profile.edu.degree)}</div></div></div>`);
  }

  if ((profile.extras || []).length) {
    q.push(`<div class="r-sec"><h3>其他</h3><div class="r-skill-row">${profile.extras.map(esc).join('<br>')}</div></div>`);
  }

  return q.join('');
}

function resumePlainText() {
  return ($('#resume-preview').innerText || '').toLowerCase();
}

function qualityReport() {
  const text = resumePlainText();
  const a = jd.analysis;
  const el = $('#resume-quality');

  // 硬门槛：这些缺了，简历投出去等于白投，先拦住
  const p0 = [];
  if (!String(profile.name || '').trim()) p0.push('姓名');
  if (!String(profile.phone || '').trim() && !String(profile.email || '').trim()) p0.push('电话或邮箱');
  const noTime = profile.projects.filter(p => !hasRange(p.time)).length;
  if (noTime) p0.push(`${noTime} 个项目没写全时间`);
  if (!profile.works.some(w => hasRange(w.time))) p0.push('工作经历时间');
  const p0Html = p0.length
    ? `<div class="note bad"><b>先别投：</b>缺 ${p0.join('、')}。HR 第一眼就卡在这里，后面写得再好也没用。</div>`
    : '';

  // 推定时间：看着像真的，其实是我们按年限排的，必须提醒
  const guessN = profile.projects.filter(p => p.timeGuess).length +
    profile.works.filter(w => w.timeGuess).length;
  const guessHtml = guessN
    ? `<div class="note warn">有 <b>${guessN}</b> 处时间是「推定」的（按工作年限自动铺的时间线），投之前务必核对。确认无误就在 ① 档案里点时间旁的 ✓。</div>`
    : '';

  if (!a) {
    el.innerHTML = p0Html + guessHtml + `<div class="note">还没有分析 JD。先在「② JD 分析」贴一份 JD，简历就能按岗位自动排序；不贴也可以用通用版。</div>`;
    return;
  }
  const top = a.skills.slice(0, 12);
  const supported = top.filter(s => effectiveLevel(s.n) >= 0.5);   // 你确实能写的
  const absent = top.filter(s => effectiveLevel(s.n) < 0.5);       // JD 要但你没有的
  const hit = supported.filter(s => text.includes(s.n.toLowerCase()));
  const pct = supported.length ? Math.round(hit.length / supported.length * 100) : 100;

  const risk = profile.skills.filter(s => s.truth === 'no' && text.includes(s.n.toLowerCase())).map(s => s.n);
  const ph = (text.match(/待补/g) || []).length;
  const nums = (($('#resume-preview').innerText || '').match(/\d+(\.\d+)?%|\d+\s*(万|条|次|人|天|小时|ms|s\b)/g) || []).length;

  el.innerHTML = p0Html + guessHtml + `
    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;flex-wrap:wrap">
      <b>能写的关键词已覆盖</b><span style="color:var(--muted)">${hit.length}/${supported.length}（${pct}%）</span>
      <span style="flex:1"></span>
      <span style="color:var(--muted)">${absent.length ? 'JD 另有 ' + absent.length + ' 项你没有：' + absent.map(s => s.n).join('、') : 'JD 的技能要求你全部覆盖'}</span>
    </div>
    <div class="qbar"><i style="width:${pct}%;background:${pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : 'var(--amber)'}"></i></div>
    ${pct < 80 ? '<div class="note warn">有能写但没写进去的技能。检查是不是最相关的项目没排上来，或者用了 JD 不认识的表述。</div>' : ''}
    ${risk.length ? `<div class="note bad">简历里出现了你标为「只是了解」的技能：<b>${risk.join('、')}</b>。面试官会专挑这些问，建议删掉。</div>` : ''}
    ${ph ? `<div class="note warn">还有 ${ph} 处「待补」没填，别投出去。</div>` : ''}
    ${nums === 0 ? `<div class="note warn">一个量化结果都没有。哪怕只有一个真实数字（数据量、耗时、覆盖率），说服力也会明显不同。</div>` : `<div class="note ok">检测到 ${nums} 处量化表述，很好。</div>`}`;
}

function renderResume() {
  const styleSel = $('#resume-style').value;
  const cnt = Number($('#resume-projcount').value);
  $('#resume-preview').innerHTML = buildResumeHtml({ style: styleSel, projCount: cnt });
  qualityReport();
  dirty = false;   // 标记：当前预览与档案一致。切走再回来不会覆盖你手改的内容
  const s = styleSel === 'auto' ? autoStyle() : styleSel;
  $('#resume-tag').textContent = '当前风格：' + (SUMMARY_TPL[s] ? SUMMARY_TPL[s].label : s) +
    (jd.title ? ' · ' + jd.title : '');
}

function mdFromResume() {
  const style = $('#resume-style').value === 'auto' ? autoStyle() : $('#resume-style').value;
  const projs = pickProjects(Number($('#resume-projcount').value));
  const skills = pickSkills();
  const primary = skills.filter(s => s.truth !== 'partial');
  const secondary = skills.filter(s => s.truth === 'partial');
  const base = primary.length ? primary : secondary;
  const extra = primary.length ? secondary : [];
  const groups = {};
  base.forEach(s => { (groups[s.c] = groups[s.c] || []).push(s.n); });

  const intent = (jd.analysis && jd.title) ? jd.title : profile.target;
  let md = `# ${profile.name || '姓名'}\n\n`;
  md += [profile.phone, profile.email, profile.city, intent].filter(Boolean).join(' ｜ ') + '\n\n';
  md += `## 个人简介\n\n${buildSummary(style, projs, skills)}\n\n`;
  md += `## 技能清单\n\n` + sortCats(Object.keys(groups)).map(c => `- **${c}**：${groups[c].join('、')}`).join('\n');
  if (extra.length) md += `\n- **参与 / 设计过**：${extra.slice(0, 7).map(s => s.n).join('、')}`;
  md += '\n\n';

  if (profile.works.length) {
    md += `## 工作经历\n\n`;
    profile.works.forEach(w => {
      md += `**${w.company}**${w.time ? '　' + w.time : ''}\n`;
      const sub = [w.title, w.desc].filter(Boolean).join(' · ');
      md += (sub ? sub + '\n\n' : '\n');
    });
  }

  md += `## 项目经历\n\n`;
  projs.forEach(p => {
    md += `### ${p.name}${p.time ? '　' + p.time : ''}\n\n`;
    if (p.role) md += `*${p.role}*\n\n`;
    pickActions(p, 5).forEach(a => { md += `- ${a}\n`; });
    if (p.result) md += `\n**结果**：${p.result}\n`;
    md += '\n';
  });
  if (profile.edu.school) md += `## 教育经历\n\n${profile.edu.school}　${profile.edu.year}\n${profile.edu.major} · ${profile.edu.degree}\n\n`;
  if ((profile.extras || []).length) md += `## 其他\n\n` + profile.extras.map(e => `- ${e}`).join('\n') + '\n';
  return md;
}

/* ============================================================
   ④ 模拟面试
   ============================================================ */
function buildQuestions(count, focus) {
  const a = jd.analysis;
  const out = [];
  const push = (q) => { if (!out.some(x => x.q === q.q)) out.push(q); };

  const projs = pickProjects(2);
  projs.forEach((p, idx) => {
    push({
      dim: '个人贡献',
      q: `介绍一下「${p.name}」，以及你在里面具体负责什么。`,
      s: '背景一句话 → 目标与难点 → 我的角色边界 → 2-3 个关键动作 → 结果（真实数字；没有就讲清你怎么验证的）。',
      f: [`这个项目如果不做会怎样？`, `你说的"负责"，具体到什么粒度？`, `团队里其他人负责什么？`],
      trap: '把团队成果说成个人成果——主动划边界反而更可信',
      src: '你的项目'
    });
    if (idx === 0) {
      push({
        dim: '个人贡献',
        q: `「${p.name}」里最难的一个技术问题是什么？你是怎么解决的？`,
        s: '先说"难在哪"（难在判断和权衡，不是难在代码量）→ 试过哪些方案 → 排除了什么 → 最后怎么定 → 怎么验证有效。',
        f: ['试过但没用的方案是什么？', '现在回头看还有更好的解法吗？'],
        trap: '说"就是工作量大"',
        src: '你的项目'
      });
      push({
        dim: '协作与反思',
        q: `如果让你重做一次「${p.name}」，你会改哪些地方？`,
        s: '给 2-3 条结构性改进：数据/版本管理、独立测试集、对照实验、监控闭环。不要说"我会更仔细"。',
        f: ['为什么当时没做？', '现在补了吗？'],
        trap: '说没什么可改的——这题考的是复盘框架',
        src: '你的项目'
      });
    }
  });

  const tags = new Set();
  const tagScore = {};
  (a ? a.skills : []).slice(0, 12).forEach(s => {
    const meta = SKILL_MAP[s.n];
    if (meta) meta.t.forEach(t => { tags.add(t); tagScore[t] = (tagScore[t] || 0) + s.weight; });
  });
  if (profile.skills.some(s => s.truth === 'yes')) tags.add('backend');
  tags.add('*');

  // JD 缺口的压力题：面试官一定会问，提前练比现场编强
  if (a) {
    const allProj = projAllText();
    const weak = a.skills
      .filter(s => s.c !== '行业与软技能')
      .map(s => ({ s, lv: effectiveLevel(s.n) }))
      // 项目里有证据、只是档案没登记的，不当作缺口来问
      .filter(x => x.lv < 0.6 && !(levelOf(x.s.n) === 0 && looseHit(allProj, x.s.n)))
      .slice(0, count >= 12 ? 3 : 2);
    weak.forEach(({ s, lv }) => {
      const state = lv <= 0 ? '几乎是空白' : lv <= 0.2 ? '只是了解、没实操' : '只有参与/设计';
      push({
        dim: '个人贡献',
        q: `JD 明确要求「${s.n}」，你档案里这块${state}。面试官追问细节时你怎么答？`,
        s: lv <= 0.2
          ? '不硬编。三步：① 直接说"这块我没有实际操作过，只是了解原理" ② 讲清你知道的难点和业界做法 ③ 说明如果交给你，第一步会做什么、怎么验证。承认边界不扣分，编造才致命。'
          : '三步：① 我实际做到哪一步（只讲做过的动作） ② 没做的部分难点在哪、业界怎么解 ③ 如果给我做，我会先验证什么。',
        f: [`${s.n} 你用过哪些具体的工具或版本？`, '这块如果要你独立做，第一步做什么？', '你在这个环节的输出交给了谁，怎么验收？'],
        trap: '含糊说"了解一点"，或者顺着面试官的话往上编——追问两层就穿',
        src: 'JD 缺口'
      });
    });
  }

  let pool = BANK.filter(b => b.tags.includes('*') || b.tags.some(t => tags.has(t)));
  if (projs.length) pool = pool.filter(b => b.id !== 'p1');   // 和项目题重复

  if (focus === '技术') pool = pool.filter(b => CN_DIM['技术'].includes(b.dim));
  else if (focus === '项目') pool = pool.filter(b => CN_DIM['项目'].includes(b.dim) || b.dim === '协作与反思');
  else if (focus === '行为') pool = pool.filter(b => CN_DIM['行为'].includes(b.dim));

  // 按 JD 相关度排序，而不是按题库数组顺序——否则 JD 最看重的技能题永远轮不到
  const rel = b => b.tags.includes('*') ? 1 : b.tags.reduce((n, t) => n + (tagScore[t] || 0), 0);
  const byDim = {};
  pool.forEach(b => { (byDim[b.dim] = byDim[b.dim] || []).push(b); });
  Object.keys(byDim).forEach(d => byDim[d].sort((x, y) => rel(y) - rel(x)));
  const dims = Object.keys(byDim).sort((x, y) => rel(byDim[y][0]) - rel(byDim[x][0]));
  let round = 0;
  while (out.length < count && round < 30) {
    let added = false;
    dims.forEach(d => {
      if (out.length >= count) return;
      const arr = byDim[d];
      if (round < arr.length) { push(arr[round]); added = true; }
    });
    if (!added) break;
    round++;
  }

  if (count >= 8) {
    const intro = BANK.find(b => b.id === 'h1');
    if (intro && !out.some(x => x.id === 'h1')) { out.unshift({ ...intro, src: '通用题库' }); }
  }
  return out.slice(0, count).map((q, i) => ({ ...q, id: q.id || 'gen' + i }));
}

function startInterview() {
  const count = Number($('#iv-count').value);
  const focus = $('#iv-focus').value;
  const t = Number($('#iv-time').value);
  iv.qs = buildQuestions(count, focus);
  iv.i = 0; iv.ratings = {}; iv.left = t;
  iv.meta = { date: new Date().toISOString().slice(0, 10), company: jd.company || '未填写', title: jd.title || '未填写', count: iv.qs.length };
  renderIv();
  startTimer();
}

function startTimer() {
  clearInterval(iv.timer);
  const t = Number($('#iv-time').value);
  if (!t) { iv.left = 0; iv.timer = null; renderTimer(); return; }
  iv.left = t;
  renderTimer();
  iv.timer = setInterval(() => {
    iv.left--;
    if (iv.left <= 0) { clearInterval(iv.timer); iv.timer = null; iv.left = 0; renderTimer(); }
    else renderTimer();
  }, 1000);
}

function renderTimer() {
  const el = $('#iv-timer');
  if (!el) return;
  const t = Number($('#iv-time').value);
  if (!t) { el.textContent = '不限时'; el.classList.remove('over'); return; }
  const m = Math.floor(iv.left / 60), s = iv.left % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('over', iv.left === 0 && t > 0);
}

function renderIv() {
  const box = $('#iv-session');
  if (!iv.qs.length) { box.innerHTML = ''; return; }
  const q = iv.qs[iv.i];
  const rated = iv.ratings[iv.i] || 0;
  const pct = Math.round((iv.i + 1) / iv.qs.length * 100);

  box.innerHTML = `
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="qcard">
      <div class="qmeta">
        <span class="dim">${esc(q.dim)}</span>
        <span class="src">${esc(q.src || '')}</span>
        <span style="flex:1"></span>
        <span style="font-size:12px;color:var(--muted)">第 ${iv.i + 1} / ${iv.qs.length} 题</span>
        <span class="timer" id="iv-timer"></span>
      </div>
      <div class="qtext">${esc(q.q)}</div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn" id="btnReveal">看答题骨架</button>
        <span style="font-size:12px;color:var(--muted)">自评</span>
        <div class="stars" id="iv-stars">
          ${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" class="${n <= rated ? 'on' : ''}">★</button>`).join('')}
        </div>
      </div>

      <div id="iv-answer"></div>

      <div class="qnav">
        <button class="btn" id="btnPrev" ${iv.i === 0 ? 'disabled' : ''}>上一题</button>
        <span style="font-size:12px;color:var(--muted)">先自己说一遍再点开，效果差 10 倍</span>
        <button class="btn primary" id="btnNext">${iv.i === iv.qs.length - 1 ? '结束并看报告' : '下一题'}</button>
      </div>
    </div>`;

  renderTimer();
  $('#btnReveal').onclick = () => {
    $('#iv-answer').innerHTML = `
      <div class="reveal">
        <h4>答题骨架</h4><p>${esc(q.s)}</p>
        ${q.f && q.f.length ? `<h4>大概率追问</h4><ul>${q.f.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <h4>雷区</h4><p style="color:var(--red)">${esc(q.trap)}</p>
      </div>`;
  };
  $('#iv-stars').onclick = e => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    iv.ratings[iv.i] = Number(b.dataset.star);
    $$('#iv-stars button').forEach((x, k) => x.classList.toggle('on', k < iv.ratings[iv.i]));
  };
  $('#btnPrev').onclick = () => { iv.i--; renderIv(); startTimer(); };
  $('#btnNext').onclick = () => {
    if (iv.i === iv.qs.length - 1) finishIv();
    else { iv.i++; renderIv(); startTimer(); }
  };
}

function finishIv() {
  clearInterval(iv.timer);
  const dims = {};
  iv.qs.forEach((q, i) => {
    (dims[q.dim] = dims[q.dim] || []).push(iv.ratings[i] || 0);
  });
  const dimAvg = {};
  Object.keys(dims).forEach(d => {
    const arr = dims[d].filter(x => x > 0);
    dimAvg[d] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  });
  const scored = Object.keys(dimAvg).filter(d => dimAvg[d] > 0);
  const overall = scored.length ? scored.reduce((a, d) => a + dimAvg[d], 0) / scored.length : 0;
  const weak = scored.filter(d => dimAvg[d] < 3).sort((a, b) => dimAvg[a] - dimAvg[b]);

  const rec = { ...iv.meta, dimAvg, overall: +overall.toFixed(2), weak, ratings: iv.ratings, qs: iv.qs.map(q => ({ q: q.q, dim: q.dim })) };
  sessions.unshift(rec);
  save(KEY.sessions, sessions);

  $('#iv-session').innerHTML = `
    <div class="qcard">
      <h2 style="font-size:16px;margin-bottom:4px">本轮完成</h2>
      <p style="color:var(--muted);font-size:12.5px;margin-bottom:16px">${esc(rec.company)} · ${esc(rec.title)} · ${rec.count} 题 · 自评均分 ${overall ? overall.toFixed(1) : '—'} / 5</p>
      ${renderDimBars(dimAvg)}
      ${weak.length ? `<div class="note warn" style="margin-top:16px"><b>薄弱维度：</b>${weak.join('、')}。<br>去「④ 模拟面试」按这个维度再刷一轮，或者回到「① 档案」把对应的素材补厚。</div>` : `<div class="note ok" style="margin-top:16px">各维度自评都在 3 分以上。下一步：把每题说到 90 秒内、不带「嗯」「那个」，再练一遍。</div>`}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn" onclick="document.querySelector('[data-tab=review]').click()">查看全部复盘</button>
        <button class="btn primary" onclick="document.querySelector('[data-tab=interview]').click()">再来一轮</button>
      </div>
    </div>`;
  toast('已记录本轮面试');
}

/* ============================================================
   ⑤ 复盘
   ============================================================ */
function renderDimBars(dimAvg) {
  const all = ['业务理解', '技术选型', '数据工程', '训练与实现', '评估', '工程与部署', '个人贡献', '协作与反思', '行为与动机'];
  const list = all.filter(d => dimAvg[d] !== undefined);
  return list.map(d => {
    const v = dimAvg[d] || 0;
    const pct = v / 5 * 100;
    const color = v >= 4 ? 'var(--green)' : v >= 3 ? 'var(--accent)' : v > 0 ? 'var(--amber)' : '#d1d5db';
    return `<div class="dim-bar"><span>${d}</span>
      <span class="track"><i style="width:${pct}%;background:${color}"></i></span>
      <span class="v">${v ? v.toFixed(1) : '—'}</span></div>`;
  }).join('');
}

function renderReview() {
  const box = $('#review-body');
  if (!sessions.length) {
    box.innerHTML = `<div class="card"><div class="empty">还没有练习记录。去「④ 模拟面试」跑一轮，这里会有你的维度雷达和弱项追踪。</div></div>`;
    return;
  }
  const agg = {};
  sessions.forEach(s => Object.keys(s.dimAvg).forEach(d => {
    if (!s.dimAvg[d]) return;
    (agg[d] = agg[d] || []).push(s.dimAvg[d]);
  }));
  const dimAvg = {};
  Object.keys(agg).forEach(d => dimAvg[d] = agg[d].reduce((a, b) => a + b, 0) / agg[d].length);

  const overalls = sessions.filter(s => s.overall).map(s => s.overall);
  const avg = overalls.length ? overalls.reduce((a, b) => a + b, 0) / overalls.length : 0;
  const weak = Object.keys(dimAvg).filter(d => dimAvg[d] < 3).sort((a, b) => dimAvg[a] - dimAvg[b]);

  box.innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="n">${sessions.length}</div><div class="l">练习轮数</div></div>
      <div class="stat"><div class="n">${sessions.reduce((a, s) => a + s.count, 0)}</div><div class="l">累计答题</div></div>
      <div class="stat"><div class="n">${avg ? avg.toFixed(1) : '—'}</div><div class="l">平均自评</div></div>
      <div class="stat"><div class="n">${weak.length}</div><div class="l">薄弱维度</div></div>
    </div>

    <div class="card">
      <h2 style="margin-bottom:14px">维度表现（累计）</h2>
      ${renderDimBars(dimAvg)}
      ${weak.length ? `<div class="note warn" style="margin-top:14px"><b>优先补：</b>${weak.join('、')}<br>
        补法不是背答案——是回到档案，把这一维度下你真实做过的事写成一条能讲 90 秒的素材。</div>` : ''}
    </div>

    <div class="card">
      <h2 style="margin-bottom:12px">练习记录</h2>
      <table class="list">
        <thead><tr><th>日期</th><th>公司</th><th>岗位</th><th>题量</th><th>自评</th><th>薄弱</th><th></th></tr></thead>
        <tbody>
        ${sessions.map((s, i) => `<tr>
          <td>${esc(s.date)}</td><td>${esc(s.company)}</td><td>${esc(s.title)}</td>
          <td>${s.count}</td><td>${s.overall ? s.overall.toFixed(1) : '—'}</td>
          <td style="font-size:12px;color:var(--muted)">${(s.weak || []).join('、') || '—'}</td>
          <td><button class="btn small" data-delses="${i}">删除</button></td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  box.querySelectorAll('[data-delses]').forEach(b => b.addEventListener('click', () => {
    sessions.splice(+b.dataset.delses, 1);
    save(KEY.sessions, sessions); renderReview();
  }));
}

/* ============================================================
   交互绑定
   ============================================================ */
function switchTab(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'resume') { if (dirty || !$('#resume-preview').innerHTML.trim()) renderResume(); }
  if (name === 'jd') renderJDResult();
  if (name === 'review') renderReview();
  if (name === 'interview') renderIvLinks();
}

function renderIvLinks() {
  const kw = encodeURIComponent(`${jd.company || ''} ${jd.title || ''} 面经 面试题`.trim());
  const kw2 = encodeURIComponent(`${jd.title || ''} 面试题 高频`);
  $('#iv-links').innerHTML = `
    <div class="chips">
      <a class="chip plain" href="https://www.bing.com/search?q=${kw}" target="_blank" rel="noopener">🔍 搜「${esc(jd.company || '公司')} 面经」</a>
      <a class="chip plain" href="https://www.bing.com/search?q=${kw2}" target="_blank" rel="noopener">🔍 搜「${esc(jd.title || '岗位')} 高频题」</a>
      <span class="chip plain" style="background:transparent;color:var(--muted)">外部搜索不受本工具控制，答案请自行甄别</span>
    </div>`;
}

const DEMO_JD = `岗位职责：
1. 负责大模型应用的设计与开发，包括 Prompt 工程、RAG 检索增强链路搭建与效果调优；
2. 负责领域模型的监督微调（SFT / LoRA），并建立模型评测体系，跟踪 Precision、Recall、F1 等指标；
3. 负责 Agent 多步工作流的编排与工程落地，与业务 API 解耦，保证线上稳定；
4. 参与后端服务开发，熟悉 Python、RESTful 接口设计，有高并发场景经验者优先。

任职要求：
1. 本科及以上学历，3 年以上后端或算法工程经验；
2. 熟悉 PyTorch / Transformers，了解 vLLM 等推理框架；
3. 有医疗、金融行业数据合规经验加分；
4. 熟悉 Docker、Kubernetes 者优先；
5. 具备良好的跨部门协作能力，能推动方案落地。`;

/* JD 抓取：公共文本代理，失败就提示手动粘贴 */async function fetchUrl() {
  const url = $('#jd-url').value.trim();
  if (!url) { toast('先填链接'); return; }
  const btn = $('#btnFetch');
  btn.disabled = true; btn.textContent = '抓取中…';
  const candidates = [
    'https://r.jina.ai/' + url,
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
  ];
  let ok = false;
  for (const c of candidates) {
    try {
      const r = await fetch(c);
      if (!r.ok) continue;
      let t = await r.text();
      t = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (t.length > 120) { $('#jd-text').value = t.slice(0, 12000); jd.text = $('#jd-text').value; saveJd(); ok = true; break; }
    } catch (e) { /* 换下一个 */ }
  }
  btn.disabled = false; btn.textContent = '从链接抓取';
  if (ok) { toast('抓取成功，建议检查一下正文是否完整'); analyzeNow(); }
  else toast('抓不到（多数招聘站有登录墙），请直接复制正文粘贴');
}

function analyzeNow() {
  const text = $('#jd-text').value.trim();
  if (text.length < 30) { toast('JD 太短了，贴完整一点'); return; }
  jd.text = text;
  jd.company = $('#jd-company').value;
  jd.title = $('#jd-title').value;
  jd.channel = $('#jd-channel').value;
  jd.analysis = analyzeJD(text);
  saveJd();
  renderJDResult();
  dirty = true;
  toast(`分析完成：识别 ${jd.analysis.skills.length} 个技术关键词`);
}

function exportAll() {
  const data = { profile, jd, sessions, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `求职工坊-备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出备份');
}

/* 老版本存档升级：用示例时间线填空缺的时间（一律标「推定」） */
function migrateProfile() {
  let changed = false;
  const flag = 'jobkit.migrated.v2';
  let first = false;
  try { first = !localStorage.getItem(flag); localStorage.setItem(flag, '1'); } catch (e) {}
  if (first) {
    let filled = 0;
    (profile.projects || []).forEach(p => {
      if (String(p.time || '').trim()) return;
      const d = DEFAULT_PROFILE.projects.find(x => x.name === p.name);
      if (d && d.time) { p.time = d.time; p.timeGuess = true; filled++; }
    });
    (profile.works || []).forEach(w => {
      if (String(w.time || '').trim()) return;
      const d = DEFAULT_PROFILE.works.find(x => x.company === w.company);
      if (d && d.time) { w.time = d.time; w.timeGuess = true; filled++; }
    });
    if (filled) {
      changed = true;
      setTimeout(() => toast(`已按 3 年经验补了 ${filled} 段时间，标为「推定」，请核对`), 500);
    }
  }
  if (changed) save(KEY.profile, profile);
}

/* 把老存档和 AI 写进来的时间收成标准写法，下拉框才显示得出来 */
function normalizeTimes() {
  let n = 0;
  const fix = v => {
    const out = standardizeTime(v);
    if (out !== v) n++;
    return out;
  };
  (profile.projects || []).forEach(p => { p.time = fix(p.time); });
  (profile.works || []).forEach(w => { w.time = fix(w.time); });
  if (profile.edu) profile.edu.year = fix(profile.edu.year);
  if (n) {
    save(KEY.profile, profile);
    setTimeout(() => toast(`已把 ${n} 处时间统一成「年.月」格式`), 700);
  }
}

function init() {
  migrateProfile();
  normalizeTimes();
  mountStartPicker(guessStart());
  renderProfile();

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  $('#btnAddSkill').onclick = () => {
    profile.skills.unshift({ n: '', c: '语言与后端', level: 3, truth: 'yes' });
    saveProfile(); renderSkills();
  };
  $('#btnAddProj').onclick = () => {
    profile.projects.push({ name: '', role: '', time: '', background: '', tech: [], actions: [''], result: '' });
    saveProfile(); renderProjects();
  };
  $('#btnAddWork').onclick = () => {
    profile.works.push({ company: '', title: '', time: '', desc: '' });
    saveProfile(); renderWorks();
  };

  $('#btnExport').onclick = exportAll;
  $('#btnSave').onclick = () => flushAll(false);
  $('#btnPlanTime').onclick = () => { renderTimeline(); toast('已重新计算时间线'); };
  $('#tl-start').addEventListener('change', onStartChange);
  $('#btnApplyAllTime').onclick = () => {
    const plan = planTimeline();
    const todo = plan.rows.filter(r => r.src === '建议');
    if (!todo.length) { toast('没有需要补的时间'); return; }
    if (!confirm(`将给 ${todo.length} 段经历填入建议时间，并标记为「推定」。继续？`)) return;
    todo.forEach(applyTimelineRow);
    saveProfile(); renderProjects(); renderWorks(); renderTimeline(); renderCompleteness();
    toast(`已填入 ${todo.length} 段时间，记得核对`);
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushAll(false); }
  });
  window.addEventListener('pagehide', () => flushAll(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(true); });
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.profile) { profile = d.profile; normalizeTimes(); saveProfile(); }
        if (d.jd) { jd = d.jd; saveJd(); }
        if (d.sessions) { sessions = d.sessions; save(KEY.sessions, sessions); }
        renderProfile(); syncJdInputs(); renderJDResult(); renderResume();
        toast('导入成功');
      } catch (err) { toast('文件格式不对'); }
    };
    r.readAsText(f);
  };
  $('#btnReset').onclick = () => {
    if (!confirm('清空所有档案和练习记录？建议先导出备份。')) return;
    localStorage.removeItem(KEY.profile);
    localStorage.removeItem(KEY.jd);
    localStorage.removeItem(KEY.sessions);
    profile = clone(DEFAULT_PROFILE);
    jd = { company: '', title: '', channel: '', text: '', url: '', analysis: null };
    sessions = [];
    setStartPicker(guessStart());
    renderProfile(); syncJdInputs(); renderJDResult(); renderReview();
    toast('已重置为示例档案');
  };

  // JD
  $('#btnAnalyze').onclick = analyzeNow;
  $('#btnFetch').onclick = fetchUrl;
  $('#btnDemoJd').onclick = () => {
    $('#jd-company').value = '示例科技';
    $('#jd-title').value = 'AI 应用工程师';
    $('#jd-text').value = DEMO_JD;
    analyzeNow();
  };
  $('#btnClearJd').onclick = () => {
    $('#jd-text').value = ''; $('#jd-url').value = '';
    jd.analysis = null; jd.text = ''; saveJd(); renderJDResult();
  };
  ['jd-company', 'jd-title', 'jd-channel'].forEach(id => {
    $('#' + id).addEventListener('input', () => {
      jd[id.replace('jd-', '')] = $('#' + id).value; saveJd();
    });
  });
  $('#jd-text').addEventListener('input', () => { jd.text = $('#jd-text').value; saveJd(); });

  // 简历
  $('#btnGenResume').onclick = renderResume;
  $('#resume-style').onchange = renderResume;
  $('#resume-projcount').onchange = renderResume;
  $('#btnPrint').onclick = () => window.print();
  $('#btnCopyMd').onclick = async () => {
    const md = mdFromResume();
    try {
      await navigator.clipboard.writeText(md);
      toast('Markdown 已复制');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = md; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      toast('Markdown 已复制');
    }
  };

  // 面试
  $('#btnStartIv').onclick = startInterview;

  syncJdInputs();
  renderJDResult();
  renderIvLinks();
}

function syncJdInputs() {
  $('#jd-company').value = jd.company || '';
  $('#jd-title').value = jd.title || '';
  $('#jd-channel').value = jd.channel || '';
  $('#jd-text').value = jd.text || '';
  $('#jd-url').value = jd.url || '';
}

document.addEventListener('DOMContentLoaded', init);
