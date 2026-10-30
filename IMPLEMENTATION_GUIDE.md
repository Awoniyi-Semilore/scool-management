# Implementation guide (beginner-friendly)

Work through these steps in order. Each step says **where** to click or type, the
**exact command**, what **success looks like**, and what to do **if it fails**.

Throughout, "terminal" means the Command Prompt, PowerShell, or Terminal app on your
computer.

---

## Step 1 — Install the software you need

1. Install **Node.js LTS** (version 20 or newer) from https://nodejs.org and accept the defaults.
2. Install **Git** (optional, for version history) from https://git-scm.com.
3. Install a code editor such as **Visual Studio Code** from https://code.visualstudio.com.

**Check:** open a terminal and run:

```bash
node -v
npm -v
```

Success: both print a version number (for example `v22.x.x` and `10.x.x`).
If it fails: close and reopen the terminal, or restart the computer after installing Node.

---

## Step 2 — Open the project folder

1. Copy the whole `school-fee-manager` folder to a place you can find, such as your
   Documents folder. Do not put it inside another project.
2. In a terminal, move into the folder. Replace the path with where you saved it:

```bash
cd Documents/school-fee-manager
```

3. Confirm you are in the right place:

```bash
ls
```

Success: you see `package.json`, `src`, `firestore.rules`, `README.md`.
If it fails: use `dir` on Windows instead of `ls`, and check the folder name.

---

## Step 3 — Install the project dependencies

Run this in the `school-fee-manager` folder:

```bash
npm install
```

It downloads the libraries listed in `package.json`. It takes one to three minutes.
The project includes an `.npmrc` file that allows this install to work; do not delete it.

Success: it ends with `added NNN packages` and no red `ERR!` lines.
If it fails: check your internet connection and run `npm install` again. If it still
fails, delete the `node_modules` folder and the `package-lock.json` file, then run it again.

---

## Step 4 — Create a Firebase project

Firebase is Google's hosted service. It stores the school's accounts, records and
uploaded proof of payment.

1. Go to https://console.firebase.google.com and sign in with a Google account.
   **Use an account the school controls**, not a personal one you may later lose access to (see Step 19).
2. Click **Create a project** (or **Add project**).
3. Name it something like `school-fee-manager-2026`. Click **Continue**.
4. Google Analytics is optional. You may turn it off. Click **Create project**.
5. Wait until it says **Your new project is ready**, then click **Continue**.

Success: you are on the project overview page.

---

## Step 5 — Turn on Email/Password sign-in

1. In the left menu, click **Build → Authentication**.
2. Click **Get started** if you see that button.
3. Open the **Sign-in method** tab.
4. Click **Email/Password**, switch on **Enable**, leave **Email link** off, and click **Save**.

Success: Email/Password shows **Enabled**.

Note: the app uses **Forgot password** emails. In **Authentication → Templates** you can
change the sender name to the school's name.

---

## Step 6 — Register the web app and copy its settings

1. On the project overview page, click the **`</>`** (Web) icon.
2. Enter an app nickname such as `fee-manager-web`. Leave **Firebase Hosting** unticked for now.
   Click **Register app**.
3. You will see a block of code that looks like `const firebaseConfig = { apiKey: ..., projectId: ... }`.
   **Keep this page open.** You will copy values from it in the next step.

These values identify your project to the browser. They are not passwords, but treat them
as your school's details and do not post them publicly.

---

## Step 7 — Create the local settings file

1. In the `school-fee-manager` folder, find the file named **`.env.example`**.
2. **Copy** it and rename the copy to **`.env.local`**.
   - Windows Explorer may hide the extension. Make sure the name is exactly `.env.local`.
   - Do **not** rename the original `.env.example`.
3. Open `.env.local` in your editor.
4. Copy each value from the Firebase page (Step 6) into the matching line. For example:

