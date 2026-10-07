/* ===== 組織図（名簿・権限から自動で作る） =====
   店舗・部署ごとの人数・役職・兼任と、役職ごとに見られる範囲を1枚にまとめる。
   印刷（PDF）と、Notion・LINEに貼れるテキストのコピーができる。メールアドレスは出さない。 */
(function () {
  'use strict';
  const { h, toast, ROLES, roleOf } = OS;

  function build(S) {
    const orgs = S.orgs.slice();
    const members = S.members.slice().sort((a, b) => roleOf(b.role).level - roleOf(a.role).level || a.name.localeCompare(b.name, 'ja'));
    const top = members.filter((m) => roleOf(m.role).all);
    const byOrg = orgs.map((o) => ({ o, ms: members.filter((m) => (m.orgIds || []).includes(o.id)) }));
    const noOrg = members.filter((m) => !roleOf(m.role).all && !(m.orgIds || []).length);
    const kenmu = members.filter((m) => (m.orgIds || []).length > 1);
    return { orgs, members, top, byOrg, noOrg, kenmu };
  }
  const nameOf = (S, id) => (S.orgs.find((o) => o.id === id) || { name: id }).name;
  const count = (ms, role) => ms.filter((m) => m.role === role).length;
  const scopeText = (r) => r.all ? 'すべての店舗・部署' : '所属する店舗・部署' + (r.level >= 40 ? '' : '（「幹部以上のみ」の会議は見られない）');
  const editText = (r) => r.edit === 'all' ? 'すべて' : r.edit === 'own' ? '所属する店舗・部署' : 'できない（自分の宿題のチェックのみ）';

  function asText(S, d) {
    const L = [`# スパチョコ 組織図（${new Date().toISOString().slice(0, 10)} 時点）`, '', `総人数：${d.members.length}名（兼任 ${d.kenmu.length}名）`, ''];
    for (const r of ROLES.filter((r) => r.all)) {
      const ms = d.top.filter((m) => m.role === r.id);
      if (ms.length) L.push(`## ${r.name}`, ...ms.map((m) => `- ${m.name}`), '');
    }
    for (const [kind, label] of [['store', '店舗'], ['dept', '部署']]) {
      const rows = d.byOrg.filter(({ o }) => (o.kind || 'store') === kind);
      if (!rows.length) continue;
      L.push(`## ${label}`);
      for (const { o, ms } of rows) {
        L.push(`### ${o.name}（${ms.length}名）`);
        for (const r of ROLES) {
          const xs = ms.filter((m) => m.role === r.id);
          if (xs.length) L.push(`- ${r.name}：${xs.map((m) => m.name + ((m.orgIds || []).length > 1 ? `（兼：${m.orgIds.filter((x) => x !== o.id).map((x) => nameOf(S, x)).join('・')}）` : '')).join('、')}`);
        }
        if (!ms.length) L.push('- （未登録）');
      }
      L.push('');
    }
    if (d.noOrg.length) L.push('## 所属未設定', ...d.noOrg.map((m) => `- ${m.name}（${roleOf(m.role).name}）`), '');
    L.push('## 役職ごとの見られる範囲', '| 役職 | 見られる議事録 | 作成・編集 |', '|---|---|---|', ...ROLES.map((r) => `| ${r.name} | ${scopeText(r)} | ${editText(r)} |`));
    return L.join('\n');
  }

  function view(ctx) {
    const { S, setTop, markNav, $view, section } = ctx;
    markNav('orgchart');
    const d = build(S);
    const copy = async () => {
      const t = asText(S, d);
      try { await navigator.clipboard.writeText(t); } catch (e) { const a = h('textarea', {}, t); document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
      toast('テキストでコピーしました（Notion・LINEに貼れます）');
    };
    setTop('組織図', '名簿・権限から自動で作成（メールアドレスは表示しません）', [
      h('button', { class: 'btn noprint', onclick: copy }, 'テキストでコピー'),
      h('button', { class: 'btn primary noprint', onclick: () => window.print() }, '印刷・PDF'),
      h('a', { class: 'btn ghost noprint', href: '#/settings', text: '名簿を編集' })]);

    const person = (m, o) => {
      const other = (m.orgIds || []).filter((x) => !o || x !== o.id);
      return h('li', { class: 'oc-p' }, h('span', { class: 'oc-role r-' + m.role, text: roleOf(m.role).name.replace(/・.*/, '') }), h('span', { text: m.name }),
        other.length && o ? h('span', { class: 'oc-ken', text: '兼：' + other.map((x) => nameOf(S, x)).join('・') }) : null);
    };
    const topBox = h('div', { class: 'oc-top' }, ROLES.filter((r) => r.all).map((r) => {
      const ms = d.top.filter((m) => m.role === r.id);
      return ms.length ? h('div', { class: 'oc-node' }, h('div', { class: 'oc-h', text: r.name }), h('ul', {}, ms.map((m) => person(m)))) : null;
    }));
    const group = (kind, label) => {
      const rows = d.byOrg.filter(({ o }) => (o.kind || 'store') === kind);
      if (!rows.length) return null;
      return h('div', { class: 'oc-group' }, h('div', { class: 'oc-glabel', text: `${label}（${rows.length}）` }),
        h('div', { class: 'oc-grid' }, rows.map(({ o, ms }) => h('div', { class: 'oc-org', style: { borderTopColor: o.color || 'var(--accent)' } },
          h('div', { class: 'oc-h' }, h('span', { class: 'dot', style: { background: o.color } }), o.name, h('span', { class: 'oc-n', text: `${ms.length}名` })),
          ms.length ? h('ul', {}, ms.map((m) => person(m, o))) : h('div', { class: 'small muted', text: 'メンバー未登録' })))));
    };
    const summary = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['店舗・部署', '人数', '店長・部署長', '幹部', '内勤・スタッフ', '兼任者'].map((x) => h('th', { text: x })))),
      h('tbody', {}, d.byOrg.map(({ o, ms }) => h('tr', {},
        h('td', {}, h('span', { class: 'dot', style: { background: o.color, marginRight: '6px' } }), o.name),
        h('td', { text: ms.length }), h('td', { text: count(ms, 'manager') }), h('td', { text: count(ms, 'exec') }), h('td', { text: count(ms, 'staff') }),
        h('td', { text: ms.filter((m) => (m.orgIds || []).length > 1).map((m) => m.name).join('、') || '—' })))));
    const access = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['役職', '人数', '見られる議事録', '作成・編集'].map((x) => h('th', { text: x })))),
      h('tbody', {}, ROLES.map((r) => h('tr', {}, h('td', { text: r.name }), h('td', { text: d.members.filter((m) => m.role === r.id).length }), h('td', { text: scopeText(r) }), h('td', { text: editText(r) })))));

    $view.replaceChildren(h('div', { class: 'grid orgchart' },
      h('div', { class: 'stats' },
        h('div', { class: 'card stat' }, h('b', { text: d.members.length }), h('span', { text: '総人数' })),
        h('div', { class: 'card stat' }, h('b', { text: d.orgs.length }), h('span', { text: '店舗・部署' })),
        h('div', { class: 'card stat' }, h('b', { text: d.kenmu.length }), h('span', { text: '兼任者' }))),
      topBox, h('div', { class: 'oc-line' }),
      group('store', '店舗'), group('dept', '部署'),
      d.noOrg.length ? h('div', { class: 'banner warn', text: `所属が未設定の人：${d.noOrg.map((m) => m.name).join('、')}（名簿で所属を設定してください）` }) : null,
      section('店舗・部署ごとの人数', h('div', { style: { overflowX: 'auto' } }, summary)),
      section('役職ごとの見られる範囲（アクセス権限）', h('div', { style: { overflowX: 'auto' } }, access))));
  }
  window.OrgChart = { view, asText, build };
})();
