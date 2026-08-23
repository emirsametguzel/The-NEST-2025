// =============================================================================
// server/src/utils/mailer.js
// Nodemailer sarmalayıcısı. SMTP ayarları .env'de tanımlı ise güvenli şekilde
// e-posta gönderir. SMTP tanımlı değilse veya test ortamındaysa sunucu terminaline
// (console.log) OTP kodunu güvenli şekilde basar.
// =============================================================================

const nodemailer = require("nodemailer");

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
const SMTP_CONFIGURED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (SMTP_CONFIGURED) {
    const port = Number(SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: port,
        secure: port === 465, // 465 için SSL, 587 için STARTTLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
        },
    });
}

/**
 * Şifre sıfırlama OTP e-postası gönderir.
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

    if (!SMTP_CONFIGURED || !transporter) {
        // --- Geliştirme / Test ortamı fallback'i ---
        console.log("╔══════════════════════════════════════════════════════╗");
        console.log("║ 📧 [DEV/FALLBACK] ŞİFRE SIFIRLAMA OTP KODU ÜRETİLDİ   ║");
        console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
        console.log(`║ OTP  : ${otp.padEnd(46)}║`);
        console.log("║ Süre : 10 Dakika                                     ║");
        console.log("╚══════════════════════════════════════════════════════╝");
        return { delivered: false, dev: true, otp };
    }

    try {
        await transporter.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to: toEmail,
            subject,
            text,
            html,
        });
        console.log(`✅ [SMTP] OTP e-postası başarıyla gönderildi: ${toEmail}`);
        return { delivered: true, dev: false };
    } catch (mailError) {
        console.error("⚠️ [SMTP Gönderim Hatası]:", mailError.message);
        console.log("╔══════════════════════════════════════════════════════╗");
        console.log("║ 🔑 [FALLBACK OTP KODU (SMTP Hatası Nedeniyle)]        ║");
        console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
        console.log(`║ OTP  : ${otp.padEnd(46)}║`);
        console.log("╚══════════════════════════════════════════════════════╝");
        return { delivered: false, dev: true, error: mailError.message, otp };
    }
}

module.exports = { sendOtpEmail, SMTP_CONFIGURED };