```
VITE_FIREBASE_API_KEY=AIza...your value...
VITE_FIREBASE_AUTH_DOMAIN=school-fee-manager-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=school-fee-manager-2026
VITE_FIREBASE_STORAGE_BUCKET=school-fee-manager-2026.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

5. Save the file.

Success: none of the lines are empty.
If it fails: the app will show "Firebase is not configured" until every value is filled in.
`.env.local` is ignored by Git on purpose. Never share it or paste it into chat.

---

## Step 8 — Enable Cloud Firestore (the database)

1. In the left menu, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location close to Nigeria (for example **europe-west1** or **eur3**; the list
   names the nearest available region). Click **Next**.
4. Select **Start in production mode**. Click **Create**.

Production mode denies everything until the rules are applied in Step 11. That is intended.

Success: you see an empty Data tab for the database.

---

## Step 9 — Enable Firebase Storage (proof of payment uploads)

1. In the left menu, click **Build → Storage**.
2. Click **Get started**. Choose **Start in production mode**, then **Next**.
3. Use the same location as Step 8 and click **Done**.

Note: Firebase may ask you to upgrade to the **Blaze (pay-as-you-go)** plan to use
Storage. Read the cost section of the README before deciding. Usage for a school of
100+ pupils is normally small, but you should set a budget alert (Step 19).

---

## Step 10 — Install the Firebase command-line tool

This tool sends your rules and the website to Firebase.

In a terminal, run:

```bash
npm install -g firebase-tools
firebase --version
```

Success: it prints a version number.
If it fails with "permission denied" on Mac or Linux, run `sudo npm install -g firebase-tools`.
On Windows, open the terminal as Administrator.

Then sign in:

```bash
firebase login
```

A browser window opens. Choose the same Google account you used in Step 4.

Then connect the project folder to your Firebase project. Run this in the
`school-fee-manager` folder, and choose your project from the list when asked:

```bash
firebase use --add
```

Give it the alias `default`.

---

## Step 11 — Apply the database and storage security rules

The rules decide who can read and write what. **This step is essential.**

In the `school-fee-manager` folder:

```bash
firebase deploy --only firestore:rules,storage
```

Success: the output ends with `Deploy complete!`.
If it fails:
- "Storage has not been set up": go back to Step 9.
- "Permission denied": make sure you signed in with the owner account (`firebase login`).
- "Invalid rules": copy the error line and check the file named in it.

Also deploy the indexes file (it is empty but must exist):

```bash
firebase deploy --only firestore:indexes
```

---

## Step 12 — Create the head teacher's account and grant administrator access

Administrator access is **never** granted through the app. This keeps it secure.

### 12a. Create the account

1. Start the app (Step 13) **or** simply sign up at the login page. Choose
   **Parent registration**, enter the head teacher's name, email and a strong password,
   and press **Create parent account**.
   - This creates a normal parent profile. You will upgrade it in step 12b.
   - Alternatively, create the user in **Authentication → Users → Add user** in the
     Firebase Console. The profile is then created the first time they sign in.

2. Sign in once as that head teacher so that their profile document exists.

### 12b. Grant administrator access (one time, by you)

1. In the Firebase Console, click **Build → Firestore Database → Data**.
2. Find the collection named **`users`**. Find the document whose ID is the head
   teacher's user ID. You can see their **User UID** under **Authentication → Users**.
3. Click the document, find the field **`role`**, and change its value from `parent` to `admin`.
4. Click **Update**.

Success: the head teacher signs out and back in and lands on the **Overview** page with
the head teacher navigation.

Why this works: the security rules let only an existing administrator change a role.
This first change is therefore done by you in the console. Nobody else can do it.

### 12c. Rules for admin accounts

- Keep the **number of administrator accounts small**, preferably one or two.
- Do not give administrator access to parents.
- To remove access, change `role` back to `parent` in the same place.

---

## Step 13 — Start the app on your computer

In the `school-fee-manager` folder:

```bash
npm run dev
```

It prints a line such as `Local: http://localhost:5173/`. Open that address in your browser.

Success: you see the **School Fee Manager** sign-in page.
If it fails: stop the server with `Ctrl+C`, check `.env.local` (Step 7), and run it again.

To stop the app later, press `Ctrl+C` in the terminal.

---

## Step 14 — Set up the school (head teacher)

Sign in as the head teacher and work through these in order:

1. **Settings** → **Create an academic session**. Enter the session ID such as `2026-2027`
   and click **Create session**. This creates First, Second and Third Term automatically.
