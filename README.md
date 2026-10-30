# School Fee Manager

A term-based school fee management and e-receipt web app for a Nigerian school.
Head teacher and parents use the same records, with different permissions.

**Status:** First working version. Core financial rules are unit-tested. Firebase
security rules are written but **must be tested against your own Firebase project**
(see `TESTING_CHECKLIST.md`). Read the limitations section before using real pupil data.

## Stack

React 18 · Vite 6 · TypeScript · Tailwind CSS 3 · Firebase Auth, Firestore, Storage ·
Firebase Hosting · jsPDF (receipts) · lucide-react (icons)

## Quick start

```bash
npm install
cp .env.example .env.local      # then fill in your Firebase values
npm run dev                     # http://localhost:5173
npm test                        # financial unit tests
npm run build                   # production build into dist/
```

Full step-by-step setup is in **IMPLEMENTATION_GUIDE.md**.

## Project layout

```
src/
  lib/
    money.ts          integer-kobo money helpers (₦1 = 100 kobo)
    ledger.ts         pure balance logic: charges, discounts, carry-forward, pending reservations
    validation.ts     pure allocation validator (mirrors the server rules)
    ledger.test.ts    financial unit tests
    rules.test.ts     business-rule unit tests
    firebase.ts       Firebase client setup (reads VITE_* env vars only)
  services/data.ts    all Firestore reads/writes; payment confirmation is one transaction
  context/            auth and theme state
  components/         shared layout, guards, UI pieces
  pages/admin/        head teacher screens
  pages/parent/       parent screens
  utils/receipt.ts    printable A5 PDF receipt
firestore.rules       database security rules (deny by default)
storage.rules         payment-evidence security rules (private)
firebase.json         hosting, rules and index wiring
public/sample-pupils.csv   import template (see notes below)
```

## Money convention

Every amount is an integer number of **kobo**. `₦50,000` is stored as `5000000`.
Floating-point arithmetic is never used for money. Amounts are only converted to
naira text for display (`formatNaira`).

## Balance model

- **Charges** are historical lines: `fee`, `discount`, or `opening_balance`. They are
  never edited or deleted. A discount applies to the fee in the same pupil, session,
  term and category.
- **Carry-forward** is not a copy. An unpaid First Term book fee remains one charge
  with its original term and category. A payment reduces that exact charge.
- **Confirmed payments** create allocations that name a specific charge. Each charge
  holds a running `paidKobo` counter, updated atomically with the payment.
- **Pending submissions** reserve availability for a new claim but never reduce the
  official outstanding balance.
- **Outstanding** for a charge = (face value − discount share − paid), never below zero.

## Roles

- Public registration creates **parent** accounts only.
- Administrator access is granted by a documented manual step (see the guide). Nobody
  can make themselves an administrator from the app, and the rules block it.

## Known limitations (read before real use)

1. **No bulk CSV import in this version.** `public/sample-pupils.csv` shows the format
   for future import. Pupils are added one at a time on the Pupils & Classes screen.
   This was deferred to protect the core workflows within the time available.
2. **Receipt correction (void/replace) is not implemented.** Confirmed payments are
   immutable. A genuine error needs a manual correction by the developer or school
   administrator until this is built.
3. **Advance payments and unapplied credit are not supported.** Any money must be
   allocated to a specific existing fee; the app will not guess.
4. **Duplicate payment detection is basic.** The system does not automatically flag
   similar submissions yet. The admin must check the bank reference.
5. **Previous-term opening balances** are entered as `opening_balance` charges. Enter
   them once at launch; they are not fabricated history.
6. **Audit log** records the main actions (sessions, pupils, charges, link decisions,
   payment confirmation and rejection). Audit entries are append-only in the rules.
7. **Parent evidence uploads** are stored privately; there are no public links. The
   claim is recorded before the upload, so if an upload fails the admin is told to
   contact the parent.
8. **Not verified against a live Firebase project** in the build environment. The
   rules and transactions are written to the documented Firebase behaviour but must be
   exercised on the school's project before go-live.
9. **Backups** are not automated by this app. See the backup section of the guide.
