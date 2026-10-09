/* ===== 店舗のまとめ（グループのアイコン＋件数の通知） =====
   店舗ごとに、課題・宿題・タスクをテーマ（グループ）のアイコンにまとめる。
   ふだんはアイコンと件数だけを出し、タップするとそのグループの中身が一覧で開く。
   件数 = 終わっていない宿題・タスク ＋ 宿題が決まっていない課題（各店舗の最新の会議のもの）。 */
(function () {
  'use strict';
  const { h, fmtDate } = OS;
  const ICON = { sales: '💰', acq: '🧲', cust: '💬', edu: '📘', hr: '🤝', team: '👥', ops: '🧹', event: '🎉', pr: '📣', rule: '📏', other: '📌' };
  const today = () => new Date().toISOString().slice(0, 10);

  // 店舗ごと・テーマごとに、課題と宿題・タスクを集める
  function collect(S, orgId) {
    const LM = window.LinkMap;
    const mtgs = S.meetings.filter((m) => m.orgId === orgId && OS.Perm.canView(S.user, m));
    const latest = mtgs.filter((m) => m.kind !== 'board').sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const tasks = mtgs.flatMap((m) => (m.tasks || []).filter((t) => !t.done).map((t) => ({ m, t })));
    const issues = latest ? (latest.issues || []).filter(Boolean).map((text) => ({ m: latest, text, key: LM.themeKeyOf(text) })) : [];
    const groups = {};
    const g = (k) => (groups[k] = groups[k] || { issues: [], tasks: [] });
    tasks.forEach((x) => g(LM.themeOfTask(x.t)).tasks.push(x));
    issues.forEach((x) => {
      const kids = tasks.filter(({ m, t }) => m.id === x.m.id && LM.themeOfTask(t) === x.key);
      g(x.key).issues.push({ ...x, kids });
    });
    Object.values(groups).forEach((gr) => {
      gr.noTask = gr.issues.filter((x) => !x.kids.length).length;
      gr.over = gr.tasks.filter(({ t }) => t.due && t.due < today()).length;
      gr.count = gr.tasks.length + gr.noTask;
    });
    return { groups, latest };
  }

  function view(ctx) {
    const { S, setTop, markNav, $view, orgOf } = ctx;
    const LM = window.LinkMap;
    markNav('home');
    const st = view.st || (view.st = { open: {} });
    const scopeOrg = S.storemode && S.scope ? orgOf(S.scope) : null;
    const myOrgIds = OS.roleOf(S.user.role).all ? S.orgs.map((o) => o.id) : (S.user.orgIds || []);
    const orgs = scopeOrg ? [scopeOrg] : S.orgs.filter((o) => myOrgIds.includes(o.id) && S.meetings.some((m) => m.orgId === o.id));
    setTop(scopeOrg ? `${scopeOrg.name}のまとめ` : '店舗のまとめ', '課題・宿題・タスクをグループごとに。アイコンを押すと中身が開きます');

    const themes = [...LM.THEMES, LM.OTHER];
    const statusLabel = (t) => (window.Board ? { todo: '未着手', doing: '進行中', hold: '保留', done: '完了' }[window.Board.statusOf(t)] : '');
    const taskRow = ({ m, t }) => {
      const over = t.due && t.due < today();
      return h('li', { class: 'hm-item' },
        h('span', { class: 'hm-kind', text: m.kind === 'board' ? 'タスク' : '宿題' }),
        h('span', { class: 'hm-tx', text: t.text }),
        h('span', { class: 'hm-meta' + (over ? ' overdue' : ''), text: [t.assignee || '担当未定', t.due ? fmtDate(t.due, false).replace(/^\d+年/, '') : '期限なし', statusLabel(t)].filter(Boolean).join('｜') }));
    };

    const sections = orgs.map((o) => {
      const { groups, latest } = collect(S, o.id);
      const keys = themes.filter((th) => groups[th.key] && groups[th.key].count);
      const total = keys.reduce((n, th) => n + groups[th.key].count, 0);
      const openKey = st.open[o.id];
      const tiles = h('div', { class: 'hm-tiles' }, keys.map((th) => {
        const gr = groups[th.key];
        return h('button', { class: 'hm-tile' + (openKey === th.key ? ' on' : ''), style: { '--c': th.color }, 'aria-expanded': openKey === th.key ? 'true' : 'false',
          onclick: () => { st.open[o.id] = openKey === th.key ? '' : th.key; view(ctx); } },
          h('span', { class: 'hm-ic', text: ICON[th.key] || '📌' }),
          h('span', { class: 'hm-lb', text: th.label }),
          h('span', { class: 'hm-badge' + (gr.over ? ' red' : ''), text: gr.count > 99 ? '99+' : gr.count, 'aria-label': `${gr.count}件${gr.over ? `、期限切れ${gr.over}件` : ''}` }));
      }));
      tiles.querySelectorAll('.hm-tile').forEach((el, i) => el.style.setProperty('--c', keys[i].color));
      let detail = null;
      if (openKey && groups[openKey]) {
        const gr = groups[openKey], th = LM.themeByKey(openKey);
        const placed = new Set(gr.issues.flatMap((x) => x.kids.map(({ t }) => t.id)));
        const loose = gr.tasks.filter(({ t }) => !placed.has(t.id));
        detail = h('div', { class: 'hm-detail', style: { borderColor: th.color } },
          h('div', { class: 'row' }, h('b', { text: `${ICON[openKey] || ''} ${th.label}` }),
            h('span', { class: 'small muted', text: `宿題・タスク ${gr.tasks.length}件${gr.noTask ? `・宿題が決まっていない課題 ${gr.noTask}件` : ''}${gr.over ? `・期限切れ ${gr.over}件` : ''}` }),
            h('span', { class: 'spacer' }), h('a', { class: 'btn sm ghost', href: '#/board', text: 'タスク管理で動かす' })),
          gr.issues.length ? h('div', { class: 'hm-block' }, h('div', { class: 'hm-h', text: `課題（${latest ? fmtDate(latest.date, false).replace(/^\d+年/, '') + 'の会議' : ''}）` }),
            h('ul', {}, gr.issues.map((x) => h('li', { class: 'hm-issue' },
              h('div', {}, h('span', { text: x.text }), x.kids.length ? null : h('span', { class: 'chip warn', style: { marginLeft: '6px' }, text: '宿題が決まっていない' })),
              x.kids.length ? h('ul', {}, x.kids.map(taskRow)) : null)))) : null,
          loose.length ? h('div', { class: 'hm-block' }, h('div', { class: 'hm-h', text: '宿題・タスク' }), h('ul', {}, loose.map(taskRow))) : null);
      }
      return h('div', { class: 'card hm-store', style: { borderTop: `4px solid ${o.color || 'var(--accent)'}` } },
        h('div', { class: 'hd' }, h('span', { class: 'dot', style: { background: o.color } }), h('h3', { text: o.name }),
          h('span', { class: 'small muted', text: total ? `たまっているもの ${total}件` : 'たまっているものはありません' }),
          h('span', { class: 'spacer' }), scopeOrg ? null : h('button', { class: 'btn sm ghost', onclick: () => ctx.setScope && ctx.setScope(o.id) }, 'この店舗を開く')),
        h('div', { class: 'bd' }, keys.length ? tiles : h('div', { class: 'small muted', text: '課題・宿題・タスクはありません' }), detail));
    });
    $view.replaceChildren(h('div', { class: 'grid', style: { gap: '16px' } }, sections.length ? sections : h('div', { class: 'card empty', text: '表示できる店舗・部署がありません' })));
  }

  // 店舗アイコンに出す件数（グループの合計）
  function countFor(S, orgId) {
    const { groups } = collect(S, orgId);
    return Object.values(groups).reduce((n, g) => n + g.count, 0);
  }
  window.Home = { view, countFor, collect };
})();
