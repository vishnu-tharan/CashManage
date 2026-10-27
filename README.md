# CashManage

A personal cashbook app built with JavaScript, React, Vite, Express and SQLite. Record income and expenses, then see where your money goes. It records money movements; it does not make payments or connect to banks.

## Features

- Cashbooks with a fixed currency, monthly budgets and accurate minor-unit amounts.
- Add, edit, delete and filter transactions; view balances and spending charts.
- Transfers, recurring entries, debts with partial repayments and savings targets.
- CSV import with preview and duplicate checks, receipt attachments and recent transaction undo.
- CSV reports and browser Print / Save as PDF.
- Accounts, encrypted local storage, offline unlock, synchronization and encrypted backup files.
- Light/dark themes, responsive layouts and browser installation.

## Setup

Install Node.js 22.14 or newer. From the project folder:

```powershell
cd client
npm ci
npm run build
cd ../server
npm ci
$env:APP_ORIGIN='http://localhost:3000'
npm start
```

Open http://localhost:3000. The Express server serves the built app and `/api` together.

For development, run `npm run dev` in `server` and `client` in separate terminals. Open http://localhost:5173 and set the server's `APP_ORIGIN` to that address. Vite forwards API requests to port 3000. Server settings can also go in `server/.env`; see `server/.env.example`.

Try **Continue as guest** for a quick demonstration. Add an income and expense, check the totals, create a cashbook, filter transactions and export a report. Guest data disappears on reload or lock; download an encrypted backup in Settings to keep it. Create an account to save and sync between sessions. The profile initially displays your username, and you can change it in Settings.

## How it works

1. `client/src/App.jsx` selects the screen. `pages/` contains the screens and `components/` contains forms, navigation and transaction dialogs.
2. `hooks/useWorkspace.js` manages unlock, local saving, sync and auto-lock. `domain/` contains currency formatting, validation, initial data and report calculations. `ledger.js` handles money movements, imports and undo.
3. `lib/` contains small API, encryption, download and CSV helpers. `storage.js` exports shared helpers.
4. The browser validates data, encrypts the workspace and saves a local copy. The server stores the encrypted vault rather than individual private transactions.
5. `server/index.js` handles accounts, sessions and revision-checked vault updates. `accountSecurity.js`, `routes/security.js`, `routes/recovery.js` and `totp.js` implement MFA, recovery and password changes. `db.js` opens SQLite.

Amounts are stored as integers in the currency's smallest unit. Different currencies are never added together. Transfers update both cashbooks but are excluded from income and expense totals. Recurring entries post once when the app is unlocked; nothing runs while it is closed. Savings progress earmarks money without creating a transaction.

## Data and account safety

The default database is `server/cashmanage.db`. Account data stays in this file and is excluded from Git. Encrypted backup files can be downloaded and restored in Settings.

Vaults and backup files use AES-GCM with a password-derived key. Cookies are HttpOnly and SameSite, and API changes require the configured origin. Settings provides MFA, recovery keys, password changes, session revocation and auto-lock. Generate and safely store a recovery key after registration; without the password or recovery key, the encrypted data cannot be recovered.

Online sign-in saves an encrypted copy for later offline unlock. Offline changes sync when online. Revision conflicts require review before saving. Keep a backup before resolving a conflict, replacing a workspace or removing a local copy. Older backups still require their original password. Revoking a session cannot erase another device's offline copy.

Receipts support JPEG, PNG and PDF, up to 300 KB each and 1 MB total. Activity history retains at most 200 events and may trim older events to limit vault size. Undo refuses to overwrite later changes. CSV and printed reports are plaintext; keep exported files private. CSV imports use YYYY-MM-DD dates and a signed amount column or an explicit income/expense direction.

For deployment, use HTTPS, `NODE_ENV=production`, the exact `APP_ORIGIN`, and persistent `DB_PATH` and `MFA_KEY_PATH` locations. Back up both SQLite and the MFA key (`server/.mfa-key` by default). Do not use independently replicated SQLite copies. Authentication rate limits are process-local; public hosting needs deployment-specific abuse controls.

For local Docker use, run `docker compose up --build` from the project folder and open http://localhost:3000. Compose loads the defaults in `.env.docker` and stores the database and MFA key in the persistent `cashmanage-data` volume. For hosting, set `APP_ORIGIN` to your HTTPS address before starting Compose. Local databases, keys and environment files are excluded from the image build context.

## Checks

```powershell
cd client
npm run lint
npm test
npm run build
cd ../server
npm test
```

Tests cover encryption and tampering, money precision, transfers, recurring dates, debt repayment limits, undo, imports, report totals, safe CSV export, account isolation, sync conflicts, MFA, recovery and session revocation. Server tests use temporary in-memory databases.

Local encrypted backups and browser PDF printing cover the backup and report journey. Real-device PWA installation and public deployment require environment-specific verification.

Verification in this workspace: client lint, 14 client tests, 4 server tests, production build and a local HTTP response check passed. The in-app browser could not reach the isolated local test server, so desktop/mobile visual checks remain unverified. No existing project screenshots were found.

## Reading the code

Start with `domain/workspace.js` to see the data shape, then read `TransactionDialog.jsx` and `ledger.js` to follow saving and calculating amounts. Page components keep their form actions in named functions above the markup. `validation.js` checks one type of record at a time. `useWorkspace.js` connects those actions to React state and encrypted storage. On the server, read `index.js` before the account-security routes.

The code uses ordinary functions, arrays, objects and explicit conditions. React hooks manage the screen state; promises and async/await wait for files, encryption and network requests. Encryption, MFA and sync revision checks remain because simplifying them away would risk account security or saved data. Their key steps have short comments. No new application framework was added.
