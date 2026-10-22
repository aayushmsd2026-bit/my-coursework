// My Coursework — a personal layer on top of a friend's shared assignment hub.
//
// Two layers, never mixed:
//   1. HUB   — your friend's data.js, fetched live and treated as read-only.
//   2. YOURS — everything you do (ticks, edits, notes, links, emails), stored per item id
//              in your own Firestore document. Syncing the hub never touches this layer.
// When the hub changes something you've also edited, your value is kept and the item is
// flagged so you can choose. If he renames an id or deletes an item, your data is re-linked
// by subject + title, or kept as "removed from the hub" — it is never thrown away.

const CONFIG = window.COURSEWORK_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  check: svg('<path d="M5 12l5 5L20 7"/>', 3.5),
  todo: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  done: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  book: svg('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.5),
  open: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  send: svg('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
  pin: svg('<path d="M12 17v4M8 3h8l-1 6 3 4H6l3-4z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  doc: svg('<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>', 1.8),
  dots: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 2.4),
  clip: svg('<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>'),
  play: svg('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>'),
  sheetI: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>'),
  slides: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v3M8 20h8"/>'),
  drive: svg('<path d="M8.5 4h7l5.5 9.5-3.5 6h-11L3 13.5z"/><path d="M8.5 4l5.5 9.5H21M3 13.5h11"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  me: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
};

/* =========================================================================
   1. HUB — fetch your friend's data.js live and parse it without running it
   ========================================================================= */

// data.js is JavaScript, not JSON. Running someone else's code inside your signed-in page
// would give it access to your account, so it's parsed as plain data instead.
function parseLiteral(src, start) {
  let i = start;
  const fail = () => { throw new SyntaxError("Unexpected token at " + i); };
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) { const n = src.indexOf("\n", i); i = n < 0 ? src.length : n; }
      else if (src.startsWith("/*", i)) { const n = src.indexOf("*/", i + 2); i = n < 0 ? src.length : n + 2; }
      else return;
    }
  };
  const ident = () => { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200)); if (!m) fail(); i += m[0].length; return m[0]; };
  const str = () => {
    const q = src[i++]; let s = "";
    while (src[i] !== q) {
      if (i >= src.length) fail();
      if (src[i] === "\\") {
        const n = src[i + 1]; i += 2;
        if (n === "u") { s += String.fromCharCode(parseInt(src.substr(i, 4), 16)); i += 4; }
        else if (n === "\n") { /* line continuation */ }
        else s += { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" }[n] ?? n;
      } else s += src[i++];
    }
    i++; return s;
  };
  const val = () => {
    ws(); const c = src[i];
    if (c === "[") { i++; const a = []; for (;;) { ws(); if (src[i] === "]") { i++; return a; } a.push(val()); ws(); if (src[i] === ",") i++; else if (src[i] !== "]") fail(); } }
    if (c === "{") {
      i++; const o = {};
      for (;;) {
        ws(); if (src[i] === "}") { i++; return o; }
        const k = src[i] === '"' || src[i] === "'" ? str() : /\d/.test(src[i]) ? String(val()) : ident();
        ws(); if (src[i++] !== ":") fail();
        o[k] = val(); ws();
        if (src[i] === ",") i++; else if (src[i] !== "}") fail();
      }
    }
    if (c === '"' || c === "'" || c === "`") return str();
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (m) { i += m[0].length; return Number(m[0]); }
    const id = ident();
    if (id === "true") return true; if (id === "false") return false; if (id === "null" || id === "undefined") return null;
    fail();
  };
  return val();
}
function readConst(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(src);
  return m ? parseLiteral(src, m.index + m[0].length) : undefined;
}
function parseHub(src) {
  const SUBJECTS = readConst(src, "SUBJECTS");
  if (!Array.isArray(SUBJECTS) || !SUBJECTS.length) throw new Error("No SUBJECTS found in the hub");
  return { SUBJECTS, GENERAL: readConst(src, "GENERAL") || [], MODULE_COUNT: readConst(src, "MODULE_COUNT") || 5 };
}
const HUB_URLS = CONFIG.hubUrls || ["https://neotahiro.github.io/assignment-hub/data.js"];
const HUB_CACHE = "mc-hub-cache";
let HUB = null, hubState = { source: "", at: 0, error: "" };

async function fetchHub() {
  for (const u of HUB_URLS) {
    try {
      const r = await fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) continue;
      const data = parseHub(await r.text());
      hubState = { source: u, at: Date.now(), error: "" };
      try { localStorage.setItem(HUB_CACHE, JSON.stringify({ data, at: hubState.at, source: u })); } catch (e) {}
      return data;
    } catch (e) { hubState.error = e.message; }
  }
  throw new Error(hubState.error || "Hub unreachable");
}
async function cachedHub() {
  try { const c = JSON.parse(localStorage.getItem(HUB_CACHE)); if (c && c.data) { hubState = { source: c.source, at: c.at, error: "", cached: true }; return c.data; } } catch (e) {}
  const r = await fetch("hub-fallback.json"); const d = await r.json();
  hubState = { source: "built-in copy", at: Date.parse(d.syncedAt) || 0, error: "", cached: true };
  return d;
}

// ---------- Hub → items ----------
const FIELDS = ["title", "due", "time", "link", "email", "module"];
const strip = a => { const o = {}; for (const k of FIELDS) if (a[k] != null && a[k] !== "") o[k] = a[k]; return o; };
const norm = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fingerprint = a => a.sid + "|" + a.kind + "|" + norm(a.title);
let SUBJ = [], BASE = [], BASE_BY_ID = new Map();

function buildFromHub(hub) {
  const palette = S.colors || (S.colors = {});
  const nextColor = () => { const used = Object.values(palette); for (let n = 1; n <= 5; n++) if (!used.includes(n)) return n; return (used.length % 5) + 1; };
  SUBJ = hub.SUBJECTS.map(s => {
    const m = String(s.name || s.id).match(/^([A-Z]+\s*\d+)\s*:\s*(.+)$/);
    if (!palette[s.id]) palette[s.id] = nextColor();
    return { id: s.id, code: m ? m[1] : "", short: m ? m[2] : s.name, name: s.name, color: `var(--s${palette[s.id]})`, modules: s.modules || hub.MODULE_COUNT || 5 };
  });
  SUBJ.push({ id: "general", code: "", short: "General", name: "General", color: "var(--s0)", modules: 1 });
  // His ids are hand-typed, so duplicates happen ("gen-a1" twice). The second copy becomes "gen-a1~2".
  const seen = {};
  const uid = id => { id = String(id || "item"); seen[id] = (seen[id] || 0) + 1; return seen[id] === 1 ? id : `${id}~${seen[id]}`; };
  BASE = [];
  hub.SUBJECTS.forEach(s => {
    (s.assignments || []).forEach(a => BASE.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "assignment" }));
    (s.readings || []).forEach(a => BASE.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "reading" }));
    (s.notes || []).forEach(a => BASE.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "note" }));
  });
  (hub.GENERAL || []).forEach(a => BASE.push({ ...strip(a), id: uid(a.id), sid: "general", kind: "assignment", module: 1 }));
  BASE_BY_ID = new Map(BASE.map(b => [b.id, b]));
}
const subjOf = id => SUBJ.find(s => s.id === id) || { id, code: "", short: "Removed subject", name: "Removed subject", color: "var(--s0)", modules: 5 };

/* =========================================================================
   2. YOURS — your layer, keyed by item id
   ========================================================================= */
const EMPTY = () => ({ v: 2, done: {}, edits: {}, custom: [], hidden: {}, star: {}, seen: [], flags: {}, work: {}, sent: {}, snap: {}, colors: {}, profile: {}, teachers: {} });
const MAPS = ["done", "edits", "hidden", "star", "work", "sent"];
const load = o => { const s = { ...EMPTY(), ...(o || {}) }; for (const k of Object.keys(EMPTY())) if (s[k] == null) s[k] = EMPTY()[k]; delete s.flags.importDismissed; return s; };
const LOCAL = "mc-state";
let S = EMPTY();
try { S = load(JSON.parse(localStorage.getItem(LOCAL))); } catch (e) {}

// Keep your data attached to the right item when the hub changes underneath it.
function reconcile() {
  let changed = false, relinked = 0;
  const hasData = id => MAPS.some(m => id in S[m]);
  const userIds = new Set(MAPS.flatMap(m => Object.keys(S[m])));
  for (const id of userIds) {
    if (BASE_BY_ID.has(id) || S.custom.some(c => c.id === id)) continue;
    const old = S.snap[id];
    if (!old) continue;
    const match = BASE.find(b => fingerprint(b) === fingerprint(old) && !hasData(b.id));
    if (!match) continue;
    for (const m of MAPS) if (id in S[m]) { S[m][match.id] = S[m][id]; delete S[m][id]; }
    S.snap[match.id] = S.snap[id]; delete S.snap[id];
    if (S.seen.includes(id)) S.seen.push(match.id); // a renamed item isn't new to you
    relinked++; changed = true;
  }
  if (updateSnaps()) changed = true;
  // Older edits (from before conflict tracking) adopt the current hub values as their starting point.
  for (const [id, e] of Object.entries(S.edits)) {
    const b = BASE_BY_ID.get(id); if (!b || e._from) continue;
    e._from = {}; for (const k of FIELDS) if (k in e) e._from[k] = b[k] ?? null;
    changed = true;
  }
  return { changed, relinked };
}

// Remember the last hub version of anything you've touched, so your data can be re-attached
// if he renames its id, and kept if he deletes it.
function updateSnaps() {
  let changed = false;
  for (const id of new Set(MAPS.flatMap(m => Object.keys(S[m])))) {
    const b = BASE_BY_ID.get(id); if (!b) continue;
    const snap = { ...strip(b), sid: b.sid, kind: b.kind };
    if (JSON.stringify(S.snap[id]) !== JSON.stringify(snap)) { S.snap[id] = snap; changed = true; }
  }
  return changed;
}

