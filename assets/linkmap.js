/* ===== 連携マップ（宿題 × 相談先の部署） =====
   宿題ごとに「どの部署と組むと進むか」を出し、部署をまたいだ動きをひと目で見られるようにする。
   - マップ：店舗 → 相談先の部署 → 宿題 の枝分かれ
   - ロードマップ：部署ごとに、期限切れ／今週／来週／今月／来月以降／期限なし で並べる
   - 相談先ガイド：どんな宿題を、どの部署に相談するか
   相談先は宿題の文面から自動で提案し、宿題を押すと付け替えられる（task.links に保存）。 */
(function () {
  'use strict';
  const { h, toast, fmtDate } = OS;

  // 相談先の種類。match は「名簿の部署名にこの語が入っていれば、その部署につなぐ」
  const CATS = [
    { key: 'hr', label: '人事・採用', match: ['人事', '採用', '総務'], color: '#2C6E68', words: ['求人', '採用', '面接', '入店', '新人', '研修', '育成', '評価', '昇格', '降格', '離職', '退店', '体験', 'バディ', '寮'], ask: '求人・面接・新人の受け入れ、研修、評価や昇格の基準' },
    { key: 'pr', label: '広報・SNS', match: ['広報', 'PR', 'SNS'], color: '#C2410C', words: ['告知', 'SNS', 'インスタ', 'TikTok', 'ティックトック', 'X投稿', '投稿', '宣材', '撮影', 'ポップ', 'POP', '動画', '配信', 'ナンバー', 'No.'], ask: 'イベント告知、宣材撮影、SNS・動画の発信、ナンバー発表' },
    { key: 'acct', label: '経理・お金', match: ['経理', '会計', '財務'], color: '#0E9F6E', words: ['給料', '給与', '経費', '予算', '売掛', '請求', '入金', '支払', '精算', 'お金', '金額', '原価', '雑費', '報酬', '手当'], ask: '給与・報酬・手当、経費と予算、売掛・請求・精算' },
    { key: 'ops', label: '運営本部', match: ['運営', '本部', '統括'], color: '#4A4A5C', words: ['ルール', 'ガイドライン', 'コンプラ', '規約', '同意', 'トラブル', 'クレーム', 'ポイント', '最優秀', '店舗間', '異動', '方針', '組織'], ask: 'ルールやガイドライン、トラブル・クレーム対応、店舗をまたぐ制度' },
    { key: 'naikin', label: '内勤', match: ['内勤'], color: '#B7791F', words: ['清掃', '掃除', '備品', '発注', '在庫', 'シフト', '出勤', '送迎', '卓', 'ボトル', 'シャンパン', 'タワー', '準備'], ask: '店内オペレーション、備品・在庫、シフトや出勤、イベント当日の準備' },
    { key: 'event', label: 'イベント・企画', match: ['企画', 'イベント'], color: '#7C4DFF', words: ['イベント', '企画', 'バースデー', '周年', 'コスプレ', '表彰', 'キックオフ', 'キャンペーン'], ask: 'イベントや企画の立案、表彰式、キャンペーン' },
  ];
  const NONE = { key: 'none', label: '店舗内で完結', name: '店舗内で完結', color: '#8A8A9E', ask: '他部署の手を借りずに進められるもの' };

  // 課題・宿題のテーマ（グループ）。文面に入っている言葉の数で振り分ける
  const THEMES = [
    { key: 'sales', label: '売上・数字', color: '#2C6E68', words: ['売上', '数字', '目標', '締め', '単価', 'KPI', '件数', '本数', '指名', 'ランキング', '実績'] },
    { key: 'acq', label: '集客・新規', color: '#C2410C', words: ['集客', '新規', '初回', '案内所', 'キャッチ', '呼び込み', '種まき', '予定', '同伴', '枝', '紹介'] },
    { key: 'cust', label: '顧客・再来店', color: '#B83280', words: ['顧客', 'お客様', '再来店', 'リピート', '飲み直し', '来店', 'クレーム', '満足', 'カルテ'] },
    { key: 'edu', label: '教育・育成', color: '#2B6CB0', words: ['教育', '育成', '研修', '新人', 'マニュアル', '指導', '面談', 'バディ', '練習', 'ロールプレイ', '夢ノート'] },
    { key: 'hr', label: '採用・人', color: '#0E9F6E', words: ['採用', '求人', '面接', '入店', '体験', '離職', '退店', '人員', '人数'] },
    { key: 'team', label: 'チーム・組織', color: '#7C4DFF', words: ['チーム', '組織', '幹部', '役割', '担当', '体制', '報連相', '連携', '相談先', '承認', '評価', '昇格'] },
    { key: 'ops', label: '店内オペレーション', color: '#B7791F', words: ['清掃', '掃除', '出勤', '遅刻', 'シフト', '備品', '在庫', '卓', 'ヘルプ', '閉め', '残る', '手順', '作業', 'LINE'] },
    { key: 'event', label: 'イベント・企画', color: '#D53F8C', words: ['イベント', '企画', 'バースデー', '周年', 'コスプレ', '表彰', 'シャンパン', 'タワー', 'キャンペーン'] },
    { key: 'pr', label: '発信・SNS', color: '#DD6B20', words: ['SNS', '告知', '投稿', 'インスタ', 'TikTok', '配信', '動画', '宣材', '撮影', '更新'] },
    { key: 'rule', label: 'ルール・規律', color: '#4A4A5C', words: ['ルール', '規律', 'ガイドライン', 'コンプラ', '禁止', '同意', '徹底', '時間', '経費', 'フロー'] },
  ];
  const OTHER = { key: 'other', label: 'そのほか', color: '#8A8A9E', words: [] };
  function themeKeyOf(text) {
    let best = null, n = 0;
    THEMES.forEach((th) => { const c = th.words.filter((w) => (text || '').includes(w)).length; if (c > n) { n = c; best = th.key; } });
    return best || 'other';
  }
  const themeOfTask = (t) => t.theme || themeKeyOf(t.text);
  const themeByKey = (k) => THEMES.find((x) => x.key === k) || OTHER;

  // 名簿の部署（kind: dept）と、相談先の種類をつなぐ
  function destsOf(S) {
    const depts = S.orgs.filter((o) => o.kind === 'dept');
    return CATS.map((c) => {
      const org = depts.find((o) => c.match.some((w) => o.name.includes(w)));
      return { ...c, orgId: org ? org.id : '', name: org ? org.name : c.label, color: (org && org.color) || c.color };
    });
  }
  function suggest(t) {
    const tx = t.text || '';
    return CATS.filter((c) => c.words.some((w) => tx.includes(w))).map((c) => c.key);
  }
  // 付け替え済みなら task.links、なければ文面からの提案
  const linksOf = (t) => (Array.isArray(t.links) ? t.links : suggest(t));

  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  function bucketOf(t) {
    const d = t.due, td = today();
    if (!d) return 'none';
    if (d < td) return 'over';
    const dow = new Date(td + 'T00:00:00').getDay();
    const endWeek = addDays(td, (7 - dow) % 7);       // 今週の日曜まで
    if (d <= endWeek) return 'w0';
    if (d <= addDays(endWeek, 7)) return 'w1';
    if (d.slice(0, 7) === td.slice(0, 7)) return 'm0';
    return 'later';
  }
  const BUCKETS = [['over', '期限切れ'], ['w0', '今週'], ['w1', '来週'], ['m0', '今月中'], ['later', '来月以降'], ['none', '期限なし']];

  async function saveTask(ctx, m, taskId, fields) {
    const fresh = await OS.Store.get('meetings', m.id);
    if (!fresh) return;
    const tasks = (fresh.tasks || []).map((x) => (x.id === taskId ? { ...x, ...fields } : x));
    await OS.Store.patch('meetings', m.id, { tasks });
    await ctx.reload(); ctx.refreshChrome();
  }

  function view(ctx, tab) {
    const { S, setTop, markNav, $view, orgOf } = ctx;
    markNav('linkmap');
    tab = tab || 'theme';
    const st = view.st || (view.st = { open: true });
    const scopeOrg = S.storemode && S.scope ? orgOf(S.scope) : null;
    const dests = destsOf(S);
    const destOf = (k) => dests.find((d) => d.key === k) || NONE;
    const items = S.meetings.filter((m) => OS.Perm.canView(S.user, m) && (!scopeOrg || m.orgId === scopeOrg.id))
      .flatMap((m) => (m.tasks || []).map((t) => ({ m, t })))
      .filter(({ t }) => !st.open || !t.done)
      .sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999'));
    const keysOf = (t) => { const k = linksOf(t); return k.length ? k : ['none']; };

    const tabs = h('div', { class: 'row', style: { marginBottom: '12px' } },
      [['theme', 'テーマ別'], ['map', '部署マップ'], ['road', 'ロードマップ'], ['guide', '相談先ガイド']].map(([k, label]) =>
        h('a', { class: 'orgchip' + (tab === k ? ' on' : ''), href: '#/linkmap/' + k, text: label })),
      h('span', { class: 'spacer' }),
      tab === 'guide' ? null : h('label', { class: 'row small', style: { gap: '6px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: st.open, onchange: (e) => { st.open = e.target.checked; view(ctx, tab); } }), '未完了だけ'));
    setTop('連携マップ', (scopeOrg ? `${scopeOrg.name}｜` : '') + '宿題を、どの部署と組めば進むか');

    // 宿題を押すと、相談先を付け替えるパネルを開く
    function editPanel(m, t) {
      const can = OS.Perm.canEdit(S.user, m) || t.assigneeId === S.user.memberId;
      const cur = new Set(linksOf(t));
      const themeSel = h('select', { disabled: !can, 'aria-label': 'テーマ' }, [...THEMES, OTHER].map((th) => h('option', { value: th.key, selected: th.key === themeOfTask(t), text: th.label })));
      const box = h('div', { class: 'card', style: { position: 'fixed', right: '16px', bottom: '16px', width: 'min(420px, calc(100vw - 32px))', zIndex: 60, boxShadow: 'var(--shadow)' } },
        h('div', { class: 'hd' }, h('h3', { text: 'テーマと相談先' }), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: () => box.remove() }, '閉じる')),
        h('div', { class: 'bd grid', style: { gap: '10px' } },
          h('div', { style: { fontWeight: 600 }, text: t.text }),
          h('div', { class: 'small muted', text: `${orgOf(m.orgId).name}｜${t.assignee || '担当未定'}｜${t.due ? '期限 ' + fmtDate(t.due, false) : '期限なし'}` }),
          h('div', { class: 'row', style: { gap: '8px' } }, h('b', { class: 'small', text: 'テーマ' }), themeSel,
            h('span', { class: 'small muted', text: t.theme ? '付け替え済み' : '文面から提案' })),
          h('b', { class: 'small', text: '相談先の部署' }),
          h('div', { class: 'small', text: Array.isArray(t.links) ? '付け替え済み' : `文面からの提案：${suggest(t).map((k) => destOf(k).name).join('・') || 'なし（店舗内で完結）'}` }),
          h('div', { class: 'grid', style: { gap: '6px' } }, dests.map((d) => {
            const cb = h('input', { type: 'checkbox', checked: cur.has(d.key), disabled: !can });
            cb.addEventListener('change', () => (cb.checked ? cur.add(d.key) : cur.delete(d.key)));
            return h('label', { class: 'row', style: { gap: '8px', cursor: can ? 'pointer' : 'default' } }, cb,
              h('span', { class: 'dot', style: { background: d.color } }), h('b', { text: d.name }), h('span', { class: 'small muted', text: d.ask }));
          })),
          can ? h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: async () => {
              const th = themeSel.value === themeKeyOf(t.text) && !t.theme ? null : themeSel.value;
              try { await saveTask(ctx, m, t.id, { links: [...cur], theme: th }); toast('保存しました'); box.remove(); view(ctx, tab); } catch (e) { toast('保存できませんでした'); }
            } }, '保存'),
            Array.isArray(t.links) || t.theme ? h('button', { class: 'btn ghost', onclick: async () => {
              try { await saveTask(ctx, m, t.id, { links: null, theme: null }); toast('文面からの提案に戻しました'); box.remove(); view(ctx, tab); } catch (e) { toast('保存できませんでした'); }
            } }, '提案に戻す') : null,
            h('a', { class: 'btn ghost', href: m.kind === 'board' ? '#/board' : '#/m/' + m.id, text: m.kind === 'board' ? 'タスク管理を開く' : '議事録を開く' }))
            : h('div', { class: 'small muted', text: '付け替えられるのは、その会議の編集者と宿題の担当者です' })));
      document.querySelectorAll('.lm-panel').forEach((x) => x.remove());
      box.classList.add('lm-panel');
      document.body.append(box);
    }
    const chip = (m, t, showOrg) => {
      const o = orgOf(m.orgId);
      const over = !t.done && t.due && t.due < today();
      return h('button', { class: 'lm-task' + (t.done ? ' done' : '') + (over ? ' over' : ''), style: { borderLeftColor: o.color || 'var(--accent)' }, onclick: () => editPanel(m, t) },
        h('span', { class: 'tx', text: t.text }),
        h('span', { class: 'meta', text: [showOrg ? o.name : null, t.assignee || '担当未定', t.due ? fmtDate(t.due, false).replace(/^\d+年/, '') : '期限なし'].filter(Boolean).join('｜') }));
    };

    let body;
    if (tab === 'theme') {
      // テーマ → 課題（議事録の「課題」）→ 宿題。同じ会議で同じテーマの宿題を、その課題の下に置く
      const mtgs = S.meetings.filter((m) => OS.Perm.canView(S.user, m) && (!scopeOrg || m.orgId === scopeOrg.id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const issues = mtgs.flatMap((m) => (m.issues || []).filter(Boolean).map((text, i) => ({ m, text, key: themeKeyOf(text), id: m.id + ':' + i })));
      const used = [...THEMES, OTHER].filter((th) => issues.some((x) => x.key === th.key) || items.some(({ t }) => themeOfTask(t) === th.key));
      if (!used.length) body = h('div', { class: 'card empty', text: '課題・宿題はまだありません' });
      else body = h('div', { class: 'lm-themes' }, used.map((th) => {
        const tks = items.filter(({ t }) => themeOfTask(t) === th.key);
        const iss = issues.filter((x) => x.key === th.key);
        const placed = new Set();
        const issueNodes = iss.map((x) => {
          const kids = tks.filter(({ m }) => m.id === x.m.id);
          kids.forEach(({ t }) => placed.add(t.id + x.m.id));
          if (st.open && !kids.length && x.m.date < (mtgs.find((mm) => mm.orgId === x.m.orgId) || x.m).date) return null; // 古い会議の、宿題がない課題は省く
          return h('li', {},
            h('div', { class: 'lm-issue' }, h('span', { class: 'lm-tag', text: '課題' }), h('span', { text: x.text }),
              h('a', { class: 'lm-src', href: '#/m/' + x.m.id, text: `${scopeOrg ? '' : orgOf(x.m.orgId).name + ' '}${fmtDate(x.m.date, false).replace(/^\d+年/, '')}` }),
              kids.length ? null : h('span', { class: 'chip warn', text: '宿題が決まっていない' })),
            kids.length ? h('ul', {}, kids.map(({ m, t }) => h('li', {}, chip(m, t, !scopeOrg)))) : null);
        }).filter(Boolean);
        const loose = tks.filter(({ m, t }) => !placed.has(t.id + m.id));
        const over = tks.filter(({ t }) => !t.done && t.due && t.due < today()).length;
        const noTask = issueNodes.filter((li) => li.querySelector('.chip.warn')).length;
        const node = h('details', { class: 'card lm-theme', open: true, style: { borderTop: `4px solid ${th.color}` } },
          h('summary', { class: 'hd' }, h('span', { class: 'dot', style: { background: th.color } }), h('h3', { text: th.label }),
            h('span', { class: 'small muted', text: `課題 ${issueNodes.length}・宿題 ${tks.length}` }),
            over ? h('span', { class: 'chip warn', text: `期限切れ ${over}` }) : null,
            noTask ? h('span', { class: 'chip', text: `宿題なしの課題 ${noTask}` }) : null),
          h('div', { class: 'bd' }, h('ul', { class: 'lm-tree' },
            issueNodes,
            loose.length ? h('li', {}, h('div', { class: 'lm-issue' }, h('span', { class: 'lm-tag', text: '宿題' }), h('span', { class: 'muted', text: '課題にひもづかない宿題' })),
              h('ul', {}, loose.map(({ m, t }) => h('li', {}, chip(m, t, !scopeOrg))))) : null)));
        node.style.setProperty('--lm', th.color); // 枝の線とラベルをテーマの色に
        return node;
      }));
    } else if (tab === 'guide') {
      body = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' } },
        [...dests, NONE].map((d) => h('div', { class: 'card', style: { borderTop: `4px solid ${d.color}` } },
          h('div', { class: 'hd' }, h('span', { class: 'dot', style: { background: d.color } }), h('h3', { text: d.name }),
            d.key !== 'none' && !d.orgId ? h('span', { class: 'chip warn', text: '名簿に部署なし' }) : null),
          h('div', { class: 'bd grid', style: { gap: '6px' } },
            h('div', { class: 'small', text: d.ask }),
            d.words ? h('div', { class: 'small muted', text: 'こんな言葉が入った宿題：' + d.words.slice(0, 10).join('・') }) : null,
            h('div', { class: 'small', text: `いまの宿題：${items.filter(({ t }) => keysOf(t).includes(d.key)).length}件` })))));
    } else if (!items.length) {
      body = h('div', { class: 'card empty', text: '該当する宿題はありません' });
    } else if (tab === 'road') {
      const rows = [...dests, NONE].filter((d) => items.some(({ t }) => keysOf(t).includes(d.key)));
      body = h('div', { class: 'card', style: { overflowX: 'auto' } }, h('table', { class: 'tbl lm-road' },
        h('thead', {}, h('tr', {}, h('th', { text: '相談先' }), BUCKETS.map(([, label]) => h('th', { text: label })))),
        h('tbody', {}, rows.map((d) => h('tr', {},
          h('td', { class: 'lm-dest' }, h('span', { class: 'dot', style: { background: d.color } }), d.name),
          BUCKETS.map(([b]) => h('td', { class: b === 'over' ? 'lm-overcol' : '' },
            items.filter(({ t }) => keysOf(t).includes(d.key) && bucketOf(t) === b).map(({ m, t }) => chip(m, t, !scopeOrg)))))))));
    } else {
      // マップ：左に店舗（またはグループ）、真ん中に部署、右に宿題。線は描画後にSVGで引く
      const stores = scopeOrg ? [scopeOrg] : S.orgs.filter((o) => items.some(({ m }) => m.orgId === o.id));
      const rootLabel = scopeOrg ? scopeOrg.name : 'スパチョコ';
      const used = [...dests, NONE].filter((d) => items.some(({ t }) => keysOf(t).includes(d.key)));
      const root = h('div', { class: 'lm-root' }, h('b', { text: rootLabel }), h('span', { class: 'small', text: `宿題 ${items.length}件` }),
        scopeOrg ? null : h('div', { class: 'lm-stores' }, stores.map((o) => h('span', { class: 'lm-store' }, h('span', { class: 'dot', style: { background: o.color } }), o.name))));
      const branches = used.map((d) => {
        const rows = items.filter(({ t }) => keysOf(t).includes(d.key));
        const over = rows.filter(({ t }) => !t.done && t.due && t.due < today()).length;
        return h('div', { class: 'lm-branch' },
          h('div', { class: 'lm-dept', style: { borderColor: d.color }, 'data-dest': d.key },
            h('span', { class: 'dot', style: { background: d.color } }), h('b', { text: d.name }),
            h('span', { class: 'small muted', text: `${rows.length}件` }), over ? h('span', { class: 'chip warn', text: `期限切れ ${over}` }) : null),
          h('div', { class: 'lm-leaves' }, rows.map(({ m, t }) => chip(m, t, !scopeOrg))));
      });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'lm-lines');
      body = h('div', { class: 'card' }, h('div', { class: 'lm-map' }, svg, root, h('div', { class: 'lm-branches' }, branches)));
      const draw = () => {
        const wrap = body.querySelector('.lm-map'); if (!wrap || !wrap.isConnected) { window.removeEventListener('resize', draw); return; }
        const W = wrap.getBoundingClientRect();
        svg.setAttribute('width', W.width); svg.setAttribute('height', W.height);
        const R = root.getBoundingClientRect();
        const paths = [];
        const curve = (x1, y1, x2, y2, c) => { const mx = (x1 + x2) / 2; paths.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${c}" />`); };
        wrap.querySelectorAll('.lm-branch').forEach((br) => {
          const dept = br.querySelector('.lm-dept'); const D = dept.getBoundingClientRect();
          const color = dept.style.borderColor || '#999';
          curve(R.right - W.left, R.top + R.height / 2 - W.top, D.left - W.left, D.top + D.height / 2 - W.top, color);
          br.querySelectorAll('.lm-task').forEach((tk) => { const T = tk.getBoundingClientRect(); curve(D.right - W.left, D.top + D.height / 2 - W.top, T.left - W.left, T.top + T.height / 2 - W.top, color); });
        });
        svg.innerHTML = paths.join('');
      };
      requestAnimationFrame(draw);
      window.addEventListener('resize', draw);
    }
    $view.replaceChildren(...[tabs,
      tab === 'guide' ? null : h('div', { class: 'small muted', style: { margin: '-4px 0 10px' }, text: tab === 'theme' ? '議事録の「課題」と「宿題」を、文面からテーマ別に分けています。宿題を押すと、テーマと相談先を付け替えられます。' : '宿題を押すと、相談先の部署を付け替えられます。相談先は宿題の文面から自動で提案しています。' }),
      body].filter(Boolean));
  }

  window.LinkMap = { view, suggest, linksOf, destsOf, CATS, THEMES, OTHER, themeOfTask, themeByKey, themeKeyOf };
})();
