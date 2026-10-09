/* ===== タスク管理（ボード） =====
   会議で決まった宿題と、会議を通さずに出てきたタスクを、1つのボードで動かす。
   - 列：未着手／進行中／保留／完了（カードの ◀ ▶ で動かす）
   - 会議以外のタスクは、店舗・部署ごとの「タスクボード」文書（meetings に kind:'board'）に入れる。
     議事録と同じ保存先なので、見られる人・宿題を動かせる人の決まり（権限ルール）もそのまま使える。 */
(function () {
  'use strict';
  const { h, toast, uid, fmtDate } = OS;
  const COLS = [['todo', '未着手'], ['doing', '進行中'], ['hold', '保留'], ['done', '完了']];
  const today = () => new Date().toISOString().slice(0, 10);

  const isBoard = (m) => m.kind === 'board';
  function statusOf(t) {
    if (t.done) return 'done';
    if (t.status) return t.status;
    const p = t.progress && t.progress.status; // 会議前の進捗確認の答え
    return p === 'doing' ? 'doing' : 'todo';
  }

  async function patchTask(ctx, m, taskId, fields) {
    const fresh = await OS.Store.get('meetings', m.id);
    if (!fresh) throw new Error('not found');
    const tasks = (fresh.tasks || []).map((x) => (x.id === taskId ? { ...x, ...fields } : x));
    await OS.Store.patch('meetings', m.id, { tasks });
    await ctx.reload(); ctx.refreshChrome();
  }
  const setStatus = (ctx, m, t, s) => patchTask(ctx, m, t.id, {
    status: s, done: s === 'done', doneAt: s === 'done' ? new Date().toISOString() : null,
    doneBy: s === 'done' ? (ctx.S.user.memberId || ctx.S.user.email || '') : null,
  });

  // 店舗・部署ごとのタスクボード文書。なければ作る（作れるのは店長・部署長以上）
  async function addTask(ctx, orgId, task) {
    const { S } = ctx;
    const board = S.meetings.find((m) => isBoard(m) && m.orgId === orgId);
    if (board) {
      const fresh = await OS.Store.get('meetings', board.id);
      await OS.Store.patch('meetings', board.id, { tasks: [...((fresh && fresh.tasks) || []), task] });
    } else {
      await OS.Store.put('meetings', {
        id: 'board_' + orgId, kind: 'board', orgId, type: 'タスク', title: 'タスクボード', date: '', start: '',
        status: 'published', visibility: 'org', participants: [], purpose: [], numbers: [], issues: [], decisions: [],
        next: { meeting: '', content: '' }, pending: '', tasks: [task], source: { kind: 'board' },
      });
    }
    await ctx.reload(); ctx.refreshChrome();
  }

  function view(ctx, sub) {
    const { S, setTop, markNav, $view, orgOf } = ctx;
    const LM = window.LinkMap;
    const mineOnly = sub === 'mine';
    markNav(mineOnly ? 'myboard' : 'board');
    const st = view.st || (view.st = { theme: '', who: '', src: '', showDone: false, adding: false });
    const scopeOrg = S.storemode && S.scope ? orgOf(S.scope) : null;
    const me = S.user.memberId;
    const all = S.meetings.filter((m) => OS.Perm.canView(S.user, m) && (!scopeOrg || m.orgId === scopeOrg.id))
      .flatMap((m) => (m.tasks || []).map((t) => ({ m, t })));
    const items = all
      .filter(({ t }) => !mineOnly || t.assigneeId === me)
      .filter(({ t }) => !st.who || (st.who === 'me' ? t.assigneeId === me : st.who === 'none' ? !t.assigneeId : t.assigneeId === st.who))
      .filter(({ t }) => !st.theme || LM.themeOfTask(t) === st.theme)
      .filter(({ m }) => !st.src || (st.src === 'board' ? isBoard(m) : !isBoard(m)))
      .sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999'));
    const redraw = () => view(ctx, sub);

    // ---- 追加フォーム ----
    const canAddIn = S.orgs.filter((o) => OS.Perm.canCreateIn(S.user, o.id) || S.meetings.some((m) => isBoard(m) && m.orgId === o.id && OS.Perm.canView(S.user, m)));
    const addForm = () => {
      const orgs = scopeOrg ? canAddIn.filter((o) => o.id === scopeOrg.id) : canAddIn;
      if (!orgs.length) return h('div', { class: 'card empty', text: 'タスクを追加できる店舗・部署がありません（最初のタスクは店長・部署長以上が追加します）' });
      const f = { text: '', orgId: orgs[0].id, assigneeId: mineOnly ? me : '', due: '', theme: '' };
      const text = h('input', { type: 'text', placeholder: '例：10月の求人原稿を広報と作る' });
      const orgSel = h('select', { 'aria-label': '店舗・部署' }, orgs.map((o) => h('option', { value: o.id, text: o.name })));
      const whoSel = h('select', { 'aria-label': '担当' });
      const fillWho = () => {
        const ms = S.members.filter((x) => (x.orgIds || []).includes(orgSel.value) || OS.roleOf(x.role).all);
        whoSel.replaceChildren(h('option', { value: '', text: '担当未定' }), ...ms.map((x) => h('option', { value: x.id, selected: x.id === f.assigneeId, text: x.name })));
      };
      orgSel.addEventListener('change', fillWho); fillWho();
      const due = h('input', { type: 'date', 'aria-label': '期限' });
      const themeSel = h('select', { 'aria-label': 'テーマ' }, h('option', { value: '', text: 'テーマ（自動）' }), LM.THEMES.map((th) => h('option', { value: th.key, text: th.label })));
      const save = async () => {
        if (!text.value.trim()) { toast('タスクの内容を入れてください'); return; }
        const who = S.members.find((x) => x.id === whoSel.value);
        const task = { id: uid('t'), text: text.value.trim(), assigneeId: who ? who.id : '', assignee: who ? who.name : '', due: due.value, done: false, status: 'todo',
          theme: themeSel.value || null, createdBy: S.user.memberId || S.user.email || '', createdAt: new Date().toISOString() };
        try { await addTask(ctx, orgSel.value, task); toast('タスクを追加しました'); st.adding = false; redraw(); }
        catch (e) { toast('追加できませんでした（この店舗・部署の最初のタスクは店長・部署長以上が追加します）'); }
      };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      return h('div', { class: 'card' }, h('div', { class: 'bd grid', style: { gap: '10px' } },
        text,
        h('div', { class: 'row bd-fields', style: { gap: '8px' } }, orgSel, whoSel, due, themeSel),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, '追加する'), h('button', { class: 'btn ghost', onclick: () => { st.adding = false; redraw(); } }, 'やめる'))));
    };

    // ---- カードの詳細（編集） ----
    function panel(m, t) {
      const can = OS.Perm.canCheckTask(S.user, m, t);
      const text = h('input', { type: 'text', value: t.text, disabled: !can || !isBoard(m) });
      const due = h('input', { type: 'date', value: t.due || '', disabled: !can });
      const ms = S.members.filter((x) => (x.orgIds || []).includes(m.orgId) || OS.roleOf(x.role).all);
      const whoSel = h('select', { disabled: !can }, h('option', { value: '', text: '担当未定' }), ms.map((x) => h('option', { value: x.id, selected: x.id === t.assigneeId, text: x.name })));
      const stSel = h('select', { disabled: !can }, COLS.map(([k, l]) => h('option', { value: k, selected: k === statusOf(t), text: l })));
      const note = h('textarea', { rows: 3, placeholder: 'メモ（進み具合・相談したいことなど）', disabled: !can }, t.note || '');
      const box = h('div', { class: 'card lm-panel', style: { position: 'fixed', right: '16px', bottom: '16px', width: 'min(440px, calc(100vw - 32px))', zIndex: 60, boxShadow: 'var(--shadow)' } },
        h('div', { class: 'hd' }, h('h3', { text: isBoard(m) ? 'タスク' : '会議の宿題' }), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: () => box.remove() }, '閉じる')),
        h('div', { class: 'bd grid', style: { gap: '10px' } },
          text,
          h('div', { class: 'small muted', text: `${orgOf(m.orgId).name}｜${isBoard(m) ? 'タスクボード' : `${m.type || '会議'} ${fmtDate(m.date, false)}`}｜テーマ：${LM.themeByKey(LM.themeOfTask(t)).label}` }),
          h('div', { class: 'row bd-fields', style: { gap: '8px' } }, stSel, whoSel, due),
          note,
          can ? h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: async () => {
              const who = S.members.find((x) => x.id === whoSel.value);
              const s = stSel.value;
              const fields = { status: s, done: s === 'done', due: due.value, assigneeId: who ? who.id : '', assignee: who ? who.name : (t.assignee && !t.assigneeId ? t.assignee : ''), note: note.value.trim() };
              if (isBoard(m)) fields.text = text.value.trim() || t.text;
              if (s === 'done' && !t.done) { fields.doneAt = new Date().toISOString(); fields.doneBy = S.user.memberId || S.user.email || ''; }
              try { await patchTask(ctx, m, t.id, fields); toast('保存しました'); box.remove(); redraw(); } catch (e) { toast('保存できませんでした'); }
            } }, '保存'),
            isBoard(m) && OS.Perm.canEdit(S.user, m) ? h('button', { class: 'btn ghost', onclick: async () => {
              if (!confirm('このタスクを削除しますか？')) return;
              const fresh = await OS.Store.get('meetings', m.id);
              try { await OS.Store.patch('meetings', m.id, { tasks: (fresh.tasks || []).filter((x) => x.id !== t.id) }); await ctx.reload(); ctx.refreshChrome(); box.remove(); redraw(); } catch (e) { toast('削除できませんでした'); }
            } }, '削除') : null,
            isBoard(m) ? null : h('a', { class: 'btn ghost', href: '#/m/' + m.id, text: '議事録を開く' }))
            : h('div', { class: 'small muted', text: '動かせるのは、担当者と店長・部署長以上です' })));
      document.querySelectorAll('.lm-panel').forEach((x) => x.remove());
      document.body.append(box);
    }

    // ---- ボード ----
    const card = ({ m, t }) => {
      const s = statusOf(t), i = COLS.findIndex(([k]) => k === s);
      const can = OS.Perm.canCheckTask(S.user, m, t);
      const over = s !== 'done' && t.due && t.due < today();
      const th = LM.themeByKey(LM.themeOfTask(t));
      const move = (d) => async (e) => { e.stopPropagation(); try { await setStatus(ctx, m, t, COLS[i + d][0]); redraw(); } catch (er) { toast('動かせませんでした'); } };
      return h('div', { class: 'bd-card' + (over ? ' over' : ''), style: { borderLeftColor: orgOf(m.orgId).color || 'var(--accent)' }, onclick: () => panel(m, t) },
        h('div', { class: 'tx', text: t.text }),
        h('div', { class: 'meta' },
          h('span', { class: 'chip', style: { color: th.color, borderColor: th.color }, text: th.label }),
          scopeOrg ? null : h('span', { text: orgOf(m.orgId).name }),
          h('span', { text: t.assignee || '担当未定' }),
          h('span', { class: over ? 'overdue' : '', text: t.due ? fmtDate(t.due, false).replace(/^\d+年/, '') : '期限なし' }),
          h('span', { class: 'muted', text: isBoard(m) ? 'タスク' : '会議の宿題' })),
        can ? h('div', { class: 'mv' },
          i > 0 ? h('button', { class: 'btn sm ghost', 'aria-label': COLS[i - 1][1] + 'へ', onclick: move(-1) }, '◀ ' + COLS[i - 1][1]) : h('span'),
          i < COLS.length - 1 ? h('button', { class: 'btn sm', 'aria-label': COLS[i + 1][1] + 'へ', onclick: move(1) }, COLS[i + 1][1] + ' ▶') : null) : null);
    };
    const doneCut = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString(); })();
    const cols = COLS.map(([k, label]) => {
      let rows = items.filter(({ t }) => statusOf(t) === k);
      const total = rows.length;
      if (k === 'done' && !st.showDone) rows = rows.filter(({ t }) => (t.doneAt || '') >= doneCut); // 完了は直近2週間だけ
      return h('div', { class: 'bd-col' },
        h('div', { class: 'bd-colhd' }, h('b', { text: label }), h('span', { class: 'small muted', text: `${total}件` })),
        rows.map(card),
        k === 'done' && rows.length < total ? h('button', { class: 'btn ghost sm', onclick: () => { st.showDone = true; redraw(); } }, `古い完了も見る（${total - rows.length}件）`) : null);
    });

    const chipSel = (key, opts) => h('select', { 'aria-label': key, style: { width: 'auto', flex: '0 1 220px' }, onchange: (e) => { st[key] = e.target.value; redraw(); } },
      opts.map(([v, l]) => h('option', { value: v, selected: st[key] === v, text: l })));
    const people = [...new Map(all.filter(({ t }) => t.assigneeId).map(({ t }) => [t.assigneeId, t.assignee])).entries()];
    const open = items.filter(({ t }) => statusOf(t) !== 'done');
    setTop(mineOnly ? '自分のタスク' : 'タスク管理', (scopeOrg ? `${scopeOrg.name}｜` : '') + '会議の宿題と、それ以外のタスクをまとめて動かす',
      [h('button', { class: 'btn primary', onclick: () => { st.adding = !st.adding; redraw(); } }, '＋ タスクを追加')]);
    $view.replaceChildren(...[
      h('div', { class: 'stats' },
        h('div', { class: 'card stat' }, h('b', { text: open.length }), h('span', { text: '進めるもの' })),
        h('div', { class: 'card stat' }, h('b', { text: open.filter(({ t }) => statusOf(t) === 'doing').length }), h('span', { text: '進行中' })),
        h('div', { class: 'card stat' }, h('b', { class: open.some(({ t }) => t.due && t.due < today()) ? 'overdue' : '', text: open.filter(({ t }) => t.due && t.due < today()).length }), h('span', { text: '期限切れ' }))),
      st.adding ? addForm() : null,
      h('div', { class: 'row', style: { gap: '8px', margin: '4px 0 12px' } },
        mineOnly ? null : chipSel('who', [['', 'すべての担当'], ['me', '自分'], ['none', '担当未定'], ...people.map(([id, n]) => [id, n])]),
        chipSel('theme', [['', 'すべてのテーマ'], ...LM.THEMES.map((th) => [th.key, th.label])]),
        chipSel('src', [['', '宿題とタスク'], ['meeting', '会議の宿題だけ'], ['board', 'タスクだけ']])),
      h('div', { class: 'bd-board' }, cols)].filter(Boolean));
  }

  window.Board = { view, isBoard, statusOf };
})();
