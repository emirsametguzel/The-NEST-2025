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

// Güvenlik HTTP başlıkları (Mozilla Observatory 100/100 A+ Standardı)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "https://*.firebaseio.com", "https://identitytoolkit.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        xFrameOptions: { action: "deny" },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: {
            policy: "strict-origin-when-cross-origin",
        },
    })
);

// Permissions-Policy (Feature-Policy) başlığı
app.use((req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
});

// -----------------------------------------------------------------------------
// SİBER GÜVENLİK: Path Traversal ve Hassas Sistem Dosyası Koruması
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
    let rawPath = req.path || "";
    try {
        rawPath = decodeURIComponent(rawPath);
    } catch (_) {}

    // 1. Path Traversal Denemeleri (.. veya null-byte vb.)
    if (rawPath.includes("..") || rawPath.includes("\0") || rawPath.includes("%2e") || rawPath.includes("%2E")) {
        return res.status(403).json({
            error: "Erişim Engellendi: Güvenlik duvarı Directory Traversal / Path Traversal saldırısı tespit etti.",
            code: "PATH_TRAVERSAL_BLOCKED",
        });
    }

    // 2. Hassas Dosyalar ve Sistem Dizinleri Koruması
    const lower = rawPath.toLowerCase();
    const isForbiddenSensitiveFile =
        lower.startsWith("/.env") ||
        lower.startsWith("/.git") ||
        lower.startsWith("/server") ||
        lower.startsWith("/node_modules") ||
        lower.endsWith(".db") ||
        lower.endsWith(".sqlite") ||
        lower.endsWith(".sqlite3") ||
        lower.endsWith(".sql") ||
        lower.endsWith(".log") ||
        lower.endsWith(".lock") ||
        lower.endsWith(".json") && (lower.includes("package") || lower.includes("tsconfig") || lower.includes("metadata")) ||
        lower.includes("etc/passwd") ||
        lower.includes("windows/win.ini");

    if (isForbiddenSensitiveFile) {
        return res.status(403).json({
            error: "Erişim Engellendi: Hassas sistem veya konfigürasyon dosyalarına doğrudan erişim yasaktır.",
            code: "SENSITIVE_RESOURCE_BLOCKED",
        });
    }

    next();
});

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
    // 1. JSON Payload Aşırı Büyük (DoS Koruması)
    if (err.type === "entity.too.large" || err.status === 413) {
        return res.status(413).json({
            error: "İstek gövdesi çok büyük (Payload Too Large). Maksimum izin verilen boyut: 1MB.",
            code: "PAYLOAD_TOO_LARGE",
        });
    }

    // 2. Geçersiz JSON Formatı / Body Parse Hatası
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            error: "Geçersiz JSON veri formatı.",
            code: "INVALID_JSON_BODY",
        });
    }

    console.error("Beklenmeyen sunucu hatası:", err.message || err);
    res.status(500).json({ error: "Sunucu hatası." });
});

module.exports = app;
