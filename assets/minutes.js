/* ===== SPACHOCO OS / 議事録アプリ =====
   画面: 一覧(#/) 詳細(#/m/ID) 編集(#/m/ID/edit) 新規(#/new) 宿題(#/tasks) 名簿・権限(#/settings)
   議事録は毎回同じテンプレート: 目的・方針 / 数値・実績 / 課題 / 決定事項 / 次回・宿題 / 継続検討 */
(function () {
  'use strict';
  const { h, toast, uid, fmtDate, ROLES, roleOf, VIS, Perm, Store, Session } = OS;

  const TYPES = ['経営者会議', '幹部会議', '朝礼', '部署会議', '全体会議', '1on1', 'その他'];
  const S = { user: null, orgs: [], members: [], meetings: [], filter: { org: '', q: '', month: '', type: '', status: '' } };
  try { Object.assign(S.filter, JSON.parse(sessionStorage.getItem('mtg-filter') || '{}')); } catch (e) {}
  // 表示のしかた：店舗ごと（左端の店舗アイコンで切り替え）か、まとめて（全店舗を一覧）か。端末ごとに覚える
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('os-' + k); localStorage.setItem('os-' + k, v); } catch (e) {} return null; };
  S.scope = pref('scope') || '';
  S.storemode = pref('storemode');

  const $view = document.getElementById('view');
  const orgOf = (id) => S.orgs.find((o) => o.id === id) || { id, name: id || '未設定', color: '#8A8A9E' };
  const today = () => new Date().toISOString().slice(0, 10);
  const visible = () => S.meetings.filter((m) => Perm.canView(S.user, m));
  const isOverdue = (t) => !t.done && t.due && t.due < today();
  const level = () => roleOf(S.user && S.user.role).level;
  const isCast = () => level() < 60; // 幹部・スタッフは「自分のこと」中心のメニュー
  const myOrgs = () => (roleOf(S.user.role).all ? S.orgs : S.orgs.filter((o) => (S.user.orgIds || []).includes(o.id)));
  const inScope = (m) => !S.storemode || !S.scope || m.orgId === S.scope;
  const scoped = () => visible().filter(inScope);
  function setScope(id) { S.scope = id; pref('scope', id); S.filter.org = ''; refreshChrome(); route(); }
  function setStoreMode(on) { S.storemode = on; pref('storemode', on ? '1' : '0'); refreshChrome(); route(); }

  async function reload() {
    S.user = await Session.current();
    if (!S.user || S.user.unregistered) { S.orgs = []; S.members = []; S.meetings = []; return; }
    [S.orgs, S.members, S.meetings] = await Promise.all([Store.list('orgs'), Store.list('members'), Store.list('meetings', S.user)]);
    S.meetings.sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
  }
  // 宿題の完了チェック(宿題の欄だけ更新するので、編集権限のない担当者本人も保存できる)
  async function setTaskDone(m, taskId, done) {
    const fresh = await Store.get('meetings', m.id);
    if (!fresh) return;
    const tasks = (fresh.tasks || []).map((x) => x.id !== taskId ? x
      : { ...x, done, doneAt: done ? new Date().toISOString() : null, doneBy: done ? (S.user.memberId || S.user.email || '') : null });
    await Store.patch('meetings', m.id, { tasks });
    await reload(); refreshChrome();
  }

  function setTop(title, sub, actions) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSub').textContent = sub || '';
    const box = document.getElementById('topActions');
    box.replaceChildren(...(actions || []));
    document.title = title + ' | SPACHOCO OS';
  }
  function markNav(key) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
    document.getElementById('rail').classList.remove('open');
  }
  // 店舗アイコンの2文字。頭の2文字が他とかぶるときは「最初＋最後の文字」（僕らの森／僕らの森2 → 僕森／僕2）
  function labelOf(o, orgs) {
    if (o.short) return o.short;
    const two = (x) => x.name.slice(0, 2);
    return orgs.some((x) => x !== o && two(x) === two(o)) ? o.name[0] + o.name.slice(-1) : two(o);
  }
  // ---------- 左メニュー（店舗アイコン列＋メニュー）----------
  function renderRail() {
    if (S.storemode === null || S.storemode === undefined) S.storemode = level() < 80; // 初回：代表・エリアMGは「まとめて」、それ以外は「店舗ごと」
    else if (typeof S.storemode === 'string') S.storemode = S.storemode === '1';
    const orgs = myOrgs();
    if (S.scope && !orgs.some((o) => o.id === S.scope)) S.scope = '';
    if (S.storemode && !S.scope && orgs.length && !roleOf(S.user.role).all) S.scope = orgs[0].id;
    document.body.classList.toggle('storemode', !!S.storemode);
    const mineOnly = (t) => !isCast() || t.assigneeId === S.user.memberId;
    const openIn = (orgId) => visible().filter((m) => !orgId || m.orgId === orgId).reduce((n, m) => n + (m.tasks || []).filter((t) => !t.done && mineOnly(t)).length, 0);

    const srv = (id, label, color, title) => {
      const n = openIn(id);
      return h('button', { class: 'srv' + (S.scope === id ? ' on' : ''), title, 'aria-label': title, style: { background: color }, onclick: () => setScope(id) },
        label, n ? h('span', { class: 'n', text: n > 99 ? '99+' : n }) : null);
    };
    document.getElementById('servers').replaceChildren(...[
      roleOf(S.user.role).all || orgs.length > 1 ? [srv('', '全', '#2C6E68', 'すべての店舗・部署'), h('div', { class: 'srvsep' })] : [],
      orgs.map((o) => srv(o.id, labelOf(o, orgs), o.color || '#5B6B6A', o.name)),
    ].flat());
    const scopeOrg = S.storemode && S.scope ? orgOf(S.scope) : null;
    document.getElementById('brandSub').textContent = scopeOrg ? scopeOrg.name : (S.storemode ? 'すべての店舗・部署' : '全店舗まとめて');

    const item = (key, href, ic, label, badge) => h('a', { class: 'navitem', href, 'data-nav': key }, h('span', { class: 'ic', text: ic }), label,
      badge ? h('span', { class: 'badge', text: badge }) : null);
    const soon = (ic, label) => h('span', { class: 'navitem soon' }, h('span', { class: 'ic', text: ic }), label);
    const sec = (t) => h('div', { class: 'railsec', text: t });
    const canNew = S.orgs.some((o) => (!scopeOrg || o.id === scopeOrg.id) && Perm.canCreateIn(S.user, o.id));
    const openAll = scoped().reduce((n, m) => n + (m.tasks || []).filter((t) => !t.done).length, 0);
    const openMine = scoped().reduce((n, m) => n + (m.tasks || []).filter((t) => !t.done && t.assigneeId === S.user.memberId).length, 0);
    const meet = [sec(scopeOrg ? `${scopeOrg.name}の会議` : '会議'),
      item('list', '#/', '≡', '議事録'),
      isCast() ? null : item('tasks', '#/tasks', '✓', '宿題・依頼事項', openAll || ''),
      canNew ? item('prep', '#/prep', '▶', '会議の準備・進行') : null,
      canNew ? item('new', '#/new', '＋', '新しい議事録') : null];
    const grow = [sec(isCast() ? 'わたし' : '成長'),
      isCast() ? item('mytasks', '#/tasks/mine', '✓', '自分の宿題', openMine || '') : null,
      item('coach', '#/coach', '✦', 'AIに相談（壁打ち）'),
      item('learn', '#/learn', '✎', 'マニュアルで学ぶ'),
      item('karte', '#/karte', '♡', 'カルテ')];
    const apps = [sec('スパチョコのアプリ'),
      level() >= 60 ? h('a', { class: 'navitem', href: 'index.html' }, h('span', { class: 'ic', text: '¥' }), '売上') : null,
      soon('￥', '給料（準備中）'), soon('☆', '夢ノート（準備中）'), level() >= 60 ? soon('◎', '統括（準備中）') : null];
    const admin = level() >= 60 ? [sec('管理'), item('orgchart', '#/orgchart', '⌘', '組織図'), item('settings', '#/settings', '⚙', '名簿・権限')] : [];
    document.getElementById('navBox').replaceChildren(...(isCast() ? [grow, meet, apps] : [meet, grow, apps, admin]).flat().filter(Boolean));

    document.getElementById('viewToggle').replaceChildren(
      h('div', { class: 'small', style: { marginBottom: '6px' }, text: '表示のしかた' }),
      h('div', { class: 'vtoggle', role: 'group', 'aria-label': '表示のしかた' },
        h('button', { class: S.storemode ? 'on' : '', onclick: () => setStoreMode(true) }, '店舗ごと'),
        h('button', { class: S.storemode ? '' : 'on', onclick: () => setStoreMode(false) }, 'まとめて')));
    const key = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'list';
    markNav(key === 'm' ? 'list' : key === 'tasks' && location.hash.includes('/mine') ? 'mytasks' : key === 'run' ? 'prep' : key);
  }
  function refreshChrome() {
    renderRail();
    const who = document.getElementById('whoBox');
    if (Session.cloud) {
      who.replaceChildren(
        h('div', { style: { fontWeight: 600, color: 'var(--text-2)' }, text: S.user.name }),
        h('div', { text: `${roleOf(S.user.role).name}｜${S.user.email}` }),
        h('button', { class: 'btn ghost sm', style: { marginTop: '6px', paddingLeft: 0 }, onclick: async () => { await Session.signOut(); location.reload(); } }, 'ログアウト'));
      document.getElementById('modeNote').replaceChildren();
      return;
    }
    const sel = h('select', { id: 'asUser' }, S.members.map((m) => h('option', { value: m.id, selected: m.id === S.user.memberId },
      `${m.name}（${roleOf(m.role).name}）`)));
    sel.addEventListener('change', async () => {
      Session.switchTo(sel.value); await reload(); refreshChrome(); route();
      toast(`${S.user.name}（${roleOf(S.user.role).name}）として表示`);
    });
    who.replaceChildren(h('label', { class: 'f', for: 'asUser', text: '表示中のユーザー（権限の確認用）' }), sel);
    document.getElementById('modeNote').replaceChildren(
      h('span', { class: 'chip warn', text: 'サンプル表示中' }),
      h('div', { class: 'small', style: { marginTop: '6px' }, text: 'データはこの端末のブラウザ内だけに保存されます。' }));
  }

  // ======================= 一覧 =======================
  function viewList() {
    markNav('list');
    const canNew = S.orgs.some((o) => Perm.canCreateIn(S.user, o.id));
    setTop(S.storemode && S.scope ? `${orgOf(S.scope).name}の議事録` : '議事録一覧', `${S.user.name} として表示`, canNew ? [h('a', { class: 'btn primary', href: '#/new', text: '＋ 新しい議事録' })] : []);
    const all = scoped();
    const f = S.filter;
    const scopeOrg = S.storemode && S.scope ? orgOf(S.scope) : null;
    const months = [...new Set(all.map((m) => m.date.slice(0, 7)))].sort().reverse();
    const rows = all.filter((m) => {
      if (f.org && m.orgId !== f.org) return false;
      if (f.month && !m.date.startsWith(f.month)) return false;
      if (f.type && m.type !== f.type) return false;
      if (f.status && m.status !== f.status) return false;
      if (f.q) {
        const hay = [m.title, m.type, orgOf(m.orgId).name, ...(m.participants || []), ...(m.purpose || []), ...(m.issues || []),
          ...(m.decisions || []), ...(m.numbers || []), ...(m.tasks || []).map((t) => t.text + ' ' + t.assignee), m.pending].join(' ');
        if (!f.q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const save = () => { try { sessionStorage.setItem('mtg-filter', JSON.stringify(f)); } catch (e) {} viewList(); };

    const openTasks = all.flatMap((m) => (m.tasks || []).filter((t) => !t.done));
    const stats = h('div', { class: 'stats' },
      h('div', { class: 'card stat' }, h('b', { text: all.length }), h('span', { text: '閲覧できる議事録' })),
      h('a', { class: 'card stat', href: '#/tasks', style: { textDecoration: 'none', color: 'inherit' } }, h('b', { text: openTasks.length }), h('span', { text: '未完了の宿題' })),
      h('div', { class: 'card stat' }, h('b', { class: openTasks.some(isOverdue) ? 'overdue' : '', text: openTasks.filter(isOverdue).length }), h('span', { text: '期限切れ' })));

    const orgsSeen = S.orgs.filter((o) => all.some((m) => m.orgId === o.id));
    const chips = h('div', { class: 'orgchips', role: 'group', 'aria-label': '店舗・部署' },
      h('button', { class: 'orgchip' + (f.org ? '' : ' on'), onclick: () => { f.org = ''; save(); } }, 'すべて'),
      orgsSeen.map((o) => h('button', { class: 'orgchip' + (f.org === o.id ? ' on' : ''), onclick: () => { f.org = o.id; save(); } },
        h('span', { class: 'dot', style: { background: o.color } }), o.name)));

    const q = h('input', { type: 'search', placeholder: 'キーワード検索（人名・決定事項など）', value: f.q, 'aria-label': 'キーワード検索' });
    q.addEventListener('change', () => { f.q = q.value.trim(); save(); });
    const sel = (val, opts, ph, on) => {
      const s = h('select', { 'aria-label': ph }, h('option', { value: '', text: ph }), opts.map(([v, t]) => h('option', { value: v, selected: v === val, text: t })));
      s.addEventListener('change', () => on(s.value)); return s;
    };
    const filters = h('div', { class: 'filters' },
      h('div', { class: 'q' }, q),
      sel(f.month, months.map((m) => [m, m.replace('-', '年') + '月']), 'すべての月', (v) => { f.month = v; save(); }),
      sel(f.type, TYPES.map((t) => [t, t]), 'すべての種類', (v) => { f.type = v; save(); }),
      sel(f.status, [['published', '公開'], ['draft', '下書き']], '公開・下書き', (v) => { f.status = v; save(); }));

    const groups = {};
    rows.forEach((m) => (groups[m.date.slice(0, 7)] = groups[m.date.slice(0, 7)] || []).push(m));
    const list = Object.keys(groups).length ? Object.entries(groups).map(([ym, ms]) => [
      h('div', { class: 'monthhd', text: ym.replace('-', '年') + '月' }),
      h('div', { class: 'mlist' }, ms.map(card)),
    ]) : h('div', { class: 'card empty', text: all.length ? '条件に合う議事録はありません' : '閲覧できる議事録はまだありません' });

    $view.replaceChildren(...[stats, scopeOrg ? null : chips, filters, list].flat(Infinity).filter(Boolean));
  }

  function card(m) {
    const o = orgOf(m.orgId);
    const open = (m.tasks || []).filter((t) => !t.done);
    return h('a', { class: 'card mcard', href: '#/m/' + m.id },
      h('div', { class: 'bar', style: { background: o.color } }),
      h('div', {},
        h('h4', { text: titleOf(m) }),
        h('div', { class: 'meta', text: `${fmtDate(m.date)} ${m.start || ''}${m.end ? '〜' + m.end : ''}${m.place ? '｜' + m.place : ''}` }),
        h('div', { class: 'gist', text: (m.decisions || []).slice(0, 3).join('／') || (m.purpose || [])[0] || '' })),
      h('div', { class: 'side' },
        m.stage === 'planned' ? h('span', { class: 'chip accent', text: '準備中' }) : m.status === 'draft' ? h('span', { class: 'chip warn', text: '下書き' }) : h('span', { class: 'chip', text: m.type }),
        m.visibility === 'exec' ? h('span', { class: 'chip accent', text: '幹部以上' }) : null,
        open.length ? h('span', { class: 'chip' + (open.some(isOverdue) ? ' err' : ''), text: `宿題 ${open.length}` }) : null));
  }
  const titleOf = (m) => m.title || `${orgOf(m.orgId).name} ${m.type} 議事録`;

  // ======================= 詳細 =======================
  function viewDetail(id) {
    markNav('list');
    const m = S.meetings.find((x) => x.id === id);
    if (!m || !Perm.canView(S.user, m)) {
      setTop('議事録', '');
      $view.replaceChildren(h('div', { class: 'card empty' }, 'この議事録は見つからないか、閲覧する権限がありません。', h('div', {}, h('a', { href: '#/', text: '一覧へ戻る' }))));
      return;
    }
    const canEdit = Perm.canEdit(S.user, m);
    setTop(titleOf(m), m.status === 'draft' ? '下書き（所属の編集者のみ表示）' : '', [
      h('a', { class: 'btn ghost', href: '#/', text: '← 一覧' }),
      h('button', { class: 'btn', onclick: () => window.print() }, 'PDF・印刷'),
      canEdit && (m.agenda || []).length && m.stage !== 'done' ? h('a', { class: 'btn', href: `#/run/${m.id}`, text: '▶ 進行する' }) : null,
      canEdit ? h('a', { class: 'btn primary', href: `#/m/${m.id}/edit`, text: '編集' }) : null,
    ]);

    // 同じ店舗・部署の前回会議の、未完了の宿題
    const prev = S.meetings.filter((x) => x.orgId === m.orgId && (x.date + x.start) < (m.date + m.start) && Perm.canView(S.user, x))[0];
    const prevOpen = prev ? (prev.tasks || []).filter((t) => !t.done) : [];

    const aside = h('aside', { class: 'grid' },
      h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: '会議情報' })),
        h('div', { class: 'bd small grid', style: { gap: '8px' } },
          infoRow('店舗・部署', h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'dot', style: { background: orgOf(m.orgId).color } }), orgOf(m.orgId).name)),
          infoRow('種類', m.type),
          infoRow('公開範囲', VIS[m.visibility || 'org']),
          infoRow('状態', m.status === 'draft' ? h('span', { class: 'chip warn', text: '下書き' }) : h('span', { class: 'chip ok', text: '公開' })),
          infoRow('元データ', sourceLabel(m.source)))),
      prev ? h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: '前回の宿題' }), h('a', { class: 'small', href: '#/m/' + prev.id, text: fmtDate(prev.date, false) })),
        h('div', { class: 'bd' }, prevOpen.length ? taskList(prev, prevOpen) : h('div', { class: 'small muted', text: '前回の宿題はすべて完了しています' }))) : null);

    $view.replaceChildren(h('div', { class: 'layout2' }, h('div', {}, docView(m), m.transcript ? h('details', { class: 'tr noprint', style: { marginTop: '14px' } },
      h('summary', { text: '文字起こし全文を表示' }), h('pre', { text: m.transcript })) : null), aside));
  }
  const infoRow = (k, v) => h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted', text: k }), v);
  const sourceLabel = (s) => ({ upload: '録音アップロード', plaud: 'PLAUD取り込み', paste: '文字起こし貼り付け', manual: '手入力', sample: 'サンプル' }[(s || {}).kind] || '—');

  // 見本と同じテンプレート
  function docView(m) {
    let n = 0;
    const sec = (title) => h('h3', {}, String(++n), h('i', { text: '|' }), title);
    const tasks = m.tasks || [];
    return h('article', { class: 'doc', style: { '--doc-accent': '#3f7d78' } },
      h('h2', { class: 't', text: titleOf(m) }),
      h('div', { class: 'when', text: `${fmtDate(m.date)}　${m.start || ''}${m.end ? '〜' + m.end : ''}${m.place ? '　|　' + m.place : ''}` }),
      h('div', { class: 'att', text: '参加者　' + ((m.participants || []).join('・') || '記載なし') }),
      (m.purpose || []).length ? [sec('会議の目的・方針'), m.purpose.map((p) => h('p', { text: p }))] : null,
      (m.numbers || []).length ? [sec('数値・実績'), h('div', { class: 'nums' }, m.numbers.map((x) => h('span', { text: x })))] : null,
      (m.issues || []).length ? [sec('挙がった課題'), h('ul', { class: 'cols' }, m.issues.map((x) => h('li', { text: x })))] : null,
      (m.decisions || []).length ? [sec('決定事項・共有ルール'), h('div', { class: 'rule' }, h('div', { class: 'lbl', text: '今回決まったこと' }),
        h('ul', {}, m.decisions.map((x) => h('li', { text: x }))))] : null,
      [sec('次回会議・依頼事項'),
        m.next && m.next.meeting ? h('p', { text: '次回：' + m.next.meeting }) : null,
        m.next && m.next.content ? h('p', { text: '主な内容：' + m.next.content }) : null,
        tasks.length ? [h('p', { text: '依頼事項：' }), taskList(m, tasks)] : null],
      m.pending ? h('div', { class: 'foot', text: '※' + m.pending.replace(/^※/, '') }) : null);
  }

  function taskList(m, tasks) {
    return h('ul', { class: 'tasklist' }, tasks.map((t) => {
      const can = Perm.canCheckTask(S.user, m, t);
      const cb = h('input', { type: 'checkbox', checked: t.done, disabled: !can, 'aria-label': '完了' });
      cb.addEventListener('change', async () => {
        try { await setTaskDone(m, t.id, cb.checked); } catch (e) { toast('保存できませんでした'); }
        route();
        toast(cb.checked ? '完了にしました' : '未完了に戻しました');
      });
      return h('li', { class: t.done ? 'done' : '' }, cb, h('div', {},
        h('div', { class: 'tx', text: t.text }),
        h('div', { class: 'who' }, `担当：${t.assignee || '未定'}`, t.due ? h('span', { class: isOverdue(t) ? 'overdue' : '', text: `　期限：${fmtDate(t.due, false)}${isOverdue(t) ? '（期限切れ）' : ''}` }) : null)));
    }));
  }

  // ======================= 編集 =======================
  function viewEdit(id, draft) {
    markNav(id ? 'list' : 'new');
    const base = id ? S.meetings.find((x) => x.id === id) : draft;
    if (!base || (id && !Perm.canEdit(S.user, base))) {
      setTop('編集', ''); $view.replaceChildren(h('div', { class: 'card empty', text: 'この議事録を編集する権限がありません。' })); return;
    }
    const m = JSON.parse(JSON.stringify(base));
    m.next = m.next || { meeting: '', content: '' };
    m.tasks = m.tasks || [];
    const editableOrgs = S.orgs.filter((o) => Perm.canCreateIn(S.user, o.id));

    const fld = (label, el) => h('div', {}, h('label', { class: 'f', text: label }), el);
    const inp = (key, type = 'text', obj = m) => {
      const e = h('input', { type, value: obj[key] || '' }); e.addEventListener('input', () => (obj[key] = e.value)); return e;
    };
    const sel = (key, opts) => {
      const e = h('select', {}, opts.map(([v, t]) => h('option', { value: v, selected: m[key] === v, text: t })));
      e.addEventListener('change', () => (m[key] = e.value)); return e;
    };
    const listEdit = (key, ph) => {
      const box = h('div', { class: 'listedit' });
      const draw = () => box.replaceChildren(
        ...(m[key] || []).map((v, i) => {
          const e = h('input', { type: 'text', value: v, placeholder: ph });
          e.addEventListener('input', () => (m[key][i] = e.value));
          return h('div', { class: 'it' }, e, h('button', { class: 'btn ghost sm danger', type: 'button', 'aria-label': '削除', onclick: () => { m[key].splice(i, 1); draw(); } }, '✕'));
        }),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { (m[key] = m[key] || []).push(''); draw(); box.querySelector('.it:last-of-type input')?.focus(); } }, '＋ 追加'));
      draw(); return box;
    };
    const taskEdit = () => {
      const box = h('div', { class: 'taskedit' });
      const memberOpts = S.members.filter((x) => (x.orgIds || []).includes(m.orgId) || roleOf(x.role).all);
      const draw = () => box.replaceChildren(
        ...m.tasks.map((t, i) => {
          const tx = h('input', { type: 'text', value: t.text, placeholder: '何を（例：イベント案を3つ持ち寄る）' });
          tx.addEventListener('input', () => (t.text = tx.value));
          const who = h('select', { class: 'w', 'aria-label': '担当' }, h('option', { value: '', text: t.assignee && !t.assigneeId ? t.assignee : '担当を選択' }),
            memberOpts.map((x) => h('option', { value: x.id, selected: x.id === t.assigneeId, text: x.name })), h('option', { value: '__all', text: '参加者全員' }));
          who.addEventListener('change', () => {
            if (who.value === '__all') { t.assigneeId = ''; t.assignee = '参加者全員'; }
            else { t.assigneeId = who.value; t.assignee = (S.members.find((x) => x.id === who.value) || {}).name || ''; }
          });
          const due = h('input', { type: 'date', class: 'd', value: t.due || '', 'aria-label': '期限' });
          due.addEventListener('input', () => (t.due = due.value));
          const cb = h('input', { type: 'checkbox', checked: t.done, 'aria-label': '完了' });
          cb.addEventListener('change', () => (t.done = cb.checked));
          return h('div', { class: 'it' }, cb, tx, who, due, h('button', { class: 'btn ghost sm danger', type: 'button', 'aria-label': '削除', onclick: () => { m.tasks.splice(i, 1); draw(); } }, '✕'));
        }),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { m.tasks.push({ id: uid('t'), text: '', assigneeId: '', assignee: '', due: '', done: false }); draw(); } }, '＋ 宿題を追加'));
      draw(); return box;
    };
    const ta = (key, obj = m) => { const e = h('textarea', { rows: 2 }, obj[key] || ''); e.addEventListener('input', () => (obj[key] = e.value)); return e; };
    const parts = h('input', { type: 'text', value: (m.participants || []).join('・'), placeholder: '・区切りで入力' });
    parts.addEventListener('input', () => (m.participants = parts.value.split(/[・、,，]/).map((s) => s.trim()).filter(Boolean)));

    async function save(status) {
      m.status = status || m.status || 'draft';
      ['purpose', 'numbers', 'issues', 'decisions', 'participants'].forEach((k) => (m[k] = (m[k] || []).map((s) => s.trim()).filter(Boolean)));
      m.tasks = m.tasks.filter((t) => t.text.trim());
      if (!m.orgId || !m.date) { toast('店舗・部署と日付を入れてください'); return; }
      if (!Perm.canEdit(S.user, m)) { toast('この店舗・部署で保存する権限がありません'); return; }
      m.id = m.id || uid('mtg');
      m.createdBy = m.createdBy || S.user.memberId || S.user.email || '';
      try { await Store.put('meetings', m); } catch (e) { toast('保存できませんでした（権限がない可能性があります）'); return; }
      await reload(); refreshChrome();
      toast(m.status === 'published' ? '公開しました' : '下書きを保存しました');
      location.hash = '#/m/' + m.id;
    }

    setTop(id ? '議事録を編集' : '新しい議事録', '', [
      h('a', { class: 'btn ghost', href: id ? '#/m/' + id : '#/', text: 'キャンセル' }),
      h('button', { class: 'btn', onclick: () => save('draft') }, '下書き保存'),
      h('button', { class: 'btn primary', onclick: () => save('published') }, '公開する'),
    ]);

    $view.replaceChildren(h('div', { class: 'form' },
      h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: '会議情報' })), h('div', { class: 'bd form' },
        h('div', { class: 'two' },
          fld('店舗・部署', sel('orgId', editableOrgs.map((o) => [o.id, o.name]))),
          fld('会議の種類', sel('type', TYPES.map((t) => [t, t])))),
        fld('タイトル（空欄なら「店舗名 会議種類 議事録」）', inp('title')),
        h('div', { class: 'four' }, fld('日付', inp('date', 'date')), fld('開始', inp('start', 'time')), fld('終了', inp('end', 'time')), fld('場所', inp('place'))),
        fld('参加者', parts),
        fld('公開範囲', sel('visibility', Object.entries(VIS))))),
      section('1｜会議の目的・方針', listEdit('purpose', '例：今月の方針と売上目標を共有する')),
      section('2｜数値・実績', listEdit('numbers', '例：今月目標 2,500万')),
      section('3｜挙がった課題', listEdit('issues', '例：平日の予定件数が少ない')),
      section('4｜決定事項・共有ルール', listEdit('decisions', '例：来週から18時出勤')),
      section('5｜次回会議・宿題', h('div', { class: 'form' },
        h('div', { class: 'two' }, fld('次回の日時', inp('meeting', 'text', m.next)), fld('次回の主な内容', inp('content', 'text', m.next))),
        fld('宿題・依頼事項（誰が・何を・いつまで）', taskEdit()))),
      section('※継続検討', ta('pending')),
      m.transcript != null ? section('文字起こし（元データ）', (() => { const e = h('textarea', { rows: 8 }, m.transcript || ''); e.addEventListener('input', () => (m.transcript = e.value)); return e; })()) : null));
  }
  const section = (title, body) => h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: title })), h('div', { class: 'bd' }, body));

  // ======================= 新規作成 =======================
  function viewNew() {
    markNav('new');
    const editableOrgs = S.orgs.filter((o) => Perm.canCreateIn(S.user, o.id));
    if (!editableOrgs.length) {
      setTop('新しい議事録', ''); $view.replaceChildren(h('div', { class: 'card empty', text: '議事録を作成できるのは店長・部署長以上です。' })); return;
    }
    setTop('新しい議事録', '録音から議事録を作る');
    const st = { orgId: (editableOrgs.find((o) => S.storemode && o.id === S.scope) || editableOrgs[0]).id, type: '経営者会議', date: today(), file: null, transcript: '' };
    const orgSel = h('select', {}, editableOrgs.map((o) => h('option', { value: o.id, selected: o.id === st.orgId, text: o.name })));
    orgSel.addEventListener('change', () => (st.orgId = orgSel.value));
    const typeSel = h('select', {}, TYPES.map((t) => h('option', { value: t, text: t })));
    typeSel.addEventListener('change', () => (st.type = typeSel.value));
    const date = h('input', { type: 'date', value: st.date });
    date.addEventListener('input', () => (st.date = date.value));

    const fileIn = h('input', { type: 'file', accept: 'audio/*,.m4a,.mp3,.wav,.opus,.txt', hidden: true });
    const fileLbl = h('div', { text: 'ここに録音ファイルをドロップ、またはクリックして選択' });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', onclick: () => fileIn.click() },
      h('div', { style: { fontSize: '26px' }, text: '🎙' }), fileLbl, h('div', { class: 'small', text: 'm4a / mp3 / wav（スマホの録音・PLAUDの音声）、または文字起こしの .txt' }));
    const pick = async (f) => {
      if (!f) return;
      st.file = f;
      if (/\.txt$/i.test(f.name) || f.type === 'text/plain') { st.transcript = await f.text(); tr.value = st.transcript; fileLbl.textContent = `文字起こしを読み込みました：${f.name}`; }
      else fileLbl.textContent = `選択中：${f.name}（${(f.size / 1048576).toFixed(1)}MB）`;
    };
    fileIn.addEventListener('change', () => pick(fileIn.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); });
    const tr = h('textarea', { rows: 6, placeholder: 'PLAUDなどの文字起こしを貼り付けることもできます' });
    tr.addEventListener('input', () => (st.transcript = tr.value));

    const toEdit = (kind) => {
      viewEdit(null, {
        orgId: st.orgId, type: st.type, date: st.date, start: '', end: '', place: '', participants: [], visibility: 'exec', status: 'draft',
        purpose: [''], numbers: [], issues: [''], decisions: [''], next: { meeting: '', content: '' }, tasks: [], pending: '',
        transcript: st.transcript || '', source: { kind, fileName: st.file ? st.file.name : '' },
      });
    };

    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '820px' } },
      h('div', { class: 'steps' }, ['① 録音をアップロード', '② 自動で文字起こし', '③ Claudeが議事録に', '④ 確認・修正して公開'].map((s, i) => h('span', { class: i === 0 ? 'on' : '', text: s }))),
      h('div', { class: 'card' }, h('div', { class: 'bd form' },
        h('div', { class: 'two' }, h('div', {}, h('label', { class: 'f', text: '店舗・部署' }), orgSel), h('div', {}, h('label', { class: 'f', text: '会議の種類' }), typeSel)),
        h('div', { style: { maxWidth: '240px' } }, h('label', { class: 'f', text: '会議の日付' }), date),
        drop, fileIn,
        h('details', {}, h('summary', { class: 'small', style: { cursor: 'pointer' }, text: '文字起こしを貼り付ける' }), h('div', { style: { marginTop: '8px' } }, tr)))),
      h('div', { class: 'banner accent' },
        h('b', { text: '自動作成（②③）は第3段階で有効になります。' }),
        ' 録音を送るだけで、文字起こし → 見本と同じテンプレートの議事録（人名は名簿で補正）まで自動で作られます。今は手入力で作成できます。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: true, title: '第3段階で有効になります' }, '✦ Claudeで議事録を作成'),
        h('button', { class: 'btn', onclick: () => toEdit(st.transcript ? 'paste' : 'manual') }, '手入力で作成する'))));
  }

  // ======================= 宿題・依頼事項 =======================
  function viewTasks(mineOnly) {
    markNav(mineOnly ? 'mytasks' : 'tasks');
    const where = S.storemode && S.scope ? `${orgOf(S.scope).name}｜` : '';
    setTop(mineOnly ? '自分の宿題' : '宿題・依頼事項', where + '会議で決まった「誰が・何を・いつまで」');
    const st = viewTasks.st || (viewTasks.st = { show: 'open', mine: false });
    if (mineOnly) st.mine = true;
    const items = scoped().flatMap((m) => (m.tasks || []).map((t) => ({ m, t })))
      .filter(({ t }) => (st.show === 'open' ? !t.done : st.show === 'done' ? t.done : true))
      .filter(({ t }) => !st.mine || t.assigneeId === S.user.memberId)
      .sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999'));
    const tab = (k, label) => h('button', { class: 'orgchip' + (st.show === k ? ' on' : ''), onclick: () => { st.show = k; viewTasks(mineOnly); } }, label);
    const mine = h('label', { class: 'row small', style: { gap: '6px', cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: st.mine, onchange: (e) => { st.mine = e.target.checked; viewTasks(); } }), '自分の担当だけ');
    if (mineOnly) mine.style.display = 'none';
    const table = items.length ? h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['', '宿題', '担当', '期限', '会議'].map((x) => h('th', { text: x })))),
      h('tbody', {}, items.map(({ m, t }) => {
        const can = Perm.canCheckTask(S.user, m, t);
        const cb = h('input', { type: 'checkbox', checked: t.done, disabled: !can, 'aria-label': '完了' });
        cb.addEventListener('change', async () => {
          try { await setTaskDone(m, t.id, cb.checked); } catch (e) { toast('保存できませんでした'); }
          viewTasks(mineOnly);
        });
        return h('tr', {}, h('td', {}, cb), h('td', { style: t.done ? { textDecoration: 'line-through', color: 'var(--text-3)' } : {}, text: t.text }),
          h('td', { text: t.assignee || '未定' }),
          h('td', { class: isOverdue(t) ? 'overdue' : '', text: t.due ? fmtDate(t.due, false) : '—' }),
          h('td', {}, h('a', { href: '#/m/' + m.id }, h('span', { class: 'dot', style: { background: orgOf(m.orgId).color, marginRight: '6px' } }), `${orgOf(m.orgId).name} ${fmtDate(m.date, false).replace(/^\d+年/, '')}`)));
      })))) : h('div', { class: 'card empty', text: '該当する宿題はありません' });
    $view.replaceChildren(h('div', { class: 'row', style: { marginBottom: '14px' } }, tab('open', '未完了'), tab('done', '完了'), tab('all', 'すべて'), h('span', { class: 'spacer' }), mine), table);
  }

  // ======================= 名簿・権限 =======================
  function viewSettings() {
    markNav('settings');
    const admin = Perm.canAdmin(S.user);
    setTop('名簿・権限', admin ? '店舗・部署と、メンバーの役職・所属を管理' : '閲覧のみ（変更は代表のみ）', [h('a', { class: 'btn', href: '#/orgchart', text: '組織図を見る' })]);

    const roleTable = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['役職', '見られる議事録', '作成・編集'].map((x) => h('th', { text: x })))),
      h('tbody', {}, ROLES.map((r) => h('tr', {}, h('td', { text: r.name }),
        h('td', { text: r.all ? 'すべての店舗・部署' : '所属する店舗・部署（「幹部以上のみ」の会議は幹部以上）' }),
        h('td', { text: r.edit === 'all' ? 'すべて' : r.edit === 'own' ? '所属する店舗・部署' : 'できない（担当の宿題のチェックのみ）' })))));

    const orgRows = S.orgs.map((o) => {
      const name = h('input', { type: 'text', value: o.name, disabled: !admin, 'aria-label': '名前' });
      const color = h('input', { type: 'color', value: o.color, disabled: !admin, 'aria-label': '色', style: { width: '42px', height: '30px', padding: '2px' } });
      const kind = h('select', { disabled: !admin, 'aria-label': '区分' }, [['store', '店舗'], ['dept', '部署']].map(([v, t]) => h('option', { value: v, selected: o.kind === v, text: t })));
      const sv = async () => { await Store.put('orgs', { ...o, name: name.value.trim() || o.name, color: color.value, kind: kind.value }); await reload(); refreshChrome(); };
      [name, color, kind].forEach((e) => e.addEventListener('change', sv));
      return h('tr', {}, h('td', {}, color), h('td', {}, name), h('td', {}, kind));
    });
    const addOrg = admin ? h('button', { class: 'btn sm', onclick: async () => { await Store.put('orgs', { id: uid('org'), name: '新しい部署', kind: 'dept', color: '#8A8A9E' }); await reload(); viewSettings(); } }, '＋ 店舗・部署を追加') : null;

    const memRows = S.members.map((mb) => {
      const name = h('input', { type: 'text', value: mb.name, disabled: !admin, 'aria-label': '名前' });
      const alias = h('input', { type: 'text', value: (mb.aliases || []).join('・'), disabled: !admin, placeholder: '例：ひらがな表記・よくある誤変換', 'aria-label': '誤変換されやすい表記' });
      const role = h('select', { disabled: !admin, 'aria-label': '役職' }, ROLES.map((r) => h('option', { value: r.id, selected: mb.role === r.id, text: r.name })));
      const mail = h('input', { type: 'text', value: mb.email || '', disabled: !admin, placeholder: 'ログインするGoogleアドレス', 'aria-label': 'Googleアドレス', inputmode: 'email' });
      const orgs = h('div', { class: 'row', style: { gap: '4px' } }, S.orgs.map((o) => {
        const c = h('input', { type: 'checkbox', checked: (mb.orgIds || []).includes(o.id), disabled: !admin });
        c.addEventListener('change', sv);
        c.dataset.org = o.id;
        return h('label', { class: 'chip', style: { cursor: admin ? 'pointer' : 'default', gap: '4px' } }, c, o.name);
      }));
      async function sv() {
        const next = { ...mb, name: name.value.trim() || mb.name, role: role.value,
          email: mail.value.trim().toLowerCase(),
          aliases: alias.value.split(/[・、,，]/).map((s) => s.trim()).filter(Boolean),
          orgIds: [...orgs.querySelectorAll('input:checked')].map((c) => c.dataset.org) };
        try {
          await Store.put('members', next);
          await syncAccount(mb, next);
          Object.assign(mb, next);
        } catch (e) { toast('保存できませんでした'); }
        await reload(); refreshChrome();
      }
      [name, alias, role, mail].forEach((e) => e.addEventListener('change', sv));
      const del = admin && mb.id !== S.user.memberId ? h('button', { class: 'btn ghost sm danger', 'aria-label': '削除', onclick: async () => {
        if (!confirm(`${mb.name} を名簿から削除しますか？`)) return;
        await Store.del('members', mb.id); await syncAccount(mb, null); await reload(); refreshChrome(); viewSettings();
      } }, '✕') : null;
      return h('tr', {}, h('td', { style: { minWidth: '130px' } }, name), h('td', { style: { minWidth: '150px' } }, role), h('td', {}, orgs),
        Session.cloud ? h('td', { style: { minWidth: '200px' } }, mail) : null, h('td', { style: { minWidth: '160px' } }, alias), h('td', {}, del));
    });
    const addMem = admin ? h('button', { class: 'btn sm', onclick: async () => { await Store.put('members', { id: uid('m'), name: '新しいメンバー', aliases: [], role: 'staff', orgIds: [] }); await reload(); refreshChrome(); viewSettings(); } }, '＋ メンバーを追加') : null;

    // ログイン用の対応表(accounts/{メール})を名簿と同期する。ルールはこれを見て権限を判定する
    async function syncAccount(before, after) {
      if (!Session.cloud) return;
      const oldMail = (before && before.email) || '';
      const newMail = (after && after.email) || '';
      if (oldMail && oldMail !== newMail) await Store.del('accounts', oldMail);
      if (newMail) await Store.put('accounts', { id: newMail, memberId: after.id, name: after.name, role: after.role, orgIds: after.orgIds || [] });
    }

    // 店舗・部署が空のときの初期登録
    const seedOrgs = admin && !S.orgs.length ? h('div', { class: 'banner accent row' }, '店舗・部署がまだ登録されていません。',
      h('button', { class: 'btn sm primary', onclick: async () => {
        for (const o of window.MINUTES_DEMO.orgs) await Store.put('orgs', o);
        await reload(); refreshChrome(); viewSettings(); toast('5店舗と3部署を登録しました');
      } }, '5店舗＋運営本部・内勤チーム・経理部を登録')) : null;

    // 議事録の一括取り込み(JSON)
    const importBox = admin ? (() => {
      const fi = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
      fi.addEventListener('change', async () => {
        const f = fi.files[0]; if (!f) return;
        let arr;
        let kb = null;
        try {
          const j = JSON.parse(await f.text());
          if (j && Array.isArray(j.kb)) kb = j.kb;
          else arr = Array.isArray(j) ? j : j.meetings || [j];
        } catch (e) { toast('JSONを読み込めませんでした'); return; }
        // スパチョコの教え（AI相談用の知識）の取り込み
        if (kb) {
          if (!confirm(`スパチョコの教え ${kb.length}件を取り込みますか？（同じIDのものは上書き）`)) return;
          let n = 0;
          for (const k of kb) { try { await Store.put('kb', { ...k, id: k.id || uid('kb') }); n++; } catch (e) {} }
          toast(`教えを${n}件取り込みました`); return;
        }
        const known = new Set(S.orgs.map((o) => o.id));
        const bad = arr.filter((m) => !known.has(m.orgId));
        if (bad.length) { toast(`店舗・部署が未登録の議事録が${bad.length}件あります（先に登録してください）`); return; }
        if (!confirm(`${arr.length}件の議事録を取り込みますか？（同じIDのものは上書き）`)) return;
        let n = 0;
        for (const m of arr) { try { await Store.put('meetings', { ...m, id: m.id || uid('mtg') }); n++; } catch (e) {} }
        await reload(); refreshChrome(); toast(`${n}件取り込みました`); location.hash = '#/';
      });
      return h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: '議事録の取り込み' })),
        h('div', { class: 'bd row' }, h('span', { class: 'small muted', text: 'Claudeが作成した議事録データ、またはスパチョコの教え（.json）をまとめて登録します。' }), fi,
          h('button', { class: 'btn sm', onclick: () => fi.click() }, 'JSONファイルを選ぶ')));
    })() : null;

    const resetBtn = admin && !Session.cloud ? h('button', { class: 'btn ghost sm danger', onclick: async () => {
      if (!confirm('この端末に保存したデータを消して、サンプルの状態に戻しますか？')) return;
      await Store.reset(window.MINUTES_DEMO); await reload(); refreshChrome(); viewSettings(); toast('サンプルの状態に戻しました');
    } }, 'サンプルの状態に戻す') : null;

    $view.replaceChildren(h('div', { class: 'grid' },
      seedOrgs,
      section('役職ごとの権限', roleTable),
      h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: '店舗・部署' }), h('span', { class: 'spacer' }), addOrg),
        h('div', { class: 'bd', style: { overflow: 'auto' } }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['色', '名前', '区分'].map((x) => h('th', { text: x })))), h('tbody', {}, orgRows)))),
      h('div', { class: 'card' }, h('div', { class: 'hd' }, h('h3', { text: 'メンバー' }), h('span', { class: 'small muted', text: '「誤変換されやすい表記」は、AIが議事録を作るときに正しい名前へ直すのに使います' }), h('span', { class: 'spacer' }), addMem),
        h('div', { class: 'bd', style: { overflow: 'auto' } }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['名前', '役職', '所属', Session.cloud ? 'Googleアドレス（ログイン用）' : null, '誤変換されやすい表記', ''].filter((x) => x !== null).map((x) => h('th', { text: x })))), h('tbody', {}, memRows)))),
      importBox,
      resetBtn ? h('div', {}, resetBtn) : null));
  }

  // 会議の準備・進行モード(meeting-run.js)に渡す道具
  const CTX = { S, setTop, markNav, $view, orgOf, section, reload, refreshChrome, setTaskDone };

  // ======================= ルーター =======================
  function route() {
    const p = (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
    if (p[0] === 'm' && p[1] && p[2] === 'edit') viewEdit(p[1]);
    else if (p[0] === 'm' && p[1]) viewDetail(p[1]);
    else if (p[0] === 'new') viewNew();
    else if (p[0] === 'prep') window.MeetingRun.viewPrep(CTX, p[1]);
    else if (p[0] === 'coach') window.Coach.viewCoach(CTX, p[1]);
    else if (p[0] === 'karte') window.Coach.viewKarte(CTX, p[1]);
    else if (p[0] === 'learn') window.Learn.view(CTX, p[1]);
    else if (p[0] === 'run' && p[1]) window.MeetingRun.viewRun(CTX, p[1]);
    else if (p[0] === 'tasks') viewTasks(p[1] === 'mine');
    else if (p[0] === 'settings') viewSettings();
    else if (p[0] === 'orgchart') window.OrgChart.view(CTX);
    else viewList();
    window.scrollTo(0, 0);
  }

  // ログイン画面・未登録画面
  function gate() {
    document.querySelector('.rail').style.display = 'none';
    document.querySelector('.shell').style.gridTemplateColumns = '1fr';
    setTop('SPACHOCO 議事録', '');
    const box = h('div', { class: 'card', style: { maxWidth: '440px', margin: '40px auto' } }, h('div', { class: 'bd grid', style: { gap: '12px', textAlign: 'center', padding: '28px' } }));
    const bd = box.firstChild;
    if (!S.user) {
      bd.append(h('div', { class: 'brand', style: { justifyContent: 'center' } }, h('div', { class: 'mark', text: 'SC' }), h('div', { style: { textAlign: 'left' } }, h('b', { text: 'SPACHOCO OS' }), h('span', { text: '議事録' }))),
        h('p', { class: 'muted small', text: 'スパチョコのGoogleアカウントでログインしてください。' }),
        h('button', { class: 'btn primary', style: { justifyContent: 'center' }, onclick: async () => {
          try { await Session.signIn(); location.reload(); } catch (e) { toast('ログインできませんでした（' + (e.code || e.message) + '）'); }
        } }, 'Googleでログイン'));
    } else {
      bd.append(h('h3', { style: { margin: 0 }, text: 'まだ名簿に登録されていません' }),
        h('p', { class: 'small muted', text: `${S.user.email} でログインしています。代表に、名簿・権限の画面でこのアドレスを登録してもらってください。` }),
        h('button', { class: 'btn', style: { justifyContent: 'center' }, onclick: async () => { await Session.signOut(); location.reload(); } }, '別のアカウントでログイン'));
    }
    $view.replaceChildren(box);
  }

  (async function start() {
    try {
      await Store.init(window.MINUTES_DEMO);
      await Session.waitAuth();
      await reload();
    } catch (e) {
      console.error(e);
      $view.replaceChildren(h('div', { class: 'card empty', text: '読み込みに失敗しました。通信状況を確認して、再読み込みしてください。（' + (e.code || e.message) + '）' }));
      return;
    }
    if (!S.user || S.user.unregistered) { gate(); return; }
    refreshChrome();
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('rail').classList.toggle('open'));
    window.addEventListener('hashchange', route);
    route();
  })();
})();
