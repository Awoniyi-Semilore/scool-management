# Testing checklist

Mark each item only after you have run it. Items marked **[unit]** run automatically
with `npm test`. Items marked **[firebase]** need your configured Firebase project and
have **not** been run by the developer during the build.

## Automated (run with `npm test`)

- [x] **[unit]** Money parsing and display (`₦50,000` ↔ 5000000 kobo).
- [x] **[unit]** ₦50,000 payment cannot be allocated ₦49,000 or ₦51,000; exact allocation is accepted.
- [x] **[unit]** Missing, zero and negative allocations are rejected.
- [x] **[unit]** Allocation above the eligible outstanding amount is rejected.
- [x] **[unit]** Allocation to an unrelated pupil is rejected.
- [x] **[unit]** Allocation referring to an unknown fee is rejected.
- [x] **[unit]** Two pending claims cannot both claim the same open balance.
- [x] **[unit]** Pending submissions do not reduce the official outstanding balance.
- [x] **[unit]** Discount reduces the amount payable; the original fee remains visible.
- [x] **[unit]** Partial payments calculate correctly.
- [x] **[unit]** Previous-term debt is carried forward once; paying it reduces only that debt.
- [x] **[unit]** A discount on one fee does not reduce a different fee.
- [x] **[unit]** A fee adjustment does not erase confirmed payments.

## Build and type checks (run with `npm run build`)

- [x] Production build completes.
- [x] TypeScript strict type-check passes.

## Firebase rules and workflows — run on your project

- [ ] **[firebase]** Visitor who is not signed in cannot read any school record.
- [ ] **[firebase]** A new parent sign-up gets role `parent` only.
- [ ] **[firebase]** A parent cannot change their own `role` to `admin` in the console or via code.
- [ ] **[firebase]** A parent cannot read a pupil before the head teacher approves the link.
- [ ] **[firebase]** A parent cannot read another family's pupil, charges or payments.
- [ ] **[firebase]** A parent cannot create a confirmed payment or receipt.
- [ ] **[firebase]** A parent cannot change the status of a submission to `confirmed`.
- [ ] **[firebase]** A parent can create a pending submission for their own account only.
- [ ] **[firebase]** Head teacher can approve a submission; balance updates exactly once.
- [ ] **[firebase]** Rejecting a submission keeps it in history with the reason shown to the parent.
- [ ] **[firebase]** Parent can read only their own receipts.
- [ ] **[firebase]** Uploaded proof is readable by the owning parent and admins only.
- [ ] **[firebase]** A parent cannot read another parent's uploaded proof.
- [ ] **[firebase]** Audit events cannot be edited or deleted by anyone.
- [ ] **[firebase]** Fee charges cannot be edited or deleted after creation (only `paidKobo` changes).
- [ ] **[firebase]** Duplicate admission numbers are rejected.

## Interface

- [x] **[manual]** Light mode renders legibly on desktop, tablet and phone.
- [x] **[manual]** Dark mode renders legibly on desktop, tablet and phone.
- [x] **[manual]** Theme preference is remembered after reload.
- [x] **[manual]** Keyboard can reach and operate every form and button; focus is visible.
- [ ] **[manual]** Receipt PDF downloads and prints on A5 paper.

## Known gaps not yet tested

- Receipt void/replacement (not implemented).
- Bulk CSV import (not implemented).
- Concurrent approvals from two admins at the same moment (needs two live sessions).