function items() {
  const out = BASE.map(b => {
    const e = S.edits[b.id] || {};
    const it = { ...b, base: b, note: e.note || "" };
    const conflicts = [];
    for (const k of FIELDS) if (k in e) {
      it[k] = e[k] ?? undefined;
      if (e._from && k in e._from && (e._from[k] ?? null) !== (b[k] ?? null)) conflicts.push({ k, was: e._from[k], now: b[k] ?? null, mine: e[k] ?? null });
    }
    it.edited = FIELDS.some(k => k in e && (e[k] ?? null) !== (b[k] ?? null));
    it.conflicts = conflicts;
    return it;
  });
  // Items he removed but you have data on.
  for (const id of new Set(MAPS.flatMap(m => Object.keys(S[m])))) {
    if (BASE_BY_ID.has(id) || S.custom.some(c => c.id === id) || !S.snap[id]) continue;
    const e = S.edits[id] || {}, sn = S.snap[id];
    const it = { ...sn, id, base: sn, note: e.note || "", removed: true, conflicts: [] };
    for (const k of FIELDS) if (k in e) it[k] = e[k] ?? undefined;
    out.push(it);
  }
  S.custom.forEach(c => out.push({ ...c, custom: true, conflicts: [] }));
  return out.map(it => ({
    ...it, work: S.work[it.id] || [], sent: S.sent[it.id] || [],
    done: !!S.done[it.id], hidden: it.id in S.hidden ? !!S.hidden[it.id] : isPlaceholder(it), star: !!S.star[it.id],
    isNew: !it.custom && !it.removed && S.seen.length > 0 && !S.seen.includes(it.id),
  }));
}
// Your friend's placeholder entries ("…please ignore") start hidden; you can unhide them.
const isPlaceholder = a => /please ignore|this is a test/i.test(a.base ? a.base.title : a.title);
const tasks = all => all.filter(a => a.kind === "assignment" || (a.kind === "reading" && a.due));

/* =========================================================================
   3. SAVING — local first, then your Firestore document
   ========================================================================= */
let fb = null, cloudRef = null, saveTimer = null, writing = Promise.resolve(), lastWritten = "", localDirty = false;
function persist() {
  updateSnaps();
  try { localStorage.setItem(LOCAL, JSON.stringify(S)); } catch (e) {}
  if (!cloudRef) { localDirty = true; return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const body = JSON.stringify(S);
    if (body === lastWritten) return;
    setSync("saving");
    writing = writing.then(() => fb.F.setDoc(cloudRef, JSON.parse(body)).then(() => { lastWritten = body; setSync("cloud"); }, err => { console.error(err); setSync("error"); }));
  }, 600);
}
function setSync(state) {
  const el = $("#syncst");
  const map = { local: ["", "Saved on this device"], saving: ["cloud", "Saving…"], cloud: ["cloud", navigator.onLine ? "Synced to your account" : "Offline · will sync when back online"], error: ["warn", "Couldn't save to your account · kept on this device"], signedout: ["", "Not signed in · saved on this device"] };
  const [cls, txt] = map[state] || map.local;
  el.className = "st " + cls; el.textContent = txt;
}
addEventListener("online", () => cloudRef && setSync("cloud"));
addEventListener("offline", () => cloudRef && setSync("cloud"));

// Union of two states, used when importing or when you signed in after working offline.
function mergeState(a, b) {
  const out = load(JSON.parse(JSON.stringify(a)));
  for (const m of ["done", "hidden", "star", "snap", "colors", "teachers"]) out[m] = { ...b[m], ...out[m] };
  for (const [id, e] of Object.entries(b.edits || {})) out.edits[id] = out.edits[id] || e;
  for (const [id, list] of Object.entries(b.work || {})) { const have = new Set((out.work[id] || []).map(w => w.url)); out.work[id] = [...(out.work[id] || []), ...list.filter(w => !have.has(w.url))]; }
  for (const [id, list] of Object.entries(b.sent || {})) { const have = new Set((out.sent[id] || []).map(w => w.at)); out.sent[id] = [...(out.sent[id] || []), ...list.filter(w => !have.has(w.at))]; }
  const ids = new Set(out.custom.map(c => c.id)); out.custom.push(...(b.custom || []).filter(c => !ids.has(c.id)));
  out.seen = [...new Set([...(out.seen || []), ...(b.seen || [])])];
  out.profile = { ...(b.profile || {}), ...(out.profile || {}) };
  out.flags = { ...(b.flags || {}), ...(out.flags || {}) };
  return out;
}

/* =========================================================================
   4. FIREBASE — Google sign-in, your document, Gmail token
   ========================================================================= */
const FB_VERSION = "10.12.2";
const fbReady = (() => { const c = CONFIG.firebase; return c && c.apiKey && !/PASTE/.test(c.apiKey); })();
async function initFirebase() {
  if (!fbReady) { setSync("local"); renderAcct(); return; }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    const [appM, A, F] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const app = appM.initializeApp(CONFIG.firebase);
    const auth = A.getAuth(app);
    let db;
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { db = F.getFirestore(app); }
    fb = { auth, db, A, F, user: null, unsub: null };
    A.getRedirectResult(auth).catch(e => toast(authError(e)));
    A.onAuthStateChanged(auth, onUser);
  } catch (e) { console.error(e); fb = null; setSync("local"); renderAcct("Couldn't load sign-in. Check your connection."); }
}
function onUser(u) {
  fb.user = u;
  if (fb.unsub) { fb.unsub(); fb.unsub = null; }
  cloudRef = null; gtok = null;
  renderAcct();
  if (!u) { setSync("signedout"); render(); return; }
  setSync("saving");
  const ref = fb.F.doc(fb.db, "users", u.uid);
  let first = true;
  fb.unsub = fb.F.onSnapshot(ref, snap => {
    if (snap.metadata.hasPendingWrites) return;
    const cloud = snap.exists() ? snap.data() : null;
    if (first) {
      first = false;
      cloudRef = ref;
      S = cloud ? (localDirty ? mergeState(load(cloud), S) : load(cloud)) : S;
      if (!S.profile.name && u.displayName) S.profile.name = u.displayName;
      lastWritten = cloud ? JSON.stringify(cloud) : "";
      localDirty = false;
      if (HUB) { buildFromHub(HUB); reconcile(); }
      persist(); setSync("cloud"); render(); markSeen();
      return;
    }
    if (!cloud) return;
    const body = JSON.stringify(cloud);
    if (body === lastWritten || body === JSON.stringify(S)) return;
    S = load(cloud); lastWritten = body;
    try { localStorage.setItem(LOCAL, body); } catch (e) {}
    if (!anyPanelOpen()) render();
  }, err => { console.error(err); setSync("error"); });
}
function authError(e) {
  const c = e && e.code || "";
  if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "Sign-in was cancelled";
  if (c.includes("unauthorized-domain")) return "This site's address isn't allowed yet. Add it under Firebase → Authentication → Settings → Authorized domains.";
  if (c.includes("user-mismatch")) return "Pick the same Google account you signed in with";
  if (c.includes("network")) return "No connection. Try again when you're online.";
  return "Sign-in didn't work: " + (e && e.message || c);
}
function signIn() {
  if (!fb) { toast(fbReady ? "Sign-in is still loading" : "Add your Firebase settings to config.js first"); return; }
  const p = new fb.A.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  fb.A.signInWithPopup(fb.auth, p).catch(e => {
    if (/popup-blocked|operation-not-supported/.test(e.code)) fb.A.signInWithRedirect(fb.auth, p);
    else toast(authError(e));
  });
}
function signOut() {
  if (!fb) return;
  fb.A.signOut(fb.auth).then(() => {
    // Leave nothing behind on a shared computer; it's all in your account.
    S = EMPTY(); try { localStorage.removeItem(LOCAL); } catch (e) {}
    if (HUB) { buildFromHub(HUB); markSeen(); }
    render(); toast("Signed out. Your data is safe in your account.");
  });
}

// Gmail: ask for permission to send only when you first send, and keep the token in memory for ~50 minutes.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
let gtok = null;
function gmailToken() {
  if (gtok && gtok.exp > Date.now()) return Promise.resolve(gtok.v);
  const p = new fb.A.GoogleAuthProvider(); p.addScope(GMAIL_SCOPE); p.setCustomParameters({ login_hint: fb.user.email });
  return fb.A.reauthenticateWithPopup(fb.user, p).then(r => {
    const c = fb.A.GoogleAuthProvider.credentialFromResult(r);
    if (!c || !c.accessToken) throw new Error("Google didn't return permission to send");
    gtok = { v: c.accessToken, exp: Date.now() + 50 * 6e4 };
    return gtok.v;
  });
}
const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const wrap76 = s => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const mimeHeader = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
async function gmailSend(token, m) {
  const B = "mc_" + Math.random().toString(36).slice(2);
  const raw = [
    `To: ${m.to}`, m.cc ? `Cc: ${m.cc}` : null, `Subject: ${mimeHeader(m.subject)}`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${B}"`, "",
    `--${B}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(m.text)),
    `--${B}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap76(b64(m.html)),
    `--${B}--`, "",
  ].filter(l => l !== null).join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error((j.error && j.error.message) || "Gmail returned " + r.status); e.status = r.status; throw e; }
  return r.json();
}

/* =========================================================================
   5. DATES & HELPERS
   ========================================================================= */
