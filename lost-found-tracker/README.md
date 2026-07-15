# Lost & Found Tracker — C237 CA2

## Setup

1.  `npm install`
2.  Copy `.env.example` to `.env` and fill in **your own** local MySQL
    `DB_USER`/`DB_PASSWORD`. `.env` is gitignored — it stays on your machine
    only, so everyone can use their own local MySQL credentials without
    ever committing a real password.
3.  Run `lost_found_schema.sql` against your MySQL instance (creates the  
    tables and two test accounts).
4.  `npm run dev` (or `npm start`) — runs on http://localhost:3000

## Test accounts (from the seed data)

| Username | Password | Role |
| --- | --- | --- |
| admin | admin123 | admin |
| student1 | student123 | student |

## Project structure

Everything backend-side lives in `**app.js**` — the DB connection, session  
setup, the `isLoggedIn`/`isAdmin` guards, and every single `app.get`/`app.post`  
route, in one file (matching the style from `C237L17`'s SupermarketApp:  
`mysql2` callback connection, `connection.query(sql, params, (error, results) => {...})`, no router modules). There is no `routes/`, `middleware/`, or  
`config/` folder — those were merged into `app.js`. Everything else in the  
project is a view: plain `.ejs` templates under `views/`, plus `public/css`.

Each feature is a section in `app.js`, marked with a banner comment naming its  
owner:

| Section banner in app.js | Owner | Feature |
| --- | --- | --- |
| Firdaus — Auth & Access Control | Firdaus | Register / login / logout (done — reference pattern) |
| Shernice — Report a Found Item (Create) | Shernice | `GET`/`POST /items/new` |
| Hui Xing — Browse & View Items (Read) / Jun Hao — Search & Filter | Hui Xing + Jun Hao | `GET /items`, `GET /items/:id` |
| Soe San — Edit Item (Update) | Soe San | `GET`/`POST /items/:id/edit` |
| Wei Qi — Remove Item (Delete) | Wei Qi | `POST /items/:id/delete` |
| Hui Xing, Wei Qi, Jun Hao — Claim Verification Workflow | Hui Xing, Wei Qi, Jun Hao | claim + review routes (enhancement) |

All of the above is implemented (not stubs) — but per the individual  
assessment, you're still expected to be able to walk through your section's  
query/validation/rendering logic (user action → route → SQL query → database  
→ response) in the presentation, not just point at the code.

## Before submission

*   Fill in your feature's row in the Development Journal (Challenges, AI  
    prompts used if any, code snippet, explanation, key learning) once you've  
    actually built it.
*   Complete your own Section D individual reflection.
*   Don't forget: `node_modules` is excluded from the submission zip.