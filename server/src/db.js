// =============================================================================
// server/src/db.js
// Uygulama genelinde paylaşılan tek veritabanı bağlantısı.
// better-sqlite3 parametreli sorgular kullanır -> SQL Injection'a karşı
// yerleşik koruma (bkz. routes/auth.js, routes/profile.js).
// =============================================================================

const Database = require("better-sqlite3");
const { DB_PATH } = require("../db/init-db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = db;
