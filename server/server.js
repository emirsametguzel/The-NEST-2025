// =============================================================================
// server/server.js — Giriş noktası
// Çalıştırmak için: npm start  (veya: node server.js)
// =============================================================================

require("dotenv").config();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error(
        "❌ HATA: SESSION_SECRET tanımlı değil veya çok kısa (en az 32 karakter olmalı).\n" +
            "   .env dosyasında SESSION_SECRET ayarlayın. Örnek üretmek için:\n" +
            "   node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
    process.exit(1);
}

const { initDatabase } = require("./db/init-db");
initDatabase(); // veritabanı/tablolar yoksa oluşturur (idempotent)

const app = require("./src/app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ The Nest API sunucusu çalışıyor: http://localhost:${PORT}`);
});
