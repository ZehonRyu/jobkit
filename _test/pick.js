/* 年月选择器自测：把下拉框点一遍，看档案里存下来的字符串对不对
   运行方式：_test/picker.html 是 index.html 的副本（资源路径改成 ../assets，
   并在 </body> 前挂了本文件）。index.html 结构变了要重新拷一份再跑：
   node _test/dump4.js http://127.0.0.1:8770/_test/picker.html 输出文件
   然后 grep testout 里的 PASS/FAIL。 */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const log = [];
    const ok = (name, cond, extra) => log.push((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? '  :: ' + extra : ''));
    const fire = (el) => el.dispatchEvent(new Event('change', { bubbles: true }));
    const setSel = (box, k, v) => { const el = box.querySelector(`[data-ym="${k}"]`); el.value = v; fire(el); return el; };

    try {
      /* --- 纯函数 --- */
      ok('标准化 年月中文', standardizeTime('2024年3月 - 2025年6月') === '2024.03 - 2025.06', standardizeTime('2024年3月 - 2025年6月'));
      ok('标准化 斜杠+至今', standardizeTime('2023/7-至今') === '2023.07 - 至今', standardizeTime('2023/7-至今'));
      ok('标准化 单个点', standardizeTime('2021.6') === '2021.06', standardizeTime('2021.6'));
      ok('带备注不改', standardizeTime('2024.03（试用期）') === '2024.03（试用期）', standardizeTime('2024.03（试用期）'));
      ok('hasRange 单点=false', hasRange('2024.03') === false);
      ok('hasRange 区间=true', hasRange('2024.03 - 2025.06') === true);
      ok('hasRange 至今=true', hasRange('2024.03 - 至今') === true);

      /* --- 项目卡下拉 --- */
      const card = document.querySelector('#proj-wrap .proj');
      const box = card.querySelector('[data-range="time"]');
      const ey = setSel(box, 'sy', '2022');
      setSel(box, 'sm', '07');
      setSel(box, 'ey', '2023');
      setSel(box, 'em', '01');
      ok('写入区间', profile.projects[0].time === '2022.07 - 2023.01', profile.projects[0].time);

      /* --- 至今开关 --- */
      const nowBtn = box.querySelector('[data-ym-now]');
      nowBtn.click();
      ok('至今', profile.projects[0].time === '2022.07 - 至今', profile.projects[0].time);
      ok('结束下拉禁用', box.querySelector('[data-ym="ey"]').disabled === true);
      ok('推定标签摘掉', !card.querySelector('.tag-guess'));
      nowBtn.click();
      ok('取消至今→只剩起点', profile.projects[0].time === '2022.07', profile.projects[0].time);

      /* --- 只选年不选月：自动补 01 --- */
      const box2 = card.querySelector('[data-range="time"]');
      setSel(box2, 'ey', '2023');
      ok('只选年自动补月', profile.projects[0].time === '2022.07 - 2023.07', profile.projects[0].time);

      /* --- 倒挂提示 --- */
      setSel(box2, 'sy', '2024');
      ok('倒挂标记', box2.classList.contains('bad'), profile.projects[0].time);

      /* --- 毕业时间（单点） --- */
      const edu = document.querySelector('#edu-form [data-year]');
      setSel(edu, 'sy', '2021');
      ok('毕业时间年', profile.edu.year === '2021.01', profile.edu.year);
      setSel(edu, 'sm', '06');
      ok('毕业时间年月', profile.edu.year === '2021.06', profile.edu.year);

      /* --- 时间线起点 --- */
      const tl = document.querySelector('#tl-start');
      ok('起点默认有值', readYmSingle(tl) !== '', readYmSingle(tl));
      setSel(tl, 'sy', '2020');
      setSel(tl, 'sm', '01');
      ok('起点可改', tlStartValue() === '2020.01', tlStartValue());
      ok('改起点后推定值清空', profile.projects.every(p => !p.timeGuess));

      /* --- 结构检查 --- */
      const bare = Array.from(document.querySelectorAll('#proj-wrap input, #work-wrap input'))
        .filter(i => /^\d{4}/.test(i.value || ''));
      ok('没有残留的时间文本框', bare.length === 0, bare.map(i => i.outerHTML.slice(0, 60)).join(' | '));
      const html = document.documentElement.innerHTML;
      ok('无 undefined/NaN', !/undefined|NaN/.test(html));
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
    }

    const d = document.createElement('div');
    d.id = 'testout';
    d.textContent = log.join('\n');
    document.body.appendChild(d);
    document.title = log.filter(x => x.indexOf('PASS') === 0).length + '/' + log.length;
  }, 150);
});
