// =============================================================================
// server/src/routes/passwordReset.js
//
//   POST /api/auth/forgot-password   -> { email } -> OTP üretir, e-posta gönderir
//   POST /api/auth/reset-password    -> { email, otp, newPassword } -> şifreyi değiştirir
// =============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { forgotPasswordLimiter } = require("../middleware/rateLimiter");
const { forgotPasswordValidationRules, resetPasswordValidationRules } = require("../utils/validators");
const { generateOtp, hashOtp, getExpiryIso, MAX_VERIFY_ATTEMPTS } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/mailer");

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// -----------------------------------------------------------------------------
// POST /api/auth/forgot-password
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
        // Her durumda aynı mesaj dönülür — bu e-postanın kayıtlı olup olmadığını
        // saldırganın anlamasını engeller (hesap keşfi/enumeration önleme).
        const genericResponse = {
            message: "Bu e-posta kayıtlıysa, doğrulama kodu gönderildi.",
        };

        try {
            const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
            if (!user) {
                return res.json(genericResponse);
            }

            const otp = generateOtp();
            const otpHash = hashOtp(otp);
            const expiresAt = getExpiryIso();

            // Bu kullanıcı için önceki kullanılmamış OTP'leri geçersiz say
            // (used=1 işaretle) — aynı anda yalnızca bir aktif kod olsun.
            db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(user.id);

            db.prepare(
                `INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES (?, ?, ?)`
            ).run(user.id, otpHash, expiresAt);

            await sendOtpEmail(user.email, otp);

            return res.json(genericResponse);
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

    const { email, otp, newPassword } = req.body;

    try {
        const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (!user) {
            // Genel hata: hangi kısmın (e-posta mı OTP mi) yanlış olduğunu belirtmiyoruz.
            return res.status(400).json({ error: "Kod geçersiz veya süresi dolmuş." });
        }

        const reset = db
            .prepare(
                `SELECT * FROM password_resets WHERE user_id = ? AND used = 0
                 ORDER BY created_at DESC LIMIT 1`
            )
            .get(user.id);

        if (!reset) {
            return res.status(400).json({ error: "Kod geçersiz veya süresi dolmuş." });
        }

        if (new Date(reset.expires_at + "Z") < new Date()) {
            return res.status(400).json({ error: "Kod geçersiz veya süresi dolmuş." });
        }

        if (reset.attempts >= MAX_VERIFY_ATTEMPTS) {
            return res.status(429).json({ error: "Çok fazla hatalı deneme. Yeni bir kod isteyin." });
        }

        const otpHash = hashOtp(otp);
        if (otpHash !== reset.otp_hash) {
            db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?").run(reset.id);
            return res.status(400).json({ error: "Kod geçersiz veya süresi dolmuş." });
        }

        // --- OTP doğru: şifreyi güncelle, kodu kullanılmış olarak işaretle ---
        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        db.prepare(
            `UPDATE users SET password_hash = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(passwordHash, user.id);

        db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(reset.id);

        return res.json({ message: "Şifreniz başarıyla güncellendi. Şimdi giriş yapabilirsiniz." });
    } catch (err) {
        console.error("Reset-password hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

module.exports = router;
