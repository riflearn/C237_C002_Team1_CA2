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
const path = require('path');

const app = express();

// ----- MySQL connection -----
// Callback-style connection (not a pool, not mysql2/promise) — same
// connection.query(sql, params, (error, results) => {...}) pattern used
// throughout C237L17's SupermarketApp — except credentials come from .env
// instead of being written directly here. This repo is shared by all 6 of
// us and everyone edits this same file for their own feature, so a secret
// hardcoded here would get committed by whoever's local password happened
// to be sitting in it. Each teammate keeps their own gitignored .env
// (copy .env.example → .env, fill in your own local MySQL password).
const connection = mysql.createConnection({
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
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
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
//   app.post('/items/:id/delete', isLoggedIn, isAdmin, (req, res) => { ... });
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
  return res.status(403).send('Forbidden — admin access only');
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
  const sql = 'SELECT * FROM users WHERE username = ? AND password = SHA1(?)';

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
// Shernice — Report a Found Item (Create)
// ===================================================================

// GET /items/new — show the "report a found item" form
app.get('/items/new', isLoggedIn, (req, res) => {
  res.render('items/new', { error: null });
});

// POST /items/new — insert the new item into the database
app.post('/items/new', isLoggedIn, (req, res) => {
  const { item_name, category, description, location_found, date_found } = req.body;

  // description is optional (its textarea has no `required`); everything
  // else must be present, or we bounce back to the form with an error.
  if (!item_name || !category || !location_found || !date_found) {
    return res.render('items/new', { error: 'Please fill in all required fields.' });
  }

  // reported_by always comes from the logged-in session, never the form —
  // otherwise a student could submit an item and claim someone else found it.
  const sql = `INSERT INTO items
      (item_name, category, description, location_found, date_found, reported_by)
    VALUES (?, ?, ?, ?, ?, ?)`;

  connection.query(
    sql,
    [item_name, category, description || null, location_found, date_found, req.session.user.user_id],
    (error) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.render('items/new', { error: 'Something went wrong. Please try again.' });
      }
      res.redirect('/items');
    }
  );
});

// ===================================================================
// Hui Xing — Browse & View Items (Read)
// Jun Hao — Search & Filter (built into the GET /items query below)
// ===================================================================

// GET /items — list all found items, optionally filtered
app.get('/items', isLoggedIn, (req, res) => {
  const { category, location, status, q } = req.query;
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
    // Hide soft-deleted items by default — Wei Qi's delete route below
    // flips status to 'removed' instead of deleting the row outright, so
    // without this filter "deleted" items would still show up here.
    sql += " AND status != 'removed'";
  }

  if (q) {
    sql += ' AND (item_name LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY created_at DESC';

  connection.query(sql, params, (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('items/index', { items: results, query: req.query });
  });
});

// GET /items/:id — view a single item's detail
app.get('/items/:id', isLoggedIn, (req, res) => {
  const sql = 'SELECT * FROM items WHERE item_id = ?';

  connection.query(sql, [req.params.id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    res.render('items/show', { item: results[0] });
  });
});

// ===================================================================
// Soe San — Edit Item (Update)
// ===================================================================

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
    res.render('items/edit', { item: results[0], error: null });
  });
});