const pad = n => String(n).padStart(2, "0");
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dueAt = a => { if (!a.due) return null; const d = parseD(a.due); if (a.time) { const [h, m] = a.time.split(":").map(Number); d.setHours(h, m); } else d.setHours(23, 59); return d; };
const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayDiff = a => Math.round((sod(parseD(a.due)) - sod(new Date())) / 864e5);
const fmtDate = s => parseD(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtLong = s => parseD(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = t => { const [h, m] = t.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
const isPast = a => !!a.due && dueAt(a) < new Date();
function urgency(a) { if (!a.due || a.done) return ""; if (isPast(a)) return "late"; const n = dayDiff(a); return n <= 1 ? "soon" : n <= 7 ? "week" : ""; }
function dueText(a) {
  if (!a.due) return "No deadline";
  const n = dayDiff(a), t = a.time ? ", " + fmtTime(a.time) : "";
  if (isPast(a)) return a.done ? "Was due " + fmtDate(a.due) : n === 0 ? "Was due today" + t : `${-n} day${n === -1 ? "" : "s"} overdue`;
  if (n === 0) return "Due today" + t;
  if (n === 1) return "Due tomorrow" + t;
  if (n < 7) return `Due ${parseD(a.due).toLocaleDateString(undefined, { weekday: "long" })}${t}`;
  return `Due ${fmtDate(a.due)}${t}`;
}
function countdown(a) { const ms = dueAt(a) - new Date(), h = Math.floor(ms / 36e5); return h < 48 ? `${h}h ${pad(Math.floor(ms / 6e4) % 60)}m left` : `${Math.floor(h / 24)} days left`; }
const ago = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
const shortTitle = (t, n = 60) => t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n) > 30 ? t.lastIndexOf(" ", n) : n).replace(/[,.:;]$/, "") + "…";

function linkInfo(url) {
  let h = ""; try { h = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
  if (/youtube\.com|youtu\.be/.test(h)) return { icon: ICON.play, kind: "YouTube video", host: h };
  if (/docs\.google\.com/.test(h)) {
    if (url.includes("/presentation")) return { icon: ICON.slides, kind: "Google Slides", host: h };
    if (url.includes("/spreadsheets")) return { icon: ICON.sheetI, kind: "Google Sheet", host: h };
    if (url.includes("/forms")) return { icon: ICON.doc, kind: "Google Form", host: h };
    return { icon: ICON.doc, kind: "Google Doc", host: h };
  }
  if (/drive\.google\.com/.test(h)) return { icon: ICON.drive, kind: "Google Drive file", host: h };
  if (/onedrive|sharepoint|1drv/.test(h)) return { icon: ICON.drive, kind: "OneDrive file", host: h };
  if (/kusoed|moodle/.test(h)) return { icon: ICON.globe, kind: "Moodle", host: h };
  return { icon: ICON.globe, kind: h || "Link", host: h };
}
const normURL = u => { u = u.trim(); if (!u) return ""; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u; try { return new URL(u).href; } catch (e) { return ""; } };

/* =========================================================================
   6. RENDERING
   ========================================================================= */
let view = "todo", filter = "all", query = "", openSubj = null, subTab = "assignments", openMod = 0, showHidden = false;
try { const v = JSON.parse(sessionStorage.getItem("mc-ui") || "{}"); view = v.view || view; filter = v.filter || filter; openSubj = v.openSubj || null; subTab = v.subTab || subTab; } catch (e) {}
const saveUI = () => { try { sessionStorage.setItem("mc-ui", JSON.stringify({ view, filter, openSubj, subTab })); } catch (e) {} };
const matches = a => !query || (a.title + " " + subjOf(a.sid).name + " " + (a.note || "") + " " + (a.work || []).map(w => w.label + " " + w.url).join(" ")).toLowerCase().includes(query);
const inFilter = a => filter === "all" || a.sid === filter;
const byDue = (x, y) => ((dueAt(x) || 8e15) - (dueAt(y) || 8e15));

function itemHTML(a) {
  const s = subjOf(a.sid), u = urgency(a);
  const tags = [
    a.star ? `<span class="tag pin">Pinned</span>` : "",
    a.isNew ? `<span class="tag new">New</span>` : "",
    a.conflicts.length ? `<span class="tag conflict">Hub updated</span>` : "",
    a.removed ? `<span class="tag gone">Removed from hub</span>` : "",
    a.kind === "reading" ? `<span class="tag">Reading</span>` : "",
    a.sent.length ? `<span class="tag sent">${ICON.send}Emailed</span>` : "",
    a.work.length ? `<span class="tag work">${ICON.clip}${a.work.length} ${a.work.length === 1 ? "link" : "links"}</span>` : "",
    a.custom ? `<span class="tag mine">Added by you</span>` : a.edited ? `<span class="tag mine">Edited</span>` : "",
  ].join("");
  const quick = a.link ? `<a class="icon" href="${esc(a.link)}" target="_blank" rel="noopener" title="Open on Moodle / Drive" aria-label="Open link">${ICON.open}</a>` : "";
  return `<div class="item${a.done ? " isdone" : ""}${u === "late" ? " late" : ""}" style="--c:${s.color}" data-id="${esc(a.id)}" data-open tabindex="0" role="button" aria-label="${esc(a.title.slice(0, 80))}">
    <button class="check${a.done ? " on" : ""}" type="button" data-toggle aria-pressed="${a.done}" aria-label="${a.done ? "Mark as not done" : "Mark as done"}" title="${a.done ? "Mark as not done" : "Mark as done"}">${ICON.check}</button>
    <div class="body"><div class="ttl">${esc(a.title)}</div>
      <div class="meta"><span class="sj" style="--c:${s.color}">${esc(s.short)}</span><span class="due ${u}">${esc(dueText(a))}</span>${tags}</div>
      ${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}</div>
    <div class="quick">${quick}</div></div>`;
}
const group = (title, list, cls = "", hint = "") => list.length ? `<section class="group"><div class="ghead ${cls}"><h2>${title}</h2><span class="n">${list.length}</span>${hint ? `<span class="hint">${hint}</span>` : ""}</div>${list.map(itemHTML).join("")}</section>` : "";

function toolbar(all, chips = true) {
  const t = tasks(all).filter(a => !a.hidden);
  const list = [["all", "", "All subjects"]].concat(SUBJ.filter(s => t.some(a => a.sid === s.id)).map(s => [s.id, s.color, s.short]));
  return `<div class="toolbar"><label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="q" type="search" placeholder="Search your assignments" aria-label="Search" value="${esc(query)}"><kbd>/</kbd></label>
    ${chips ? `<div class="chips" role="group" aria-label="Filter by subject">${list.map(([id, c, n]) => `<button type="button" data-filter="${id}" class="${filter === id ? "on" : ""}">${c ? `<span class="sw" style="background:${c}"></span>` : ""}${esc(n)}</button>`).join("")}</div>` : ""}</div>`;
}
function tiles(all) {
  const t = tasks(all).filter(a => !a.hidden), d = t.filter(a => a.done).length;
  const open = t.filter(a => !a.done), late = open.filter(isPast);
  const nx = open.filter(a => a.due && !isPast(a)).sort(byDue)[0];
  const C = 2 * Math.PI * 27, pct = t.length ? d / t.length : 0;
  return `<div class="tiles">
    <button type="button" class="tile ${late.length ? "late" : "ok"}" data-jump="late"><span class="label">Overdue</span><span class="big">${late.length}</span><span class="s">${late.length ? "Already submitted? Tick them off" : "You're on top of things"}</span></button>
    ${nx ? `<button type="button" class="tile next" data-id="${esc(nx.id)}" data-open><span class="label">Next deadline</span><span class="nt">${esc(nx.title)}</span><span class="cd">${esc(dueText(nx))} · ${countdown(nx)}</span></button>` : `<div class="tile next"><span class="label">Next deadline</span><span class="nt">No upcoming deadlines</span></div>`}
    <button type="button" class="tile prog" data-go="done"><span class="ring"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--line-strong)" stroke-width="7"/><circle cx="32" cy="32" r="27" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg></span><span class="txt"><span class="label">Your progress</span><span class="big">${d}<small> / ${t.length}</small></span></span></button>
  </div>`;
}
function setupCard(all) {
  const past = tasks(all).filter(a => !a.hidden && !a.done && isPast(a)).sort(byDue);
  if (!past.length) return "";
  return `<section class="setup" id="setup"><header><span class="label">Quick start</span><h2>Which of these have you already submitted?</h2><p>These deadlines have passed. Tick the ones you've handed in; the rest stay on your list as overdue.</p></header>
    <ul>${past.map(a => `<li><label><input type="checkbox" value="${esc(a.id)}"><span><span class="t">${esc(a.title)}</span><span class="m">${esc(subjOf(a.sid).short)} · was due ${esc(fmtDate(a.due))}</span></span></label></li>`).join("")}</ul>
    <footer><button class="btn ghost" type="button" data-setup="skip">Skip</button><button class="btn" type="button" data-setup="all">I submitted all of them</button><button class="btn primary" type="button" data-setup="save">Save ticked</button></footer></section>`;
}
function renderTodo(all) {
  const t = tasks(all).filter(a => !a.hidden && inFilter(a) && matches(a));
  const open = t.filter(a => !a.done).sort(byDue);
  const pinned = open.filter(a => a.star), rest = open.filter(a => !a.star);
  const late = rest.filter(isPast), up = rest.filter(a => a.due && !isPast(a));
  const today = up.filter(a => dayDiff(a) === 0), tmr = up.filter(a => dayDiff(a) === 1), week = up.filter(a => dayDiff(a) > 1 && dayDiff(a) <= 7), later = up.filter(a => dayDiff(a) > 7);
  const nod = rest.filter(a => !a.due);
  const showSetup = !query && filter === "all" && !S.flags.setupDone;
  const groups = group("Pinned", pinned) + group("Overdue", late, "late", "Submitted already? Tick it off") + group("Today", today) + group("Tomorrow", tmr) + group("This week", week) + group("Later", later) + group("No deadline", nod, "", "Open-ended, or no date announced yet");
  return (showSetup ? setupCard(all) : "") + tiles(all) + toolbar(all)
    + (groups || `<div class="empty"><b>${query ? "Nothing matches that search" : "All caught up"}</b>${query ? "Try a different word." : filter === "all" ? "Nothing left to do. Nice work." : "Nothing left in this subject."}</div>`)
    + footRow(all, t.filter(a => a.done).length);
}
function footRow(all, dn) {
  const h = all.filter(a => a.hidden && inFilter(a));
  const bits = [];
  if (dn) bits.push(`${dn} completed · <button type="button" data-go="done">View</button>`);
  if (h.length) bits.push(`${h.length} hidden · <button type="button" data-showhidden>${showHidden ? "Hide them" : "Show"}</button>`);
  return (bits.length ? `<p class="more">${bits.join(" &nbsp;·&nbsp; ")}</p>` : "") + (showHidden && h.length ? group("Hidden", h, "", "Open one to unhide it") : "");
}
function renderDone(all) {
  const t = tasks(all).filter(a => !a.hidden && a.done && inFilter(a) && matches(a)).sort((x, y) => (S.done[y.id] || 0) - (S.done[x.id] || 0));
  return toolbar(all) + (group("Completed", t, "", "Most recent first · untick to move back") || `<div class="empty"><b>Nothing completed yet</b>Tick the box next to an assignment and it moves here.</div>`);
}
function renderSubjects(all) {
  return `<div class="sgrid">${SUBJ.filter(s => all.some(a => a.sid === s.id && !a.hidden)).map(s => {
    const t = tasks(all).filter(a => a.sid === s.id && !a.hidden), d = t.filter(a => a.done).length;
    const rd = all.filter(a => a.sid === s.id && a.kind === "reading" && !a.hidden), rdd = rd.filter(a => a.done).length;
    const nx = t.filter(a => !a.done && a.due && !isPast(a)).sort(byDue)[0], late = t.filter(a => !a.done && isPast(a)).length;
    return `<button class="scard" type="button" data-subj="${esc(s.id)}" style="--c:${s.color}"><span class="code">${esc(s.code || "Other")}</span><b>${esc(s.short)}</b>
      <div class="bar"><i style="width:${t.length ? d / t.length * 100 : 0}%"></i></div>
      <div class="f"><span>${d} of ${t.length} assignments done</span>${rd.length ? `<span>${rdd}/${rd.length} read</span>` : ""}</div>
      ${late ? `<div class="f nx" style="color:var(--late)">${late} overdue</div>` : nx ? `<div class="f nx"><span>Next: ${esc(dueText(nx).replace(/^Due /, ""))}</span></div>` : `<div class="f"><span>No upcoming deadlines</span></div>`}</button>`;
  }).join("")}</div>`;
}
function renderSubject(all) {
  const s = subjOf(openSubj);
  const mine = all.filter(a => a.sid === s.id && (showHidden || !a.hidden) && matches(a));
  const T = tasks(mine), R = mine.filter(a => a.kind === "reading" && !a.due), N = mine.filter(a => a.kind === "note");
  const lists = { assignments: T, readings: R, notes: N };
  if (!lists[subTab].length) subTab = T.length ? "assignments" : R.length ? "readings" : "notes";
  const cur = lists[subTab];
  const mods = [...new Set(cur.map(a => a.module || 1))].sort((a, b) => a - b);
  if (openMod && !mods.includes(openMod)) openMod = 0;
  const inMod = a => !openMod || (a.module || 1) === openMod;
  const tab = (k, label, list, extra) => list.length ? `<button type="button" role="tab" data-tab="${k}" class="${subTab === k ? "on" : ""}" aria-selected="${subTab === k}">${label}<span class="n">${extra}</span></button>` : "";
  const resRow = a => `<div class="row${a.done ? " isdone" : ""}" data-id="${esc(a.id)}">
      ${a.kind === "note" ? `<span class="doc">${ICON.doc}</span>` : `<button class="check round${a.done ? " on" : ""}" type="button" data-toggle aria-label="${a.done ? "Mark as unread" : "Mark as read"}" title="${a.done ? "Mark as unread" : "Mark as read"}">${ICON.check}</button>`}
      <div>${a.link ? `<a class="t" href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : `<span class="t">${esc(a.title)}</span>`}<div class="m">Module ${a.module || 1}${a.isNew ? " · new" : ""}${a.edited || a.custom ? " · edited" : ""}${a.note ? " · has notes" : ""}${a.work.length ? " · " + a.work.length + " links" : ""}</div></div>
      <button class="icon" type="button" data-open aria-label="Details and notes" title="Details and notes">${ICON.dots}</button></div>`;
  let body;
  if (subTab === "assignments") {
    const L = T.filter(inMod);
    body = group("To do", L.filter(a => !a.done).sort(byDue)) + group("Done", L.filter(a => a.done).sort(byDue)) || `<div class="empty"><b>Nothing here</b></div>`;
  } else body = `<div class="card res">${cur.filter(inMod).map(resRow).join("")}</div>`;
  const doneT = T.filter(a => a.done).length;
  return `<div class="subhead" style="--c:${s.color}">
      <button class="btn ghost back" type="button" data-go="subjects">← All subjects</button>
      ${s.code ? `<span class="code">${esc(s.code)}</span>` : ""}<h2>${esc(s.short)}</h2>
      <div style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--mute)"><div class="pbar" style="flex:0 1 260px;margin:0"><i style="width:${T.length ? doneT / T.length * 100 : 0}%;background:${s.color}"></i></div>${doneT} of ${T.length} assignments done</div>
    </div>
    <div class="tabs" style="--c:${s.color}" role="tablist">${tab("assignments", "Assignments", T, `${doneT}/${T.length}`)}${tab("readings", "Readings", R, `${R.filter(a => a.done).length}/${R.length}`)}${tab("notes", "Lecture notes", N, N.length)}</div>
    ${mods.length > 1 ? `<div class="mods"><button type="button" data-mod="0" class="${openMod ? "" : "on"}">All modules</button>${mods.map(m => `<button type="button" data-mod="${m}" class="${openMod === m ? "on" : ""}">Module ${m}</button>`).join("")}</div>` : ""}
    ${body}`;
}

function workList(a, removable) {
  return (a.work || []).map(w => { const li = linkInfo(w.url); return `<div class="wl" data-wid="${esc(w.id)}"><span class="wi">${li.icon}</span><a href="${esc(w.url)}" target="_blank" rel="noopener"><b>${esc(w.label || li.kind)}</b><small>${esc(w.label ? li.kind + " · " : "")}${esc(li.host)}${w.added ? " · added " + new Date(w.added).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</small></a>${removable ? `<button type="button" class="icon" data-sheet="unwork" aria-label="Remove link" title="Remove link">${ICON.x}</button>` : ""}</div>`; }).join("");
}
const mineCount = all => all.filter(a => a.work.length || a.note || a.edited || a.custom || a.sent.length || a.removed).length;
function mineCard(a, extra) {
  const s = subjOf(a.sid);
  return `<div class="mcard" style="--c:${s.color}" data-id="${esc(a.id)}">
    <button type="button" class="mhead" data-open><span class="meta"><span class="sj">${esc(s.short)}</span><span class="due">${esc(a.kind === "note" ? "Lecture note" : a.kind === "reading" ? "Reading" : dueText(a))}</span>${a.done ? `<span class="tag mine">Done</span>` : ""}${a.removed ? `<span class="tag gone">Removed from hub</span>` : ""}${a.sent.length ? `<span class="tag sent">${ICON.send}Emailed</span>` : ""}</span><span class="ttl">${esc(a.title)}</span></button>
    ${extra}</div>`;
}
const FIELD_LABEL = { title: "Title", due: "Due date", time: "Time", link: "Link", email: "Email", module: "Module" };
const showVal = (k, v) => v == null || v === "" ? "empty" : k === "due" ? fmtDate(v) : k === "time" ? fmtTime(v) : String(v);
function renderMine(all) {
  const vis = all.filter(matches);
  const withWork = vis.filter(a => a.work.length).sort((x, y) => Math.max(...y.work.map(w => w.added || 0)) - Math.max(...x.work.map(w => w.added || 0)));
  const sec = (t, list, fn, hint) => list.length ? `<section class="group"><div class="ghead"><h2>${t}</h2><span class="n">${list.length}</span>${hint ? `<span class="hint">${hint}</span>` : ""}</div><div class="mgrid">${list.map(fn).join("")}</div></section>` : "";
  const html =
    sec("Hub updates to review", vis.filter(a => a.conflicts.length), a => mineCard(a, conflictHTML(a)), "He changed something you'd also changed") +
    sec("Your submissions", withWork, a => mineCard(a, `<div class="wlist">${workList(a, false)}</div>`), "Links to the work you handed in") +
    sec("Emails sent", vis.filter(a => a.sent.length), a => mineCard(a, sentHTML(a))) +
    sec("Your notes", vis.filter(a => a.note), a => mineCard(a, `<div class="note full">${esc(a.note)}</div>`)) +
    sec("Your changes", vis.filter(a => a.edited), a => mineCard(a, `<div class="diff">${Object.keys(FIELD_LABEL).filter(k => (a.base[k] ?? null) !== (a[k] ?? null)).map(k => `<div><span>${FIELD_LABEL[k]}</span><s>${esc(showVal(k, a.base[k]))}</s><b>${esc(showVal(k, a[k]))}</b></div>`).join("")}</div>`), "Hub version crossed out, yours in bold") +
    sec("Added by you", vis.filter(a => a.custom), a => mineCard(a, "")) +
    sec("No longer on the hub", vis.filter(a => a.removed), a => mineCard(a, `<p class="hint">Your friend removed this. Your ticks, notes and links are kept.</p>`));
  return toolbar(all, false) + (html || `<div class="empty"><b>Nothing here yet</b>Open any assignment and use “Add link” to save your Google Doc, Drive file or YouTube video. Your notes, edits and sent emails show up here too.</div>`);
}
function conflictHTML(a) {
  return `<div class="conflictbox"><span><b>Your friend updated this after you changed it.</b> Your version is still showing.</span>
    ${a.conflicts.map(c => `<div class="ch"><span>${FIELD_LABEL[c.k]}</span><span>His new value: <b>${esc(showVal(c.k, c.now))}</b> <s>${esc(showVal(c.k, c.was))}</s><br>Yours: ${esc(showVal(c.k, c.mine))}</span></div>`).join("")}
    <div class="btnrow"><button type="button" class="btn" data-conflict="theirs" data-id="${esc(a.id)}">Use his version</button><button type="button" class="btn ghost" data-conflict="mine" data-id="${esc(a.id)}">Keep mine</button></div></div>`;
}
function sentHTML(a) {
  return `<div class="sentlog">${a.sent.slice().reverse().map(m => `<div>${ICON.send}<span>${m.via === "gmail" ? "Sent" : "Drafted"} to ${esc(m.to)} · ${new Date(m.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>`).join("")}</div>`;
}

function renderNav(all) {
  const t = tasks(all).filter(a => !a.hidden), open = t.filter(a => !a.done), late = open.filter(isPast).length, dn = t.length - open.length;
  const on = v => view === v ? " on" : "";
  let h = `<button type="button" class="nv${on("todo")}" data-go="todo">${ICON.todo}<span>To do</span><span class="ct${late ? " late" : ""}">${open.length}</span></button>
    <button type="button" class="nv${on("done")}" data-go="done">${ICON.done}<span>Completed</span><span class="ct">${dn}</span></button>
    <button type="button" class="nv${on("mine")}" data-go="mine">${ICON.me}<span>My work</span><span class="ct">${mineCount(all)}</span></button>
    <button type="button" class="nv${on("subjects")}" data-go="subjects">${ICON.book}<span>All subjects</span><span class="ct"></span></button>
    <span class="label">Subjects</span>`;
  h += SUBJ.filter(s => all.some(a => a.sid === s.id && !a.hidden)).map(s => {
    const st = t.filter(a => a.sid === s.id), sd = st.filter(a => a.done).length;
    return `<button type="button" class="nv subj${view === "subject" && openSubj === s.id ? " on" : ""}" data-subj="${esc(s.id)}"><span class="sw" style="background:${s.color}"></span><span>${esc(s.short)}</span><span class="ct">${sd}/${st.length}</span><span class="bar"><i style="width:${st.length ? sd / st.length * 100 : 0}%;background:${s.color}"></i></span></button>`;
  }).join("");
  $("#navlist").innerHTML = h;
  const tb = (v, icon, label, badge) => `<button type="button" class="${(view === v || (v === "subjects" && view === "subject")) ? "on" : ""}" data-go="${v}">${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</button>`;
  $("#tabbar").innerHTML = tb("todo", ICON.todo, "To do", late) + tb("subjects", ICON.book, "Subjects") + tb("mine", ICON.me, "My work") + tb("done", ICON.done, "Completed") + `<button type="button" class="add" data-add><span class="plus">${ICON.plus}</span><span>Add</span></button>`;
  renderHubStatus();
}
function renderHubStatus() {
  const el = $("#hubdate");
  if (!HUB) { el.textContent = "Connecting to the hub…"; return; }
  el.innerHTML = hubState.cached
    ? `Hub offline · showing copy from ${esc(ago(hubState.at))} · <button type="button" class="linkbtn" data-refreshhub>Retry</button>`
    : `Live from the hub · checked ${esc(ago(hubState.at))} · <button type="button" class="linkbtn" data-refreshhub>Refresh</button>`;
}
function renderAcct(msg) {
  const el = $("#acct");
  if (!fbReady) { el.innerHTML = `<span class="hint">Cloud sync is off. Add Firebase settings in <b>config.js</b>.</span>`; return; }
  if (!fb || !fb.user) { el.innerHTML = msg ? `<span class="hint">${esc(msg)}</span>` : `<button type="button" class="gbtn" data-signin style="width:100%;justify-content:center">${ICON.google}Sign in with Google</button>`; return; }
  const u = fb.user, ini = (u.displayName || u.email || "?").trim()[0].toUpperCase();
  el.innerHTML = `${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc(ini)}</span>`}<span class="who"><b>${esc(u.displayName || "Signed in")}</b><small>${esc(u.email || "")}</small></span>`;
}
function renderBanner() {
  const b = $("#banner");
  if (fbReady && fb && !fb.user && !S.flags.signinDismissed) {
    b.innerHTML = `<div class="banner"><p><b>Sign in to sync across your devices.</b> Your ticks, links and notes will follow you from your MacBook to your phone, and you can email submissions straight from Gmail.</p><div class="btnrow"><button type="button" class="gbtn" data-signin>${ICON.google}Sign in with Google</button><button type="button" class="btn ghost" data-dismiss="signin">Later</button></div></div>`;
    return;
  }
  b.innerHTML = "";
}

function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function render() {
  if (!HUB) return;
  if (view === "subject" && !SUBJ.find(s => s.id === openSubj)) view = "subjects";
  const all = items();
  renderNav(all); renderBanner();
  const t = tasks(all).filter(a => !a.hidden), open = t.filter(a => !a.done), late = open.filter(isPast).length;
  const week = open.filter(a => a.due && !isPast(a) && dayDiff(a) <= 7).length;
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const first = (S.profile.name || "").split(" ")[0];
  if (view === "todo") {
    $("#headline").textContent = greeting() + (first ? ", " + first : "");
    $("#subline").textContent = `${dateStr} · ` + (open.length ? `${open.length} to do` + (week ? `, ${week} due this week` : "") + (late ? `, ${late} overdue` : "") : "you're all caught up");
  } else if (view === "done") { $("#headline").textContent = "Completed"; $("#subline").textContent = `${t.length - open.length} of ${t.length} assignments done`; }
  else if (view === "mine") { $("#headline").textContent = "My work"; $("#subline").textContent = "Everything that's yours: submissions, emails, notes and changes"; }
  else { $("#headline").textContent = "Subjects"; $("#subline").textContent = view === "subject" ? "Tick readings as you finish them · lecture notes open in Drive" : "Assignments, readings and lecture notes for each course"; }
  const focusQ = document.activeElement && document.activeElement.id === "q", pos = focusQ ? document.activeElement.selectionStart : 0;
  $("#view").innerHTML = view === "todo" ? renderTodo(all) : view === "done" ? renderDone(all) : view === "mine" ? renderMine(all) : view === "subject" ? renderSubject(all) : renderSubjects(all);
  if (focusQ && $("#q")) { $("#q").focus(); $("#q").setSelectionRange(pos, pos); }
  saveUI();
}

/* =========================================================================
   7. ACTIONS
   ========================================================================= */
function toast(msg, action, label = "Undo") {
  const t = $("#toast"); $("#toastmsg").textContent = msg;
  const b = $("#toastbtn"); b.hidden = !action; b.textContent = label; b.onclick = () => { action(); t.classList.remove("on"); };
  t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), action ? 6000 : 4000);
}
function toggle(id) {
  const was = !!S.done[id], it = items().find(a => a.id === id);
  if (was) delete S.done[id]; else S.done[id] = Date.now();
  persist();
  document.querySelectorAll(`#view [data-id="${CSS.escape(id)}"]`).forEach(n => { const c = n.querySelector(".check"); if (c) c.classList.toggle("on", !was); if (n.classList.contains("item")) n.classList.add("leaving"); });
  setTimeout(render, 320);
  if (!it || it.kind === "note") return;
  toast(was ? "Moved back to To do" : it.kind === "reading" ? "Marked as read" : "Marked as done", () => { was ? (S.done[id] = Date.now()) : delete S.done[id]; persist(); render(); });
}
function resolveConflict(id, which) {
  const it = items().find(a => a.id === id), e = S.edits[id]; if (!it || !e) return;
  for (const c of it.conflicts) {
    if (which === "theirs") { delete e[c.k]; delete e._from[c.k]; }
    else e._from[c.k] = c.now;
  }
  if (!FIELDS.some(k => k in e) && !e.note) delete S.edits[id];
  persist(); render(); if (editing && editing.id === id) openSheet(id, true);
  toast(which === "theirs" ? "Updated to his version" : "Kept your version");
}
document.addEventListener("click", e => {
  if (e.target.closest(".sheet")) return;
  const t = e.target.closest("[data-toggle],[data-open],[data-add],[data-go],[data-subj],[data-filter],[data-tab],[data-mod],[data-setup],[data-showhidden],[data-jump],[data-signin],[data-dismiss],[data-settings],[data-refreshhub],[data-conflict],a");
  if (!t || t.tagName === "A") return;
  const row = t.closest("[data-id]"), id = row && row.dataset.id;
  if (t.hasAttribute("data-toggle")) toggle(id);
  else if (t.dataset.conflict) resolveConflict(t.dataset.id, t.dataset.conflict);
  else if (t.hasAttribute("data-open")) openSheet(t.dataset.id || id);
  else if (t.hasAttribute("data-add")) openSheet(null);
  else if (t.hasAttribute("data-signin")) signIn();
  else if (t.hasAttribute("data-settings")) openSettings();
  else if (t.hasAttribute("data-refreshhub")) refreshHub(true);
  else if (t.dataset.dismiss) { S.flags[t.dataset.dismiss + "Dismissed"] = 1; persist(); render(); }
  else if (t.dataset.go) { view = t.dataset.go; openSubj = null; render(); window.scrollTo({ top: 0 }); }
  else if (t.dataset.subj) { view = "subject"; openSubj = t.dataset.subj; openMod = 0; subTab = "assignments"; render(); window.scrollTo({ top: 0 }); }
  else if (t.dataset.filter) { filter = t.dataset.filter; render(); }
  else if (t.dataset.tab) { subTab = t.dataset.tab; openMod = 0; render(); }
  else if (t.dataset.mod != null) { openMod = Number(t.dataset.mod); render(); }
  else if (t.hasAttribute("data-showhidden")) { showHidden = !showHidden; render(); }
  else if (t.dataset.jump) { const g = document.querySelector(".ghead.late"); if (g) g.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (t.dataset.setup) {
    const boxes = [...document.querySelectorAll("#setup input[type=checkbox]")];
    const ids = (t.dataset.setup === "all" ? boxes : t.dataset.setup === "save" ? boxes.filter(b => b.checked) : []).map(b => b.value);
    ids.forEach(i => S.done[i] = Date.now());
    S.flags.setupDone = 1; persist(); render();
    toast(ids.length ? `Marked ${ids.length} as done` : "Skipped. Overdue items are listed below", ids.length ? () => { ids.forEach(i => delete S.done[i]); persist(); render(); } : null);
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") return closePanels();
  const row = e.target.closest && e.target.closest(".item[data-open]");
  if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openSheet(row.dataset.id); return; }
  if (e.target.matches("input,textarea,select") || anyPanelOpen()) return;
  if (e.key === "/") { e.preventDefault(); if (!["todo", "done", "mine"].includes(view)) { view = "todo"; render(); } $("#q").focus(); }
  if (e.key === "n") { e.preventDefault(); openSheet(null); }
});
document.addEventListener("input", e => { if (e.target.id === "q") { query = e.target.value.trim().toLowerCase(); render(); } });
addEventListener("scroll", () => { const tb = document.querySelector(".toolbar"); if (tb) tb.classList.toggle("stuck", tb.getBoundingClientRect().top <= 14 && scrollY > 40); }, { passive: true });

/* =========================================================================
   8. PANELS — item details, email composer, settings
   ========================================================================= */
let editing = null, lastFocus = null, openPanel = null;
const anyPanelOpen = () => !!openPanel;
function showPanel(el, focusEl) {
  if (openPanel && openPanel !== el) openPanel.classList.remove("on");
  if (!openPanel) lastFocus = document.activeElement;
  openPanel = el; el.classList.add("on"); el.setAttribute("aria-hidden", "false"); $("#scrim").classList.add("on");
  if (focusEl) setTimeout(() => focusEl.focus(), 300);
}
function closePanels() {
  if (!openPanel) return;
  openPanel.classList.remove("on"); openPanel.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("on");
  openPanel = null; editing = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  render();
}
$("#scrim").onclick = closePanels;
document.querySelectorAll("[data-close]").forEach(b => b.onclick = closePanels);

// ----- Item details -----
const f = id => $("#f-" + id);
function fillMods(sid, val) {
  const n = Math.max(subjOf(sid).modules, val || 1);
  f("mod").innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">Module ${i + 1}</option>`).join("");
  f("mod").value = val || 1;
}
f("subj").addEventListener("change", () => fillMods(f("subj").value, 1));
function sheetView(a) {
  const s = subjOf(a.sid), u = urgency(a);
  const doneLabel = a.kind === "reading" ? (a.done ? "Read" : "Mark as read") : (a.done ? "Done" : "Mark as done");
  return `<h2 class="bigt">${esc(a.title)}</h2>
    <div class="status"><span style="font-weight:600">${esc(s.short)}</span>${a.sid !== "general" ? `<span>· Module ${a.module || 1}</span>` : ""}${a.kind !== "note" ? `<span>·</span><span class="due ${u}">${esc(dueText(a))}${a.due && !a.done && !isPast(a) ? " · " + countdown(a) : ""}</span>` : ""}</div>
    ${a.conflicts.length ? conflictHTML(a) : ""}
    ${a.removed ? `<div class="orig"><span><b>Removed from the hub.</b> Your friend deleted this item. Everything you saved on it is kept here.</span></div>` : ""}
    <div class="actions">
      ${a.kind !== "note" ? `<button type="button" class="btn${a.done ? " on" : ""}" data-sheet="done">${svg('<path d="M5 12l5 5L20 7"/>', 3)}${doneLabel}</button>` : ""}
      ${a.link ? `<a class="btn" href="${esc(a.link)}" target="_blank" rel="noopener">${ICON.open}Open ${a.kind === "assignment" ? "assignment" : "file"}</a>` : ""}
      ${a.kind !== "note" ? `<button type="button" class="btn${a.star ? " on" : ""}" data-sheet="pin">${ICON.pin}${a.star ? "Pinned" : "Pin to top"}</button>` : ""}
    </div>
    <section class="worksec">
      <div class="whead"><h3>${a.kind === "assignment" ? "My submission" : "My links"}</h3><span>${a.kind === "assignment" ? "Your doc, Drive file or video for this assignment" : "Summaries, highlights, anything related"}</span></div>
      <div class="wlist">${workList(a, true)}</div>
      <div class="wadd"><input id="w-url" type="text" inputmode="url" placeholder="Paste a Google Doc, Drive or YouTube link" aria-label="Link"><input id="w-label" type="text" placeholder="Name (optional)" aria-label="Name"><button type="button" class="btn primary" data-sheet="work">${ICON.plus}Add link</button></div>
      ${a.kind === "assignment" ? `<button type="button" class="btn" data-sheet="email" style="align-self:flex-start">${ICON.mail}Email my submission</button>` : ""}
      ${a.sent.length ? sentHTML(a) : ""}
    </section>`;
}
function openSheet(id, keep) {
  const keptNote = keep ? f("note").value : null;
  const a = id ? items().find(x => x.id === id) : null;
  if (id && !a) return;
  editing = a;
  const s = a ? subjOf(a.sid) : null;
  $("#sheet").style.setProperty("--c", s ? s.color : "var(--accent)");
  $("#sheetlabel").textContent = a ? (s.code ? s.code + " · " : "") + (a.kind === "note" ? "Lecture note" : a.kind === "reading" ? "Reading" : "Assignment") : "New assignment";
  $("#sheetview").innerHTML = a ? sheetView(a) : "";
  $("#sheetview").hidden = !a;
  f("subj").innerHTML = SUBJ.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
  f("subj").value = a ? a.sid : (view === "subject" && openSubj) || (filter !== "all" ? filter : SUBJ[0].id);
  fillMods(f("subj").value, a ? a.module : (openMod || 1));
  f("title").value = a ? a.title : ""; f("due").value = a && a.due || ""; f("time").value = a && a.time || "";
  f("link").value = a && a.link || ""; f("email").value = a && a.email || ""; f("note").value = keep ? keptNote : a && a.note || "";
  f("kind").value = a && a.kind === "reading" ? "reading" : "assignment";
  $("#f-subj-wrap").hidden = !!(a && !a.custom);
  $("#f-kind-wrap").hidden = !!(a && !a.custom);
  $("#edithint").textContent = !a || a.custom ? "" : a.edited ? "You've changed this" : "Changes only show for you";
  const box = $("#editbox"); if (!keep) box.open = !a; box.classList.toggle("bare", !a); box.querySelector("summary").hidden = !a;
  const o = $("#orig");
  if (a && !a.custom && !a.removed && a.edited) {
    const b = a.base; o.hidden = false;
    o.innerHTML = `<span><b>Original from the hub:</b> ${esc(b.title)}</span><span>${b.due ? "Due " + esc(fmtDate(b.due)) + (b.time ? ", " + esc(fmtTime(b.time)) : "") : "No deadline"}</span><button type="button" class="btn" data-sheet="reset" style="align-self:flex-start">Undo my changes</button>`;
  } else o.hidden = true;
  $("#f-hide").hidden = !a;
  $("#f-hide").textContent = a && a.custom ? "Delete" : a && a.removed ? "Forget this item" : a && a.hidden ? "Unhide" : "Hide from my list";
  $("#f-save").textContent = a ? "Save" : "Add to my list";
  if (keep) { $("#w-url") && $("#w-url").focus(); return; }
  showPanel($("#sheet"), a ? $("#sheet [data-close]") : f("title"));
}
function addWork() {
  if (!editing) return;
  const url = normURL($("#w-url").value), id = editing.id;
  if (!url) { $("#w-url").focus(); $("#w-url").classList.add("bad"); toast("That doesn't look like a link. Paste the full address."); return; }
  (S.work[id] = S.work[id] || []).push({ id: Date.now().toString(36), url, label: $("#w-label").value.trim(), added: Date.now() });
  persist(); openSheet(id, true); toast("Link saved");
}
$("#sheet").addEventListener("keydown", e => { if (e.key === "Enter" && (e.target.id === "w-url" || e.target.id === "w-label")) { e.preventDefault(); addWork(); } });
$("#sheet").addEventListener("input", e => { if (e.target.id === "w-url") e.target.classList.remove("bad"); });
$("#sheet").addEventListener("click", e => {
  const c = e.target.closest("[data-conflict]"); if (c) { resolveConflict(c.dataset.id, c.dataset.conflict); return; }
  const b = e.target.closest("[data-sheet]"); if (!b || !editing) return;
  const id = editing.id, act = b.dataset.sheet;
  if (act === "done") { toggle(id); setTimeout(() => openSheet(id, true), 340); }
  else if (act === "pin") { S.star[id] ? delete S.star[id] : (S.star[id] = 1); persist(); openSheet(id, true); toast(S.star[id] ? "Pinned to the top of To do" : "Unpinned"); }
  else if (act === "work") addWork();
  else if (act === "email") openComposer(id);
  else if (act === "unwork") {
    const wid = b.closest("[data-wid]").dataset.wid, list = S.work[id] || [], i = list.findIndex(w => w.id === wid), w = list[i];
    list.splice(i, 1); if (!list.length) delete S.work[id];
    persist(); openSheet(id, true);
    toast("Link removed", () => { (S.work[id] = S.work[id] || []).splice(i, 0, w); persist(); openSheet(id, true); });
  }
  else if (act === "reset") {
    const prev = S.edits[id], note = prev && prev.note;
    if (note) S.edits[id] = { note }; else delete S.edits[id];
    persist(); openSheet(id, true); toast("Back to the hub version", () => { S.edits[id] = prev; persist(); openSheet(id, true); });
  }
});
$("#form").addEventListener("submit", e => {
  e.preventDefault();
  const v = { title: f("title").value.trim(), due: f("due").value || null, time: f("time").value || null, link: f("link").value.trim() || null, email: f("email").value.trim() || null, module: Number(f("mod").value) };
  const note = f("note").value.trim();
  if (!v.title) { $("#editbox").open = true; f("title").focus(); return; }
  if (!editing) {
    const c = { id: "my-" + Date.now().toString(36), sid: f("subj").value, kind: f("kind").value, note };
    for (const k of FIELDS) if (v[k] != null) c[k] = v[k];
    S.custom.push(c); toast("Added to your list");
  } else if (editing.custom) {
    const c = S.custom.find(x => x.id === editing.id);
    for (const k of FIELDS) { if (v[k] != null) c[k] = v[k]; else delete c[k]; }
    Object.assign(c, { sid: f("subj").value, kind: f("kind").value, note }); toast("Saved");
  } else {
    // Only fields that differ from the hub are stored, plus the hub value at the time,
    // so a later change on his side can be spotted instead of silently overwritten.
    const b = editing.base, prev = S.edits[editing.id] || {}, ed = { _from: {} };
    for (const k of FIELDS) if ((v[k] ?? null) !== (b[k] ?? null)) { ed[k] = v[k]; ed._from[k] = prev._from && k in prev._from && prev[k] === v[k] ? prev._from[k] : b[k] ?? null; }
    if (note) ed.note = note;
    if (FIELDS.some(k => k in ed) || note) S.edits[editing.id] = ed; else delete S.edits[editing.id];
    toast("Saved");
  }
  persist(); closePanels();
});
$("#f-hide").onclick = () => {
  if (!editing) return; const id = editing.id;
  if (editing.custom) { const i = S.custom.findIndex(c => c.id === id), c = S.custom[i]; S.custom.splice(i, 1); persist(); closePanels(); toast("Deleted", () => { S.custom.splice(i, 0, c); persist(); render(); }); }
  else if (editing.removed) { const saved = {}; for (const m of MAPS) if (id in S[m]) { saved[m] = S[m][id]; delete S[m][id]; } persist(); closePanels(); toast("Forgotten", () => { Object.assign(S, Object.fromEntries(Object.entries(saved).map(([m, v]) => [m, { ...S[m], [id]: v }]))); persist(); render(); }); }
  else if (editing.hidden) { S.hidden[id] = 0; persist(); closePanels(); toast("Back on your list"); }
  else { S.hidden[id] = 1; persist(); closePanels(); toast("Hidden. Find it at the bottom of To do", () => { delete S.hidden[id]; persist(); render(); }); }
};

// ----- Email composer -----
let mailFor = null, bodyDirty = false;
const c = id => $("#c-" + id);
function teacherFor(a) {
  const t = S.teachers[a.sid] || {};
  return { name: t.name || "", email: a.email || t.email || "" };
}
function mailSubject(a) {
  const s = subjOf(a.sid), name = S.profile.name || "";
  return ["Submission: " + shortTitle(a.title, 70), s.code || s.short, name].filter(Boolean).join(" | ");
}
function mailText(a, teacherName) {
  const s = subjOf(a.sid), p = S.profile;
  const links = a.work.length ? a.work.map(w => `• ${w.label || linkInfo(w.url).kind}: ${w.url}`) : ["• [Paste the link to your work here]"];
  const details = [
    `Course: ${s.code ? s.code + " – " : ""}${s.short}`,
    `Assignment: ${a.title}`,
    a.sid !== "general" ? `Module: ${a.module || 1}` : null,
    a.due ? `Due date: ${fmtLong(a.due)}${a.time ? ", " + fmtTime(a.time) : ""}` : null,
    `Submitted on: ${fmtLong(new Date().toISOString().slice(0, 10))}`,
  ].filter(Boolean);
  const sig = [p.name || "[Your name]", p.program, p.studentId ? `Student ID: ${p.studentId}` : null, p.institution || "Kathmandu University School of Education", p.phone].filter(Boolean);
  return [
    `Dear ${teacherName || "Sir/Madam"},`,
    "",
    `I hope this message finds you well. Please find below my submission for the following assignment.`,
    "",
    ...details,
    "",
    a.work.length > 1 ? "Submission links:" : "Submission link:",
    ...links,
    "",
    "I have made sure the link is accessible. Kindly let me know if you have any trouble opening it, or if anything further is required from my side.",
    "",
    "Thank you for your time and guidance.",
    "",
    "Kind regards,",
    ...sig,
  ].join("\n");
}
// Turn the plain-text message into a clean HTML email. Built from the text, so your edits always carry over.
function mailHTML(text) {
  const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:#1F3A5F;font-weight:600;text-decoration:underline">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`);
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const out = blocks.map((blk, bi) => {
    const lines = blk.split("\n");
    if (lines.length && lines.every(l => /^[A-Z][A-Za-z ()\/.-]{1,24}:\s+\S/.test(l)) && !/^Dear\b/.test(lines[0])) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:#EAF1F9;border-radius:12px;margin:4px 0 18px"><tbody>${lines.map((l, i) => { const k = l.indexOf(":"); return `<tr><td style="padding:${i ? 6 : 14}px 16px ${i === lines.length - 1 ? 14 : 6}px;color:#6B6B73;font-size:13px;white-space:nowrap;vertical-align:top;width:120px">${esc(l.slice(0, k))}</td><td style="padding:${i ? 6 : 14}px 16px ${i === lines.length - 1 ? 14 : 6}px 0;color:#1F3A5F;font-size:14px;font-weight:600;vertical-align:top">${linkify(l.slice(k + 1).trim())}</td></tr>`; }).join("")}</tbody></table>`;
    }
    const bullets = lines.filter(l => /^\s*[•\-*]\s+/.test(l));
    if (bullets.length && bullets.length >= lines.length - 1) {
      const head = lines.length > bullets.length ? `<p style="margin:0 0 8px;font-weight:600;color:#1F3A5F">${linkify(lines[0])}</p>` : "";
      return head + `<ul style="margin:0 0 18px;padding:0;list-style:none">${bullets.map(l => { const t = l.replace(/^\s*[•\-*]\s+/, ""), m = /^([^:]{1,40}):\s+(https?:\/\/\S+)$/.exec(t); return `<li style="margin:0 0 8px;padding:10px 14px;border:1px solid #E5DFCF;border-radius:10px">${m ? `<span style="color:#2B2B2F;font-weight:600">${esc(m[1])}</span><br>${linkify(m[2])}` : linkify(t)}</li>`; }).join("")}</ul>`;
    }
    const isSig = /^(kind|best|warm)?\s*regards,?$/i.test(lines[0].trim()) || /^sincerely,?$/i.test(lines[0].trim());
    if (isSig) return `<p style="margin:0 0 4px">${esc(lines[0])}</p><p style="margin:0;line-height:1.5"><strong style="color:#1F3A5F">${esc(lines[1] || "")}</strong>${lines.slice(2).map(l => `<br><span style="color:#6B6B73;font-size:13px">${linkify(l)}</span>`).join("")}</p>`;
    return `<p style="margin:0 0 16px">${lines.map(linkify).join("<br>")}</p>`;
  }).join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2B2B2F;max-width:620px"><div style="height:3px;width:40px;background:#C8102E;border-radius:2px;margin:0 0 20px"></div>${out}</div>`;
}
function gmailComposeURL(m) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: m.to, su: m.subject, body: m.text });
  if (m.cc) q.set("cc", m.cc);
  if (fb && fb.user && fb.user.email) q.set("authuser", fb.user.email);
  return "https://mail.google.com/mail/?" + q.toString();
}
function currentMail() { return { to: c("to").value.trim(), cc: c("cc").value.trim(), subject: c("subject").value.trim(), text: c("body").value }; }
function refreshPreview() {
  const m = currentMail();
  c("preview").innerHTML = `<div class="mhdr"><span><b>To:</b> ${esc(m.to || "—")}${m.cc ? ` · <b>Cc:</b> ${esc(m.cc)}` : ""}</span><span><b>Subject:</b> ${esc(m.subject)}</span></div>${mailHTML(m.text)}`;
  c("gmail").href = gmailComposeURL(m);
  const a = items().find(x => x.id === mailFor), warns = [];
  if (a && !a.work.length) warns.push(`<b>No link attached yet.</b> Add your Google Doc or Drive link under “My submission” first. <button type="button" data-cw="back">Go back</button>`);
  if (!S.profile.name) warns.push(`<b>Add your name</b> so the email is signed properly. <button type="button" data-cw="settings">Open settings</button>`);
  c("warn").innerHTML = warns.map(w => `<div class="cwarn"><span>${w}</span></div>`).join("");
  const canSend = fb && fb.user;
  c("send").disabled = false;
  c("send").title = canSend ? "Sends from " + fb.user.email : "Sign in with Google to send directly";
}
function openComposer(id) {
  const a = items().find(x => x.id === id); if (!a) return;
  mailFor = id; bodyDirty = false;
  const t = teacherFor(a);
  c("tname").value = t.name; c("to").value = t.email; c("cc").value = "";
  c("subject").value = mailSubject(a);
  c("body").value = mailText(a, t.name);
  c("markdone").checked = !a.done;
  c("markdone").parentElement.hidden = a.done;
  setCTab("preview"); refreshPreview();
  showPanel($("#composer"), t.email ? c("send") : c("to"));
}
function setCTab(tab) {
  document.querySelectorAll("[data-ctab]").forEach(b => b.classList.toggle("on", b.dataset.ctab === tab));
  c("preview").hidden = tab !== "preview"; c("editwrap").hidden = tab !== "edit";
}
$("#composer").addEventListener("click", e => {
  const t = e.target.closest("[data-ctab]"); if (t) { setCTab(t.dataset.ctab); if (t.dataset.ctab === "preview") refreshPreview(); return; }
  const w = e.target.closest("[data-cw]"); if (w) { if (w.dataset.cw === "back") openSheet(mailFor); else openSettings(); }
});
$("#composer").addEventListener("input", e => {
  if (e.target.id === "c-body") bodyDirty = true;
  if (e.target.id === "c-tname" && !bodyDirty) { const a = items().find(x => x.id === mailFor); c("body").value = mailText(a, c("tname").value.trim()); }
  if (e.target.id !== "c-body") refreshPreview(); else c("gmail").href = gmailComposeURL(currentMail());
});
c("regen").onclick = () => { const a = items().find(x => x.id === mailFor); c("body").value = mailText(a, c("tname").value.trim()); bodyDirty = false; refreshPreview(); };
c("copy").onclick = () => {
  const m = currentMail(), txt = `Subject: ${m.subject}\n\n${m.text}`;
  const fallback = () => { setCTab("edit"); c("body").select(); toast("Selected. Press ⌘C to copy"); };
  try { navigator.clipboard.writeText(txt).then(() => toast("Email copied"), fallback); } catch (err) { fallback(); }
};
function rememberTeacher(a) {
  const name = c("tname").value.trim(), to = c("to").value.trim();
  S.teachers[a.sid] = { ...(S.teachers[a.sid] || {}), ...(name ? { name } : {}), ...(to && !a.email ? { email: to } : {}) };
}
function recordSent(via) {
  const a = items().find(x => x.id === mailFor); if (!a) return;
  const m = currentMail();
  (S.sent[a.id] = S.sent[a.id] || []).push({ to: m.to, cc: m.cc, subject: m.subject, at: Date.now(), via });
  if (c("markdone").checked && !c("markdone").parentElement.hidden) S.done[a.id] = Date.now();
  rememberTeacher(a); persist();
}
c("gmail").addEventListener("click", () => {
  const id = mailFor;
  setTimeout(() => toast("Sent it from Gmail?", () => { mailFor = id; recordSent("compose"); render(); toast("Marked as submitted"); }, "Yes, mark as sent"), 400);
});
c("send").onclick = () => {
  const m = currentMail();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.to)) { c("to").focus(); toast("Add your teacher's email address"); return; }
  if (!fb || !fb.user) { toast("Sign in with Google to send directly, or use “Open in Gmail”"); return; }
  const btn = c("send"), label = btn.innerHTML;
  // gmailToken() must run straight from the click so the permission pop-up isn't blocked.
  gmailToken().then(token => {
    btn.disabled = true; btn.textContent = "Sending…";
    return gmailSend(token, { ...m, html: mailHTML(m.text) });
  }).then(() => {
    recordSent("gmail"); closePanels(); toast(`Sent to ${m.to}`);
  }).catch(e => {
    console.error(e);
    if (e.status === 401) gtok = null;
    const msg = e.code ? authError(e)
      : /has not been used|disabled/i.test(e.message) ? "Gmail sending isn't switched on yet. Enable the Gmail API in Google Cloud (see the README)."
      : e.status === 403 ? "Google refused to send. Make sure you allowed “Send email on your behalf”."
      : "Couldn't send: " + e.message;
    toast(msg, () => window.open(gmailComposeURL(m), "_blank"), "Open in Gmail");
  }).finally(() => { btn.disabled = false; btn.innerHTML = label; });
};

