// Lost & Found Tracker — C237 CA2
// Version: 1.0.0
// Single-file backend: every GET/POST route lives in this file, grouped by
// feature under the section banners below (each banner names its owner —
// same people as before, just no longer split into separate routes/*.js
// files). Views are plain .ejs under views/, nothing else is a .js file.

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');

const app = express();

// ----- File upload storage (Shernice — Image Upload) -----
// Same multer.diskStorage pattern as C237L17's SupermarketApp. Filenames
// get a timestamp prefix so two people uploading a photo with the same
// original filename (e.g. "photo.jpg") don't overwrite each other.
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    },
  }),
});

// ----- MySQL connection pool -----
// Same callback-style connection.query(sql, params, (error, results) => {...})
// pattern used throughout C237L17's SupermarketApp — a POOL rather than a
// single createConnection, though: pool.query() has the exact same signature,
// so nothing else in this file changes. The reason for a pool is our cloud DB
// (Azure) closes idle connections after a few minutes; a single connection
// would then error out and crash the app the next time it's used, whereas a
// pool just hands out a fresh connection automatically. The variable is still
// called `connection` so every teammate's query below reads the same.
// Credentials come from .env (not written here) because this repo is shared by
// all 6 of us — a hardcoded secret would get committed by whoever's local
// password happened to be sitting in it. Each teammate keeps their own
// gitignored .env (copy .env.example → .env, fill in your own local password).
const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Return DATE columns (items.date_found) as plain 'YYYY-MM-DD' strings
  // instead of JS Date objects, so views can print/pre-fill them directly.
  dateStrings: true,
  // Cloud MySQL (e.g. Azure Database for MySQL) requires an encrypted
  // connection; local MySQL doesn't need or expect this. Opt-in per person
  // via DB_SSL=true in your own .env, so switching to a cloud DB doesn't
  // break teammates still running MySQL locally.
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  // Pool settings: keep a small number of reusable connections and queue
  // any extra requests rather than erroring when they're all busy.
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

// One-off startup check so a bad DB config still fails loudly at boot.
// (A pool connects lazily, so we grab one connection just to confirm.)
connection.getConnection((err, conn) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
  conn.release();
});

// ----- View engine + core middleware -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }, // 2 hours
}));

// Makes the logged-in user available in every view (e.g. for the nav bar)
// without every route having to pass it in manually.
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ----- Auth guards, used inline as extra arguments on the routes below -----
//   app.get('/items/new', isLoggedIn, (req, res) => { ... });
//   app.post('/items/:id/delete', isLoggedIn, isStaffOrAdmin, (req, res) => { ... });
function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  // Render a proper styled 403 page instead of raw text, so students
  // who accidentally land on an admin route see something reasonable.
  return res.status(403).render('403', {});
}

function isStaffOrAdmin(req, res, next) {
  if (req.session && req.session.user && (req.session.user.role === 'staff' || req.session.user.role === 'admin')) {
    return next();
  }
  return res.status(403).render('403', {});
}

// ===================================================================
// Firdaus — Password strength check
// One shared rule for every place a password is set: registration, the
// admin "create account" form, and the profile password change. A password
// must be at least 6 characters AND contain at least one letter and one
// number — this blocks the common weak cases: all-numbers ("12345678"),
// all-letters ("password"), and too-short ("abc1"). Returns an error message
// string if the password is no good, or null if it passes.
// ===================================================================
function checkPassword(password) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (!/[A-Za-z]/.test(password)) {
    // No letters at all — e.g. a password that's just numbers.
    return 'Password must include at least one letter.';
  }
  if (!/[0-9]/.test(password)) {
    // No digits at all — e.g. a password that's just letters.
    return 'Password must include at least one number.';
  }
  return null; // password is acceptable
}

// ===================================================================
// Firdaus — Auth & Access Control
// This section is complete and working, as a reference for the pattern
// (route -> validate -> query -> render/redirect) the rest of the team
// follows. Still expected to be able to explain every line.
// ===================================================================

// GET /register — show the registration form
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// POST /register — create a new student account
app.post('/register', (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.render('register', { error: 'All fields are required.' });
  }

  // Password strength check (see checkPassword above).
  const passwordError = checkPassword(password);
  if (passwordError) {
    return res.render('register', { error: passwordError });
  }

  const checkSql = 'SELECT user_id FROM users WHERE username = ?';
  connection.query(checkSql, [username], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.render('register', { error: 'Something went wrong. Please try again.' });
    }
    if (results.length > 0) {
      return res.render('register', { error: 'That username is already taken.' });
    }

    // Hash the password with MySQL's SHA1() as part of the INSERT itself —
    // same pattern as L19's RegistrationApp — instead of a Node-side hashing
    // library. The plain-text password never gets stored, only its hash.
    const insertSql = 'INSERT INTO users (username, password, email, role) VALUES (?, SHA1(?), ?, ?)';
    connection.query(insertSql, [username, password, email, 'student'], (insertErr) => {
      if (insertErr) {
        console.error('Database query error:', insertErr.message);
        return res.render('register', { error: 'Something went wrong. Please try again.' });
      }
      res.redirect('/login');
    });
  });
});

