/* ===== スパチョコ会議の型 =====
   会議の種類ごとの目的・ゴール・標準アジェンダ・時間配分・進行スクリプト。
   ファシリテーターが拾った「良い部分」でここを書き換えていく（=会議の型が資産になる）。
   kind: share=共有 / discuss=検討 / decide=決定
   スクリプト中の {goal} {end} {org} は会議の情報で置き換わる。 */
window.MEETING_TEMPLATES = {
  '経営者会議': {
    minutes: 90,
    purpose: '店舗の今月の施策を共有し、施策ごとの責任者を決める',
    goal: '今月の目標・重点施策3つ・各施策の担当と期限が決まっている',
    items: [
      { title: 'オープニング', kind: 'share', minutes: 3, script: [
        '本日の目的は「{purpose}」です。',
        'ゴールは「{goal}」。終了は{end}です。',
        '助言は各議題の最後にまとめて伺います。' ] },
      { title: '前回の宿題確認', kind: 'share', minutes: 10, auto: 'prevTasks', script: [
        '前回決まった宿題を確認します。担当の方は「完了／途中／未着手」で一言ずつお願いします。',
        '途中・未着手のものは、新しい期限をこの場で決めます。' ] },
      { title: '先月の数字と振り返り', kind: 'share', minutes: 15, script: [
        '先月の実績を目標との差から見ます。良かった点を1つ、課題を1つに絞ってください。' ] },
      { title: '今月の目標', kind: 'decide', minutes: 15, script: [
        'この議題は今日ここで決めます。',
        '目標は店舗のビジョンと期限から逆算して、新規・組数・日々の行動まで落とします。' ] },
      { title: '重点施策と担当', kind: 'decide', minutes: 30, script: [
        '施策を3つに絞ります。まず若手から一言ずつ。上の立場の方は最後にお願いします。',
        '施策ごとに「担当・期限・何ができたら成功か」を決めます。' ] },
      { title: '助言', kind: 'discuss', minutes: 10, script: [
        'ここで助言をお願いします。助言ごとに、受け取る人と次の行動を決めます。' ] },
      { title: '決定と宿題の復唱', kind: 'decide', minutes: 7, auto: 'recap', script: [
        '今日決まったことを読み上げます。',
        '担当と期限が空いているものは、この場で決めてから終わります。' ] },
    ],
  },
  '幹部会議': {
    minutes: 60,
    purpose: '施策の進み具合を確認し、詰まりを解く',
    goal: '遅れている施策の次の一手と担当が決まっている',
    items: [
      { title: 'オープニング', kind: 'share', minutes: 2, script: ['本日のゴールは「{goal}」。終了は{end}です。'] },
      { title: '前回の宿題確認', kind: 'share', minutes: 10, auto: 'prevTasks', script: ['宿題を「完了／途中／未着手」で確認します。'] },
      { title: '数字の進み具合', kind: 'share', minutes: 10, script: ['今週の数字を目標との差で見ます。'] },
      { title: '悩み相談（1人1つ）', kind: 'discuss', minutes: 25, script: ['1人1つ、今いちばん詰まっていることを話してください。', '解決策は本人が最後に選びます。'] },
      { title: '決定と宿題の復唱', kind: 'decide', minutes: 8, auto: 'recap', script: ['決まったことと宿題を読み上げます。担当と期限を確認します。'] },
    ],
  },
  '朝礼': {
    minutes: 10,
    purpose: '今日の営業に全員の意識を揃える',
    goal: '一人ひとりが今日の目標を宣言している',
    items: [
      { title: '昨日の実績', kind: 'share', minutes: 2, script: ['昨日は◯組・◯円でした。良かったところを1つ共有します。'] },
      { title: '今日の予定と告知', kind: 'share', minutes: 3, script: ['今日のイベントと告知事項です。'] },
      { title: '一人一言の宣言', kind: 'decide', minutes: 5, script: ['今日の目標を一人一言で宣言してください。'] },
    ],
  },
  '部署会議': {
    minutes: 60,
    purpose: '店舗運営を支える仕組みを整える',
    goal: '業務ルールの決定と担当が決まっている',
    items: [
      { title: 'オープニング', kind: 'share', minutes: 3, script: ['本日のゴールは「{goal}」。終了は{end}です。'] },
      { title: '前回の宿題確認', kind: 'share', minutes: 10, auto: 'prevTasks', script: ['宿題を「完了／途中／未着手」で確認します。'] },
      { title: '現場からの課題', kind: 'discuss', minutes: 20, script: ['現場で困っていることを一人ずつ。まず聞くことに集中します。'] },
      { title: '改善案と決定', kind: 'decide', minutes: 20, script: ['この場で決めます。案ごとに担当と期限を決めます。'] },
      { title: '決定と宿題の復唱', kind: 'decide', minutes: 7, auto: 'recap', script: ['決まったことと宿題を読み上げます。'] },
    ],
  },
  '全体会議': {
    minutes: 120,
    purpose: '各店舗が自分の言葉で施策と責任を宣言し、グループとして判断する',
    goal: '各店舗の目標・施策・担当が宣言され、判断が必要な事項が決まっている',
    items: [
      { title: 'オープニング', kind: 'share', minutes: 3, script: [
        '本日の目的は「{purpose}」です。',
        '各店舗の発表のあとに助言の時間を取ります。途中で出た論点は「駐車場」に預かります。',
        '終了は{end}です。' ] },
      { title: '判断が必要な事項（承認・人事）', kind: 'decide', minutes: 10, script: [
        '先に、今日決める必要があるものを決めます。' ] },
      { title: '前回の対応事項の進捗', kind: 'share', minutes: 10, auto: 'prevTasks', script: [
        '前回の対応事項を確認します。担当と期限が未設定のものはここで決めます。' ] },
      { title: '各店舗の発表', kind: 'share', minutes: 0, auto: 'stores', perStore: { minutes: 10, adviceMinutes: 5 }, script: [
        '{org}の発表です。9月実績→今月目標→振り返り→取り組みの順で10分です。' ] },
      { title: '部署の共有', kind: 'share', minutes: 15, script: ['各部署から共有をお願いします。'] },
      { title: '決定と対応事項の復唱', kind: 'decide', minutes: 10, auto: 'recap', script: [
        '今日の決定と対応事項を読み上げます。担当・期限・成果が空いているものはこの場で決めます。' ] },
    ],
  },
  '1on1': {
    minutes: 30,
    purpose: '本人の目標と成長を支える',
    goal: '次の1か月でやることを本人が決めている',
    items: [
      { title: '前回の振り返り', kind: 'share', minutes: 8, auto: 'prevTasks', script: ['前回決めたことはどうでしたか？'] },
      { title: '本人の話', kind: 'discuss', minutes: 17, script: ['今いちばん考えていることを聞かせてください。（聴くのが8割）'] },
      { title: '次の行動', kind: 'decide', minutes: 5, script: ['次の1か月で何をやりますか？期限も決めましょう。'] },
    ],
  },
};