// ----- Settings -----
const p = id => $("#p-" + id);
function openSettings() {
  const P = S.profile;
  p("name").value = P.name || (fb && fb.user && fb.user.displayName) || ""; p("id").value = P.studentId || ""; p("program").value = P.program || "";
  p("inst").value = P.institution || ""; p("phone").value = P.phone || "";
  const hubEmails = {}; for (const b of BASE) if (b.email && !hubEmails[b.sid]) hubEmails[b.sid] = b.email;
  $("#s-teachers").innerHTML = SUBJ.filter(s => s.id !== "general").map(s => { const t = S.teachers[s.id] || {}; return `<div class="trow" style="--c:${s.color}" data-sid="${esc(s.id)}"><span class="sjn">${esc(s.code ? s.code + " · " : "")}${esc(s.short)}</span><input type="text" data-k="name" placeholder="Teacher's name" value="${esc(t.name || "")}" aria-label="Teacher's name for ${esc(s.short)}"><input type="email" data-k="email" placeholder="${esc(hubEmails[s.id] || "Email")}" value="${esc(t.email || "")}" aria-label="Teacher's email for ${esc(s.short)}"></div>`; }).join("");
  const u = fb && fb.user;
  $("#s-account").innerHTML = `<h3>Account</h3>` + (!fbReady ? `<p class="hint">Cloud sync isn't set up. Fill in <b>config.js</b> with your Firebase settings to sign in.</p>`
    : u ? `<div class="kv"><span>Signed in as</span><b>${esc(u.email)}</b><span>Saving</span><span>${esc($("#syncst").textContent)}</span><span>Gmail</span><span>${gtok && gtok.exp > Date.now() ? "Allowed for this session" : "Asks permission the first time you send"}</span></div><div class="btnrow"><button type="button" class="btn ghost danger" id="s-signout">Sign out</button></div>`
    : `<p class="hint">Sign in to sync across devices and send emails from Gmail.</p><button type="button" class="gbtn" data-signin2>${ICON.google}Sign in with Google</button>`);
  $("#s-hub").innerHTML = `<h3>Your friend's hub</h3><div class="kv"><span>Source</span><code>${esc(hubState.source || "—")}</code><span>Last checked</span><span>${hubState.at ? esc(ago(hubState.at)) : "never"}${hubState.cached ? " (offline copy)" : ""}</span><span>Items</span><span>${BASE.length} from the hub · ${S.custom.length} added by you</span></div><div class="btnrow"><button type="button" class="btn" id="s-refresh">${ICON.refresh}Check for updates now</button></div>`;
  showPanel($("#settings"), p("name"));
}
$("#settings").addEventListener("click", e => {
  if (e.target.closest("#s-signout")) { signOut(); closePanels(); }
  else if (e.target.closest("[data-signin2]")) signIn();
  else if (e.target.closest("#s-refresh")) refreshHub(true);
  else if (e.target.closest("#s-export")) {
    const txt = JSON.stringify(S);
    const fallback = () => { $("#s-import").value = txt; $("#s-import").select(); toast("Selected. Press ⌘C to copy"); };
    try { navigator.clipboard.writeText(txt).then(() => toast("Your data is copied"), fallback); } catch (err) { fallback(); }
  }
  else if (e.target.closest("#s-doimport")) {
    let incoming; try { incoming = JSON.parse($("#s-import").value); } catch (err) { toast("That isn't valid data. Paste exactly what “Copy my data” gave you."); return; }
    incoming = load(incoming);
    // The Claude version named duplicate ids "gen-a1-2"; here they're "gen-a1~2".
    for (const m of MAPS) for (const id of Object.keys(incoming[m])) {
      const alt = id.replace(/-(\d+)$/, "~$1");
      if (!BASE_BY_ID.has(id) && alt !== id && BASE_BY_ID.has(alt)) { incoming[m][alt] = incoming[m][id]; delete incoming[m][id]; }
    }
    S = mergeState(S, incoming); reconcile(); persist(); $("#s-import").value = ""; toast("Imported and merged with your data"); render();
  }
});
$("#sform").addEventListener("submit", e => {
  e.preventDefault();
  S.profile = { ...S.profile, name: p("name").value.trim(), studentId: p("id").value.trim(), program: p("program").value.trim(), institution: p("inst").value.trim(), phone: p("phone").value.trim() };
  document.querySelectorAll("#s-teachers .trow").forEach(r => {
    const t = {}; r.querySelectorAll("input").forEach(i => { if (i.value.trim()) t[i.dataset.k] = i.value.trim(); });
    if (Object.keys(t).length) S.teachers[r.dataset.sid] = t; else delete S.teachers[r.dataset.sid];
  });
  persist(); closePanels(); toast("Settings saved");
});