// GET /login — show the login form
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// POST /login — verify credentials and start a session
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Hash the submitted password with SHA1() inside the query and compare it
  // straight to the stored hash — a match means the row exists, so no
  // separate compare step is needed (same pattern as L19's RegistrationApp).
  // status = 'active' is in the same WHERE, not a separate check afterwards
  // — a disabled account fails to log in with the exact same "Invalid
  // username or password" message as a wrong password, on purpose (same
  // reasoning as not distinguishing "no such username" from "wrong
  // password" above: don't leak account status to a logged-out visitor).
  const sql = "SELECT * FROM users WHERE username = ? AND password = SHA1(?) AND status = 'active'";

  connection.query(sql, [username, password], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.render('login', { error: 'Something went wrong. Please try again.' });
    }
    if (results.length === 0) {
      return res.render('login', { error: 'Invalid username or password.' });
    }

    const user = results[0];
    req.session.user = { user_id: user.user_id, username: user.username, role: user.role };
    res.redirect('/items');
  });
});

// POST /logout — end the session
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ===================================================================
// Firdaus — My Profile / Account Settings
// Personalisation feature: view/edit your own account, optionally change
// your password. Only ever reads/writes the logged-in user's own row.
// ===================================================================

// GET /profile — show the logged-in user's own account details
app.get('/profile', isLoggedIn, (req, res) => {
  const sql = 'SELECT user_id, username, email, role FROM users WHERE user_id = ?';

  connection.query(sql, [req.session.user.user_id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('profile', { profileUser: results[0], error: null, success: null });
  });
});

// POST /profile — update own email, optionally change password
app.post('/profile', isLoggedIn, (req, res) => {
  const { email, current_password, new_password } = req.body;
  const userId = req.session.user.user_id;

  if (!email) {
    return res.render('profile', {
      profileUser: { ...req.session.user, email },
      error: 'Email is required.',
      success: null,
    });
  }

  // Changing the password is optional — only touch it if a new one was
  // actually entered. If it was, the current password must be verified
  // first, same SHA1-comparison pattern as login, just scoped to this
  // one account.
  if (new_password) {
    if (!current_password) {
      return res.render('profile', {
        profileUser: { ...req.session.user, email },
        error: 'Enter your current password to set a new one.',
        success: null,
      });
    }

    // New password must pass the same strength rule as registration
    // (see checkPassword above).
    const passwordError = checkPassword(new_password);
    if (passwordError) {
      return res.render('profile', {
        profileUser: { ...req.session.user, email },
        error: passwordError,
        success: null,
      });
    }

    const verifySql = 'SELECT user_id FROM users WHERE user_id = ? AND password = SHA1(?)';
    connection.query(verifySql, [userId, current_password], (verifyErr, verifyResults) => {
      if (verifyErr) {
        console.error('Database query error:', verifyErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      if (verifyResults.length === 0) {
        return res.render('profile', {
          profileUser: { ...req.session.user, email },
          error: 'Current password is incorrect.',
          success: null,
        });
      }

      const updateSql = 'UPDATE users SET email = ?, password = SHA1(?) WHERE user_id = ?';
      connection.query(updateSql, [email, new_password, userId], (updateErr) => {
        if (updateErr) {
          console.error('Database query error:', updateErr.message);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        res.render('profile', {
          profileUser: { ...req.session.user, email },
          error: null,
          success: 'Profile updated.',
        });
      });
    });
    return;
  }

  // No password change requested — just update the email.
  const updateSql = 'UPDATE users SET email = ? WHERE user_id = ?';
  connection.query(updateSql, [email, userId], (updateErr) => {
    if (updateErr) {
      console.error('Database query error:', updateErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('profile', {
      profileUser: { ...req.session.user, email },
      error: null,
      success: 'Profile updated.',
    });
  });
});

// ===================================================================
// Firdaus — User Management (admin only)
// Lets an admin see all registered users, promote/demote their role, and
// disable/reactivate their login ("delete" a user without a hard DELETE —
// see the schema comment on users.status for why). An admin cannot change
// their own role or disable themselves — prevents accidental lockout.
// ===================================================================

// GET /admin/users — list all users with their roles
app.get('/admin/users', isLoggedIn, isAdmin, (req, res) => {
  const sql = 'SELECT user_id, username, email, role, status FROM users ORDER BY role ASC, username ASC';
  connection.query(sql, (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('admin/users', { users: results, success: req.query.success || null, error: null });
  });
});

// POST /admin/users/create — admin creates a new account with any role
app.post('/admin/users/create', isLoggedIn, isAdmin, (req, res) => {
  const { username, email, password, role } = req.body;

  // The user list has to be re-fetched to re-render this page on any error.
  // Include `status` — views/admin/users.ejs shows a status badge per row.
  const listSql = 'SELECT user_id, username, email, role, status FROM users ORDER BY role ASC, username ASC';

  if (!username || !email || !password || !role) {
    return connection.query(listSql, (err, results) => {
      res.render('admin/users', {
        users: results || [],
        success: null,
        error: 'All fields are required.',
      });
    });
  }

  // Password strength check (see checkPassword above) — same rule the
  // register form uses, so admin-created accounts aren't held to a lower bar.
  const passwordError = checkPassword(password);
  if (passwordError) {
    return connection.query(listSql, (err, results) => {
      res.render('admin/users', {
        users: results || [],
        success: null,
        error: passwordError,
      });
    });
  }

  if (role !== 'admin' && role !== 'student' && role !== 'staff') {
    return res.status(400).send('Invalid role.');
  }

  const checkSql = 'SELECT user_id FROM users WHERE username = ?';
  connection.query(checkSql, [username], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Database query error:', checkErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (checkResults.length > 0) {
      return connection.query(listSql, (err, results) => {
        res.render('admin/users', {
          users: results || [],
          success: null,
          error: 'That username is already taken.',
        });
      });
    }

    const insertSql = 'INSERT INTO users (username, password, email, role) VALUES (?, SHA1(?), ?, ?)';
    connection.query(insertSql, [username, password, email, role], (insertErr) => {
      if (insertErr) {
        console.error('Database query error:', insertErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.redirect('/admin/users?success=created');
    });
  });
});

// POST /admin/users/:id/role — change a user's role
app.post('/admin/users/:id/role', isLoggedIn, isAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const { role } = req.body;

  // Guard: admin cannot change their own role — prevents self-lockout.
  if (targetId === req.session.user.user_id) {
    return res.redirect('/admin/users?success=cannot-self');
  }

  if (role !== 'admin' && role !== 'student' && role !== 'staff') {
    return res.status(400).send('Invalid role.');
  }

  const sql = 'UPDATE users SET role = ? WHERE user_id = ?';
  connection.query(sql, [role, targetId], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/admin/users?success=updated');
  });
});

// POST /admin/users/:id/delete — "delete" a user
// Not a hard DELETE: items.reported_by, claims.claimed_by/reviewed_by,
// item_edit_log.edited_by and search_history.user_id all have a FOREIGN KEY
// on users.user_id, so a real DELETE would fail the moment that user has
// done anything at all in the app — same reason Wei Qi's item delete is a
// soft delete. Flipping status to 'disabled' blocks them from logging in
// (see the status check in POST /login) while keeping every row they're
// linked to intact.
app.post('/admin/users/:id/delete', isLoggedIn, isAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);

  // Guard: admin cannot disable their own account — prevents accidental
  // lockout, same rule as the role-change route above.
  if (targetId === req.session.user.user_id) {
    return res.redirect('/admin/users?success=cannot-self');
  }

  const sql = "UPDATE users SET status = 'disabled' WHERE user_id = ?";
  connection.query(sql, [targetId], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/admin/users?success=deleted');
  });
});

