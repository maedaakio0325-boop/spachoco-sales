/* ===== SPACHOCO OS  共通コア =====
   全アプリ共通: DOMヘルパー / 名簿マスタ / 権限 / データ保存(Store)。
   第1段階はブラウザ内保存(DemoStore)。第2段階で同じ関数名のまま Firebase(Firestore) に差し替える。 */
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

  // ---------- Store (第1段階: ブラウザ内保存) ----------
  const KEY = 'spachoco-os-v1';
  const COLLS = ['orgs', 'members', 'meetings'];
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  let mem = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 保存できない環境でも表示は続ける */ }
  }
  const Store = {
    mode: 'demo',
    async init(seed) {
      if (!mem || !mem.orgs) { mem = JSON.parse(JSON.stringify(seed)); persist(); }
      for (const c of COLLS) mem[c] = mem[c] || [];
    },
    async list(coll) { return (mem[coll] || []).map((x) => ({ ...x })); },
    async get(coll, id) { const x = (mem[coll] || []).find((o) => o.id === id); return x ? JSON.parse(JSON.stringify(x)) : null; },
    async put(coll, obj) {
      obj = JSON.parse(JSON.stringify(obj));
      obj.updatedAt = new Date().toISOString();
      const arr = mem[coll] || (mem[coll] = []);
      const i = arr.findIndex((o) => o.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      persist();
      return obj;
    },
    async del(coll, id) { mem[coll] = (mem[coll] || []).filter((o) => o.id !== id); persist(); },
    async reset(seed) { mem = JSON.parse(JSON.stringify(seed)); persist(); },
  };

  // ---------- ログイン中のユーザー ----------
  // 第1段階: 名簿から「誰として見るか」を切り替えて権限を確認できる。第2段階で Googleログインに置き換え。
  const Session = {
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
