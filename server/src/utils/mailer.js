// =============================================================================
// server/src/utils/mailer.js
// Nodemailer sarmalayıcısı. SMTP ayarları .env'de tanımlı değilse (geliştirme
// ortamı), e-posta gerçekten gönderilmez — OTP kodu yalnızca sunucu
// terminaline (console.log) basılır. Böylece SMTP kurmadan da akış test edilebilir.
// =============================================================================

const nodemailer = require("nodemailer");

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
const SMTP_CONFIGURED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (SMTP_CONFIGURED) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

/**
 * Şifre sıfırlama OTP e-postası gönderir.
 * SMTP tanımlı değilse gerçek gönderim yapılmaz, yalnızca konsola yazılır.
 */
async function sendOtpEmail(toEmail, otp) {
    const subject = "The Nest — Şifre Sıfırlama Kodu";
    const text = `Şifre sıfırlama kodunuz: ${otp}\n\nBu kod 10 dakika boyunca geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.`;
    const html = `
        <p>Şifre sıfırlama kodunuz:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${otp}</p>
        <p>Bu kod <strong>10 dakika</strong> boyunca geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
    `;

    if (!SMTP_CONFIGURED) {
        // --- Geliştirme ortamı fallback'i ---
        console.log("─────────────────────────────────────────────");
        console.log("📧 [DEV] SMTP tanımlı değil — e-posta gönderilmedi.");
        console.log(`   Alıcı : ${toEmail}`);
        console.log(`   OTP   : ${otp}`);
        console.log("─────────────────────────────────────────────");
        return { delivered: false, dev: true };
    }

    await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: toEmail,
        subject,
        text,
        html,
    });
    return { delivered: true, dev: false };
}

module.exports = { sendOtpEmail, SMTP_CONFIGURED };
