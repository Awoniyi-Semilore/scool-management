# Verification results (first handover)

Last run in the build sandbox. "Verified" means the check was executed and passed.

| Item | Status | How it was checked |
|---|---|---|
| TypeScript typecheck | Verified | `npm run typecheck` |
| Production build | Verified | `npm run build` (main bundle 708 kB, gzip 183 kB, was 1,138 kB) |
| Money, discounts, carry-forward, pending reservations | Verified | 16 + 8 unit tests (`ledger.test.ts`, `rules.test.ts`) |
| Allocation validation (₦50,000 cases) | Verified | unit tests |
| Approval must match parent claim; parent link re-checked at approval | Verified (logic) | `approval.test.ts` (4 tests). Firestore transaction not run against a live database |
| CSV pupil import (parse, duplicates, unknown class, missing columns, sample file) | Verified (logic + UI wired) | `csvImport.test.ts` (9 tests). UI not clicked through a signed-in session |
| Receipt PDF generation (valid PDF, receipt number and bank reference present) | Verified | `receipt.test.ts` (2 tests) |
| Light and dark mode, desktop and mobile layout, no horizontal overflow, no console errors | Verified on the signed-out pages | Playwright screenshots of the login page. Signed-in pages not tested (need Firebase) |
| Dark-mode title readability | Fixed and re-verified | Title was dark-on-dark; fixed in `ui.tsx` and `LoginPage.tsx` |
| Firestore security rules (access, role escalation, confirmed-payment immutability, audit log) | NOT VERIFIED | Written in `rules-tests/rules.test.mjs` (30 cases). Could not run: the Firestore emulator jar download is blocked in the build sandbox |
| Storage security rules (private evidence, file type, owner-only overwrite) | NOT VERIFIED | Same test file. Same blocker |
| End-to-end signed-in workflows (parent submits, admin approves, receipt downloads) | NOT VERIFIED | Needs a real Firebase project |

## Run the rules tests yourself
From the project folder, with Java 11+ installed:

    npm run test:rules

Every test must pass before real pupil data is loaded. Any failure is a security bug, not a test bug, until proven otherwise.

## Known limitations still open
- Rules cannot add up allocation totals. The exact-total check is enforced at approval time only.
- `createPupil` checks for duplicate admission numbers before writing, not inside a transaction. Acceptable for one administrator, not for several working at once.
- The disabled "Sign in" button on the login page is low contrast. Disabled controls are exempt from contrast rules; it is still worth reviewing.
