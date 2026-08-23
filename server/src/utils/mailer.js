// =============================================================================
// server/src/utils/mailer.js
// E-posta gönderim modülü: Resend HTTP API ve Nodemailer SMTP desteği.
// Resend HTTP (Port 443) kullandığı için tüm bulut ve sunucu ortamlarında
// port bloklamasına takılmadan anında e-posta iletir.
// =============================================================================

const { Resend } = require("resend");
const nodemailer = require("nodemailer");

const {
    RESEND_API_KEY,
    RESEND_FROM,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
} = process.env;

const HAS_RESEND = Boolean(RESEND_API_KEY && RESEND_API_KEY.trim().length > 0);
const HAS_SMTP = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

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

let resendClient = null;
let smtpTransporter = null;

if (HAS_RESEND) {
    resendClient = new Resend(RESEND_API_KEY.trim());
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ 🚀 [RESEND API] E-POSTA SERVİSİ AKTİF EDİLDİ           │");
    console.log(`│ API Key : ${maskSecret(RESEND_API_KEY).padEnd(45)}│`);
    console.log(`│ Gönderen: ${(RESEND_FROM || "The Nest <onboarding@resend.dev>").padEnd(45)}│`);
    console.log("│ Durum   : HTTP Port 443 (Bloklamasız Güvenli Gönderim) │");
    console.log("└────────────────────────────────────────────────────────┘");
} else if (HAS_SMTP) {
    const port = Number(SMTP_PORT) || 587;
    smtpTransporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: { rejectUnauthorized: false },
    });
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ 📧 [SMTP FALLBACK] YAPILANDIRMASI YÜKLENDİ             │");
    console.log(`│ Host    : ${(SMTP_HOST || "").padEnd(45)}│`);
    console.log(`│ User    : ${maskEmail(SMTP_USER).padEnd(45)}│`);
    console.log("└────────────────────────────────────────────────────────┘");
} else {
    console.log("⚠️ [E-POSTA UYARISI]: RESEND_API_KEY veya SMTP tanımlanmamış.");
    console.log("   Şifre sıfırlama OTP kodları sunucu terminaline yazdırılacaktır.");
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

    // 1. ÖNCELİK: Resend HTTP REST API ile Gönderim
    if (resendClient) {
        try {
            const sender = RESEND_FROM || "The Nest <onboarding@resend.dev>";
            console.log(`🚀 [Resend] ${toEmail} adresine e-posta gönderiliyor (Gönderen: ${sender})...`);

            const { data, error } = await resendClient.emails.send({
                from: sender,
                to: [toEmail],
                subject,
                text,
                html,
            });

            if (error) {
                console.error("❌ [Resend API Hatası]:", error);
                console.log("╔══════════════════════════════════════════════════════╗");
                console.log("║ 🔑 [FALLBACK OTP KODU (Resend Hatası Nedeniyle)]     ║");
                console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
                console.log(`║ OTP  : ${otp.padEnd(46)}║`);
                console.log("╚══════════════════════════════════════════════════════╝");
                return { delivered: false, dev: true, error: error.message || String(error), otp };
            }

            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ ✅ [RESEND TESLİMATI BAŞARILI]                        ║");
            console.log(`║ Alıcı  : ${toEmail.padEnd(44)}║`);
            console.log(`║ Mail ID: ${(data?.id || "").padEnd(44)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");

            return { delivered: true, dev: false, messageId: data?.id };
        } catch (apiErr) {
            console.error("❌ [Resend İstek Hatası]:", apiErr.message);
            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ 🔑 [FALLBACK OTP KODU]                               ║");
            console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
            console.log(`║ OTP  : ${otp.padEnd(46)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");
            return { delivered: false, dev: true, error: apiErr.message, otp };
        }
    }

    // 2. İKİNCİ ÖNCELİK: SMTP Transporter (Eğer Resend yok ama SMTP varsa)
    if (smtpTransporter) {
        try {
            console.log(`📤 [SMTP] ${toEmail} adresine e-posta iletiliyor...`);
            const info = await smtpTransporter.sendMail({
                from: SMTP_FROM || SMTP_USER,
                to: toEmail,
                subject,
                text,
                html,
            });
            console.log(`✅ [SMTP] E-posta başarıyla iletildi. MessageId: ${info.messageId}`);
            return { delivered: true, dev: false, messageId: info.messageId };
        } catch (mailError) {
            console.error("❌ [SMTP Hatası]:", mailError.message);
            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ 🔑 [FALLBACK OTP KODU (SMTP Hatası)]                 ║");
            console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
            console.log(`║ OTP  : ${otp.padEnd(46)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");
            return { delivered: false, dev: true, error: mailError.message, otp };
        }
    }

    // 3. YEREL / GELİŞTİRME FALLBACK MODU (API veya SMTP tanımlı değilse)
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║ 📧 [DEV/LOCAL] ŞİFRE SIFIRLAMA OTP KODU ÜRETİLDİ     ║");
    console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
    console.log(`║ OTP  : ${otp.padEnd(46)}║`);
    console.log("║ Süre : 10 Dakika                                     ║");
    console.log("║ Not  : RESEND_API_KEY tanımlayarak canlıya alın.     ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    return { delivered: false, dev: true, otp };
}

module.exports = { sendOtpEmail, HAS_RESEND, HAS_SMTP };
