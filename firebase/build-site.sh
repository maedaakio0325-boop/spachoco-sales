#!/bin/sh
# Firebase Hosting（https://spachoco-os.web.app）に載せる「入れ物」を dist/ に作る。
# 中身のアプリは GitHub Pages の最新版を毎回読み込むので、アプリを直しても載せ直しは不要。
# （ログインの受け付けと同じ住所で動かすため。iPadのSafariは住所が違うとログイン情報を受け渡さない）
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cat > dist/minutes.html <<'HTML'
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SPACHOCO OS</title><style>body{font-family:sans-serif;color:#333;background:#F6F2EA;display:grid;place-items:center;min-height:100vh;margin:0}</style></head>
<body><div id="msg">読み込み中…</div>
<script>
(function () {
  var SRC = 'https://maedaakio0325-boop.github.io/spachoco-sales/';
  fetch(SRC + 'minutes.html?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  }).then(function (html) {
    // 部品（assets/…）だけGitHubから読む。画面内のリンク（#/…）はこの住所のまま動く
    html = html.replace(/(src|href)="assets\//g, '$1="' + SRC + 'assets/');
    document.open(); document.write(html); document.close();
  }).catch(function (e) {
    document.getElementById('msg').textContent = '読み込めませんでした。通信を確認して、再読み込みしてください（' + e.message + '）';
  });
})();
</script></body></html>
HTML
printf '<meta http-equiv="refresh" content="0;url=minutes.html">\n' > dist/index.html
echo "dist/ を作りました"; ls dist
