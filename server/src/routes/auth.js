// =============================================================================
// server/src/routes/auth.js
//
//   GET  /api/auth/csrf-token   -> CSRF token al
//   POST /api/auth/register     -> Yeni kullanıcı kaydı
//   POST /api/auth/login        -> Giriş yap, session başlat
//   POST /api/auth/logout       -> Çıkış yap, session sonlandır
//   GET  /api/auth/me           -> Mevcut oturum bilgisini döndür
//                                    (main.js sayfa yüklenirken bunu çağırır)
// =============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");

const db = require("../db");
const { issueCsrfToken, verifyCsrfToken } = require("../middleware/csrf");
const { registerLimiter } = require("../middleware/rateLimiter");
const { requireAuth } = require("../middleware/requireAuth");
const { registerValidationRules, loginValidationRules } = require("../utils/validators");

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED !== "false"; // .env ile kapatılabilir

router.get("/csrf-token", issueCsrfToken);

// -----------------------------------------------------------------------------
// POST /api/auth/register
// -----------------------------------------------------------------------------
router.post("/register", registerLimiter, verifyCsrfToken, registerValidationRules, async (req, res) => {
    if (!REGISTRATION_ENABLED) {
        return res.status(403).json({ error: "Kayıt şu anda kapalı." });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { username, email, password, displayName } = req.body;

    try {
        const existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
        if (existing) {
            // Hangisinin çakıştığını belirtmiyoruz -> hesap keşfi (enumeration) önleme
            return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta zaten kayıtlı." });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const result = db
            .prepare(
                `INSERT INTO users (username, email, password_hash, display_name, role)
                 VALUES (?, ?, ?, ?, 'member')`
            )
            .run(username, email, passwordHash, displayName || username);

        req.session.regenerate((err) => {
            if (err) {
                console.error("Session regenerate hatası:", err);
                return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
            }
            req.session.userId = result.lastInsertRowid;
            req.session.username = username;
            req.session.role = "member";

            return res.status(201).json({
                message: "Kayıt başarılı.",
                user: { id: result.lastInsertRowid, username, email, role: "member" },
            });
        });
    } catch (err) {
        console.error("Register hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

// -----------------------------------------------------------------------------
// POST /api/auth/login
//
// Ürün kararı: hesap/IP kilitleme mantığı tamamen kaldırıldı. Hatalı şifrede
// yalnızca genel bir "E-posta veya şifre hatalı." mesajı dönülür, hesap hiçbir
// şekilde kilitlenmez. (Not: bu, brute-force korumasını zayıflatır — dilerseniz
// ileride CAPTCHA veya IP bazlı hafif bir rate limit eklenebilir.)
// -----------------------------------------------------------------------------
router.post("/login", verifyCsrfToken, loginValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { identifier, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "";
    const normalized = identifier.toLowerCase();

    const logAttempt = (success) => {
        db.prepare(
            `INSERT INTO login_attempts (identifier, ip_address, success, user_agent) VALUES (?, ?, ?, ?)`
        ).run(normalized, ipAddress, success ? 1 : 0, userAgent);
    };

    try {
        const user = db
            .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
            .get(normalized, normalized);

        if (!user) {
            logAttempt(false);
            // Zamanlama saldırısını (timing attack) zorlaştırmak için sahte bir
            // bcrypt karşılaştırması yapılır -> "kullanıcı yok" ile "şifre yanlış"
            // yanıt süreleri neredeyse eşitlenir.
            await bcrypt.compare(password, "$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsalt.");
            return res.status(401).json({ error: "E-posta veya şifre hatalı." });
        }

        if (!user.is_active) {
            logAttempt(false);
            return res.status(403).json({ error: "Bu hesap devre dışı bırakılmış." });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            logAttempt(false);
            return res.status(401).json({ error: "E-posta veya şifre hatalı." });
        }

        db.prepare(
            `UPDATE users SET last_login_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(user.id);
        logAttempt(true);

        // Session fixation saldırılarına karşı: girişte session ID'sini yenile.
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session regenerate hatası:", err);
                return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
            }
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;

            return res.json({
                message: "Giriş başarılı.",
                user: { id: user.id, username: user.username, email: user.email, role: user.role },
            });
        });
    } catch (err) {
        console.error("Login hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

// -----------------------------------------------------------------------------
// POST /api/auth/logout
// -----------------------------------------------------------------------------
router.post("/logout", verifyCsrfToken, requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout hatası:", err);
            return res.status(500).json({ error: "Çıkış yapılırken hata oluştu." });
        }
        res.clearCookie("connect.sid");
        return res.json({ message: "Çıkış yapıldı." });
    });
});

// -----------------------------------------------------------------------------
// GET /api/auth/me
// -----------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
    const user = db
        .prepare(
            "SELECT id, username, email, display_name, bio, avatar_path, role, created_at, last_login_at FROM users WHERE id = ?"
        )
        .get(req.userId);

    if (!user) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }
    return res.json({ user });
});

module.exports = router;
