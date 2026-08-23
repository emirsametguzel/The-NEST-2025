// =============================================================================
// server/server.js — Giriş noktası
// Çalıştırmak için: npm start  (veya: node server.js)
// =============================================================================

require("dotenv").config();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || "default_development_session_secret_32_chars_long_key_the_nest";
}

const { initDatabase } = require("./db/init-db");
initDatabase(); // veritabanı/tablolar yoksa oluşturur (idempotent)

const app = require("./src/app");

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ The Nest API sunucusu çalışıyor: http://0.0.0.0:${PORT}`);
});
