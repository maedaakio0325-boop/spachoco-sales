/* ===== AIに相談（壁打ち）とカルテ =====
   課金なしで始めるため、アプリが「スパチョコの教え」入りの相談文（プロンプト）を作り、
   本人がふだん使っているAI（ChatGPT・Gemini・Claude）に貼り付けて壁打ちする。
   AIとのやり取りのまとめと、決めた行動は本人の「カルテ」に貯まる（見られるのは本人と代表・エリアMG）。
   スパチョコの教え（kb）は社内の研修内容なので、このリポジトリには置かず、ログインが必要な保存先に取り込む。 */
(function () {
  'use strict';
  const { h, toast, uid, fmtDate } = OS;

  // 相談の入口。kb のテーマ名に keys の語が含まれるものを教えとして添える
  const SCENES = [
    { id: 'goal', title: '目標の立て方がわからない', keys: ['目標', '夢ノート', '数値'], hint: '例：今月何を目指せばいいか決められない' },
    { id: 'vision', title: '自分のビジョンが見えない', keys: ['ビジョン', '理念', '夢', '人生'], hint: '例：この仕事で何を目指したいのか分からない' },
    { id: 'habit', title: '行動が続かない・自己管理', keys: ['自己管理', '時間', '行動', '数値'], hint: '例：決めた営業件数が3日で止まる' },
    { id: 'mind', title: 'やる気が出ない・気持ちの整理', keys: ['選択理論', 'マインド', '欲求', '上質世界'], hint: '例：最近なにをしても気持ちが乗らない' },
    { id: 'trust', title: 'お客様・仲間との信頼関係', keys: ['信頼', '見られ方', '顧客', '継続'], hint: '例：2回目につながらない' },
    { id: 'lead', title: '後輩・チームの育て方', keys: ['リーダー', '育成', '教え方', '後継者'], hint: '例：後輩に何度言っても変わらない' },
    { id: 'org', title: '店づくり・評価・採用', keys: ['QSC', '評価', '採用', '組織', 'ブランド', '経営数字', '理念'], hint: '例：離職が止まらない／評価の基準があいまい' },
    { id: 'meeting', title: '会議・面談の進め方', keys: ['コーチング', '面談', 'リーダー'], hint: '例：会議で若手が発言しない' },
  ];
  const AI_LINKS = [['ChatGPT', 'https://chatgpt.com/'], ['Gemini', 'https://gemini.google.com/'], ['Claude', 'https://claude.ai/new']];

  function kbFor(kb, scene) {
    return kb.filter((k) => scene.keys.some((w) => (k.title || '').includes(w))).slice(0, 3);
  }
  function kbText(items) {
    if (!items.length) return '（スパチョコの教えはまだ登録されていません。一般的なコーチングの進め方で構いません）';
    return items.map((k) => [
      `■${k.title}`,
      (k.points || []).length ? '要点：\n' + k.points.map((x) => '・' + x).join('\n') : '',
      (k.questions || []).length ? '使える問いかけ：\n' + k.questions.map((x) => '・' + x).join('\n') : '',
      (k.pitfalls || []).length ? 'よくあるつまずきと処方：\n' + k.pitfalls.map((x) => '・' + x).join('\n') : '',
    ].filter(Boolean).join('\n')).join('\n\n');
  }
  function buildPrompt(scene, items, me, f) {
    return [
      'あなたは、ホストクラブグループ「スパチョコ」のコーチ役「スパチョコAI」です。下の「スパチョコの教え」に沿って、私の壁打ち相手になってください。',
      '',
      '【進め方のルール】',
      '・質問は一度に1つだけ。私が答えてから次に進む',
      '・答えを押しつけず、私が自分で選べるように問いかける（決めるのは私）',
      '・ほめる・認めることを忘れない。責めない',
      '・最後に「次の7日間でやる行動」を3つ以内、数字と期限つきで一緒に決める',
      '・お金、法律、心と体の不調など専門的なことは、上司や専門家に相談するよう勧める',
      '',
      `【相談したいこと】${scene.title}`,
      '',
      '【スパチョコの教え】',
      kbText(items),
      '',
      '【私のこと】',
      `・立場：${me.role || '未記入'}`,
      `・今の状況：${f.situation || '未記入'}`,
      `・今の目標（あれば）：${f.goal || '未記入'}`,
      `・困っていること：${f.problem || '未記入'}`,
      '',
      'では、最初の質問からお願いします。',
    ].join('\n');
  }
  const SUMMARY_PROMPT = 'ここまでの会話を、次の3つに分けて合計300字以内でまとめてください。\n①気づいたこと\n②決めた行動（数字と期限つき、3つ以内）\n③次に相談したいこと';

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('コピーしました'); }
    catch (e) { const t = h('textarea', {}, text); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('コピーしました'); }
  }

  // ---------- AIに相談 ----------
  async function viewCoach(ctx, sceneId) {
    const { S, setTop, markNav, $view, section } = ctx;
    markNav('coach');
    setTop('AIに相談（壁打ち）', 'ふだん使っているAIに貼り付けて相談します');
    let kb = [];
    try { kb = await OS.Store.list('kb', S.user); } catch (e) { kb = []; }
    const scene = SCENES.find((x) => x.id === sceneId);
    if (!scene) {
      $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '900px' } },
        h('div', { class: 'banner accent', text: '相談したいことを選ぶと、スパチョコの教えが入った相談文ができます。それをChatGPT・Gemini・Claudeなど、ふだん使っているAIに貼り付けて壁打ちしてください。最後にまとめをここに貼ると、あなたのカルテに残ります。' }),
        kb.length ? null : h('div', { class: 'banner warn', text: 'スパチョコの教えがまだ登録されていません（代表が「名簿・権限」から取り込みます）。登録前でも相談はできます。' }),
        h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' } },
          SCENES.map((sc) => h('a', { class: 'card', href: '#/coach/' + sc.id, style: { textDecoration: 'none', color: 'inherit' } },
            h('div', { class: 'bd' }, h('div', { style: { fontWeight: 700, fontSize: '15px' }, text: sc.title }),
              h('div', { class: 'small muted', style: { marginTop: '4px' }, text: sc.hint }),
              h('div', { class: 'small', style: { marginTop: '8px', color: 'var(--accent)' }, text: `関連する教え ${kbFor(kb, sc).length}件` })))))));
      return;
    }
    const items = kbFor(kb, scene);
    const f = { situation: '', goal: '', problem: '' };
    const ta = (key, ph) => { const e = h('textarea', { rows: 3, placeholder: ph }); e.addEventListener('input', () => (f[key] = e.value.trim())); return e; };
    const me = { role: OS.roleOf(S.user.role).name };
    const promptBox = h('textarea', { rows: 10, readonly: true, 'aria-label': '相談文' });
    const refresh = () => (promptBox.value = buildPrompt(scene, items, me, f));
    const fields = h('div', { class: 'form' },
      h('div', {}, h('label', { class: 'f', text: '今の状況' }), ta('situation', scene.hint)),
      h('div', {}, h('label', { class: 'f', text: '今の目標（あれば）' }), ta('goal', '例：今月 指名10本')),
      h('div', {}, h('label', { class: 'f', text: '困っていること' }), ta('problem', '例：何から手をつければいいか分からない')));
    fields.addEventListener('input', refresh);
    refresh();

    const summary = h('textarea', { rows: 6, placeholder: 'AIが出したまとめ（①気づき ②決めた行動 ③次に相談したいこと）を貼り付け' });
    const acts = [0, 1, 2].map(() => ({ text: h('input', { type: 'text', placeholder: '決めた行動（例：毎日20件連絡する）' }), due: h('input', { type: 'date', style: { width: '160px', flex: 'none' }, 'aria-label': '期限' }) }));
    async function save() {
      const actions = acts.map((a) => ({ id: uid('k'), text: a.text.value.trim(), due: a.due.value, done: false })).filter((a) => a.text);
      if (!summary.value.trim() && !actions.length) { toast('まとめか行動を入れてください'); return; }
      const entry = { id: uid('karte'), ownerEmail: S.user.email || S.user.memberId || '', memberId: S.user.memberId || '', name: S.user.name || '',
        scene: scene.title, situation: f.situation, goal: f.goal, problem: f.problem, summary: summary.value.trim(), actions, createdAt: new Date().toISOString() };
      try { await OS.Store.put('karte', entry); } catch (e) { toast('保存できませんでした'); return; }
      toast('カルテに保存しました'); location.hash = '#/karte';
    }

    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '900px' } },
      h('div', { class: 'row' }, h('a', { class: 'btn ghost', href: '#/coach', text: '← 相談テーマに戻る' }), h('h2', { style: { margin: 0, fontSize: '18px' }, text: scene.title })),
      section('① あなたのことを書く', fields),
      section('② 相談文をコピーして、AIに貼り付ける', h('div', { class: 'grid', style: { gap: '10px' } },
        h('div', { class: 'small muted', text: `スパチョコの教え：${items.length ? items.map((k) => k.title).join('・') : 'まだ登録されていません'}` }),
        promptBox,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => copy(promptBox.value) }, '相談文をコピー'),
          AI_LINKS.map(([n, u]) => h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener', text: n + 'を開く' }))))),
      section('③ 終わったら、まとめを頼んで貼り付ける', h('div', { class: 'grid', style: { gap: '10px' } },
        h('div', { class: 'row' }, h('span', { class: 'small muted', text: '壁打ちが終わったら、AIにこう頼んでください：' }), h('button', { class: 'btn sm', onclick: () => copy(SUMMARY_PROMPT) }, 'まとめの頼み方をコピー')),
        h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: '10px', borderRadius: 'var(--radius-sm)', margin: 0 }, text: SUMMARY_PROMPT }),
        summary,
        h('div', { class: 'small muted', text: '決めた行動（期限つき）' }),
        acts.map((a) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, a.text, a.due)),
        h('div', {}, h('button', { class: 'btn primary', onclick: save }, 'カルテに保存'))))));
  }

  // ---------- カルテ ----------
  async function viewKarte(ctx, who) {
    const { S, setTop, markNav, $view } = ctx;
    markNav('karte');
    const admin = OS.roleOf(S.user.role).level >= 80;
    let all = [];
    try { all = await OS.Store.list('karte', S.user); } catch (e) { all = []; }
    const mine = S.user.email || S.user.memberId || '';
    const people = [...new Map(all.map((e) => [e.ownerEmail, e.name || e.ownerEmail])).entries()];
    const target = who ? decodeURIComponent(who) : mine;
    const list = all.filter((e) => e.ownerEmail === target).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const name = (people.find(([k]) => k === target) || [, S.user.name])[1];
    setTop('カルテ', admin ? '相談・決めた行動の記録（代表・エリアMGは全員分を見られます）' : 'あなたの相談と決めた行動の記録（見られるのは本人と代表・エリアMG）',
      [h('a', { class: 'btn primary', href: '#/coach', text: '＋ AIに相談する' })]);
    const today = new Date().toISOString().slice(0, 10);
    const openActs = list.flatMap((e) => (e.actions || []).filter((a) => !a.done).map((a) => ({ e, a })));

    const pick = admin && people.length ? h('select', { 'aria-label': '表示する人', style: { maxWidth: '320px' } },
      (people.some(([k]) => k === mine) ? [] : [h('option', { value: mine, text: `${S.user.name}（自分）` })]),
      people.map(([k, n]) => h('option', { value: k, selected: k === target, text: k === mine ? `${n}（自分）` : n }))) : null;
    if (pick) pick.addEventListener('change', () => (location.hash = '#/karte/' + encodeURIComponent(pick.value)));

    async function toggle(e, a, done) {
      const actions = e.actions.map((x) => (x.id === a.id ? { ...x, done, doneAt: done ? new Date().toISOString() : null } : x));
      try { await OS.Store.put('karte', { ...e, actions }); } catch (er) { toast('保存できませんでした'); return; }
      viewKarte(ctx, who);
    }
    const canEdit = target === mine;
    $view.replaceChildren(h('div', { class: 'grid', style: { maxWidth: '900px' } },
      pick ? h('div', { class: 'row' }, h('span', { class: 'small muted', text: '表示する人' }), pick) : null,
      h('div', { class: 'stats' },
        h('div', { class: 'card stat' }, h('b', { text: list.length }), h('span', { text: '相談の回数' })),
        h('div', { class: 'card stat' }, h('b', { text: openActs.length }), h('span', { text: 'やりかけの行動' })),
        h('div', { class: 'card stat' }, h('b', { class: openActs.some(({ a }) => a.due && a.due < today) ? 'overdue' : '', text: openActs.filter(({ a }) => a.due && a.due < today).length }), h('span', { text: '期限切れ' }))),
      list.length ? list.map((e) => h('div', { class: 'card' },
        h('div', { class: 'hd' }, h('h3', { text: e.scene }), h('span', { class: 'spacer' }), h('span', { class: 'small muted', text: fmtDate(e.createdAt.slice(0, 10)) })),
        h('div', { class: 'bd grid', style: { gap: '8px' } },
          e.situation ? h('div', { class: 'small' }, h('b', { text: '状況：' }), e.situation) : null,
          e.problem ? h('div', { class: 'small' }, h('b', { text: '困っていたこと：' }), e.problem) : null,
          e.summary ? h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)', background: 'var(--surface-2)', padding: '10px', borderRadius: 'var(--radius-sm)', margin: 0 }, text: e.summary }) : null,
          (e.actions || []).length ? h('ul', { class: 'tasklist' }, e.actions.map((a) => {
            const cb = h('input', { type: 'checkbox', checked: a.done, disabled: !canEdit, 'aria-label': '完了' });
            cb.addEventListener('change', () => toggle(e, a, cb.checked));
            return h('li', { class: a.done ? 'done' : '' }, cb, h('div', {}, h('div', { class: 'tx', text: a.text }),
              a.due ? h('div', { class: 'who' + (!a.done && a.due < today ? ' overdue' : ''), text: `期限：${fmtDate(a.due, false)}` }) : null));
          })) : null))) : h('div', { class: 'card empty', text: 'まだ相談の記録はありません。「AIに相談する」から始めてみてください。' })));
  }

  window.Coach = { viewCoach, viewKarte, SCENES, buildPrompt };
})();