2. **Settings** → **Classes**. Add each class (for example `Primary 1`).
3. **Settings** → in the session list, click **Make active** on the current term.
4. **Pupils & Classes** → **Add a pupil** for each child (or the parents will send requests).
5. **Fee Register** → choose the session, term and class. Click **Open account** on a pupil.

Fees are added as charges. Use the account panel and record payments there. Enter
opening balances once, as charges of the type you choose, with a reason.

---

## Step 15 — Test the main workflows

Follow `TESTING_CHECKLIST.md`. In summary:

1. **Parent sign-up:** open a private window, register a parent account, and confirm the
   parent cannot see any pupil.
2. **Parent request:** as the parent, go to **My Children** and ask to add a child.
3. **Approval:** as the head teacher, go to **Pupils & Classes** and link the parent.
4. **Submission:** as the parent, go to **Submit Payment**, enter the amount, reference,
   proof file, and allocate it exactly. The submission appears as **Pending review**.
5. **Verification:** as the head teacher, go to **Verify Payments** and confirm it. The
   balance drops and a receipt is created.
6. **Receipt:** as the parent, go to **Receipts & Statements** and download the PDF.

For each step, note what you observed and whether it matched the expected result.

---

## Step 15b — Run the automated security-rule tests (recommended before real data)

These tests check the Firestore and Storage rules against a local copy of Firebase.
They need **Java 11 or newer** installed (check with `java -version` in a terminal).

1. Open a terminal in the `school-fee-manager` folder.
2. Run:

```bash
npm run test:rules
```

3. Wait about a minute. The first run downloads the Firebase emulator (one-time).

Success: the output ends with `# pass 30` and `# fail 0`.
If any test fails: stop. Do not load real pupil records. Copy the failing test name into a note
and ask for help. A failure means a permission rule is not doing what it should.

Also run the unit tests for the money logic and CSV import (no Java needed):

```bash
npm test
```

Success: `Tests  39 passed (39)`.

---

## Step 15c — Import pupils from a CSV file

1. Create your classes first (**Pupils & Classes** → **Add a class**). Class names must match the CSV exactly, ignoring capitals.
2. Open `public/sample-pupils.csv` in Excel or Google Sheets. Keep the four column headers:
   `admission_number, first_name, last_name, class`.
3. Replace the sample rows with your pupils. Save as CSV (UTF-8).
4. In **Pupils & Classes**, scroll to **Import pupils from a CSV file** and choose the file.
5. Read the preview. Rows marked **Error** are skipped. Fix them in the CSV and choose the file again.
6. Click **Import N ready row(s)** and confirm.

Success: the pupils appear in the **Pupils** table. Re-importing the same file reports
"already exists" for every row, so nothing is duplicated.

---

---

## Step 16 — Run the production build

Stop the dev server (`Ctrl+C`), then run:

```bash
npm run build
```

Success: it ends with `✓ built in ...` and creates a `dist` folder.
If it fails: copy the first red error line and fix that file. The most common cause is a
missing `.env.local` value only if you have changed the code.

Optional, to preview the production build locally:

```bash
npm run preview
```

---

## Step 17 — Deploy to Firebase Hosting

1. In the Firebase Console, click **Build → Hosting → Get started** and follow the
   prompts (you can skip the setup commands; you have already installed the tool).
2. Back in the `school-fee-manager` folder, run:

```bash
npm run build
firebase deploy --only hosting
```

Success: the output ends with a line like:
`Hosting URL: https://school-fee-manager-2026.web.app`

If it fails: check that `dist` exists (run `npm run build` first) and that you are
logged in (`firebase login`).

---

## Step 18 — Connect the school to the deployed address

1. Open the Hosting URL in a browser and sign in as the head teacher. Check that it works.
2. Optional custom domain: in **Hosting → Add custom domain** follow the DNS instructions
   with the school's domain provider.
3. Add the Hosting domain to the allowed sign-in domains: **Authentication → Settings →
   Authorized domains**. The Firebase `web.app` domain is already allowed; add any custom
   domain here as well.
