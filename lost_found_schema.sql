-- =====================================================
-- Lost & Found Tracker — Database Schema
-- C237 CA2 · Shared schema for all 6 feature branches
-- =====================================================

CREATE DATABASE IF NOT EXISTS lost_found_tracker;
USE lost_found_tracker;

-- ---------------------------------------------------
-- users
-- ---------------------------------------------------
CREATE TABLE users (
  user_id     INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,        -- SHA1 hash (via MySQL's SHA1()), never plain text
  email       VARCHAR(100) NOT NULL,
  role        ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------
-- items  (Firdaus's auth gates access; Shernice/Hui Xing/
-- Soe San/Wei Qi/Jun Hao all read and write this table)
-- ---------------------------------------------------
CREATE TABLE items (
  item_id         INT AUTO_INCREMENT PRIMARY KEY,
  item_name       VARCHAR(100) NOT NULL,
  category        VARCHAR(50)  NOT NULL,
  description     TEXT,
  location_found  VARCHAR(100) NOT NULL,
  date_found      DATE NOT NULL,
  status          ENUM('unclaimed', 'pending', 'claimed', 'removed') NOT NULL DEFAULT 'unclaimed',
  reported_by     INT NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reported_by) REFERENCES users(user_id)
);

-- ---------------------------------------------------
-- claims  (enhancement — Hui Xing, Wei Qi, Jun Hao)
-- ---------------------------------------------------
CREATE TABLE claims (
  claim_id            INT AUTO_INCREMENT PRIMARY KEY,
  item_id             INT NOT NULL,
  claimed_by          INT NOT NULL,
  proof_description   TEXT NOT NULL,
  claim_status        ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by         INT NULL,
  reviewed_at         TIMESTAMP NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(item_id),
  FOREIGN KEY (claimed_by) REFERENCES users(user_id),
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
);

-- =====================================================
-- Seed data — test accounts for local dev + the demo
-- Passwords are hashed with SHA1() right here in the INSERT, same as how
-- app.js hashes them at register time — so these seed rows use the exact
-- same hashing the app checks against at login. Use the plain text shown
-- in each comment to log in while testing.
-- =====================================================

-- admin / password: admin123
INSERT INTO users (username, password, email, role) VALUES
('admin', SHA1('admin123'), 'admin@lostfound.test', 'admin');

-- student / password: student123
INSERT INTO users (username, password, email, role) VALUES
('student1', SHA1('student123'), 'student1@lostfound.test', 'student');

-- a couple of sample items so Hui Xing's list/view page has something to render immediately
INSERT INTO items (item_name, category, description, location_found, date_found, status, reported_by) VALUES
('Black umbrella', 'Accessories', 'Compact black umbrella, slightly wet, left near the entrance', 'Block A, Level 1', CURDATE(), 'unclaimed', 1),
('Blue water bottle', 'Accessories', 'Stainless steel bottle with a scratched sticker on the side', 'Library, Level 2', CURDATE(), 'unclaimed', 1);
