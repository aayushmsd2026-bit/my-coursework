// Shared by the website (app.js) and the daily reminder job (scripts/remind.mjs),
// so both read your friend's hub exactly the same way.

// data.js is JavaScript, not JSON. Running someone else's code inside your signed-in page
// would give it access to your account, so it's parsed as plain data instead.
export function parseLiteral(src, start) {
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
export function readConst(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(src);
  return m ? parseLiteral(src, m.index + m[0].length) : undefined;
}
export function parseHub(src) {
  const SUBJECTS = readConst(src, "SUBJECTS");
  if (!Array.isArray(SUBJECTS) || !SUBJECTS.length) throw new Error("No SUBJECTS found in the hub");
  return { SUBJECTS, GENERAL: readConst(src, "GENERAL") || [], MODULE_COUNT: readConst(src, "MODULE_COUNT") || 5 };
}

export const FIELDS = ["title", "due", "time", "link", "email", "module"];
export const strip = a => { const o = {}; for (const k of FIELDS) if (a[k] != null && a[k] !== "") o[k] = a[k]; return o; };

// Flatten the hub into one list. His ids are hand-typed, so duplicates happen ("gen-a1" twice):
// the second copy becomes "gen-a1~2".
export function hubItems(hub) {
  const seen = {};
  const uid = id => { id = String(id || "item"); seen[id] = (seen[id] || 0) + 1; return seen[id] === 1 ? id : `${id}~${seen[id]}`; };
  const out = [];
  hub.SUBJECTS.forEach(s => {
    (s.assignments || []).forEach(a => out.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "assignment" }));
    (s.readings || []).forEach(a => out.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "reading" }));
    (s.notes || []).forEach(a => out.push({ ...strip(a), id: uid(a.id), sid: s.id, kind: "note" }));
  });
  (hub.GENERAL || []).forEach(a => out.push({ ...strip(a), id: uid(a.id), sid: "general", kind: "assignment", module: 1 }));
  return out;
}
