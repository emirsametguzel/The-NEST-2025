// =============================================================================
// server/src/app.js
// Express uygulaması: güvenlik katmanları ve statik dosya sunumu
// =============================================================================

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const multer = require("multer");

const { generalLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const passwordResetRoutes = require("./routes/passwordReset");
const profileRoutes = require("./routes/profile");
const adminRoutes = require("./routes/admin");

const app = express();

const isProduction = process.env.NODE_ENV === "production";

// Ters proxy arkasında (Render / Cloud Run) doğru IP tespiti
app.set("trust proxy", 1);

// Güvenlik HTTP başlıkları (Statik dosyalar ve CDN'ler için esnetilmiş CSP, iframe uyumlu)
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
        store: new SQLiteStore({
            dir: path.join(__dirname, "..", "..", "data"),
            db: "sessions.sqlite",
        }),
        name: "nest.sid",
        secret: process.env.SESSION_SECRET || "default_secret_key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 2, // 2 saat
        },
    })
);

// Tüm /api rotalarına genel rate limit
app.use("/api", generalLimiter);

// API Rotaları (v4 Rotaları Dahil)
app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);

// Takım başvuru formu API'si (index.html formu için)
const uploadNone = multer().none();
const handleTeamApplication = (req, res) => {
    const { name, department, email } = req.body || {};
    console.log(`Takım Başvurusu alındı: ${name} (${email}) -> ${department}`);
    return res.json({
        success: true,
        message: "Başvurunuz başarıyla alındı! Ekibimiz en kısa sürede sizinle iletişime geçecektir.",
    });
};
app.post("/team_application.html", uploadNone, handleTeamApplication);
app.post("/api/team-application", uploadNone, handleTeamApplication);

// Yüklenen avatarları statik servis et
app.use("/uploads", express.static(path.join(__dirname, "..", "..", "uploads")));

// Basit sağlık kontrolü
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

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