/* =========================================================================
   9. BOOT
   ========================================================================= */
function markSeen() {
  const ids = BASE.map(b => b.id);
  if (S.seen.length && ids.every(i => S.seen.includes(i))) return;
  if (!S.seen.length) { S.seen = ids; persist(); return; }
  setTimeout(() => { S.seen = [...new Set([...S.seen, ...ids])]; persist(); }, 2000); // new items keep their badge for this visit
}
function applyHub(hub, announce) {
  const before = new Set(BASE.map(b => b.id)), prevJSON = JSON.stringify(HUB);
  HUB = hub; buildFromHub(hub);
  const { changed, relinked } = reconcile();
  if (changed) persist();
  if (!anyPanelOpen()) render(); else renderNav(items());
  const added = BASE.filter(b => before.size && !before.has(b.id) && !S.seen.includes(b.id)).length;
  const differs = prevJSON !== JSON.stringify(hub);
  if (announce && added) toast(`${added} new item${added > 1 ? "s" : ""} from the hub`);
  else if (announce && relinked) toast("Hub updated · your data was kept");
  else if (announce === "manual") toast(differs ? "Updated from the hub" : "Already up to date");
}
let hubBusy = false;
async function refreshHub(manual) {
  if (hubBusy) return; hubBusy = true;
  try { applyHub(await fetchHub(), manual ? "manual" : true); }
  catch (e) { if (!HUB) applyHub(await cachedHub(), false); else { hubState.cached = true; renderHubStatus(); } if (manual) toast("Couldn't reach the hub. Showing your last copy."); }
  finally { hubBusy = false; }
}
(async () => {
  initFirebase();
  // Show something instantly from the last copy, then swap in the live hub.
  try { const c0 = JSON.parse(localStorage.getItem(HUB_CACHE)); if (c0 && c0.data) { hubState = { source: c0.source, at: c0.at, cached: true }; applyHub(c0.data, false); } } catch (e) {}
  await refreshHub(false);
  markSeen();
  const every = Math.max(1, CONFIG.hubRefreshMinutes || 5) * 6e4;
  setInterval(() => { if (!document.hidden) refreshHub(false); }, every);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - hubState.at > 6e4) refreshHub(false); });
  setInterval(() => { if (!document.hidden && !anyPanelOpen() && !(document.activeElement && document.activeElement.id === "q")) render(); }, 60000);
})();
