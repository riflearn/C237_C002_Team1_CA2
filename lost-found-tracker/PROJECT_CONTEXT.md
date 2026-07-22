# Lost & Found Tracker — C237 CA2 Project Context

## Project Overview
- **Module**: C237 Software Application Development
- **Type**: Group CA2 — 6-person team
- **Stack**: Node.js + Express + EJS + MySQL (mysql2, callback style)
- **Architecture**: Single-file backend (`app.js`) — all routes live in one file, grouped by feature owner under section banners
- **Views**: Plain `.ejs` files under `views/`, no client-side JS frameworks
- **Pattern**: Same `connection.query(sql, params, (error, results) => {...})` callback style as C237L17 SupermarketApp throughout

---

## Team & Feature Ownership

| Person | Feature | Routes |
|---|---|---|
| **Firdaus** | Auth & Access Control + Profile/Account Settings + User Management | `GET/POST /register`, `GET/POST /login`, `POST /logout`, `GET/POST /profile`, `GET /admin/users`, `POST /admin/users/create`, `POST /admin/users/:id/role` |
| **Shernice** | Report a Found Item + Image Upload | `GET/POST /items/new` |
| **Hui Xing** | Browse & View Items + Pagination & Sorting + Status Tabs + 30-day filter | `GET /items`, `GET /items/:id` |
| **Jun Hao** | Search & Filter + Autocomplete + Recent Searches + Date Range Filter | `GET /items/search` |
| **Soe San** | Edit Item + Edit History / Audit Log | `GET/POST /items/:id/edit`, `GET /items/:id/history` |
| **Wei Qi** | Delete Item (soft) + Claim Verification Workflow | `POST /items/:id/delete`, `GET/POST /items/:id/claim`, `GET /claims`, `GET /claims/item/:id`, `POST /claims/:id/review` |

---

## Database Tables

### `items`
| Column | Type | Notes |
|---|---|---|
| `item_id` | INT PK AUTO_INCREMENT | |
| `item_name` | VARCHAR | |
| `category` | VARCHAR | Electronics, Clothing, Documents, Accessories, Bags, Others |
| `description` | TEXT nullable | |
| `location_found` | VARCHAR | |
| `date_found` | DATE | Used for 30-day filter on Browse page |
| `reported_by` | INT FK → users.user_id | Always from session, never form |
| `image` | VARCHAR nullable | Filename only, stored in `public/images/` |
| `status` | ENUM | `unclaimed`, `pending`, `claimed`, `removed` |
| `created_at` | TIMESTAMP | |

### `users`
| Column | Type | Notes |
|---|---|---|
| `user_id` | INT PK AUTO_INCREMENT | |
| `username` | VARCHAR UNIQUE | |
| `password` | VARCHAR | SHA1 hash (MySQL SHA1() function) |
| `email` | VARCHAR | |
| `role` | ENUM | `student`, `staff`, `admin` — requires ALTER TABLE if adding `staff` |

### `claims`
| Column | Type | Notes |
|---|---|---|
| `claim_id` | INT PK AUTO_INCREMENT | |
| `item_id` | INT FK → items.item_id | |
| `claimed_by` | INT FK → users.user_id | Always from session |
| `proof_description` | TEXT | Something only the real owner would know |
| `claim_status` | ENUM | `pending`, `approved`, `rejected` |
| `reviewed_by` | INT FK → users.user_id nullable | |
| `reviewed_at` | TIMESTAMP nullable | |
| `created_at` | TIMESTAMP | |

### `item_edit_log` (Soe San's audit log)
| Column | Type |
|---|---|
| `log_id` | INT PK AUTO_INCREMENT |
| `item_id` | INT FK → items.item_id |
| `edited_by` | INT FK → users.user_id |
| `changes_summary` | TEXT |
| `changed_at` | TIMESTAMP |

### `search_history` (Jun Hao's recent searches)
| Column | Type |
|---|---|
| `id` | INT PK AUTO_INCREMENT |
| `user_id` | INT FK → users.user_id |
| `search_term` | VARCHAR |
| `searched_at` | TIMESTAMP |

---

## Roles & Permissions

| Action | Student | Staff | Admin |
|---|---|---|---|
| Browse & view items | ✅ | ✅ | ✅ |
| Search items | ✅ | ✅ | ✅ |
| Claim an item | ✅ | ❌ | ❌ |
| Report a found item | ❌ | ✅ | ✅ |
| Edit an item | ❌ | ✅ | ✅ |
| View edit history | ❌ | ✅ | ✅ |
| Approve/reject claims | ❌ | ✅ | ✅ |
| Delete an item (soft) | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ✅ |

### Auth Guards in `app.js`
- `isLoggedIn` — redirects to `/login` if no session
- `isStaff` — 403 if not staff
- `isAdmin` — 403 if not admin
- `isStaffOrAdmin` — 403 if neither staff nor admin

