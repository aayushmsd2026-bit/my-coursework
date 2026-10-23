# My Coursework

A personal tracker built on top of a friend's shared [Assignment Hub](https://neotahiro.github.io/assignment-hub/).
His list is read live; your ticks, edits, notes, submission links and sent emails are stored
separately in your own Firebase account, so his updates never overwrite your work.

## What it does

- **To do** grouped by Overdue / Today / Tomorrow / This week / Later, with search and subject filters
- **Calendar**: month view of every deadline; download them all as an `.ics` file for Apple or Google Calendar, or add one at a time to Google Calendar
- **Steps** on each assignment (or a one-click starter plan), with progress shown in the list, plus an **In progress** status
- **My submission** links (Google Docs, Drive, YouTube…), private **notes**, and **marks & feedback** once graded, with a per-subject average
- **Email my submission** to your teacher: a formatted email you can send from Gmail directly, or copy and paste into a Gmail draft
- **My work**: everything that's yours in one place: in progress, submissions, results, emails, notes and your edits
- Word-count targets read from the assignment text, keyboard shortcuts (press `?`), light and dark mode
- Installable: Safari → File → **Add to Dock** on Mac, or Share → **Add to Home Screen** on iPhone

## How syncing works

| Situation | What happens |
|---|---|
| He adds an assignment | It appears with a **New** tag. |
| He changes a field you never touched | You get his update. |
| He changes a field **you** also changed | Your value stays. The item is flagged **Hub updated** so you can pick *Use his version* or *Keep mine*. |
| He renames an item's id | Your data is re-attached by subject + title. |
| He deletes an item you have data on | It's kept under **My work → No longer on the hub**. |
| His file has duplicate ids | The second copy becomes `id~2`, so nothing collides. |

His `data.js` is parsed as data, never executed, so nothing in his file can run inside your signed-in page.

## Setup (about 15 minutes, once)

### 1. Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**. Pick your support email, save.
3. **Build → Firestore Database → Create database** → production mode → a nearby location (e.g. `asia-south1`).
4. In Firestore → **Rules**, paste the contents of `firestore.rules` and **Publish**.
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no hosting).
   Copy the `firebaseConfig` values into `config.js`.

### 2. Allow Gmail sending (optional, for "Send from my Gmail")
1. Open <https://console.cloud.google.com> and select the **same project** Firebase created.
2. **APIs & Services → Library → Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform → Audience / Data access):
   - User type **External**, publishing status **Testing**.
   - Under **Test users**, add your own Gmail address.
   - Under **Data access / Scopes**, add `https://www.googleapis.com/auth/gmail.send`.
4. The first time you send, Google shows "Google hasn't verified this app". That's expected for a personal
   app: click **Continue**, then allow **Send email on your behalf**. The app can only send; it can't read your inbox.

Without this step, everything else works and **Open in Gmail** still opens a pre-filled draft.

### 3. Publish on GitHub Pages
1. Create a new repository on GitHub, e.g. `my-coursework` (public; Pages on private repos needs a paid plan).
2. Upload every file in this folder (or `git push`).
3. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save**.
4. After a minute your site is at `https://<your-username>.github.io/my-coursework/`.
5. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `<your-username>.github.io`.

### 4. First run
1. Open the site → **Sign in with Google**.
2. **Settings (gear)** → fill in your name, programme, student ID, and each teacher's name/email.
3. Moving from the Claude version? There, click **Copy my data**; here, paste it under
   **Settings → Your data → Import and merge**.

On iPhone: open the site in Safari → Share → **Add to Home Screen** for an app-like icon.

## Files

- `index.html`, `styles.css` — layout and design (KU palette, Apple-style surfaces)
- `app.js` — hub sync, your data layer, Firebase, Gmail
- `config.js` — your Firebase keys and the hub address (the only file you need to edit)
- `firestore.rules` — security rules: only you can read or write your data
- `hub-fallback.json` — offline copy used if the hub can't be reached on first load
- `hub-core.js` — reads the hub (parsed as data, never run)
