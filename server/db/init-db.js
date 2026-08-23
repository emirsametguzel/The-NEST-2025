// =============================================================================
// server/db/init-db.js
// Veritabanı dosyasını ve tablolarını schema.sql'den oluşturur.
// Çalıştırmak için: npm run init-db  (package.json script'i çağırır)
// =============================================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "the-nest.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function initDatabase() {
    // data/ klasörü yoksa oluştur
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema);

    console.log(`✅ Veritabanı hazır: ${DB_PATH}`);
    db.close();
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase, DB_PATH };
