// =============================================================================
// server/src/utils/otp.js
// 6 haneli doğrulama kodu (OTP) üretimi ve hash'lenmesi.
//
// Neden sha256 (bcrypt değil)? OTP yalnızca 6 haneli sayısal bir kod
// (1.000.000 olasılık) — bcrypt'in yavaş, maliyetli hash'lemesi burada
// gereksiz yük getirir. Gerçek koruma zaten şuradan geliyor: 10 dakikalık
// kısa geçerlilik süresi, ilk kullanımda geçersiz kılma, ve doğrulama
// denemelerinin sınırlanması (bkz. routes/passwordReset.js).
// =============================================================================

const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 dakika
const MAX_VERIFY_ATTEMPTS = 5;

function generateOtp() {
    // 000000-999999 arası, başında sıfır olabilecek şekilde sabit 6 hane
    const num = crypto.randomInt(0, 10 ** OTP_LENGTH);
    return String(num).padStart(OTP_LENGTH, "0");
}

function hashOtp(otp) {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

function getExpiryIso() {
    return new Date(Date.now() + OTP_TTL_MS).toISOString().replace("Z", "");
}

module.exports = { generateOtp, hashOtp, getExpiryIso, OTP_TTL_MS, MAX_VERIFY_ATTEMPTS };
