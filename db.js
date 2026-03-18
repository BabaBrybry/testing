const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'haulmail.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS carrier_lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    lane TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS carriers (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES carrier_lists(id)
  );

  CREATE TABLE IF NOT EXISTS loads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    equipment TEXT NOT NULL,
    weight TEXT,
    rate TEXT NOT NULL,
    pickup_date TEXT NOT NULL,
    notes TEXT,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS blasts (
    id TEXT PRIMARY KEY,
    load_id TEXT NOT NULL,
    carrier_id TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    opened_at DATETIME,
    replied_at DATETIME,
    reply_text TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (load_id) REFERENCES loads(id),
    FOREIGN KEY (carrier_id) REFERENCES carriers(id)
  );
`);

module.exports = db;
