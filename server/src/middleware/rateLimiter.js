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

const isTest = () => {
    if (process.env.ENABLE_RATE_LIMIT_TEST === "true") return false;
    return process.env.NODE_ENV === "test";
};

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
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin." },
});

const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20, // 1 dakikada en fazla 20 istek
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla başarısız veya hızlı giriş denemesi. Lütfen 1 dakika bekleyin.", code: "TOO_MANY_REQUESTS" },
});

// Şifre sıfırlama OTP isteği limiter
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTest,
    message: { error: "Çok fazla şifre sıfırlama isteği. Lütfen birkaç dakika sonra tekrar deneyin." },
});

module.exports = { generalLimiter, registerLimiter, loginLimiter, forgotPasswordLimiter };