---

## Colour Schemes (role-based, applied via `<body class="">`)

| Role | Body Class | Navbar/Hero | Accent | Background |
|---|---|---|---|---|
| Student | *(none)* | `#0e2841` → `#156082` teal | `#156082` | `#eef2f5` |
| Staff | `staff-theme` | `#14532d` → `#16a34a` green | `#16a34a` | `#f0fdf4` |
| Admin | `admin-theme` | `#3b0764` → `#7c3aed` purple | `#7c3aed` | `#f5f3ff` |

Applied in `views/partials/header.ejs`:
```html
<body class="<%= user && user.role === 'admin' ? 'admin-theme' : user && user.role === 'staff' ? 'staff-theme' : '' %>">
```

---

## Key Design Decisions

### Browse Page (`/items`) — Hui Xing
- Defaults to **last 30 days** based on `date_found`
- Split into **3 status tabs**: Unclaimed / Pending Verification / Claimed
- `removed` items never shown (soft-delete)
- Pagination is **per-tab** (independent page counters)
- Sort options: Newest (`created_at DESC`), Date Found (`date_found DESC`), Name A–Z (`item_name ASC`)
- Sort by status removed (redundant when already filtered by status)
- Older items reachable via `/items/search` with date range filter

### Claims Workflow — Wei Qi
- **Multiple claims allowed** per item — item stays `unclaimed` when a claim is submitted
- Duplicate claims from same user blocked (one pending claim per user per item)
- Admin/staff view at `/claims` groups items by category with claim count badge
- `/claims/item/:id` shows all pending claims for one item side by side
- On approval: item → `claimed`, all other pending claims auto-rejected
- On rejection: just that one claim rejected, item stays `unclaimed`

### Search — Jun Hao
- Filters: keyword (`q`), category, location (LIKE), status, `date_from`, `date_to`
- Autocomplete via native `<datalist>` — zero JS
- Recent searches stored in `search_history`, shown last 5 per user
- `date_from`/`date_to` filter on `date_found` — main way to reach items older than 30 days

### Image Upload — Shernice
- multer diskStorage, saved to `public/images/`
- Filename: `Date.now() + '-' + originalname` (prevents collisions)
- Optional field — `req.file` checked before storing

### Audit Log — Soe San
- Before any edit, old values fetched and diff computed
- Only changed fields recorded in `changes_summary`
- Log failure is non-fatal (edit proceeds even if log INSERT fails)

### User Management — Firdaus
- Admin-only at `/admin/users`
- Create accounts with any role (student/staff/admin)
- Promote/demote existing users
- Admin cannot change their own role (lockout prevention)
- Self-registration always creates `student` role

---

## File Structure
```
lost-found-tracker/
├── app.js                  # All routes (1000 lines)
├── .env                    # Local credentials (gitignored)
├── .env.example            # Template for .env
├── package.json
├── public/
│   ├── css/style.css       # All styles including role themes
│   └── images/             # Uploaded item photos
└── views/
    ├── partials/
    │   ├── header.ejs      # Navbar + role-based body class
    │   └── footer.ejs
    ├── items/
    │   ├── index.ejs       # Browse page (Hui Xing)
    │   ├── show.ejs        # Item detail
    │   ├── new.ejs         # Report found item (Shernice)
    │   ├── edit.ejs        # Edit item (Soe San)
    │   ├── history.ejs     # Edit history (Soe San)
    │   ├── claim.ejs       # Claim form (Wei Qi)
    │   └── search.ejs      # Search page (Jun Hao)
    ├── claims/
    │   ├── index.ejs       # Admin claims list by category (Wei Qi)
    │   └── item.ejs        # Claims for one item (Wei Qi)
    ├── admin/
    │   └── users.ejs       # User management (Firdaus)
    ├── 403.ejs             # Forbidden page
    ├── login.ejs
    ├── register.ejs
    └── profile.ejs
```

---

## Running Locally
```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in credentials
copy .env.example .env
# Edit .env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SESSION_SECRET, PORT

# 3. Start server
node app.js
# → Lost & Found Tracker running on http://localhost:3000
```

## Important Notes for AI
- **Never change route ownership** without checking the section banner in `app.js`
- **Column names are exact** — always verify against the schema above before writing SQL
- **Callback style only** — no async/await, no mysql2/promise
- **No client-side JS** — all interactivity must be server-side EJS + form POSTs
- **SQL injection prevention** — column names validated against allowlists, values always use `?` params
- The `staff-theme` CSS class needs to be added to `style.css` (the admin-theme exists, staff-theme may still need implementing)
- If `role ENUM` errors occur when creating staff accounts, run: `ALTER TABLE users MODIFY COLUMN role ENUM('student', 'staff', 'admin') NOT NULL DEFAULT 'student';`
