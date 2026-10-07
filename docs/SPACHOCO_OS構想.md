# SPACHOCO OS 構想

売上・議事録・夢ノート・統括を **1つのログイン・1つの名簿** でつなぐ、スパチョコの運営基盤。

## 進め方

| 段階 | 内容 | 状態 |
|---|---|---|
| 1 | 議事録アプリの画面一式（一覧・検索・閲覧・編集・宿題管理・PDF・名簿と権限）。サンプルデータで操作可能 | ✅ `minutes.html` |
| 2 | Firebase と接続。Googleログイン、権限をサーバー側で強制、データをクラウド保存 | 未着手 |
| 3 | 録音アップロード → 文字起こし → Claude が毎回同じテンプレートで議事録化（名簿で人名補正） | 未着手 |
| 4 | 売上インポートを同じ基盤へ移行。夢ノート・統括を追加 | 未着手 |

## ファイル構成

```
index.html            売上インポート（既存）
minutes.html          議事録アプリ
assets/os.css         共通デザイントークン・部品（全アプリ共通）
assets/os-core.js     共通コア：DOMヘルパー / 役職と権限(Perm) / 保存(Store) / ログイン(Session)
assets/minutes.js     議事録アプリ本体
assets/minutes-demo.js 架空のサンプルデータ
```

新しいアプリ（夢ノート等）は `os.css` と `os-core.js` を読み込み、同じ名簿（`orgs` / `members`）を参照する。

## データの形（Firestore のコレクションと同じ）

- `orgs` … 店舗・部署 `{id, name, kind: 'store'|'dept', color}`
- `members` … メンバー `{id, name, aliases[], role, orgIds[]}`
  - `aliases` は文字起こしで誤変換されやすい表記。AIが議事録を作るときに正しい名前へ直す辞書になる
- `meetings` … 議事録
  ```
  {id, orgId, type, title, date, start, end, place, participants[],
   visibility: 'org'|'exec', status: 'draft'|'published',
   purpose[], numbers[], issues[], decisions[],
   next: {meeting, content},
   tasks: [{id, text, assigneeId, assignee, due, done, doneAt, doneBy}],
   pending, transcript, source: {kind: 'upload'|'plaud'|'paste'|'manual', fileName},
   createdBy, updatedAt}
  ```

## 権限

| 役職 | 見られる議事録 | 作成・編集 |
|---|---|---|
| 代表 | すべて | すべて |
| エリアMG・統括 | すべて | すべて |
| 店長・部署長 | 所属する店舗・部署 | 所属する店舗・部署 |
| 幹部 | 所属する店舗・部署 | ×（担当の宿題チェックのみ） |
| 内勤・スタッフ | 所属する店舗・部署（「幹部以上のみ」の会議は除く・下書きは除く） | ×（担当の宿題チェックのみ） |

第1段階は画面上の制御のみ。第2段階で Firestore セキュリティルールにより同じ規則をサーバー側で強制する。

## データの置き場所について

このリポジトリと GitHub Pages は **公開** されている。議事録の本文・名簿などの実データは
リポジトリに入れず、ログインが必要な Firebase に保存する（第2段階）。
アプリのプログラムが公開されていても、データはログインと権限がないと読めない。

## 第3段階：議事録の自動作成

1. 録音を Firebase Storage にアップロード
2. Cloud Functions が文字起こしAPIで文字にする（PLAUDの文字起こし .txt を使うことも可）
3. Claude API に「文字起こし＋名簿（正しい名前と誤変換表記）＋テンプレート」を渡し、上記 `meetings` の形で議事録を作らせる
4. 下書きとして保存 → 店長・部署長が確認・修正して公開

テンプレートの方針：各項目は短く具体的に。決定事項と宿題は「誰が・何を・いつまで」。
個人の金銭・家族・トラブルなどの機微な話は「個別対応」とだけ書く。