4. Share the address only with staff and parents who should use it.

---

## Step 19 — Back up the data and keep ownership safe

**Ownership:** the Firebase project belongs to whichever Google account created it. Use
an account the school controls, and add a second owner:
**Project settings → Users and permissions → Add member → Owner**.

**Billing alert:** in the Google Cloud Console (https://console.cloud.google.com), choose
**Billing → Budgets & alerts** and create a budget with an email alert, for example at
₦10,000 or your agreed limit.

**Backups:** this version does **not** configure automatic backups. To make one manually:

1. Install the Firestore export tool through the Google Cloud CLI
   (https://cloud.google.com/sdk/docs/install).
2. Run `gcloud firestore export gs://YOUR-BUCKET/backup-YYYY-MM-DD` after creating a
   Cloud Storage bucket with that name.
3. Store a copy somewhere the school controls, and test restoring it once.

You can also export the **Reports** CSV files from the Receipts & Reports screen. These
are useful records but are **not** a complete database backup.

---

## Step 20 — Troubleshooting

| Problem | What to do |
|---|---|
| Page says "Firebase is not configured" | Check every line of `.env.local` is filled; restart `npm run dev`. |
| "Missing or insufficient permissions" | The rules are blocking the action. Confirm the user's `role` is correct and the rules were deployed (Step 11). |
| Head teacher still sees the parent screens | Their `role` is still `parent`. Change it in Firestore (Step 12b) and sign out/in. |
| Sign-in says "Email or password is incorrect" | Use **Forgot password**, or check the account exists under Authentication → Users. |
| Upload fails | Check the file is a PDF, JPG, PNG or WEBP under 5 MB, and Storage is enabled (Step 9). |
| `npm run dev` port in use | Stop the other program using port 5173, or run `npm run dev -- --port 5180`. |
| Receipt PDF does not download | Try another browser and check pop-up blocking is not stopping the download. |
| Build fails after editing | Run `npm run build` and fix the first error it reports. |

If something is not covered here, copy the exact error text and the step number you were
on, and ask for help. Do not paste your `.env.local` file or any password.

---

## Appendix — What has been verified (summary)

See `VERIFICATION_RESULTS.md` for the full table. In short:

- Verified by automated checks: build, typecheck, 39 unit tests (money, allocation, approval guard, CSV import, receipt PDF).
- Verified in a browser on the signed-out pages: light and dark mode, desktop and mobile layout.
- **Not yet verified:** the security rules (run `npm run test:rules`, Step 15b), and every signed-in workflow (Steps 13–15) on your own Firebase project.

---

## Appendix B — Using the new fee register (version 3)

**Set the standard fees once per class and term**
1. Open **Fee Register**. Choose the session, term and class.
2. Click **Edit standard fees** under the class name.
3. Type each fee name (for example Tuition, Books, Uniform) and its amount. Use **Add a fee** for more.
4. Click **Save standard fees** and confirm.
Fees saved here are copied to children added to that class later. Children already in the register are not changed.

**Add a child with their fees**
Open **Pupils & Classes**, fill in the form, and enter the **Outstanding fee from earlier terms** if they owe money. The class's standard fees are added automatically if a term is active.

**Change what one child pays**
1. In **Fee Register**, click the child's name.
2. Click **Change amount** on the fee line.
3. Enter the new amount. Enter **0** for "not charged".
4. Add a reason if you want (optional), then save and confirm.
The change is recorded as a discount or an added fee. Nothing is deleted, so the history stays correct.

**Record a payment**
1. Click the child's name, then **Record a payment**.
2. Enter the amount, the date, who paid, and the bank reference (optional).
3. Use **Fill in order** or type the amount against each fee.
4. The fees must add up to the amount paid. Save, then confirm. A receipt is issued.
Payments cannot be edited after saving.

**Recording money paid before the system started**
Use **Record a payment** and enter the date it was paid. The receipt is issued the same way.

**Known limits in this version**
- There is no correction screen for a payment entered by mistake yet.
- Parents downloading a receipt see "not yet calculated" for the outstanding balance.
- The receipt numbers use their own series (TCS-000001 onward). They never clash with the paper receipt book.
