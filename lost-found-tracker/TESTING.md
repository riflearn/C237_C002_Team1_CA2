# Testing Guide — Lost & Found Tracker

Thanks for helping test before submission! This walks through every feature step by step. You don't need any technical background — just follow the numbered steps and note what happens.

## Before you start

**Where to test:** the live site — **https://c237-c002-team1-ca2.onrender.com/**  
(If the live site seems broken or out of date, mention it in the group chat before assuming it's a real bug — it might just need a redeploy.)

**Important — use your own account, not** `**student1**`**:**  
Multiple of us will be testing at the same time. If everyone uses the same `student1` login, we'll interfere with each other (e.g. one person changes the password, locking everyone else out; two people editing "their" profile at once gets confusing). Instead:

1.  Go to the site → click **Register**.
2.  Register your own account — use your real name as the username (e.g. `shernice`, `weiqi`), any email, any password you'll remember.
3.  Use **that** account for everything below except the admin-only sections.

**For admin-only sections** (marked below), use `admin` / `admin123` — since there's only one admin account, **check the group chat before testing admin scenarios**, so two of us aren't fighting over the same account at once. Call it out with something like "testing admin stuff now, back in 5 min."

**Naming your test data:** whenever you create a test item, put your name in the item name (e.g. "Shernice test umbrella") — makes it obvious whose test data is whose, and easy to tell apart from real seed data.

**If something goes wrong:** don't panic, don't try to fix it yourself — just note exactly what you did and what happened, using the feedback template at the very bottom of this doc.

---

## 1\. Register, Log In, Log Out

1.  Go to the site (you'll land on `/items`, then get redirected to `/login` since you're not logged in yet).
2.  Click **Register**.
3.  Leave the username blank, fill in email and password, click **Create account**.
    *   **Expect:** an error saying all fields are required. You should still be on the register page.
4.  Now fill in all three fields with your real test username, then click **Create account** again.
    *   **Expect:** redirected to the login page.
5.  Try registering **again** with the exact same username you just used.
    *   **Expect:** "That username is already taken."
6.  On the login page, type your username correctly but the **wrong** password, click **Log in**.
    *   **Expect:** "Invalid username or password."
7.  Type a username that doesn't exist at all, any password, click **Log in**.
    *   **Expect:** the exact same "Invalid username or password." message (not a different one — this is intentional, so an attacker can't tell which usernames are real).
8.  Now log in with your correct username and password.
    *   **Expect:** redirected to `/items`, and the top-right of the page shows "Hi, `yourusername` (student)".
9.  Click **Log out**.
    *   **Expect:** redirected to `/login`.
10.  After logging out, manually type `/items` into the address bar (e.g. `https://c237-c002-team1-ca2.onrender.com/items`).
    *   **Expect:** you get bounced straight back to `/login` — you shouldn't be able to see the items list while logged out.

---

## 2\. My Profile

1.  Log in with your test account.
2.  Click your own name/"Hi, ..." link at the top right — this takes you to `/profile`.
    *   **Expect:** your current username, email, and role are shown.
3.  Change the email field to something else, leave both password fields blank, click **Save changes**.
    *   **Expect:** a success message, and the email field now shows your new email.
4.  Clear the email field entirely (leave it blank), click **Save changes**.
    *   **Expect:** "Email is required." — nothing should save.
5.  Now type something into **New password** only (leave **Current password** blank), click **Save changes**.
    *   **Expect:** "Enter your current password to set a new one."
6.  Fill in **Current password** with the _wrong_ password, and any **New password**, click **Save changes**.
    *   **Expect:** "Current password is incorrect."
7.  Now fill in **Current password** correctly, and a real **New password**, click **Save changes**.
    *   **Expect:** success message.
8.  Log out, then log back in using your **new** password.
    *   **Expect:** it works — confirms the password actually changed in the database, not just on screen.

---

## 3\. Report a Found Item (+ Photo Upload)

1.  Log in, click **\+ Report a found item** on the items page.
2.  Leave **Item name** blank, fill everything else in, click **Submit**.
    *   **Expect:** "Please fill in all required fields." — form doesn't submit.
3.  Now fill in Item name, Category, Location found, Date found — but leave **Description** blank (it's optional) — click **Submit**.
    *   **Expect:** succeeds, redirects to the items list, and your item is there.
4.  Report a second item, this time attaching a photo (any image file on your device) using the **Photo** field.
    *   **Expect:** succeeds, and when you click into that item's detail page, the photo displays.
5.  **Photo collision test:** find two _different_ image files on your device and rename them both to the exact same filename (e.g. `test.jpg`) before uploading — report two separate items, one with each renamed file.
    *   **Expect:** both items show their own correct, different photo — neither one overwrites the other.

---

## 4\. Browse & View Items (+ Pagination & Sorting)

1.  Go to `/items`.
    *   **Expect:** you see a list of items (not ones that have been removed by an admin).
2.  Click into any item.
    *   **Expect:** its detail page shows the name, status, description, location, date, and photo if it has one.
3.  Manually change the URL to an item ID that doesn't exist, e.g. `/items/999999`.
    *   **Expect:** "Item not found." — not a crash or blank page.
4.  Back on `/items`, if there are more than 5 items total, look for **Prev / Next** links at the bottom.
    *   **Expect:** clicking **Next** shows a different set of items, and the page number updates.
5.  Try each of the sort links (**Newest**, **Date found**, **Name (A-Z)**, **Status**).
    *   **Expect:** the order of items visibly changes each time.
6.  Manually edit the URL to something like `/items?page=999`.
    *   **Expect:** doesn't crash — shows an empty list or the last real page, gracefully.

---

## 5\. Edit an Item (+ Edit History)

**Log in as** `**admin**`**/**`**admin123**` **for this section** (check the group chat first).

1.  Go to `/items`, click into any item, click **Edit**.
    *   **Expect:** the edit form is pre-filled with the item's current details.
2.  Change one field (e.g. the description) and click **Save changes**.
    *   **Expect:** redirected to the item's detail page, showing your change.
3.  Edit the same item again, this time clear a required field (e.g. Item name) and submit.
    *   **Expect:** an error message, **and** whatever else you'd typed in the other fields is still there (not wiped back to blank or to the old values).
4.  On the edit page, click **View past edits**.
    *   **Expect:** a log entry for the edit you made in step 2, showing exactly which field changed and the old/new values (e.g. `description changed`).
5.  Edit the item one more time, but submit it with the exact same values as before (change nothing).
    *   **Expect:** a new log entry appears saying "No fields changed."
6.  **Worth flagging, not necessarily a bug:** while logged in as your own _student_ account (not admin), try manually visiting `/items/1/edit` (pick any real item ID) directly in the address bar.
    *   **Note what happens** — currently this isn't blocked at the route level the way Delete is, so you may be able to get into the edit form even without the Edit button being visible to you. This is a known, deliberate thing to flag, not something to "fix" yourself — just confirm and report what actually happens.

---

## 6\. Remove (Delete) an Item

**Log in as** `**admin**`**/**`**admin123**` **for this section.**

1.  Report a throwaway test item first (see Section 3) so you're not deleting real seed data.
2.  Open that item, click **Delete**.
    *   **Expect:** redirected to `/items`, and that item no longer appears in the list.
3.  Log out, log back in as your own **student** account.
4.  Try to manually trigger a delete without using the button — if you're comfortable with browser dev tools, open the Console (F12) and run:(replace `1` with any real item ID)
    *   **Expect:** this should fail (403 Forbidden) — students shouldn't be able to delete items even by going around the button. If you're not comfortable with dev tools, skip this specific step and just note that you skipped it.

---

## 7\. Claim an Item (Student Side) + Review Claims (Admin Side)

1.  **As your own student account**, find an item with status "unclaimed," open it, click **Claim this item**.
2.  Leave the description blank, click **Submit claim**.
    *   **Expect:** an error — the claim shouldn't submit without a description.
3.  Fill in a description (anything, e.g. "it's mine, has a scratch on the side"), click **Submit claim**.
    *   **Expect:** redirected to the item, and its status badge now shows "pending."
4.  Log out, log in as `**admin**`**/**`**admin123**` (check group chat first).
5.  Click **Claims** in the top nav.
    *   **Expect:** you see your pending claim listed, with the item's name and your username.
6.  Click **Approve** on it.
    *   **Expect:** redirected back to the claims list, the claim is gone from the pending list, and if you check the item itself, its status is now "claimed."
7.  Go claim a _different_ item (as your student account again), then as admin, this time click **Reject** instead.
    *   **Expect:** the item's status goes back to "unclaimed" (not stuck on "pending").
8.  **Two-claims test** (needs a second person, or do it yourself with two accounts): have two different student accounts both claim the _same_ unclaimed item before either claim is reviewed.
    *   **Expect:** this should be _allowed_ — the app doesn't currently stop a second claim on an already-pending item. That's a known limitation, not something to fix — just confirm it's actually true.
9.  **As your student account**, try manually visiting `/claims` directly in the address bar.
    *   **Expect:** `403 Forbidden` — you shouldn't be able to see the staff claims queue.

---

## 8\. Search & Filter (+ Autocomplete & Recent Searches)

1.  Click **Search** in the top nav.
2.  Type a few letters of an existing item's name into the search box.
    *   **Expect:** a dropdown of suggested full item names appears as you type (this is your browser's built-in autocomplete, not something that pops up instantly — click into the field and start typing).
3.  Search using just the **Category** dropdown, no text.
    *   **Expect:** only items in that category show up.
4.  Search using just the **Status** dropdown.
    *   **Expect:** only items with that status show up.
5.  Type a word that only appears in an item's **description** (not its name) into the search box.
    *   **Expect:** that item still shows up in results.
6.  Combine a category **and** a search word at the same time.
    *   **Expect:** results match _both_ conditions together, not just one.
7.  Search for something completely made up that won't match anything (e.g. "xyzxyzxyz123").
    *   **Expect:** "No items match your search." — not a crash or blank page.
8.  After doing 2-3 different searches, revisit the Search page (or refresh it).
    *   **Expect:** a "Recent searches" section shows your last few searches as clickable links.
9.  Click one of those recent search links.
    *   **Expect:** it re-runs that exact search automatically.
10.  Search the exact same word twice in a row.
    *   **Expect:** it shouldn't show up twice in your recent searches list — just once.

---

## Full end-to-end run-through (optional, do this last if you have time)

Register a new account → report an item with a photo → find it by browsing → find it again by searching → log in as admin, edit that item, check its edit history → log in as a different student account, claim it → log in as admin, approve the claim → confirm the item now shows as claimed everywhere you'd expect it to.

---

## How to send me feedback

For **anything that didn't match what "Expect:" said**, copy this template, fill it in, and send it to me (Firdaus) in the group chat:

```
Section: [e.g. "5. Edit an Item"]
Step: [the numbered step, e.g. "Step 3"]
What I did: [exactly what you clicked/typed]
What I expected: [copy the "Expect:" line]
What actually happened: [describe it, or attach a screenshot]
Account used: [your username, and whether student or admin]
```

Screenshots are extremely helpful, especially for anything visual (broken layout, missing button, wrong data showing). If the app shows an error message on screen, please include the _exact_ text, not a paraphrase — it usually tells us exactly what went wrong.

If you're **not sure whether something is actually a bug** (like the two flagged "worth noting" items above), report it anyway — better to over-report than have something slip through before submission.

```
fetch('/items/1/delete', { method: 'POST' })
```