// Daily reminder email. Run by .github/workflows/reminders.yml every morning.
//
// For each signed-in user who has reminders on, it reads the live hub, applies that person's
// own layer (ticks, edited dates, hidden items, things they added), and emails what's pending.
// It uses the same parser as the website (hub-core.js), so both always agree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
import { parseHub, parseLiteral, hubItems, FIELDS } from "../hub-core.js";

// ===== Settings that may be changed =====
const TZ = "Asia/Kathmandu"; // decides what "today" is
// Same defaults as the website's Settings → Email reminders.
const REMINDER_DEFAULTS = { enabled: true, days: 3, overdue: true, readings: false };
// ========================================

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "true";
const SITE_URL = process.env.SITE_URL || "";
const today = process.env.TODAY_OVERRIDE || new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// ---------- Hub ----------
// config.js is written for the browser, so only its hubUrls list is read from it.
function hubUrls() {
  const src = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
  const m = /hubUrls\s*:\s*/.exec(src);
  return m ? parseLiteral(src, m.index + m[0].length) : [];
}
async function loadHub() {
  for (const u of hubUrls()) {
    try {
      const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) { const hub = parseHub(await r.text()); console.log("Hub: " + u); return hub; }
    } catch (e) { console.warn(`Hub ${u} failed: ${e.message}`); }
  }
  console.warn("Hub unreachable, using hub-fallback.json");
  return JSON.parse(fs.readFileSync(path.join(ROOT, "hub-fallback.json"), "utf8"));
}

// ---------- One person's pending list ----------
const isPlaceholder = t => /please ignore|this is a test/i.test(t || "");
const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const MAPS = ["done", "edits", "hidden", "star", "work", "sent"];

export function pendingFor(hub, base, st, R) {
  const byId = new Map(base.map(b => [b.id, b]));
  const withEdits = b => {
    const e = (st.edits || {})[b.id] || {}, it = { ...b, baseTitle: b.title };
    for (const k of FIELDS) if (k in e) it[k] = e[k] ?? undefined;
    return it;
  };
  const list = base.map(withEdits);
  // Items he removed that this person still has data on (same rule as the website).
  const touched = new Set(MAPS.flatMap(m => Object.keys(st[m] || {})));
  for (const id of touched) if (!byId.has(id) && st.snap && st.snap[id] && !(st.custom || []).some(c => c.id === id)) list.push(withEdits({ ...st.snap[id], id }));
  for (const c of st.custom || []) list.push({ ...c, baseTitle: c.title });

  const hidden = id => (st.hidden && id in st.hidden) ? !!st.hidden[id] : null;
  return list
    .filter(a => a.due && (a.kind === "assignment" || (R.readings && a.kind === "reading")))
    .filter(a => !(st.done || {})[a.id])
    .filter(a => { const h = hidden(a.id); return h === null ? !isPlaceholder(a.baseTitle) : !h; })
    .map(a => ({ ...a, left: dayNum(a.due) - dayNum(today), work: (st.work || {})[a.id] || [], sent: ((st.sent || {})[a.id] || []).length > 0 }))
    .filter(a => (a.left < 0 && R.overdue) || (a.left >= 0 && a.left <= R.days))
    .sort((a, b) => a.left - b.left || (a.time || "23:59").localeCompare(b.time || "23:59"));
}

// ---------- Email ----------
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = s => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtTime = t => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const short = (t, n = 140) => t.length > n ? t.slice(0, n - 1) + "…" : t;
const leftText = n => n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "due today" : n === 1 ? "due tomorrow" : `in ${n} days`;
const GROUPS = [
  { key: "late", label: "Overdue", color: "#C8102E", test: a => a.left < 0 },
  { key: "today", label: "Due today", color: "#C8102E", test: a => a.left === 0 },
  { key: "tmr", label: "Due tomorrow", color: "#1F3A5F", test: a => a.left === 1 },
  { key: "soon", label: "Coming up", color: "#1F3A5F", test: a => a.left > 1 },
];

