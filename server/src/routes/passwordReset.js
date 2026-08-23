// =============================================================================
// server/src/routes/passwordReset.js
// Firebase Authentication tabanlı şifre sıfırlama mekanizması
// =============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { forgotPasswordLimiter } = require("../middleware/rateLimiter");
const { forgotPasswordValidationRules, resetPasswordValidationRules } = require("../utils/validators");
const { generatePasswordResetLink } = require("../utils/firebaseAdmin");

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// -----------------------------------------------------------------------------
// POST /api/auth/forgot-password (Firebase Auth Destekli)
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
        const genericResponse = {
            success: true,
            message: "Bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı oluşturuldu.",
        };

        try {
            const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
            if (!user) {
                return res.json(genericResponse);
            }

            // Firebase Admin SDK ile şifre sıfırlama linki oluştur
            const result = await generatePasswordResetLink(user.email);

            const responsePayload = {
                success: true,
                message: "Şifre sıfırlama bağlantısı başarıyla oluşturuldu.",
                resetLink: result.link,
            };

            if (result.dev) {
                responsePayload.devMode = true;
                responsePayload.devNote = "Geliştirme modu / test bağlantısı oluşturuldu.";
            }

            return res.json(responsePayload);
        } catch (err) {
            console.error("Forgot-password Firebase hatası:", err);
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
