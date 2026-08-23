// =============================================================================
// server/src/app.js
// Express uygulaması: güvenlik katmanları ve statik dosya sunumu
// =============================================================================

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const { generalLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const passwordResetRoutes = require("./routes/passwordReset");
const profileRoutes = require("./routes/profile");
const adminRoutes = require("./routes/admin");

const app = express();

const isProduction = process.env.NODE_ENV === "production";

// Ters proxy arkasında (Render) doğru IP tespiti
app.set("trust proxy", 1);

// Güvenlik HTTP başlıkları (Statik dosyalar ve CDN'ler için esnetilmiş CSP)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "blob:"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"],
            },
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
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
            sameSite: "strict",
            secure: isProduction,
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

// Yüklenen avatarları statik servis et
app.use("/uploads", express.static(path.join(__dirname, "..", "..", "uploads")));

// Basit sağlık kontrolü
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// -----------------------------------------------------------------------------
// FRONTEND STATİK DOSYA SUNUMU (Cannot GET / Hatasını Çözen Kısım)
// -----------------------------------------------------------------------------
const rootDir = path.join(__dirname, "..", "..");

// Tüm ana dizin statik dosyalarını (HTML, CSS, JS, görseller) dışarı aç
app.use(express.static(rootDir));

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