export function buildEmail(hub, items, name) {
  const course = sid => { const s = hub.SUBJECTS.find(x => x.id === sid); if (!s) return "General"; const m = /^([A-Z]+\s*\d+)\s*:\s*(.+)$/.exec(s.name); return m ? `${m[1]} · ${m[2]}` : s.name; };
  const when = a => fmtDate(a.due) + (a.time ? ", " + fmtTime(a.time) : "");
  const groups = GROUPS.map(g => ({ ...g, list: items.filter(g.test) })).filter(g => g.list.length);
  const counts = groups.map(g => `${g.list.length} ${g.label.toLowerCase()}`).join(" · ");
  const first = (name || "").split(" ")[0];
  const urgent = items.filter(a => a.left <= 0).length;
  const subject = urgent
    ? `${urgent} assignment${urgent === 1 ? "" : "s"} need${urgent === 1 ? "s" : ""} you today · My Coursework`
    : `${items.length} deadline${items.length === 1 ? "" : "s"} coming up · My Coursework`;

  const text = `Good morning${first ? ", " + first : ""}.\n\n${counts}\n\n` +
    groups.map(g => g.label.toUpperCase() + "\n" + g.list.map(a =>
      `- ${short(a.title)}\n  ${course(a.sid)} · ${when(a)} (${leftText(a.left)})` +
      (a.work.length ? `\n  Your links: ${a.work.map(w => w.label || w.url).join(", ")}` : "") +
      (a.link ? `\n  ${a.link}` : "")).join("\n")).join("\n\n") +
    (SITE_URL ? `\n\nOpen My Coursework: ${SITE_URL}` : "") +
    "\n\nTo change or stop these emails: My Coursework → Settings → Email reminders.\n";

  const card = (a, g) => `
    <tr><td style="padding:0 0 10px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border:1px solid #E5DFCF;border-left:3px solid ${g.color};border-radius:10px">
        <tr><td style="padding:12px 14px">
          <div style="font-size:15px;font-weight:600;color:#2B2B2F;line-height:1.4">${a.link ? `<a href="${esc(a.link)}" style="color:#2B2B2F;text-decoration:none">${esc(short(a.title))}</a>` : esc(short(a.title))}</div>
          <div style="font-size:13px;color:#6B6B73;margin-top:4px">${esc(course(a.sid))} · ${esc(when(a))} · <span style="color:${g.color};font-weight:600">${leftText(a.left)}</span></div>
          ${a.work.length ? `<div style="font-size:13px;margin-top:6px;color:#1F3A5F">Your links: ${a.work.map(w => `<a href="${esc(w.url)}" style="color:#1F3A5F">${esc(w.label || "link")}</a>`).join(", ")}${a.sent ? " · emailed ✓" : ""}</div>` : a.sent ? `<div style="font-size:13px;margin-top:6px;color:#1F3A5F">Emailed to your teacher ✓</div>` : ""}
        </td></tr>
      </table>
    </td></tr>`;
  const html = `<div style="background:#F5F5F7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">
    <tr><td style="height:4px;background:#C8102E;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:26px 26px 6px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6B6B73">My Coursework · ${esc(fmtDate(today))}</div>
      <div style="font-size:24px;font-weight:700;color:#1F3A5F;letter-spacing:-.02em;margin-top:6px">Good morning${first ? ", " + esc(first) : ""}</div>
      <div style="font-size:15px;color:#2B2B2F;margin-top:6px">${esc(counts)}</div>
    </td></tr>
    <tr><td style="padding:10px 26px 4px">
      ${groups.map(g => `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${g.color};margin:14px 0 8px">${g.label}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${g.list.map(a => card(a, g)).join("")}</table>`).join("")}
    </td></tr>
    ${SITE_URL ? `<tr><td style="padding:12px 26px 26px"><a href="${esc(SITE_URL)}" style="display:inline-block;background:#1F3A5F;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:999px">Open My Coursework</a></td></tr>` : ""}
  </table>
  <p style="max-width:600px;margin:14px auto 0;font-size:12px;color:#6B6B73;text-align:center">To change or stop these emails: My Coursework → Settings → Email reminders.</p>
</div>`;
  return { subject, text, html };
}

// ---------- Run ----------
async function main() {
const need = ["FIREBASE_SERVICE_ACCOUNT", "GMAIL_USER", "GMAIL_APP_PASSWORD"].filter(k => !process.env[k]);
if (need.length) { console.error("Missing GitHub secrets: " + need.join(", ") + ". See README → Daily reminders."); process.exit(1); }

let account;
try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
catch (e) { console.error("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste the whole downloaded key file into the secret."); process.exit(1); }
initializeApp({ credential: cert(account) });
const db = getFirestore(), auth = getAuth();
const mailer = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") } });

const hub = await loadHub();
const base = hubItems(hub);
console.log(`Today (${TZ}): ${today}. Hub items: ${base.length}.`);

const users = await db.collection("users").get();
let sent = 0;
for (const doc of users.docs) {
  const st = doc.data() || {}, R = { ...REMINDER_DEFAULTS, ...(st.reminders || {}) };
  if (!R.enabled) { console.log(`${doc.id}: reminders off`); continue; }
  const logRef = db.doc(`reminderLog/${doc.id}`), log = (await logRef.get()).data() || {};
  if (log.day === today && !FORCE) { console.log(`${doc.id}: already handled today`); continue; }

  const to = R.to || (st.account && st.account.email) || (await auth.getUser(doc.id).catch(() => ({}))).email;
  if (!to) { console.log(`${doc.id}: no email address`); continue; }

  const items = pendingFor(hub, base, st, R);
  if (!items.length) {
    console.log(`${doc.id}: nothing pending`);
    if (!DRY) await logRef.set({ ...log, day: today, checkedAt: Date.now(), to });
    continue;
  }
  const mail = buildEmail(hub, items, (st.profile && st.profile.name) || (st.account && st.account.name));
  if (DRY) { console.log(`DRY RUN → ${to}\nSubject: ${mail.subject}\n\n${mail.text}`); continue; }
  await mailer.sendMail({ from: `"My Coursework" <${process.env.GMAIL_USER}>`, to, subject: mail.subject, text: mail.text, html: mail.html });
  await logRef.set({ day: today, checkedAt: Date.now(), sentAt: Date.now(), sentCount: items.length, to });
  console.log(`${doc.id}: sent ${items.length} item(s) to ${to}`);
  sent++;
}
console.log(`Done. Emails sent: ${sent}.`);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
