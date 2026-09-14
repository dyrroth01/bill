# BillFlow — Digital bills + billing CRM

Create digital bills in **PDF** from your existing bill-book format, and track **paid / pending / overdue**
payments in a CRM-style dashboard. Built as a **Next.js website + API** with an **Expo React Native mobile app**
that uses the same API.

## Quick start (website)

```bash
# 1. install dependencies (first run downloads Chromium for PDF rendering — be patient)
npm install

# 2. create the database (SQLite file at prisma/dev.db)
npm run db:push

# 3. start the dev server
npm run dev
# → port 3000 if free, otherwise: npx next dev -p 3100
```

Open the app, **Sign up** (starter templates are seeded automatically), and you're on the
**Welcome screen** with three ways to create your bill format:

1. **AI Bill Maker** — upload a photo/PDF of an existing bill. AI reads the letterhead
   (logo?, signature?, GST fields?, bank block?) and generates a reusable Handlebars HTML template.
   Logo & signature are auto-cropped for your review — you can replace them with clean scans or remove them.
2. **Import file** — upload an existing `.html` / `.docx` bill (`.pdf` goes through the AI path).
3. **Ready templates** — Classic Bill Book (R.K. Mould style), GST Tax Invoice (Krishna Engineering style),
   Modern Minimal (A4), Blank starter.

Existing users log in straight to the **Dashboard**; new users go through the Welcome screen first.

## Enable the AI Bill Maker (free)

1. Get a free key at https://aistudio.google.com/apikey
2. Either put it in `.env` as `GEMINI_API_KEY=...` and restart, or paste it in **Settings** in the app
   (stored per-user, use "Test AI key" to verify).

Without a key the AI flow runs in **demo mode** (close built-in layout, clearly labelled), so the whole
app is testable without one.

## Mobile app (`mobile/`)

```bash
cd mobile
npm install
npx expo start
```

- Scan the QR with **Expo Go** (Android/iOS) or press `a` for an emulator.
- In the app's **Settings** tab, set **Server URL**:
  - Android emulator: `http://10.0.2.2:3100`
  - Real phone: your PC's LAN IP, e.g. `http://192.168.1.5:3100` (same Wi-Fi as the PC running `npm run dev`).
- Log in with the account you created on the website. Home, Bills, New bill, Formats, Settings tabs;
  bills open their PDF via a short-lived signed link.

## How it works

- **HTML is the template format** (not Word) — pixel-perfect PDF via headless Chrome (Puppeteer),
  AI generates it reliably, and `{{#if hasLogo}}`-style blocks handle "some bills have logo/signature/GST,
  some don't". Word (.docx) is supported as *import* via `mammoth`.
- **One-time generation**: the template is created once; every bill fills its placeholders
  (`{{billNo}}`, `{{client.name}}`, `{{#each items}}`…) and renders a fresh PDF.
- **Overdue** is computed automatically: `status = PENDING and dueDate < today`.
- **Cheque payments** are tracked (number + pending/cleared/bounced) and shown on the bill + lists.

```
app/                 Next.js App Router (pages + REST API under app/api)
lib/                 auth, db, Handlebars engine, PDF renderer, Gemini pipeline, built-in templates
prisma/schema.prisma User · Template · Client · Bill · Asset (SQLite)
uploads/             logos, signatures, source bill photos, generated PDFs
mobile/              Expo app (thin client over the same API)
test-fixtures/       your two sample bill photos for testing the AI maker
```

## Notes

- Port 3000 was occupied by another project on this machine, so run `npx next dev -p 3100` (or stop the
  other app). The mobile app's default server URL matches the emulator case; change it in Settings.
- `.env`: `DATABASE_URL`, `AUTH_SECRET` (change in production), `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Templates are fully editable in **Templates → Edit** (name, page size A4/A5, section toggles,
  logo/signature upload, custom fields, raw HTML with a placeholder cheat-sheet, live preview).
