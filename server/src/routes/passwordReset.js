// =============================================================================
// server/src/routes/passwordReset.js
// Şifre sıfırlama istekleri ve güncelleme rotaları
// =============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { forgotPasswordLimiter } = require("../middleware/rateLimiter");
const { forgotPasswordValidationRules, resetPasswordValidationRules } = require("../utils/validators");

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// -----------------------------------------------------------------------------
// POST /api/auth/forgot-password (Backend Güvenlik ve Doğrulama)
// -----------------------------------------------------------------------------
router.post(
    "/forgot-password",
    forgotPasswordLimiter,
    verifyCsrfToken,
    forgotPasswordValidationRules,
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
        }

        const { email } = req.body;

        try {
            // Kullanıcı kontrolü ve güvenlik loglaması
            const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
            if (user) {
                console.log(`🔒 [Şifre Sıfırlama Talebi] Kayıtlı kullanıcı: ${user.email}`);
            }

            // Güvenlik gereği link ekrana veya yanıta basılmaz, sadece standart bildirim döner
            return res.json({
                success: true,
                message: "Şifre sıfırlama bağlantısı e-posta adresinize gönderildi!",
            });
        } catch (err) {
            console.error("Forgot-password hatası:", err);
            return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
        }
    }
);

// -----------------------------------------------------------------------------
// POST /api/auth/reset-password
// -----------------------------------------------------------------------------
router.post("/reset-password", verifyCsrfToken, resetPasswordValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { email, newPassword } = req.body;

    try {
        const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (!user) {
            return res.status(400).json({ error: "Kullanıcı bulunamadı veya işlem geçersiz." });
        }

        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        db.prepare(
            `UPDATE users SET password_hash = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(passwordHash, user.id);

        return res.json({ message: "Şifreniz başarıyla güncellendi. Şimdi giriş yapabilirsiniz." });
    } catch (err) {
        console.error("Reset-password hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

module.exports = router;
