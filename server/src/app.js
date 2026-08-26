// =============================================================================
// server/src/app.js
// Express uygulaması: güvenlik katmanları ve statik dosya sunumu
// =============================================================================

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const multer = require("multer");

const db = require("./db");
const { generalLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const passwordResetRoutes = require("./routes/passwordReset");
const profileRoutes = require("./routes/profile");
const adminRoutes = require("./routes/admin");
const contentRoutes = require("./routes/content");

const app = express();

const isProduction = process.env.NODE_ENV === "production";

// Ters proxy arkasında (Render / Cloud Run) doğru IP tespiti
app.set("trust proxy", 1);

// Güvenlik HTTP başlıkları
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
        frameguard: false,
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Session Yönetimi
app.use(
    session({
        name: "nest.sid",
        secret: process.env.SESSION_SECRET || "default_development_session_secret_32_chars_long_key_the_nest",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 24, // 24 saat
        },
    })
);

// Tüm /api rotalarına genel rate limit
app.use("/api", generalLimiter);

// Firebase İstemci Yapılandırma Bilgisi
app.get("/api/config/firebase", (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDeeISJIL3SHLj35cJpvfTBWG5c0J3JQLE",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "the-nest-c38fc.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "the-nest-c38fc.firebasestorage.app",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "193072967668",
        appId: process.env.FIREBASE_APP_ID || "1:193072967668:web:89127b808338a81b5713a1",
        measurementId: "G-45M53EMXWV",
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", contentRoutes);

// Takım başvuru formu API'si (index.html ve apply.html formu için)
const uploadNone = multer().none();
const handleTeamApplication = async (req, res) => {
    const { name, class_name, email, phone, experience, department, tools, motivation } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ success: false, error: "İsim ve e-posta zorunludur." });
    }

    try {
        await db.createTeamApplication({
            name: name || "Anonim",
            class_name: class_name || "Lise",
            email,
            phone: phone || "—",
            experience: experience || "—",
            department: department || "Genel",
            tools: tools || "—",
            motivation: motivation || "Takıma katılmak istiyorum.",
        });
        console.log(`📝 Takım Başvurusu kaydedildi: ${name} (${email}) -> ${department}`);
        return res.json({
            success: true,
            message: "Başvurunuz başarıyla alındı! Ekibimiz en kısa sürede sizinle iletişime geçecektir.",
        });
    } catch (dbErr) {
        console.error("Takım başvurusu kayıt hatası:", dbErr);
        return res.json({
            success: true,
            message: "Başvurunuz alındı!",
        });
    }
};

app.post("/team_application.html", uploadNone, handleTeamApplication);
app.post("/api/team-application", uploadNone, handleTeamApplication);

// Yüklenen avatarları statik servis et
app.use("/uploads", express.static(path.join(__dirname, "..", "..", "uploads")));

// Basit sağlık kontrolü
app.get("/api/health", (req, res) => res.json({ status: "ok", database: "firestore" }));

// -----------------------------------------------------------------------------
// FRONTEND STATİK DOSYA SUNUMU
// -----------------------------------------------------------------------------
const rootDir = path.join(__dirname, "..", "..");

// Tüm ana dizin statik dosyalarını (HTML, CSS, JS, görseller) dışarı aç
app.use(express.static(rootDir));

// HTML uzantısız istekler için sayfa yönlendirmeleri
const htmlPages = [
    "admin",
    "apply",
    "dersler",
    "forgot-password",
    "login",
    "makaleler",
    "news",
    "objeler",
    "profile",
    "register",
    "reset-password",
    "sunumlar",
    "team",
    "team_application",
];

htmlPages.forEach((page) => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(rootDir, `${page}.html`));
    });
});

// Ana dizine (/) gelindiğinde index.html'i sun
app.get("/", (req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
});

// Merkezi hata yakalayıcı
app.use((err, req, res, next) => {
    console.error("Beklenmeyen hata:", err);
    res.status(500).json({ error: "Sunucu hatası." });
});

module.exports = app;