// POST /admin/users/:id/reactivate — undo a delete
app.post('/admin/users/:id/reactivate', isLoggedIn, isAdmin, (req, res) => {
  const sql = "UPDATE users SET status = 'active' WHERE user_id = ?";
  connection.query(sql, [req.params.id], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/admin/users?success=reactivated');
  });
});

// ===================================================================
// Shernice — Report a Found Item (Create)
// + Image Upload (attach a photo when reporting an item)
// ===================================================================

// GET /items/new — show the "report a found item" form. Any logged-in
// user can report an item — student, staff, or admin.
app.get('/items/new', isLoggedIn, (req, res) => {
  res.render('items/new', { error: null });
});

// POST /items/new — insert the new item into the database
app.post('/items/new', isLoggedIn, imageUpload.single('image'), (req, res) => {
  const { item_name, category, description, location_found, date_found } = req.body;

  // description is optional (its textarea has no `required`); everything
  // else must be present, or we bounce back to the form with an error.
  if (!item_name || !category || !location_found || !date_found) {
    return res.render('items/new', { error: 'Please fill in all required fields.' });
  }

  // A photo is optional — req.file only exists if one was actually
  // uploaded. Store just the filename, not the full path.
  const image = req.file ? req.file.filename : null;

  // reported_by always comes from the logged-in session, never the form —
  // otherwise a student could submit an item and claim someone else found it.
  const sql = `INSERT INTO items
      (item_name, category, description, location_found, date_found, reported_by, image)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    sql,
    [item_name, category, description || null, location_found, date_found, req.session.user.user_id, image],
    (error) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.render('items/new', { error: 'Something went wrong. Please try again.' });
      }
      res.redirect('/items');
    }
  );
});

// GET /items/mine — every item the logged-in user has reported, and its
// current status. The student-facing (well, reporter-facing) counterpart to
// My Claims below — without this, once you've reported a few items there's
// no way to find them again except stumbling across them in Browse/Search.
// Also doubles as the natural way in to editing your own report (see
// canEditItem in Soe San's section) instead of hunting for it first.
// Declared before GET /items/:id so Express doesn't treat "mine" as an item ID.
app.get('/items/mine', isLoggedIn, (req, res) => {
  // Scoped to the logged-in user's own reports via reported_by — never a
  // value from the URL — so nobody can view someone else's report list.
  const sql = 'SELECT * FROM items WHERE reported_by = ? ORDER BY created_at DESC';

  connection.query(sql, [req.session.user.user_id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('items/mine', { items: results });
  });
});

// ===================================================================
// Hui Xing — Browse & View Items (Read)
// + Pagination & Sorting
// ===================================================================

// GET /items — list found items, paginated and sortable, filtered by status tab
// Default view shows only the last 30 days. Older items are accessible via
// /items/search (Jun Hao's filter page) — keeps the browse list manageable.
app.get('/items', isLoggedIn, (req, res) => {
  // ORDER BY's column name can't be passed as a `?` placeholder — those
  // only work for values, not identifiers — so req.query.sort is checked
  // against a fixed allowlist before ever touching the SQL string. Never
  // interpolate unvalidated user input into a query, even just a column name.
  // 'status' removed from the allowlist — sorting by status within a
  // status-filtered page is meaningless now that items are already split
  // into separate tabs by status.
  const allowedSortColumns = ['created_at', 'date_found', 'item_name'];
  const sortColumn = allowedSortColumns.includes(req.query.sort) ? req.query.sort : 'created_at';
  const sortDirection = req.query.dir === 'asc' ? 'ASC' : 'DESC';

  // Status tab: 'unclaimed' | 'pending' | 'claimed' — defaults to 'unclaimed'.
  // 'pending' here means "claim approved, not yet collected from the hub" —
  // set by POST /claims/:id/review and cleared by POST /items/:id/collect.
  // Validated against an allowlist for the same reason as sortColumn.
  const allowedStatuses = ['unclaimed', 'pending', 'claimed', 'removed'];
  let activeStatus = allowedStatuses.includes(req.query.status) ? req.query.status : 'unclaimed';

    // If user is not staff/admin, prevent them from accessing removed items
    if (activeStatus === 'removed' && (!req.session.user || (req.session.user.role !== 'staff' && req.session.user.role !== 'admin'))) {
      activeStatus = 'unclaimed';
  }
  const perPage = 5;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const offset = (page - 1) * perPage;

  // COUNT is scoped to the active status tab AND the last 30 days so
  // pagination is independent per tab and old items don't clutter the list.
  // Users can find older items via Search & Filter (Jun Hao's /items/search).
  const countSql = 'SELECT COUNT(*) AS total FROM items WHERE status = ? AND date_found >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
  connection.query(countSql, [activeStatus], (countErr, countResults) => {
    if (countErr) {
      console.error('Database query error:', countErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }

    const totalItems = countResults[0].total;
    const totalPages = Math.max(Math.ceil(totalItems / perPage), 1);

    // JOIN users so the list can show who reported each item — otherwise
    // the Edit button that sometimes appears (see canEditItem) has no
    // visible explanation for why it's there on this item and not others.
    // sortColumn needs the `i.` prefix now — users has its own created_at,
    // so an unqualified ORDER BY created_at would be ambiguous once joined.
    const sql = `SELECT i.*, u.username AS reported_by_username
      FROM items i JOIN users u ON i.reported_by = u.user_id
      WHERE i.status = ? AND i.date_found >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      ORDER BY i.${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;

    connection.query(sql, [activeStatus, perPage, offset], (error, results) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('items/index', {
        items: results,
        page,
        totalPages,
        sort: sortColumn,
        dir: sortDirection.toLowerCase(),
        activeStatus,
        success: req.query.success || null,
      });
    });
  });
});

