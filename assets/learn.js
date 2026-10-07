/* ===== マニュアルで学ぶ（読む → 確認テスト → カルテに記録） =====
   マニュアルは「スパチョコの教え」（kb）に kind: 'manual' として入れる。社内の内容なのでリポジトリには置かない。
   形：{ id, kind:'manual', title, category, for, sections:[{h, body}], quiz:[{q, choices:[...], answer:<番号>, why}] }
   テストの結果は本人のカルテ（karte）に type:'quiz' で残る。代表・エリアMGは全員の習熟状況を見られる。 */
(function () {
  'use strict';
  const { h, toast, uid, fmtDate } = OS;
  const PASS = 0.8;

  const isManual = (k) => k.kind === 'manual';
  async function loadAll(S) {
    let kb = [], karte = [];
    try { kb = await OS.Store.list('kb', S.user); } catch (e) { kb = []; }
    try { karte = await OS.Store.list('karte', S.user); } catch (e) { karte = []; }
    return { manuals: kb.filter(isManual).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.title.localeCompare(b.title)), quizzes: karte.filter((e) => e.type === 'quiz') };
  }
  // その人のマニュアルごとの最高点
  function bestOf(quizzes, owner) {
    const m = {};
    quizzes.filter((q) => q.ownerEmail === owner).forEach((q) => {
      const r = q.total ? q.score / q.total : 0;
      if (!m[q.manualId] || r > m[q.manualId].r) m[q.manualId] = { r, q };
    });
    return m;
  }
  function badge(best) {
    if (!best) return h('span', { class: 'chip', text: '未受講' });
    const pct = Math.round(best.r * 100);
    return h('span', { class: 'chip' + (best.r >= PASS ? ' ok' : ' warn'), text: best.r >= PASS ? `合格 ${pct}点` : `再挑戦 ${pct}点` });
  }
  function manualText(m) {
    return [`■${m.title}`, ...(m.sections || []).map((s) => `【${s.h}】\n${s.body}`)].join('\n\n');
  }
  function practicePrompt(m) {
    return [
      'あなたは、ホストクラブグループ「スパチョコ」の教育係「スパチョコAI」です。下のマニュアルを私に叩き込んでください。',
      '',
      '【進め方】',
      '・マニュアルの内容から、1問ずつ出題する（選択肢か、短く答える問題）',
      '・私が答えたら、正解・不正解と、マニュアルのどこに書いてあるかを短く伝える',
      '・間違えたところは、少し形を変えてもう一度出す',
      '・ときどき「お客様（または後輩）役」になって、現場での場面を再現し、私の対応をマニュアルに沿って評価する',
      '・10問ほどで、できているところと、もう一度読むべきところをまとめる',
      '・ほめて伸ばす。責めない',
      '',
      '【マニュアル】',
      manualText(m),
      '',
      'では、1問目をお願いします。',
    ].join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('コピーしました'); }
    catch (e) { const t = h('textarea', {}, text); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('コピーしました'); }
  }

  // ---------- 一覧 ----------
  async function viewList(ctx) {
    const { S, setTop, $view } = ctx;
    const admin = OS.roleOf(S.user.role).level >= 80;
    setTop('マニュアルで学ぶ', '読んで、確認テストで身につける。結果はカルテに残ります',
      admin ? [h('a', { class: 'btn', href: '#/learn/status', text: '習熟状況を見る' })] : []);
    const { manuals, quizzes } = await loadAll(S);
    const best = bestOf(quizzes, S.user.email || S.user.memberId || '');
    const done = manuals.filter((m) => best[m.id] && best[m.id].r >= PASS).length;
    const cats = [...new Set(manuals.map((m) => m.category || 'その他'))];
    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '1000px' } },
      manuals.length ? h('div', { class: 'stats' },
        h('div', { class: 'card stat' }, h('b', { text: manuals.length }), h('span', { text: 'マニュアル' })),
        h('div', { class: 'card stat' }, h('b', { text: done }), h('span', { text: '合格済み' })),
        h('div', { class: 'card stat' }, h('b', { text: manuals.length - done }), h('span', { text: 'これから' }))) : null,
      manuals.length ? cats.map((c) => h('div', { class: 'grid', style: { gap: '8px' } },
        h('h3', { style: { margin: '8px 0 0', fontSize: '15px' }, text: c }),
        h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' } },
          manuals.filter((m) => (m.category || 'その他') === c).map((m) => h('a', { class: 'card', href: '#/learn/' + encodeURIComponent(m.id), style: { textDecoration: 'none', color: 'inherit' } },
            h('div', { class: 'bd grid', style: { gap: '6px' } },
              h('div', { style: { fontWeight: 700, fontSize: '15px' }, text: m.title }),
              m.for ? h('div', { class: 'small muted', text: `対象：${m.for}` }) : null,
              h('div', { class: 'row' }, badge(best[m.id]), h('span', { class: 'small muted', text: `${(m.sections || []).length}章・テスト${(m.quiz || []).length}問` })))))))) :
        h('div', { class: 'card empty', text: 'マニュアルはまだ登録されていません。代表が取り込むと、ここに並びます。' })));
  }

  // ---------- 読む・テスト ----------
  async function viewManual(ctx, id) {
    const { S, setTop, $view, section } = ctx;
    const { manuals, quizzes } = await loadAll(S);
    const m = manuals.find((x) => x.id === id);
    if (!m) { $view.replaceChildren(h('div', { class: 'card empty', text: 'マニュアルが見つかりません' })); return; }
    const owner = S.user.email || S.user.memberId || '';
    const mine = quizzes.filter((q) => q.ownerEmail === owner && q.manualId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setTop(m.title, [m.category, m.for && `対象：${m.for}`].filter(Boolean).join('・'), [h('a', { class: 'btn ghost', href: '#/learn', text: '← 一覧へ' })]);
    const quizBox = h('div', { class: 'grid', style: { gap: '10px' } });
    const startBtn = (m.quiz || []).length ? h('button', { class: 'btn primary', onclick: () => runQuiz(ctx, m, quizBox) }, `確認テストを始める（${m.quiz.length}問）`) : h('span', { class: 'small muted', text: '確認テストはまだありません' });
    quizBox.replaceChildren(startBtn);
    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '860px' } },
      h('div', { class: 'row' }, badge(bestOf(quizzes, owner)[m.id]),
        mine.length ? h('span', { class: 'small muted', text: `受講${mine.length}回・最後：${fmtDate(mine[0].createdAt.slice(0, 10))}` }) : null),
      (m.sections || []).map((s, i) => section(`${i + 1}. ${s.h}`, h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.8 }, text: s.body }))),
      section('確認テスト', quizBox),
      section('AIで練習する（ロールプレイ・追加問題）', h('div', { class: 'grid', style: { gap: '10px' } },
        h('div', { class: 'small muted', text: 'マニュアル入りの練習文をコピーして、ふだん使っているAIに貼り付けると、問題を出したり、お客様役になって練習相手になってくれます。' }),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copy(practicePrompt(m)) }, '練習文をコピー'),
          [['ChatGPT', 'https://chatgpt.com/'], ['Gemini', 'https://gemini.google.com/'], ['Claude', 'https://claude.ai/new']].map(([n, u]) => h('a', { class: 'btn ghost', href: u, target: '_blank', rel: 'noopener', text: n })))))));
  }

  function runQuiz(ctx, m, box) {
    const { S } = ctx;
    // 選択肢の順番を毎回入れ替える
    const qs = m.quiz.map((q) => {
      const order = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5);
      return { ...q, order };
    });
    let i = 0, score = 0;
    const misses = [];
    function show() {
      if (i >= qs.length) return finish();
      const q = qs[i];
      const fb = h('div');
      const btns = q.order.map((ci) => h('button', { class: 'btn', style: { justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', minHeight: '48px' }, onclick: () => pick(ci) }, q.choices[ci]));
      function pick(ci) {
        btns.forEach((b) => (b.disabled = true));
        const ok = ci === q.answer;
        if (ok) score++; else misses.push(q.q);
        btns[q.order.indexOf(q.answer)].classList.add('primary');
        fb.replaceChildren(h('div', { class: 'banner ' + (ok ? 'accent' : 'warn'), style: { whiteSpace: 'pre-line' }, text: (ok ? '正解！' : `ちがいます。正解は「${q.choices[q.answer]}」`) + (q.why ? `\n${q.why}` : '') }),
          h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => { i++; show(); } }, i + 1 < qs.length ? '次の問題へ' : '結果を見る')));
      }
      box.replaceChildren(h('div', { class: 'small muted', text: `${i + 1} / ${qs.length}問` }), h('div', { style: { fontWeight: 700, fontSize: '16px' }, text: q.q }), ...btns, fb);
    }
    async function finish() {
      const pass = score / qs.length >= PASS;
      const entry = { id: uid('karte'), type: 'quiz', ownerEmail: S.user.email || S.user.memberId || '', memberId: S.user.memberId || '', name: S.user.name || '',
        scene: `マニュアル：${m.title}`, manualId: m.id, score, total: qs.length, passed: pass, misses, actions: [], createdAt: new Date().toISOString() };
      try { await OS.Store.put('karte', entry); } catch (e) { toast('結果を保存できませんでした'); }
      box.replaceChildren(...[
        h('div', { class: 'banner ' + (pass ? 'accent' : 'warn'), text: `${score} / ${qs.length}問 正解（${Math.round((score / qs.length) * 100)}点）— ${pass ? '合格です！' : `合格は${PASS * 100}点から。もう一度読んで再挑戦しましょう`}` }),
        misses.length ? h('div', { class: 'small' }, h('b', { text: '間違えた問題：' }), h('ul', {}, misses.map((x) => h('li', { text: x })))) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => runQuiz(ctx, m, box) }, 'もう一度'), h('a', { class: 'btn ghost', href: '#/learn', text: '一覧へ' }))].filter(Boolean));
    }
    show();
  }

  // ---------- 習熟状況（代表・エリアMG） ----------
  async function viewStatus(ctx) {
    const { S, setTop, $view } = ctx;
    setTop('マニュアルの習熟状況', '誰がどのマニュアルに合格しているか', [h('a', { class: 'btn ghost', href: '#/learn', text: '← 一覧へ' })]);
    if (OS.roleOf(S.user.role).level < 80) { $view.replaceChildren(h('div', { class: 'card empty', text: '代表・エリアMGだけが見られます' })); return; }
    const { manuals, quizzes } = await loadAll(S);
    const people = [...new Map(quizzes.map((q) => [q.ownerEmail, q.name || q.ownerEmail])).entries()];
    if (!manuals.length || !people.length) { $view.replaceChildren(h('div', { class: 'card empty', text: 'まだ受講の記録がありません' })); return; }
    const td = { style: { padding: '8px', borderBottom: '1px solid var(--line)', textAlign: 'center' } };
    $view.replaceChildren(h('div', { class: 'card', style: { overflowX: 'auto' } }, h('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: '14px' } },
      h('thead', {}, h('tr', {}, h('th', { ...td, style: { ...td.style, textAlign: 'left' }, text: '名前' }), manuals.map((m) => h('th', { ...td, text: m.title })), h('th', { ...td, text: '合格' }))),
      h('tbody', {}, people.map(([email, name]) => {
        const b = bestOf(quizzes, email);
        return h('tr', {}, h('td', { ...td, style: { ...td.style, textAlign: 'left' } }, h('a', { href: '#/karte/' + encodeURIComponent(email), text: name })),
          manuals.map((m) => h('td', td, badge(b[m.id]))),
          h('td', { ...td, text: `${manuals.filter((m) => b[m.id] && b[m.id].r >= PASS).length}/${manuals.length}` }));
      })))));
  }

  function view(ctx, arg) {
    ctx.markNav('learn');
    if (!arg) return viewList(ctx);
    if (arg === 'status') return viewStatus(ctx);
    return viewManual(ctx, decodeURIComponent(arg));
  }
  window.Learn = { view, practicePrompt, isManual };
})();
