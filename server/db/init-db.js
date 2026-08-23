// =============================================================================
// server/db/init-db.js
// Veritabanı dosyasını ve tablolarını schema.sql'den oluşturur.
// Çalıştırmak için: npm run init-db  (package.json script'i çağırır)
// =============================================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

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

    // İlk admin kullanıcısını oluştur (varsa atlar)
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    if (userCount === 0) {
        const adminPassHash = bcrypt.hashSync("Admin123!", 10);
        db.prepare(
            `INSERT INTO users (username, email, password_hash, display_name, role)
             VALUES ('admin', 'admin@thenest.org', ?, 'The Nest Yönetici', 'admin')`
        ).run(adminPassHash);
        console.log("👤 Varsayılan admin kullanıcısı oluşturuldu: admin / Admin123!");
    }

    console.log(`✅ Veritabanı hazır: ${DB_PATH}`);
    db.close();
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase, DB_PATH };
