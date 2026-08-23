// =============================================================================
// server/src/middleware/csrf.js
// CSRF Koruması — Senkronize Token Deseni (OWASP önerisi).
//
// `csurf` paketi artık bakımsız/güvensiz uyarısı aldığı için elle uygulandı:
//   1) Frontend sayfa yüklenince GET /api/auth/csrf-token çağırır.
//   2) Sunucu session'a bağlı rastgele bir token üretir, döner.
//   3) Frontend, state değiştiren her istekte (POST/PUT/DELETE) bu token'ı
//      X-CSRF-Token header'ında geri gönderir.
//   4) Sunucu header'daki token ile session'daki token'ı sabit-süreli
//      (timing-safe) karşılaştırır.
//
// SameSite=Strict cookie zaten birincil CSRF savunmasıdır; bu katman
// "defense in depth" için eklenmiştir.
// =============================================================================

const crypto = require("crypto");

function getOrCreateCsrfToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    return req.session.csrfToken;
}

function issueCsrfToken(req, res) {
    const token = getOrCreateCsrfToken(req);
    res.json({ csrfToken: token });
}

function verifyCsrfToken(req, res, next) {
    const headerToken = req.headers["x-csrf-token"];
    const sessionToken = req.session.csrfToken;

    if (!sessionToken || !headerToken) {
        return res.status(403).json({ error: "CSRF doğrulaması başarısız: token eksik." });
    }

    const a = Buffer.from(headerToken);
    const b = Buffer.from(sessionToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: "CSRF doğrulaması başarısız: token geçersiz." });
    }

    next();
}

module.exports = { issueCsrfToken, verifyCsrfToken };