// POST /items/:id/edit — save the changes
app.post('/items/:id/edit', isLoggedIn, (req, res) => {
  const { item_name, category, description, location_found, date_found } = req.body;
  const itemId = req.params.id;

  // Same required-field set as Shernice's create form.
  if (!item_name || !category || !location_found || !date_found) {
    // Re-fetch the item so the form can re-render pre-filled instead of
    // losing the other fields the user already typed.
    const fetchSql = 'SELECT * FROM items WHERE item_id = ?';
    return connection.query(fetchSql, [itemId], (fetchErr, results) => {
      if (fetchErr) {
        console.error('Database query error:', fetchErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.render('items/edit', {
        item: { ...results[0], ...req.body, item_id: itemId },
        error: 'Please fill in all required fields.',
      });
    });
  }

  const sql = `UPDATE items
      SET item_name = ?, category = ?, description = ?, location_found = ?, date_found = ?
    WHERE item_id = ?`;

  connection.query(
    sql,
    [item_name, category, description || null, location_found, date_found, itemId],
    (error) => {
      if (error) {
        console.error('Database query error:', error.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }
      res.redirect('/items/' + itemId);
    }
  );
});

// ===================================================================
// Wei Qi — Remove Item (Delete)
// This is the one route that needs isAdmin, not just isLoggedIn.
// ===================================================================

// POST /items/:id/delete — staff-only removal
app.post('/items/:id/delete', isLoggedIn, isAdmin, (req, res) => {
  // Soft-delete (flip status) instead of a hard DELETE — items can have
  // claims referencing them (claims.item_id FOREIGN KEY), so an actual
  // DELETE would fail once a claim exists. Updating status keeps the row
  // (and its claim history) intact and just hides it from the default
  // browse list (see the "!= 'removed'" filter in GET /items above).
  const sql = 'UPDATE items SET status = ? WHERE item_id = ?';

  connection.query(sql, ['removed', req.params.id], (error) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.redirect('/items');
  });
});

// ===================================================================
// Hui Xing, Wei Qi, Jun Hao — Claim Verification Workflow (enhancement)
// ===================================================================

// GET /items/:id/claim — show the claim form
app.get('/items/:id/claim', isLoggedIn, (req, res) => {
  const sql = 'SELECT * FROM items WHERE item_id = ?';

  connection.query(sql, [req.params.id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    res.render('items/claim', { item: results[0], error: null });
  });
});

// POST /items/:id/claim — submit a claim
app.post('/items/:id/claim', isLoggedIn, (req, res) => {
  const { proof_description } = req.body;
  const itemId = req.params.id;

  // Look the item up first — needed either way (to re-render the form on a
  // validation error, or just to confirm it exists before the INSERT below,
  // since claims.item_id has a FOREIGN KEY on items).
  const fetchSql = 'SELECT * FROM items WHERE item_id = ?';
  connection.query(fetchSql, [itemId], (fetchErr, results) => {
    if (fetchErr) {
      console.error('Database query error:', fetchErr.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    if (results.length === 0) {
      return res.status(404).send('Item not found.');
    }
    if (!proof_description) {
      return res.render('items/claim', {
        item: results[0],
        error: 'Please describe the item before submitting your claim.',
      });
    }

    // claimed_by always comes from the session, never the form — same
    // rule Shernice follows for reported_by above.
    const insertSql = 'INSERT INTO claims (item_id, claimed_by, proof_description) VALUES (?, ?, ?)';
    connection.query(insertSql, [itemId, req.session.user.user_id, proof_description], (insertErr) => {
      if (insertErr) {
        console.error('Database query error:', insertErr.message);
        return res.status(500).send('Something went wrong. Please try again.');
      }

      // Flip the item to 'pending' so it drops out of the "unclaimed" list
      // while staff review it (see GET /claims below).
      const updateSql = 'UPDATE items SET status = ? WHERE item_id = ?';
      connection.query(updateSql, ['pending', itemId], (updateErr) => {
        if (updateErr) {
          console.error('Database query error:', updateErr.message);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        res.redirect('/items/' + itemId);
      });
    });
  });
});

// GET /claims — staff view of pending claims
app.get('/claims', isLoggedIn, isAdmin, (req, res) => {
  // JOIN against items and users so the staff view gets the item's name and
  // the claimant's username in one round trip.
  const sql = `SELECT c.claim_id, c.proof_description, c.created_at,
        i.item_id, i.item_name,
        u.username AS claimant_username
      FROM claims c
      JOIN items i ON c.item_id = i.item_id
      JOIN users u ON c.claimed_by = u.user_id
      WHERE c.claim_status = 'pending'
      ORDER BY c.created_at ASC`;

  connection.query(sql, (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Something went wrong. Please try again.');
    }
    res.render('claims/index', { claims: results });
  });
});

// POST /claims/:id/review — approve or reject a claim
app.post('/claims/:id/review', isLoggedIn, isAdmin, (req, res) => {
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

      // Approving hands the item to the claimant for good; rejecting
      // reopens it instead of leaving it stuck on 'pending' forever.
      const newItemStatus = decision === 'approved' ? 'claimed' : 'unclaimed';
      const updateItemSql = 'UPDATE items SET status = ? WHERE item_id = ?';
      connection.query(updateItemSql, [newItemStatus, claim.item_id], (updateItemErr) => {
        if (updateItemErr) {
          console.error('Database query error:', updateItemErr.message);
          return res.status(500).send('Something went wrong. Please try again.');
        }
        res.redirect('/claims');
      });
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
