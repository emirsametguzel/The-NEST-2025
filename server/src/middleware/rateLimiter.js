// =============================================================================
// server/src/middleware/rateLimiter.js
//
// Not: Login rotasındaki (POST /api/auth/login) hesap/IP kilitleme mantığı
// ürün kararıyla tamamen kaldırıldı (bkz. routes/auth.js). Bu dosyada kalan
// limiter'lar login ile ilgili DEĞİL — kayıt formu botlarına ve şifre
// sıfırlama e-postalarının spam amaçlı kötüye kullanımına karşı genel
// aşırı-kullanım korumasıdır.
// =============================================================================

const rateLimit = require("express-rate-limit");

const isTest = () => process.env.NODE_ENV === "test";

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin." },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin." },
});

// Şifre sıfırlama OTP isteği: burada amaç "hatalı şifrede kilitleme" değil,
// e-posta gönderim servisinin spam/kötüye kullanım amaçlı bombalanmasını
// önlemek (farklı bir güvenlik kaygısı, madde 1'deki login kilidiyle ilgisi yok).
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar deneyin." },
});

module.exports = { generalLimiter, registerLimiter, forgotPasswordLimiter };
