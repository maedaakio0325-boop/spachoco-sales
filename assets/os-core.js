/* ===== SPACHOCO OS  共通コア =====
   全アプリ共通: DOMヘルパー / 名簿マスタ / 権限 / データ保存(Store)。
   保存先は Firebase(CloudStore) とブラウザ内保存(DemoStore) を同じ関数名で切り替える。 */
(function (global) {
  'use strict';

  // ---------- DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }
  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function fmtDate(iso, withWd = true) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WD[new Date(y, m - 1, d).getDay()];
    return `${y}年${m}月${d}日` + (withWd ? `（${wd}）` : '');
  }

  // ---------- 役職と権限 ----------
  // level が高いほど権限が広い。all=true は全組織の会議を閲覧できる。
  const ROLES = [
    { id: 'owner',   name: '代表',           level: 100, all: true,  edit: 'all' },
    { id: 'area',    name: 'エリアMG・統括', level: 80,  all: true,  edit: 'all' },
    { id: 'manager', name: '店長・部署長',   level: 60,  all: false, edit: 'own' },
    { id: 'exec',    name: '幹部',           level: 40,  all: false, edit: 'none' },
    { id: 'staff',   name: '内勤・スタッフ', level: 20,  all: false, edit: 'none' },
  ];
  const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[ROLES.length - 1];

  // 会議の公開範囲: 'org' = その組織の全員 / 'exec' = その組織の幹部以上
  const VIS = { org: '所属メンバー全員', exec: '幹部以上のみ' };

  const Perm = {
    canView(user, mtg) {
      if (!user || !mtg) return false;
      const r = roleOf(user.role);
      if (r.all) return true;
      if (!(user.orgIds || []).includes(mtg.orgId)) return false;
      if (mtg.status !== 'published' && r.edit === 'none') return false;
      if (mtg.visibility === 'exec' && r.level < roleOf('exec').level) return false;
      return true;
    },
    canEdit(user, mtg) {
      const r = roleOf(user && user.role);
      if (r.edit === 'all') return true;
      if (r.edit === 'own') return (user.orgIds || []).includes(mtg ? mtg.orgId : '');
      return false;
    },
    canCreateIn(user, orgId) { return this.canEdit(user, { orgId }); },
    // 宿題のチェックは編集者か、その宿題の担当者本人
    canCheckTask(user, mtg, task) {
      return this.canEdit(user, mtg) || (!!task.assigneeId && task.assigneeId === user.memberId);
    },
    canAdmin(user) { return roleOf(user && user.role).level >= 100; },
  };

  // ---------- 保存先 ----------
  // cloud: Firebase(Firestore)。ログイン必須で、権限はサーバー側のルール(firebase/firestore.rules)でも強制される。
  // demo : ブラウザ内保存。URLに ?demo を付けるか、Firebaseが読み込めないときに使う。
  const KEY = 'spachoco-os-v1';
  const COLLS = ['orgs', 'members', 'meetings'];
  const ROOT_EMAIL = 'spicechocolategroup@gmail.com';
  const wantDemo = /[?&]demo\b/.test(location.search);
  const cloudReady = !wantDemo && global.SPACHOCO_FIREBASE && global.firebase && global.firebase.initializeApp;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  let mem = null;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 保存できない環境でも表示は続ける */ }
  }
  const DemoStore = {
    mode: 'demo',
    async init(seed) {
      mem = load();
      if (!mem || !mem.orgs) { mem = clone(seed); persist(); }
      for (const c of COLLS) mem[c] = mem[c] || [];
    },
    async list(coll) { return (mem[coll] || []).map((x) => ({ ...x })); },
    async get(coll, id) { const x = (mem[coll] || []).find((o) => o.id === id); return x ? clone(x) : null; },
    async put(coll, obj) {
      obj = clone(obj);
      obj.updatedAt = new Date().toISOString();
      const arr = mem[coll] || (mem[coll] = []);
      const i = arr.findIndex((o) => o.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      persist();
      return obj;
    },
    async patch(coll, id, fields) {
      const x = (mem[coll] || []).find((o) => o.id === id);
      if (x) { Object.assign(x, clone(fields), { updatedAt: new Date().toISOString() }); persist(); }
    },
    async del(coll, id) { mem[coll] = (mem[coll] || []).filter((o) => o.id !== id); persist(); },
    async reset(seed) { mem = clone(seed); persist(); },
  };

  let fdb = null;
  const CloudStore = {
    mode: 'cloud',
    async init() {
      if (!global.firebase.apps.length) global.firebase.initializeApp(global.SPACHOCO_FIREBASE);
      fdb = global.firebase.firestore();
    },
    // 議事録は、その人が読める範囲だけを問い合わせる(ルールが範囲外の問い合わせを拒否するため)
    async list(coll, user) {
      if (coll !== 'meetings') return (await fdb.collection(coll).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
      const r = roleOf(user && user.role);
      if (r.all) return (await fdb.collection('meetings').get()).docs.map((d) => ({ ...d.data(), id: d.id }));
      const orgIds = (user && user.orgIds) || [];
      const out = [];
      for (let i = 0; i < orgIds.length; i += 30) {
        let q = fdb.collection('meetings').where('orgId', 'in', orgIds.slice(i, i + 30));
        if (r.level < roleOf('manager').level) q = q.where('status', '==', 'published');
        if (r.level < roleOf('exec').level) q = q.where('visibility', '==', 'org');
        (await q.get()).docs.forEach((d) => out.push({ ...d.data(), id: d.id }));
      }
      return out;
    },
    async get(coll, id) {
      try { const d = await fdb.collection(coll).doc(id).get(); return d.exists ? { ...d.data(), id: d.id } : null; } catch (e) { return null; }
    },
    async put(coll, obj) {
      obj = clone(obj);
      obj.updatedAt = new Date().toISOString();
      await fdb.collection(coll).doc(obj.id).set(obj);
      return obj;
    },
    async patch(coll, id, fields) {
      await fdb.collection(coll).doc(id).update({ ...clone(fields), updatedAt: new Date().toISOString() });
    },
    async del(coll, id) { await fdb.collection(coll).doc(id).delete(); },
  };
  const Store = cloudReady ? CloudStore : DemoStore;

  // ---------- ログイン中のユーザー ----------
  // cloud: Googleログイン → accounts/{メール} で役職・所属を引く。未登録なら閲覧できない。
  // demo : 名簿から「誰として見るか」を切り替えて権限を確認できる。
  const Session = cloudReady ? {
    cloud: true,
    async waitAuth() {
      const auth = global.firebase.auth();
      return new Promise((res) => { const off = auth.onAuthStateChanged((u) => { off(); res(u); }); });
    },
    async signIn() {
      const p = new global.firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      await global.firebase.auth().signInWithPopup(p);
    },
    async signOut() { await global.firebase.auth().signOut(); },
    // 戻り値: null(未ログイン) / {unregistered:true, email} / ユーザー
    async current() {
      const u = global.firebase.auth().currentUser;
      if (!u) return null;
      const email = (u.email || '').toLowerCase();
      const a = await CloudStore.get('accounts', email);
      if (a) return { memberId: a.memberId || '', name: a.name || u.displayName || email, role: a.role, orgIds: a.orgIds || [], email };
      if (email === ROOT_EMAIL) return { memberId: '', name: u.displayName || '代表', role: 'owner', orgIds: [], email };
      return { unregistered: true, email };
    },
    switchTo() {},
  } : {
    cloud: false,
    async waitAuth() { return null; },
    async current() {
      const members = await Store.list('members');
      let id = null;
      try { id = localStorage.getItem(KEY + ':as'); } catch (e) {}
      const m = members.find((x) => x.id === id) || members.find((x) => x.role === 'owner') || members[0];
      return m ? { memberId: m.id, name: m.name, role: m.role, orgIds: m.orgIds || [] } : null;
    },
    switchTo(memberId) { try { localStorage.setItem(KEY + ':as', memberId); } catch (e) {} },
  };

  global.OS = { h, toast, uid, fmtDate, ROLES, roleOf, VIS, Perm, Store, Session };
})(window);
