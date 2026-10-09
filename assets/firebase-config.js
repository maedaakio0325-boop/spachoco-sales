/* Firebase の接続設定（プロジェクト: spachoco-os）。
   ブラウザ用の公開設定値でパスワードではない。データの保護はログインとセキュリティルール(firebase/firestore.rules)で行う。 */
window.SPACHOCO_FIREBASE = {
  apiKey: 'AIzaSyBNqHJd7_g-ihIBHn0Kz-LImDe94cLKkJ0',
  // ログインの受け付け。アプリも同じ住所（spachoco-os.firebaseapp.com）で開く。
  // iPadのSafariは住所が違うとログイン情報を受け渡さない。また、Googleに登録済みの戻り先はこの住所だけ
  authDomain: 'spachoco-os.firebaseapp.com',
  projectId: 'spachoco-os',
  storageBucket: 'spachoco-os.firebasestorage.app',
  messagingSenderId: '486125268065',
  appId: '1:486125268065:web:118c0796413bbc69718e20',
};
