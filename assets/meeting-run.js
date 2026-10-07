/* ===== 会議の準備・進行（ファシリテーターモード） =====
   準備(#/prep): 会議の型から、時間配分・進行スクリプト・前回の宿題入りのアジェンダを自動で組む。送信用の文面も作る。
   進行(#/run/ID): 議題ごとのタイムキーパーとスクリプト。その場で決定・宿題・駐車場を記録し、議事録へ流し込む。
   実際にかかった時間は会議に記録され、次回の時間配分の参考（前回実績）として表示される。 */
(function () {
  'use strict';
  const { h, toast, uid, fmtDate } = OS;
  const KIND = { share: '共有', discuss: '検討', decide: '決定' };
  const KIND_CHIP = { share: '', discuss: 'warn', decide: 'accent' };
  const pad = (n) => String(n).padStart(2, '0');
  const addMin = (hhmm, m) => {
    if (!hhmm) return '';
    const [H, M] = hhmm.split(':').map(Number);
    const t = H * 60 + M + Math.round(m);
    return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
  };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] || '');
  const sumMin = (items) => items.reduce((n, it) => n + (Number(it.minutes) || 0), 0);
  const mmss = (sec) => {
    const neg = sec < 0, a = Math.abs(Math.round(sec));
    return (neg ? '+' : '') + `${Math.floor(a / 60)}:${pad(a % 60)}`;
  };

  // ---------- アジェンダの自動作成 ----------
  function prevMeeting(ctx, orgId, date) {
    return ctx.S.meetings.filter((m) => m.orgId === orgId && m.date < date && (m.tasks || []).length)
      .sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')))[0];
  }
  // 同じ店舗・同じ種類の過去の会議で、議題ごとに実際にかかった時間（分）
  function learned(ctx, orgId, type) {
    const out = {};
    ctx.S.meetings.filter((m) => m.orgId === orgId && m.type === type && m.run && m.run.items)
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).forEach((m) => {
        m.run.items.forEach((r) => { if (r.title && r.actualSec) (out[r.title] = out[r.title] || []).push(r.actualSec / 60); });
      });
    const avg = {};
    for (const [k, v] of Object.entries(out)) avg[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    return avg;
  }

  function buildAgenda(ctx, base) {
    const tpl = window.MEETING_TEMPLATES[base.type] || window.MEETING_TEMPLATES['経営者会議'];
    const items = [];
    for (const it of tpl.items) {
      if (it.auto === 'stores') {
        ctx.S.orgs.filter((o) => o.kind === 'store').forEach((o) => {
          items.push({ id: uid('a'), title: `${o.name}の発表`, kind: 'share', minutes: it.perStore.minutes, script: it.script.map((s) => fill(s, { org: o.name })) });
          items.push({ id: uid('a'), title: `${o.name}への助言`, kind: 'discuss', minutes: it.perStore.adviceMinutes, script: ['助言をお願いします。助言ごとに、受け取る人と次の行動を決めます。'] });
        });
        continue;
      }
      items.push({ id: uid('a'), title: it.title, kind: it.kind, minutes: it.minutes, auto: it.auto || '', script: it.script.slice() });
    }
    const total = Number(base.totalMinutes) || tpl.minutes;
    const planned = sumMin(items);
    if (planned && total !== planned) {
      const r = total / planned;
      items.forEach((it) => (it.minutes = Math.max(1, Math.round(it.minutes * r))));
      const diff = total - sumMin(items);
      const big = items.reduce((a, b) => (b.minutes > a.minutes ? b : a), items[0]);
      big.minutes = Math.max(1, big.minutes + diff);
    }
    return { items, purpose: tpl.purpose, goal: tpl.goal, totalMinutes: total };
  }

  function agendaText(ctx, m) {
    const org = ctx.orgOf(m.orgId).name;
    let t = m.start || '';
    const lines = [`【${org} ${m.type}】`, `日時：${fmtDate(m.date)} ${m.start || ''}〜${m.end || ''}`];
    if (m.place) lines.push(`場所：${m.place}`);
    lines.push(`目的：${(m.purpose || [])[0] || ''}`, `ゴール：${m.goal || ''}`, '', '■アジェンダ');
    (m.agenda || []).forEach((it, i) => {
      lines.push(`${i + 1}. ${t ? t + ' ' : ''}${it.title}（${it.minutes}分・${KIND[it.kind] || ''}）`);
      t = addMin(t, it.minutes);
    });
    const prev = prevMeeting(ctx, m.orgId, m.date);
    const open = prev ? (prev.tasks || []).filter((x) => !x.done) : [];
    if (open.length) {
      lines.push('', '■前回の宿題（冒頭で確認します）');
      open.forEach((x) => lines.push(`・${x.text}（担当：${x.assignee || '未定'}${x.due ? '／期限：' + x.due.slice(5).replace('-', '/') : ''}）`));
    }
    const decide = (m.agenda || []).filter((it) => it.kind === 'decide' && !it.auto);
    lines.push('', '■事前のお願い');
    decide.forEach((it) => lines.push(`・「${it.title}」は当日決めます。意見を持ってきてください`));
    lines.push('・数字は前日までに共有をお願いします', '・終了時刻を守ります');
    return lines.join('\n');
  }

  // ---------- 準備画面 ----------
  function viewPrep(ctx, id) {
    const { S, setTop, markNav, $view, orgOf, section } = ctx;
    markNav('prep');
    const editable = S.orgs.filter((o) => OS.Perm.canCreateIn(S.user, o.id));
    if (!editable.length) { setTop('会議の準備', ''); $view.replaceChildren(h('div', { class: 'card empty', text: '会議を準備できるのは店長・部署長以上です。' })); return; }
    const existing = id ? S.meetings.find((x) => x.id === id) : null;
    const m = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: '', orgId: editable[0].id, type: '経営者会議', date: new Date().toISOString().slice(0, 10), start: '15:00', end: '', place: '',
      participants: [], visibility: 'exec', status: 'draft', stage: 'planned', purpose: [], goal: '', agenda: [],
      numbers: [], issues: [], decisions: [], next: { meeting: '', content: '' }, tasks: [], pending: '', source: { kind: 'manual' },
    };
    if (!m.agenda || !m.agenda.length) Object.assign(m, regenerate(ctx, m, null));

    const fld = (label, el) => h('div', {}, h('label', { class: 'f', text: label }), el);
    const inp = (obj, key, type = 'text', on) => { const e = h('input', { type, value: obj[key] || '' }); e.addEventListener('input', () => { obj[key] = e.value; on && on(); }); return e; };
    const totalIn = h('input', { type: 'number', min: '5', step: '5', value: sumMin(m.agenda) });
    const sel = (key, opts, on) => {
      const e = h('select', {}, opts.map(([v, t]) => h('option', { value: v, selected: m[key] === v, text: t })));
      e.addEventListener('change', () => { m[key] = e.value; on && on(); }); return e;
    };
    const purposeIn = h('input', { type: 'text', value: (m.purpose || [])[0] || '' });
    purposeIn.addEventListener('input', () => (m.purpose = [purposeIn.value]));
    const goalIn = h('input', { type: 'text', value: m.goal || '' });
    goalIn.addEventListener('input', () => (m.goal = goalIn.value));
    const regen = () => {
      if ((m.agenda || []).length && !confirm('会議の型からアジェンダを作り直しますか？（今の編集は消えます）')) return;
      Object.assign(m, regenerate(ctx, m, Number(totalIn.value)));
      purposeIn.value = m.purpose[0]; goalIn.value = m.goal; drawItems();
    };
    const hint = learned(ctx, m.orgId, m.type);
    const itemsBox = h('div', { class: 'grid', style: { gap: '8px' } });
    const sumBox = h('div', { class: 'small' });

    function drawItems() {
      let t = m.start;
      itemsBox.replaceChildren(...m.agenda.map((it, i) => {
        const from = t; t = addMin(t, it.minutes);
        const title = h('input', { type: 'text', value: it.title, 'aria-label': '議題' });
        title.addEventListener('input', () => (it.title = title.value));
        const kind = h('select', { 'aria-label': '種類', style: { width: '96px', flex: 'none' } }, Object.entries(KIND).map(([v, l]) => h('option', { value: v, selected: it.kind === v, text: l })));
        kind.addEventListener('change', () => (it.kind = kind.value));
        const min = h('input', { type: 'number', min: '1', value: it.minutes, 'aria-label': '分', style: { width: '70px', flex: 'none' } });
        min.addEventListener('change', () => { it.minutes = Math.max(1, Number(min.value) || 1); drawItems(); });
        const script = h('textarea', { rows: Math.max(2, it.script.length), 'aria-label': '進行スクリプト' }, it.script.join('\n'));
        script.addEventListener('input', () => (it.script = script.value.split('\n')));
        const mv = (d) => { const j = i + d; if (j < 0 || j >= m.agenda.length) return; [m.agenda[i], m.agenda[j]] = [m.agenda[j], m.agenda[i]]; drawItems(); };
        const past = hint[it.title];
        return h('div', { class: 'card' }, h('div', { class: 'bd', style: { display: 'grid', gap: '8px' } },
          h('div', { class: 'row' },
            h('span', { class: 'num small muted', style: { width: '92px' }, text: from ? `${from}〜${t}` : `${i + 1}` }),
            h('div', { style: { flex: '1 1 220px' } }, title), kind, min, h('span', { class: 'small muted', text: '分' }),
            past ? h('span', { class: 'chip' + (past > it.minutes ? ' warn' : ''), title: '同じ会議の直近の実績', text: `前回実績 ${past}分` }) : null,
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': '上へ', onclick: () => mv(-1) }, '↑'),
            h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': '下へ', onclick: () => mv(1) }, '↓'),
            h('button', { class: 'btn ghost sm danger', type: 'button', 'aria-label': '削除', onclick: () => { m.agenda.splice(i, 1); drawItems(); } }, '✕')),
          h('div', {}, h('label', { class: 'f', text: '進行スクリプト（読み上げる言葉）' }), script)));
      }), h('button', { class: 'btn sm', type: 'button', onclick: () => { m.agenda.push({ id: uid('a'), title: '新しい議題', kind: 'discuss', minutes: 10, script: [''] }); drawItems(); } }, '＋ 議題を追加'));
      const total = sumMin(m.agenda);
      m.end = addMin(m.start, total);
      sumBox.replaceChildren(`合計 ${total}分`, m.start ? `（${m.start}〜${m.end}）` : '');
    }

    async function save(quiet) {
      if (!OS.Perm.canEdit(S.user, m)) { toast('この店舗・部署で保存する権限がありません'); return null; }
      m.id = m.id || uid('mtg');
      m.createdBy = m.createdBy || S.user.memberId || S.user.email || '';
      m.end = addMin(m.start, sumMin(m.agenda));
      try { await OS.Store.put('meetings', m); } catch (e) { toast('保存できませんでした'); return null; }
      await ctx.reload(); ctx.refreshChrome();
      if (!quiet) toast('準備を保存しました');
      return m;
    }
    function sendDialog() {
      const text = agendaText(ctx, { ...m, end: addMin(m.start, sumMin(m.agenda)) });
      const ta = h('textarea', { rows: 16, readonly: true }, text);
      const dlg = h('div', { style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'grid', placeItems: 'center', padding: '16px' } },
        h('div', { class: 'card', style: { width: 'min(560px,100%)' } },
          h('div', { class: 'hd' }, h('h3', { text: 'アジェンダを送る' }), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: () => dlg.remove() }, '閉じる')),
          h('div', { class: 'bd grid' }, h('div', { class: 'small muted', text: 'コピーして、会議のLINEグループに送ってください（前日までが目安）。' }), ta,
            h('div', { class: 'row' },
              h('button', { class: 'btn primary', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('コピーしました'); } catch (e) { ta.select(); document.execCommand('copy'); toast('コピーしました'); } } }, 'コピー'),
              navigator.share ? h('button', { class: 'btn', onclick: () => navigator.share({ text }).catch(() => {}) }, '共有（LINEなど）') : null))));
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
      document.body.append(dlg);
    }

    setTop('会議の準備', '会議の型から、時間配分とスクリプト入りのアジェンダを作ります', [
      h('button', { class: 'btn', onclick: () => save() }, '保存'),
      h('button', { class: 'btn', onclick: sendDialog }, 'アジェンダを送る'),
      h('button', { class: 'btn primary', onclick: async () => { const r = await save(true); if (r) location.hash = '#/run/' + r.id; } }, '▶ 会議を始める'),
    ]);
    const orgSel = sel('orgId', editable.map((o) => [o.id, o.name]));
    const typeSel = sel('type', Object.keys(window.MEETING_TEMPLATES).map((t) => [t, t]));
    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '980px' } },
      section('会議の基本', h('div', { class: 'form' },
        h('div', { class: 'two' }, fld('店舗・部署', orgSel), fld('会議の種類', typeSel)),
        h('div', { class: 'four' }, fld('日付', inp(m, 'date', 'date')), fld('開始', inp(m, 'start', 'time', drawItems)), fld('全体の時間（分）', totalIn), fld('場所', inp(m, 'place'))),
        fld('目的（なぜ集まるか）', purposeIn),
        fld('ゴール（終わったとき何が決まっていれば成功か）', goalIn),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: regen }, '会議の型からアジェンダを作り直す'), h('span', { class: 'small muted', text: '店舗・種類・全体の時間を変えたら押してください' })))),
      h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: 'アジェンダ・時間配分・進行スクリプト' }), h('span', { class: 'spacer' }), sumBox),
        h('div', { class: 'bd' }, itemsBox))));
    drawItems();
  }

  function regenerate(ctx, m, total) {
    const a = buildAgenda(ctx, { type: m.type, totalMinutes: total });
    return { agenda: a.items, purpose: [a.purpose], goal: a.goal };
  }

  // ---------- 進行画面（タイムキーパー） ----------
  let timer = null;
  let keyHandler = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  window.addEventListener('hashchange', () => { if (!/^#\/run\//.test(location.hash)) { stopTimer(); document.body.classList.remove('stage'); } });

  function viewRun(ctx, id) {
    const { S, setTop, markNav, $view, orgOf } = ctx;
    markNav('prep');
    stopTimer();
    document.body.classList.add('stage');
    const m = S.meetings.find((x) => x.id === id);
    if (!m || !OS.Perm.canEdit(S.user, m) || !(m.agenda || []).length) {
      setTop('会議の進行', ''); $view.replaceChildren(h('div', { class: 'card empty', text: 'この会議は進行できません（準備がされていないか、権限がありません）。' })); return;
    }
    const KEY = 'spachoco-run:' + id;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    st = st || { idx: 0, used: {}, extra: {}, itemStart: null, paused: true, startedAt: null, decisions: [], tasks: [], parking: [] };
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
    const now = () => Date.now();
    const item = () => m.agenda[st.idx];
    const usedSec = (it) => (st.used[it.id] || 0) + (it === item() && !st.paused && st.itemStart ? (now() - st.itemStart) / 1000 : 0);
    const planSec = (it) => (Number(it.minutes) + (st.extra[it.id] || 0)) * 60;
    const vars = { purpose: (m.purpose || [])[0] || '', goal: m.goal || '', end: m.end || '', org: orgOf(m.orgId).name };
    const prev = prevMeeting(ctx, m.orgId, m.date);
    const members = S.members.filter((x) => (x.orgIds || []).includes(m.orgId) || OS.roleOf(x.role).all);
    let beeped = {};

    function beep() {
      try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(); o.frequency.value = 880; o.connect(ac.destination); o.start(); setTimeout(() => { o.stop(); ac.close(); }, 250); } catch (e) {}
    }
    function bank() { const it = item(); if (!st.paused && st.itemStart) { st.used[it.id] = (st.used[it.id] || 0) + (now() - st.itemStart) / 1000; st.itemStart = now(); } }
    function go(d) { bank(); st.idx = Math.min(m.agenda.length - 1, Math.max(0, st.idx + d)); st.itemStart = st.paused ? null : now(); persist(); draw(); }
    function toggle() {
      if (st.paused) { st.paused = false; st.itemStart = now(); st.startedAt = st.startedAt || new Date().toISOString(); }
      else { bank(); st.paused = true; st.itemStart = null; }
      persist(); draw();
    }

    const timerEl = h('div', { class: 'num', style: { fontSize: 'clamp(56px,11vw,112px)', fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em' } });
    const totalEl = h('div', { class: 'small' });
    const barEl = h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--accent)', width: '0%', transition: 'width .5s' } });
    function tick() {
      const it = item(); const left = planSec(it) - usedSec(it);
      timerEl.textContent = left >= 0 ? mmss(left) : mmss(left);
      timerEl.style.color = left < 0 ? 'var(--err)' : left <= 60 ? 'var(--warn)' : 'var(--text)';
      if (left <= 0 && !beeped[it.id] && !st.paused) { beeped[it.id] = true; beep(); }
      const plannedTotal = m.agenda.reduce((n, x) => n + planSec(x), 0);
      const usedTotal = m.agenda.reduce((n, x) => n + usedSec(x), 0);
      const doneIdxPlan = m.agenda.slice(0, st.idx).reduce((n, x) => n + planSec(x), 0) + Math.min(usedSec(it), planSec(it));
      const drift = (m.agenda.slice(0, st.idx).reduce((n, x) => n + usedSec(x) - planSec(x), 0)) + Math.max(0, usedSec(it) - planSec(it));
      barEl.style.width = Math.min(100, (doneIdxPlan / plannedTotal) * 100) + '%';
      totalEl.replaceChildren(`経過 ${mmss(usedTotal).replace('+', '')} / 予定 ${Math.round(plannedTotal / 60)}分　`,
        h('span', { style: { color: drift > 60 ? 'var(--err)' : 'var(--ok)', fontWeight: 600 }, text: drift > 60 ? `予定より ${Math.round(drift / 60)}分押し` : '予定どおり' }));
    }

    // その場の記録（決定・宿題・駐車場）
    function captureBox() {
      const tx = h('input', { type: 'text', placeholder: '決まったこと・宿題・あとで扱う論点を入力' });
      const who = h('select', { 'aria-label': '担当', style: { width: '170px', flex: 'none' } }, h('option', { value: '', text: '担当' }), members.map((x) => h('option', { value: x.id, text: x.name })), h('option', { value: '__all', text: '参加者全員' }));
      const due = h('input', { type: 'date', 'aria-label': '期限', style: { width: '150px' } });
      const add = (kind) => {
        const v = tx.value.trim(); if (!v) { tx.focus(); return; }
        if (kind === 'decision') st.decisions.push({ id: uid('d'), text: v, at: item().title });
        if (kind === 'parking') st.parking.push({ id: uid('p'), text: v, at: item().title });
        if (kind === 'task') {
          const mem = members.find((x) => x.id === who.value);
          st.tasks.push({ id: uid('t'), text: v, assigneeId: mem ? mem.id : '', assignee: who.value === '__all' ? '参加者全員' : mem ? mem.name : '', due: due.value, done: false });
        }
        tx.value = ''; persist(); drawLog(); tx.focus();
      };
      tx.addEventListener('keydown', (e) => { if (e.key === 'Enter') add('decision'); });
      return h('div', { class: 'card' }, h('div', { class: 'bd grid', style: { gap: '8px' } }, tx,
        h('div', { class: 'row' }, who, due,
          h('button', { class: 'btn sm primary', onclick: () => add('decision') }, '決定に追加'),
          h('button', { class: 'btn sm', onclick: () => add('task') }, '宿題に追加'),
          h('button', { class: 'btn sm', onclick: () => add('parking') }, '駐車場に預ける'))));
    }
    const logBox = h('div', { class: 'grid', style: { gap: '10px' } });
    function drawLog() {
      const missing = st.tasks.filter((t) => !t.assignee || !t.due).length;
      const row = (list, i, label, extra) => h('li', { class: 'row', style: { justifyContent: 'space-between', gap: '6px', flexWrap: 'nowrap', alignItems: 'flex-start' } },
        h('span', { style: { flex: '1 1 auto' } }, label ? h('span', { class: 'chip', style: { marginRight: '6px' }, text: label }) : null, list[i].text, extra || null),
        h('button', { class: 'btn ghost sm danger', 'aria-label': '削除', onclick: () => { list.splice(i, 1); persist(); drawLog(); } }, '✕'));
      logBox.replaceChildren(
        h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: `決定 ${st.decisions.length}` })),
          h('div', { class: 'bd' }, st.decisions.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, st.decisions.map((_, i) => row(st.decisions, i))) : h('div', { class: 'small muted', text: 'まだありません' }))),
        h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: `宿題 ${st.tasks.length}` }), missing ? h('span', { class: 'chip err', text: `担当・期限なし ${missing}` }) : null),
          h('div', { class: 'bd' }, st.tasks.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, st.tasks.map((t, i) => row(st.tasks, i, null,
            h('span', { class: 'small', style: { marginLeft: '6px', color: (!t.assignee || !t.due) ? 'var(--err)' : 'var(--text-3)' }, text: `（${t.assignee || '担当未定'}／${t.due ? t.due.slice(5).replace('-', '/') : '期限未定'}）` })))) : h('div', { class: 'small muted', text: 'まだありません' }))),
        h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: `駐車場 ${st.parking.length}` })),
          h('div', { class: 'bd' }, st.parking.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, st.parking.map((_, i) => row(st.parking, i))) : h('div', { class: 'small muted', text: '途中で出た論点はここに預けます' }))));
    }

    async function finish() {
      bank(); st.paused = true; persist();
      const missing = st.tasks.filter((t) => !t.assignee || !t.due).length;
      if (missing && !confirm(`担当か期限が決まっていない宿題が${missing}件あります。このまま終了しますか？`)) return;
      const fresh = await OS.Store.get('meetings', m.id);
      if (!fresh) { toast('会議が見つかりません'); return; }
      fresh.decisions = [...(fresh.decisions || []).filter(Boolean), ...st.decisions.map((d) => d.text)];
      fresh.tasks = [...(fresh.tasks || []), ...st.tasks];
      if (st.parking.length) fresh.pending = [fresh.pending, '駐車場：' + st.parking.map((p) => p.text).join('／')].filter(Boolean).join('　');
      fresh.run = { startedAt: st.startedAt, endedAt: new Date().toISOString(), items: m.agenda.map((it) => ({ title: it.title, plannedMin: it.minutes, actualSec: Math.round(st.used[it.id] || 0) })) };
      fresh.stage = 'done';
      try { await OS.Store.put('meetings', fresh); } catch (e) { toast('保存できませんでした'); return; }
      try { localStorage.removeItem(KEY); } catch (e) {}
      stopTimer(); await ctx.reload(); ctx.refreshChrome();
      toast('議事録に反映しました。内容を確認して公開してください');
      location.hash = '#/m/' + m.id + '/edit';
    }

    function draw() {
      const it = item();
      const next = m.agenda[st.idx + 1];
      const prevOpen = it.auto === 'prevTasks' && prev ? (prev.tasks || []).filter((t) => !t.done) : [];
      setTop(`${orgOf(m.orgId).name} ${m.type}`, `${fmtDate(m.date)} ${m.start || ''}〜${m.end || ''}`, [
        h('a', { class: 'btn ghost', href: '#/prep/' + m.id, text: '準備に戻る' }),
        h('button', { class: 'btn danger', onclick: finish }, '会議を終了して議事録へ'),
      ]);
      const recap = it.auto === 'recap';
      $view.replaceChildren(h('div', { class: 'layout2' },
        h('div', { class: 'grid' },
          h('div', { class: 'card' }, h('div', { style: { background: 'var(--surface-2)', borderRadius: 'var(--radius) var(--radius) 0 0', overflow: 'hidden' } }, barEl),
            h('div', { class: 'bd grid', style: { gap: '14px' } },
              h('div', { class: 'row' }, h('span', { class: 'chip', text: `${st.idx + 1} / ${m.agenda.length}` }), h('span', { class: 'chip ' + (KIND_CHIP[it.kind] || ''), text: KIND[it.kind] || '' }),
                h('span', { class: 'spacer' }), totalEl),
              h('h2', { style: { margin: 0, fontSize: '24px' }, text: it.title }),
              h('div', { class: 'row', style: { alignItems: 'flex-end', gap: '18px' } }, timerEl,
                h('div', { class: 'small muted', style: { paddingBottom: '10px' }, text: `持ち時間 ${Math.round(planSec(it) / 60)}分` })),
              h('div', { class: 'row runctl' },
                h('button', { class: 'btn', onclick: () => go(-1), disabled: st.idx === 0 }, '◀ 前へ'),
                h('button', { class: 'btn primary', onclick: toggle }, st.paused ? (st.startedAt ? '▶ 再開' : '▶ スタート') : '⏸ 一時停止'),
                h('button', { class: 'btn', onclick: () => { st.extra[it.id] = (st.extra[it.id] || 0) + 3; persist(); tick(); toast('3分延長しました'); } }, '＋3分延長'),
                h('button', { class: 'btn', onclick: () => go(1), disabled: st.idx === m.agenda.length - 1 }, '次へ ▶')),
              h('div', { class: 'small muted kbdhint' }, 'キーボード：', h('span', { class: 'kbd', text: 'Space' }), ' スタート／一時停止　', h('span', { class: 'kbd', text: '←' }), h('span', { class: 'kbd', text: '→' }), ' 前／次　', h('span', { class: 'kbd', text: '+' }), ' 3分延長'),
              h('div', { style: { borderLeft: '3px solid var(--accent)', background: 'var(--accent-soft)', padding: '12px 14px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' } },
                h('div', { class: 'small muted', style: { marginBottom: '4px' }, text: '進行スクリプト' }),
                it.script.filter(Boolean).map((s) => h('p', { style: { margin: '0 0 4px', fontSize: '15px' }, text: fill(s, vars) }))),
              prevOpen.length ? h('div', {}, h('div', { class: 'small muted', style: { marginBottom: '6px' }, text: '前回の宿題（完了したらチェック）' }),
                h('ul', { class: 'tasklist' }, prevOpen.map((t) => {
                  const cb = h('input', { type: 'checkbox', 'aria-label': '完了' });
                  cb.addEventListener('change', async () => { try { await ctx.setTaskDone(prev, t.id, cb.checked); } catch (e) { toast('保存できませんでした'); } });
                  return h('li', {}, cb, h('div', {}, h('div', { class: 'tx', text: t.text }), h('div', { class: 'who', text: `担当：${t.assignee || '未定'}${t.due ? '　期限：' + fmtDate(t.due, false) : ''}` })));
                }))) : null,
              recap ? h('div', { class: 'banner warn', text: '担当・期限が空いている宿題は、右の一覧で赤く表示されます。この場で決めてから終わりましょう。' }) : null,
              next ? h('div', { class: 'small muted', text: `次：${next.title}（${next.minutes}分）` }) : h('div', { class: 'small muted', text: '最後の議題です' }))),
          captureBox()),
        h('aside', { class: 'grid' }, logBox,
          h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: 'アジェンダ' })),
            h('div', { class: 'bd' }, h('ol', { style: { margin: 0, paddingLeft: '20px', fontSize: '13px' } }, m.agenda.map((x, i) => h('li', {
              style: { fontWeight: i === st.idx ? 700 : 400, color: i < st.idx ? 'var(--text-3)' : 'var(--text)', cursor: 'pointer', padding: '2px 0' },
              onclick: () => { bank(); st.idx = i; st.itemStart = st.paused ? null : now(); persist(); draw(); },
            }, `${x.title}（${x.minutes + (st.extra[x.id] || 0)}分）`, st.used[x.id] && i !== st.idx ? h('span', { class: 'muted', text: ` 実績${Math.round(st.used[x.id] / 60)}分` }) : null))))))));
      drawLog(); tick();
    }
    draw();
    timer = setInterval(tick, 1000);

    // ノートパソコン：キーボードで進行（入力中は反応しない）
    const onKey = (e) => {
      if (!/^#\/run\//.test(location.hash)) { document.removeEventListener('keydown', onKey); keyHandler = null; return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+') { st.extra[item().id] = (st.extra[item().id] || 0) + 3; persist(); tick(); toast('3分延長しました'); }
    };
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = onKey;
    document.addEventListener('keydown', onKey);
    // iPad：会議中に画面が消えないようにする
    requestWake();
  }

  let wake = null;
  async function requestWake() {
    try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { /* 使えない端末では何もしない */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && /^#\/run\//.test(location.hash)) requestWake(); });
  window.addEventListener('hashchange', () => { if (!/^#\/run\//.test(location.hash) && wake) { wake.release().catch(() => {}); wake = null; } });

  window.MeetingRun = { viewPrep, viewRun, buildAgenda, agendaText };
})();
