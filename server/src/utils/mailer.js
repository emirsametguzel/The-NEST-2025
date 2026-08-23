// =============================================================================
// server/src/utils/mailer.js
// Nodemailer SMTP E-Posta Gönderim Modülü (Brevo SMTP Relay veya Özel SMTP)
// =============================================================================

const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "The Nest <parolasifirlamanest@gmail.com>";

// Güvenli Maskeleme Yardımcıları
function maskSecret(str) {
    if (!str) return "(tanımsız)";
    if (str.length <= 6) return str.slice(0, 2) + "***";
    return str.slice(0, 4) + "*".repeat(Math.min(str.length - 4, 10)) + str.slice(-2);
}

function maskEmail(email) {
    if (!email || !email.includes("@")) return maskSecret(email);
    const [name, domain] = email.split("@");
    return name.slice(0, 2) + "***@" + domain;
}

const HAS_AUTH = Boolean(SMTP_USER && SMTP_PASS);

let transporter = null;
try {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: HAS_AUTH
            ? {
                  user: SMTP_USER,
                  pass: SMTP_PASS,
              }
            : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        tls: {
            rejectUnauthorized: false,
        },
    });

    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ 📧 [SMTP TRANSPORTER] YAPILANDIRILDI                   │");
    console.log(`│ Host    : ${SMTP_HOST.padEnd(45)}│`);
    console.log(`│ Port    : ${String(SMTP_PORT).padEnd(45)}│`);
    console.log(`│ Secure  : ${String(SMTP_SECURE).padEnd(45)}│`);
    console.log(`│ User    : ${maskEmail(SMTP_USER).padEnd(45)}│`);
    console.log(`│ From    : ${SMTP_FROM.padEnd(45)}│`);
    console.log("└────────────────────────────────────────────────────────┘");
} catch (initErr) {
    console.error("❌ [SMTP BAŞLATMA HATASI]:", initErr.message);
    transporter = null;
}

/**
 * Şifre sıfırlama OTP e-postası gönderir (Fail-Safe)
 * @param {string} toEmail Alıcı e-posta adresi
 * @param {string} otp 6 haneli doğrulama kodu
 */
async function sendOtpEmail(toEmail, otp) {
    const subject = "The Nest — Şifre Sıfırlama Kodu";
    const text = `The Nest platformu şifre sıfırlama talebiniz için tek kullanımlık kodunuz:\n\n${otp}\n\nBu kod 10 dakika boyunca geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı güvenle görmezden gelebilirsiniz.`;
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; color: #0f172a;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #042C62; margin: 0; font-size: 22px; font-weight: 700;">The Nest 2025</h1>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Şifre Sıfırlama Doğrulama Kodu</p>
            </div>
            <p style="font-size: 15px; color: #334155; line-height: 1.6;">Merhaba,</p>
            <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hesabınız için şifre sıfırlama talebinde bulunuldu. Aşağıdaki 6 haneli kodu kullanarak şifrenizi yenileyebilirsiniz:</p>
            <div style="text-align: center; margin: 28px 0;">
                <div style="display: inline-block; padding: 14px 28px; background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 8px;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #166534; font-family: monospace;">${otp}</span>
                </div>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
                ⏳ Bu kod <strong>10 dakika</strong> süreyle geçerlidir.<br>
                🔒 Bu işlemi siz başlatmadıysanız hiçbir işlem yapmanıza gerek yoktur, hesabınız güvendedir.
            </p>
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">© 2025 The Nest Robotics Platformu</p>
        </div>
    `;

    if (transporter && HAS_AUTH) {
        try {
            console.log(`📤 [SMTP] ${toEmail} adresine e-posta iletiliyor (From: ${SMTP_FROM})...`);
            const info = await transporter.sendMail({
                from: SMTP_FROM,
                to: toEmail,
                subject,
                text,
                html,
            });

            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ ✅ [SMTP TESLİMATI BAŞARILI]                         ║");
            console.log(`║ Alıcı     : ${toEmail.padEnd(41)}║`);
            console.log(`║ MessageId : ${(info?.messageId || "").slice(0, 41).padEnd(41)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");

            return { delivered: true, dev: false, messageId: info?.messageId };
        } catch (sendError) {
            console.error("❌ [SMTP Gönderim Hatası]:", sendError.message);
            logFallbackOtp(toEmail, otp, "SMTP Hatası: " + sendError.message);
            return { delivered: false, dev: true, error: sendError.message, otp };
        }
    }

    // SMTP auth bilgisi yoksa veya transporter başlatılamadıysa fallback modu
    logFallbackOtp(toEmail, otp, "SMTP Kullanıcı/Şifre Tanımsız");
    return { delivered: false, dev: true, otp };
}

function logFallbackOtp(toEmail, otp, reason) {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║ 🔑 [OTP KODU] (${(reason || "Fallback").slice(0, 30).padEnd(30)}) ║`);
    console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
    console.log(`║ OTP  : ${otp.padEnd(46)}║`);
    console.log("║ Süre : 10 Dakika                                     ║");
    console.log("╚══════════════════════════════════════════════════════╝");
}

module.exports = {
    transporter,
    sendOtpEmail,
    sendOTP: sendOtpEmail,
    sendMail: sendOtpEmail,
    HAS_SMTP: Boolean(transporter && HAS_AUTH),
};
