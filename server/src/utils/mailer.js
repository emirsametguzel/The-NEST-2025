// =============================================================================
// server/src/utils/mailer.js
// Brevo (Sendinblue) HTTP API & Fallback E-Posta Gönderim Modülü
// Brevo v3 REST API (Port 443 HTTPS) kullanır, alan adı doğrulama zorunluluğu
// olmadan doğrudan Gmail/özel e-posta gönderici adresiyle sorunsuz çalışır.
// =============================================================================

const {
    BREVO_API_KEY,
    BREVO_FROM_EMAIL,
    BREVO_FROM_NAME,
    RESEND_API_KEY,
    RESEND_FROM,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
} = process.env;

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

const HAS_BREVO = Boolean(BREVO_API_KEY && BREVO_API_KEY.trim().length > 0);
const SENDER_EMAIL = (BREVO_FROM_EMAIL || "parolasifirlamanest@gmail.com").trim();
const SENDER_NAME = (BREVO_FROM_NAME || "The Nest").trim();

if (HAS_BREVO) {
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ 📬 [BREVO API] E-POSTA SERVİSİ AKTİF EDİLDİ            │");
    console.log(`│ API Key : ${maskSecret(BREVO_API_KEY).padEnd(45)}│`);
    console.log(`│ Gönderen: ${(SENDER_NAME + " <" + SENDER_EMAIL + ">").padEnd(45)}│`);
    console.log("│ İletişim: HTTPS Port 443 (api.brevo.com/v3/smtp/email) │");
    console.log("└────────────────────────────────────────────────────────┘");
} else {
    console.log("⚠️ [BREVO API]: BREVO_API_KEY tanımlanmamış.");
    console.log("   Şifre sıfırlama OTP kodları sunucu terminaline yazdırılacaktır.");
}

/**
 * Brevo HTTP API v3 üzerinden e-posta gönderir
 */
async function sendViaBrevo(toEmail, subject, text, html) {
    const endpoint = "https://api.brevo.com/v3/smtp/email";
    const apiKey = BREVO_API_KEY.trim();

    const payload = {
        sender: {
            name: SENDER_NAME,
            email: SENDER_EMAIL,
        },
        to: [
            {
                email: toEmail,
            },
        ],
        subject: subject,
        htmlContent: html,
        textContent: text,
    };

    console.log(`🚀 [Brevo API] ${toEmail} adresine e-posta gönderiliyor (Gönderici: ${SENDER_EMAIL})...`);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "accept": "application/json",
            "api-key": apiKey,
            "content-type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errMsg = responseData.message || responseData.error || `HTTP ${response.status} Hatası`;
        throw new Error(`Brevo API Hatası (${response.status}): ${errMsg}`);
    }

    return responseData; // { messageId: "<...>" }
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

    // 1. ÖNCELİK: Brevo HTTP REST API
    if (HAS_BREVO) {
        try {
            const data = await sendViaBrevo(toEmail, subject, text, html);

            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ ✅ [BREVO TESLİMATI BAŞARILI]                         ║");
            console.log(`║ Alıcı     : ${toEmail.padEnd(41)}║`);
            console.log(`║ MessageId : ${(data?.messageId || "Gönderildi").slice(0, 41).padEnd(41)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");

            return { delivered: true, dev: false, messageId: data?.messageId };
        } catch (err) {
            console.error("❌ [Brevo Gönderim Hatası]:", err.message);
            logFallbackOtp(toEmail, otp, "Brevo Hatası");
            return { delivered: false, dev: true, error: err.message, otp };
        }
    }

    // 2. YEREL / GELİŞTİRME FALLBACK MODU
    logFallbackOtp(toEmail, otp, "Yerel Geliştirme / Test Modu");
    return { delivered: false, dev: true, otp };
}

function logFallbackOtp(toEmail, otp, reason) {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║ 🔑 [OTP KODU] (${reason.slice(0, 30).padEnd(30)}) ║`);
    console.log(`║ Alıcı: ${toEmail.padEnd(46)}║`);
    console.log(`║ OTP  : ${otp.padEnd(46)}║`);
    console.log("║ Süre : 10 Dakika                                     ║");
    console.log("╚══════════════════════════════════════════════════════╝");
}

module.exports = {
    sendOtpEmail,
    sendOTP: sendOtpEmail,
    sendMail: sendOtpEmail,
    HAS_BREVO,
};