// ===================================================================
// Jun Hao — Search & Filter
// + Autocomplete (native <datalist>) & Recent Searches
//
// Registered before GET /items/:id on purpose — Express matches routes
// in the order they're declared, and /items/:id would otherwise treat
// "search" as an item ID and swallow every request to this route first.
// ===================================================================

// GET /items/search — search/filter items, with autocomplete + recent searches
app.get('/items/search', isLoggedIn, (req, res) => {
  const { category, location, status, q, date_from, date_to } = req.query;
  let sql = 'SELECT * FROM items WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (location) {
    sql += ' AND location_found LIKE ?';
    params.push(`%${location}%`);
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  } else {
    sql += " AND status != 'removed'";
  }

  if (q) {
    sql += ' AND (item_name LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  // Date range filter on date_found — lets users reach items older than
  // 30 days that are hidden from the default Browse page.
  // Both fields are optional: supply just date_from for "from X onwards",
  // just date_to for "up to X", or both for a specific window.
  // Values come in as 'YYYY-MM-DD' strings from <input type="date">;
  // passed as ? params so they're never interpolated into the SQL string.
  if (date_from) {
    sql += ' AND date_found >= ?';
    params.push(date_from);
  }

  if (date_to) {
    sql += ' AND date_found <= ?';
    params.push(date_to);
  }

  sql += ' ORDER BY created_at DESC';

  connection.query(sql, params, (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }

    // Autocomplete: every distinct item name feeds a native <datalist> in
    // the view, so the browser handles the suggestion dropdown itself —
    // zero client-side JavaScript, zero extra endpoint.
    connection.query('SELECT DISTINCT item_name FROM items', (namesErr, namesResults) => {
      if (namesErr) {
        console.error('Database query error:', namesErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      const itemNames = namesResults.map((row) => row.item_name);

      function showRecentSearchesAndRender() {
        // GROUP BY (not SELECT DISTINCT) here — MySQL won't allow ORDER BY
        // on a column that isn't in the SELECT list when DISTINCT is used.
        // GROUP BY + MAX() also orders by each term's *most recent* search,
        // which is the actually-correct behavior for "recent searches".
        const recentSql = `SELECT search_term, MAX(searched_at) AS last_searched
          FROM search_history WHERE user_id = ?
          GROUP BY search_term ORDER BY last_searched DESC LIMIT 5`;
        connection.query(recentSql, [req.session.user.user_id], (recentErr, recentResults) => {
          if (recentErr) {
            console.error('Database query error:', recentErr.message);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          res.render('items/search', {
            items: results,
            query: req.query,
            itemNames,
            recentSearches: recentResults.map((row) => row.search_term),
          });
        });
      }

      // Only log an actual search term, not a blank visit to the page.
      if (q) {
        const logSql = 'INSERT INTO search_history (user_id, search_term, searched_at) VALUES (?, ?, NOW())';
        connection.query(logSql, [req.session.user.user_id, q], (logErr) => {
          if (logErr) {
            console.error('Database query error:', logErr.message);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          showRecentSearchesAndRender();
        });
      } else {
        showRecentSearchesAndRender();
      }
    });
  });
});

// GET /items/:id — view a single item's detail
app.get('/items/:id', isLoggedIn, (req, res) => {
  // JOIN users so the detail page can show who reported it.
  const sql = `SELECT i.*, u.username AS reported_by_username
    FROM items i JOIN users u ON i.reported_by = u.user_id
    WHERE i.item_id = ?`;

  connection.query(sql, [req.params.id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }

    // Check if the logged-in user already has a pending claim for this item
    // so the view can hide the "Claim this item" button and show a message
    // instead — prevents the confusing double-submit flow.
    const claimCheckSql = "SELECT claim_id FROM claims WHERE item_id = ? AND claimed_by = ? AND claim_status = 'pending'";
    connection.query(claimCheckSql, [req.params.id, req.session.user.user_id], (claimErr, claimResults) => {
      if (claimErr) {
        console.error('Database query error:', claimErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('items/show', {
        item: results[0],
        alreadyClaimed: claimResults.length > 0,
      });
    });
  });
});

// ===================================================================
// Soe San — Edit Item (Update)
// + Edit History / Audit Log
// ===================================================================

// Who's allowed to edit an item: staff/admin (any item), or the student who
// originally reported it — their own item only, e.g. to fix a typo. This
// depends on the item itself (item.reported_by), not just the user's role,
// so it's a plain helper called inside the routes below rather than route
// middleware like isAdmin/isStaffOrAdmin.
function canEditItem(user, item) {
  return user.role === 'staff' || user.role === 'admin' || item.reported_by === user.user_id;
}

// GET /items/:id/edit — show the edit form, pre-filled with current data
app.get('/items/:id/edit', isLoggedIn, (req, res) => {
  const sql = 'SELECT * FROM items WHERE item_id = ?';

  connection.query(sql, [req.params.id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    if (!canEditItem(req.session.user, results[0])) {
      return res.status(403).render('403', {});
    }
    res.render('items/edit', { item: results[0], error: null });
  });
});

// POST /items/:id/edit — save the changes
// imageUpload.single('image') is Shernice's multer config, reused as-is (not
// duplicated) — replacing the photo is just one more optional field on this
// form, not a separate feature.
app.post('/items/:id/edit', isLoggedIn, imageUpload.single('image'), (req, res) => {
  const { item_name, category, description, location_found, date_found } = req.body;
  const itemId = req.params.id;

  // Fetch the item first — needed both for the edit-permission check below
  // and, if validation fails, to re-render the form pre-filled with the
  // item's existing values (previously this ran as two separate fetches;
  // now the same one covers both).
  const fetchSql = 'SELECT * FROM items WHERE item_id = ?';
  connection.query(fetchSql, [itemId], (fetchErr, results) => {
    if (fetchErr) {
      console.error('Database query error:', fetchErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    const oldItem = results[0];

    if (!canEditItem(req.session.user, oldItem)) {
      return res.status(403).render('403', {});
    }

    // Same required-field set as Shernice's create form.
    if (!item_name || !category || !location_found || !date_found) {
      return res.render('items/edit', {
        item: { ...oldItem, ...req.body, item_id: itemId },
        error: 'Please fill in all required fields.',
      });
    }

    // A new photo is optional — keep the existing one if none was uploaded
    // this time, same "leave blank to keep it" pattern as the profile's
    // optional password change.
    const image = req.file ? req.file.filename : oldItem.image;

    const sql = `UPDATE items
        SET item_name = ?, category = ?, description = ?, location_found = ?, date_found = ?, image = ?
      WHERE item_id = ?`;

    connection.query(
      sql,
      [item_name, category, description || null, location_found, date_found, image, itemId],
      (error) => {
        if (error) {
          console.error('Database query error:', error.message);
          return res.status(500).send('Something went wrong. Please try again.');
        }

        // Build a plain-text summary of only the fields that actually
        // changed, for the audit log.
        const changedFields = [];
        if (oldItem.item_name !== item_name) {
          changedFields.push(`item_name: '${oldItem.item_name}' -> '${item_name}'`);
        }
        if (oldItem.category !== category) {
          changedFields.push(`category: '${oldItem.category}' -> '${category}'`);
        }
        if ((oldItem.description || '') !== (description || '')) {
          changedFields.push('description changed');
        }
        if (oldItem.location_found !== location_found) {
          changedFields.push(`location_found: '${oldItem.location_found}' -> '${location_found}'`);
        }
        if (oldItem.date_found !== date_found) {
          changedFields.push(`date_found: '${oldItem.date_found}' -> '${date_found}'`);
        }
        if (oldItem.image !== image) {
          changedFields.push('photo changed');
        }
        const changesSummary = changedFields.length > 0 ? changedFields.join('; ') : 'No fields changed';

        const logSql = 'INSERT INTO item_edit_log (item_id, edited_by, changes_summary) VALUES (?, ?, ?)';
        connection.query(logSql, [itemId, req.session.user.user_id, changesSummary], (logErr) => {
          if (logErr) {
            console.error('Database query error:', logErr.message);
            // Don't fail the whole edit just because the audit log insert
            // failed — the item itself already saved successfully.
          }
          res.redirect('/items/' + itemId);
        });
      }
    );
  });
});

// GET /items/:id/history — view the edit history for an item. Same access
// rule as the edit form itself: staff/admin, or whoever reported this item.
app.get('/items/:id/history', isLoggedIn, (req, res) => {
  const itemId = req.params.id;

  const itemSql = 'SELECT reported_by FROM items WHERE item_id = ?';
  connection.query(itemSql, [itemId], (itemErr, itemResults) => {
    if (itemErr) {
      console.error('Database query error:', itemErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (itemResults.length === 0) {
      return res.status(404).send('Item not found.');
    }
    if (!canEditItem(req.session.user, itemResults[0])) {
      return res.status(403).render('403', {});
    }

    // JOIN against users so the log shows who made each edit, not just a
    // numeric user_id.
    const sql = `SELECT l.log_id, l.changes_summary, l.changed_at, u.username AS edited_by_username
        FROM item_edit_log l
        JOIN users u ON l.edited_by = u.user_id
        WHERE l.item_id = ?
        ORDER BY l.changed_at DESC`;

    connection.query(sql, [itemId], (error, results) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('items/history', { history: results, itemId });
    });
  });
});

// ===================================================================
// Wei Qi — Remove Item (Delete) + Restore
// Staff or admin can remove an item and bring it back — not admin-only.
// ===================================================================

// POST /items/:id/delete — staff/admin removal, requires typing "delete" to
// confirm (views/items/show.ejs's modal) since this is destructive-feeling.
// Soft-delete (flip status) rather than a hard DELETE — items can have
// claims referencing them (claims.item_id FOREIGN KEY), so an actual DELETE
// would fail once a claim exists. Updating status keeps the row (and its
// claim history) intact and just hides it from the default browse list
// (see the status allowlist in GET /items above) — reversible via Restore
// below, unlike a real DELETE.
app.post('/items/:id/delete', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const { confirmText } = req.body;

  if (confirmText !== 'delete') {
    // If staff didn’t type delete correctly, reject
    return res.status(400).send('You must type "delete" to confirm removal.');
  }

  const sql = 'UPDATE items SET status = ? WHERE item_id = ?';
  connection.query(sql, ['removed', req.params.id], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/items');
  });
});

// POST /items/:id/restore — undo remove (reactivate item)
app.post('/items/:id/restore', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const sql = 'UPDATE items SET status = ? WHERE item_id = ?';
  connection.query(sql, ['unclaimed', req.params.id], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/items?success=restored');
  });
});

// ===================================================================
// Wei Qi — Claim Verification Workflow (core feature, sole owner)
// Covers both halves: students submitting a claim below, and the
// staff-only review queue further down. Paired with Remove Item above —
// both are staff/verification-flavored responsibilities, though claim
// *submission* itself is open to any logged-in student, not staff-only.
// ===================================================================

// GET /items/:id/claim — show the claim form.
// Two guards before showing it: the item must still be unclaimed, and the
// user must not already have a pending claim on it. In either case we send
// them to the item detail page (which shows the right message) instead of
// rendering an empty form they can't usefully submit.
app.get('/items/:id/claim', isLoggedIn, (req, res) => {
  const itemId = req.params.id;
  const sql = 'SELECT * FROM items WHERE item_id = ?';

  connection.query(sql, [itemId], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    // Can only claim an item that's still up for grabs.
    if (results[0].status !== 'unclaimed') {
      return res.redirect('/items/' + itemId);
    }

    // Already have a pending claim here? The detail page shows "your claim
    // has been submitted" — send them there rather than a fresh empty form.
    const dupSql = "SELECT claim_id FROM claims WHERE item_id = ? AND claimed_by = ? AND claim_status = 'pending'";
    connection.query(dupSql, [itemId, req.session.user.user_id], (dupErr, dupResults) => {
      if (dupErr) {
        console.error('Database query error:', dupErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      if (dupResults.length > 0) {
        return res.redirect('/items/' + itemId);
      }
      res.render('items/claim', { item: results[0], error: null });
    });
  });
});

// POST /items/:id/claim — submit a claim
// Multiple claims per item are allowed — anyone can submit a claim and
// staff compare them all to find the real owner. The item status is NOT
// flipped to 'pending' here anymore; it stays 'unclaimed' so other users
// can still see and claim it. Status only changes when staff approve/reject
// via POST /claims/:id/review below.
app.post('/items/:id/claim', isLoggedIn, (req, res) => {
  const { proof_description } = req.body;
  const itemId = req.params.id;

  const fetchSql = 'SELECT * FROM items WHERE item_id = ?';
  connection.query(fetchSql, [itemId], (fetchErr, results) => {
    if (fetchErr) {
      console.error('Database query error:', fetchErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    // Guard: only unclaimed items can be claimed. Stops a direct POST to a
    // claimed/removed item from creating a stray claim.
    if (results[0].status !== 'unclaimed') {
      return res.redirect('/items/' + itemId);
    }
    if (!proof_description) {
      return res.render('items/claim', {
        item: results[0],
        error: 'Please describe something about the item before submitting your claim.',
      });
    }

    // Check if this user has already submitted a pending claim for this item
    // — no point letting the same person submit duplicates.
    const dupSql = "SELECT claim_id FROM claims WHERE item_id = ? AND claimed_by = ? AND claim_status = 'pending'";
    connection.query(dupSql, [itemId, req.session.user.user_id], (dupErr, dupResults) => {
      if (dupErr) {
        console.error('Database query error:', dupErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      if (dupResults.length > 0) {
        return res.render('items/claim', {
          item: results[0],
          error: 'You already have a pending claim for this item.',
        });
      }

      // claimed_by always comes from the session, never the form.
      const insertSql = 'INSERT INTO claims (item_id, claimed_by, proof_description) VALUES (?, ?, ?)';
      connection.query(insertSql, [itemId, req.session.user.user_id, proof_description], (insertErr) => {
        if (insertErr) {
          console.error('Database query error:', insertErr.message);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        // Item stays 'unclaimed' — staff review all claims together and
        // flip the status only when they approve one (see POST /claims/:id/review).
        res.redirect('/items/' + itemId);
      });
    });
  });
});

// GET /claims/mine — the student's own side of the claim workflow: every
// claim they've submitted and where it stands (pending / approved / rejected).
// Without this, a student submits a claim and never finds out what happened.
// Declared before /claims/item/:id so "mine" isn't mistaken for an item id.
app.get('/claims/mine', isLoggedIn, (req, res) => {
  // Scoped to the logged-in user's own claims via claimed_by — never a value
  // from the URL, so nobody can read someone else's claims. JOIN items to show
  // what each claim was for.
  const sql = `SELECT c.claim_id, c.proof_description, c.claim_status, c.created_at,
        i.item_id, i.item_name, i.category, i.location_found, i.image
      FROM claims c
      JOIN items i ON c.item_id = i.item_id
      WHERE c.claimed_by = ?
      ORDER BY c.created_at DESC`;

  connection.query(sql, [req.session.user.user_id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('claims/mine', { claims: results });
  });
});

// GET /claims — staff view: browse pending claims grouped by category.
app.get('/claims', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const activeCategory = req.query.category || null;

  // Get all distinct categories that currently have pending claims,
  // so the category nav only shows relevant ones.
  const catSql = `SELECT DISTINCT i.category
      FROM claims c
      JOIN items i ON c.item_id = i.item_id
      WHERE c.claim_status = 'pending'
      ORDER BY i.category ASC`;

  connection.query(catSql, (catErr, catResults) => {
    if (catErr) {
      console.error('Database query error:', catErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    const categories = catResults.map(r => r.category);

    // Items that have at least one pending claim, optionally filtered by
    // category. GROUP BY + COUNT so the view can show how many claims
    // each item has without a separate query per item.
    let itemSql = `SELECT i.item_id, i.item_name, i.category, i.location_found,
          COUNT(c.claim_id) AS claim_count
        FROM claims c
        JOIN items i ON c.item_id = i.item_id
        WHERE c.claim_status = 'pending'`;
    const itemParams = [];

    if (activeCategory) {
      itemSql += ' AND i.category = ?';
      itemParams.push(activeCategory);
    }

    itemSql += ' GROUP BY i.item_id ORDER BY i.category ASC, i.item_name ASC';

    connection.query(itemSql, itemParams, (itemErr, itemResults) => {
      if (itemErr) {
        console.error('Database query error:', itemErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('claims/index', {
        categories,
        items: itemResults,
        activeCategory,
      });
    });
  });
});

// GET /claims/item/:id — staff view of all pending claims for one item.
// Registered before POST /claims/:id/review so Express doesn't treat
// "item" as a claim ID.
app.get('/claims/item/:id', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const itemId = req.params.id;

  const itemSql = 'SELECT * FROM items WHERE item_id = ?';
  connection.query(itemSql, [itemId], (itemErr, itemResults) => {
    if (itemErr) {
      console.error('Database query error:', itemErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (itemResults.length === 0) {
      return res.status(404).send('Item not found.');
    }

    const claimsSql = `SELECT c.claim_id, c.proof_description, c.created_at,
          u.username AS claimant_username
        FROM claims c
        JOIN users u ON c.claimed_by = u.user_id
        WHERE c.item_id = ? AND c.claim_status = 'pending'
        ORDER BY c.created_at ASC`;

    connection.query(claimsSql, [itemId], (claimsErr, claimsResults) => {
      if (claimsErr) {
        console.error('Database query error:', claimsErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('claims/item', {
        item: itemResults[0],
        claims: claimsResults,
      });
    });
  });
});

// POST /claims/:id/review — approve or reject a claim
app.post('/claims/:id/review', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const { decision } = req.body;
  const claimId = req.params.id;

  // Only two buttons post here (Approve/Reject in views/claims/index.ejs)
  // — anything else means a malformed request, not a valid business case.
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).send('Invalid decision.');
  }

  const fetchSql = 'SELECT * FROM claims WHERE claim_id = ?';
  connection.query(fetchSql, [claimId], (fetchErr, results) => {
    if (fetchErr) {
      console.error('Database query error:', fetchErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Claim not found.');
    }
    const claim = results[0];

    // Record who reviewed it and when, alongside the decision.
    const updateClaimSql = 'UPDATE claims SET claim_status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE claim_id = ?';
    connection.query(updateClaimSql, [decision, req.session.user.user_id, claimId], (updateClaimErr) => {
      if (updateClaimErr) {
        console.error('Database query error:', updateClaimErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }

      // Approving confirms ownership but doesn't mean the item has actually
      // been picked up from the lost & found hub yet — those are two
      // different real-world events. So approval moves the item to
      // 'pending' (repurposed here to mean "approved, awaiting collection",
      // not its old pre-multi-claim meaning of "claim awaiting review" —
      // that state doesn't exist anymore, see GET /items below). Staff mark
      // it fully 'claimed' only once the owner actually collects it, via
      // POST /items/:id/collect further down. Rejecting just leaves the
      // item 'unclaimed' so other claimants' submissions stay active.
      if (decision === 'approved') {
        const updateItemSql = 'UPDATE items SET status = ? WHERE item_id = ?';
        connection.query(updateItemSql, ['pending', claim.item_id], (updateItemErr) => {
          if (updateItemErr) {
            console.error('Database query error:', updateItemErr.message);
            return res.status(500).send('Something went wrong. Please try again.');
          }
          // Also reject all other pending claims for this item now that
          // one has been approved — no point leaving them open.
          const rejectOthersSql = "UPDATE claims SET claim_status = 'rejected' WHERE item_id = ? AND claim_id != ? AND claim_status = 'pending'";
          connection.query(rejectOthersSql, [claim.item_id, claimId], (rejectErr) => {
            if (rejectErr) {
              console.error('Database query error:', rejectErr.message);
              // Non-fatal — the approval already went through.
            }
            res.redirect('/claims/item/' + claim.item_id);
          });
        });
      } else {
        // Rejection: item stays unclaimed, other claims stay open.
        res.redirect('/claims/item/' + claim.item_id);
      }
    });
  });
});

// POST /items/:id/collect — staff/admin confirms the owner has actually
// picked up the item from the hub. Only valid from 'pending' (approved,
// awaiting collection) — an unclaimed or already-claimed item has nothing
// to collect, so this is a no-op redirect rather than an error for those.
app.post('/items/:id/collect', isLoggedIn, isStaffOrAdmin, (req, res) => {
  const itemId = req.params.id;

  const fetchSql = 'SELECT status FROM items WHERE item_id = ?';
  connection.query(fetchSql, [itemId], (fetchErr, results) => {
    if (fetchErr) {
      console.error('Database query error:', fetchErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    if (results[0].status !== 'pending') {
      return res.redirect('/items/' + itemId);
    }

    const sql = 'UPDATE items SET status = ? WHERE item_id = ?';
    connection.query(sql, ['claimed', itemId], (error) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.redirect('/items/' + itemId);
    });
  });
});

// ===================================================================
// Misc
// ===================================================================

app.get('/', (req, res) => res.redirect('/items'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Lost & Found Tracker running on http://localhost:${PORT}`);
});
