// =============================================================================
// server/src/app.js
// Express uygulaması: güvenlik katmanları burada merkezi olarak kurulur.
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

// -----------------------------------------------------------------------------
// Ters proxy arkasında (Nginx vb.) doğru istemci IP'sini okumak için gerekli.
// Bu olmadan express-rate-limit tüm istekleri proxy'nin tek IP'sinden
// geliyormuş gibi görür ve tüm ziyaretçileri birlikte kilitleyebilir.
// -----------------------------------------------------------------------------
app.set("trust proxy", 1);

// -----------------------------------------------------------------------------
// Güvenlik HTTP başlıkları (XSS, clickjacking, MIME sniffing vb. azaltma)
// -----------------------------------------------------------------------------
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // Google Fonts ve mevcut sitenin kullandığı CDN'ler
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:"],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"],
            },
        },
        crossOriginResourcePolicy: { policy: "same-site" },
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// -----------------------------------------------------------------------------
// Session: httpOnly + SameSite=Strict + (üretimde) Secure cookie.
// JWT değil, sunucu taraflı session tercih edildi çünkü:
//   - Anında iptal edilebilir (şifre değişince / hesap askıya alınınca)
//   - Token boyutu/açık payload sorunları yok
//   - "Tüm cihazlardan çıkış yap" gibi işlemler trivial
// SQLite tabanlı store (connect-sqlite3) sayesinde sunucu yeniden başlasa
// bile oturumlar kaybolmaz (bellek-içi MemoryStore'un aksine).
// -----------------------------------------------------------------------------
app.use(
    session({
        store: new SQLiteStore({
            dir: path.join(__dirname, "..", "..", "data"),
            db: "sessions.sqlite",
        }),
        name: "nest.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "strict",
            secure: isProduction, // yalnızca HTTPS üzerinde Secure bayrağı (localhost HTTP'de false olmalı)
            maxAge: 1000 * 60 * 60 * 2, // 2 saat boşta kalma süresi
        },
    })
);

// Tüm /api rotalarına genel rate limit
app.use("/api", generalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);

// Yüklenen avatarları statik servis et
app.use("/uploads", express.static(path.join(__dirname, "..", "..", "uploads")));

// Basit sağlık kontrolü
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Merkezi hata yakalayıcı: beklenmeyen hatalarda ayrıntı sızdırmaz
app.use((err, req, res, next) => {
    console.error("Beklenmeyen hata:", err);
    res.status(500).json({ error: "Sunucu hatası." });
});

module.exports = app;
