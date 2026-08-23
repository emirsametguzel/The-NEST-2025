-- =============================================================================
-- The Nest — Kullanıcı Veritabanı Şeması (Node.js/Express backend için)
-- Mevcut projedeki sql/schema.sqlite.sql temel alınarak uyarlanmıştır;
-- alan adları (display_name, bio, avatar_path) korunmuştur ki profile.html
-- ve mevcut kullanıcı verisiyle uyumlu kalsın.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,

    -- ASLA düz metin şifre saklanmaz — yalnızca bcrypt hash'i (60 karakter, örn: $2b$12$...)
    password_hash   TEXT NOT NULL,

    display_name    TEXT,
    bio             TEXT,
    avatar_path     TEXT,

    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    -- Hesap bazlı brute-force koruması (IP bazlı katmana ek olarak)
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,

    created_at      TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);

-- IP + kullanıcı adı bazlı giriş denemesi kaydı (denetim + ek rate-limit katmanı)
CREATE TABLE IF NOT EXISTS login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier   TEXT,
    ip_address   TEXT NOT NULL,
    success      INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
    user_agent   TEXT,
    attempted_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_ip_time ON login_attempts (ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_attempts_id_time ON login_attempts (identifier, attempted_at);

-- Şifre sıfırlama OTP (tek kullanımlık doğrulama kodu) kayıtları.
-- OTP düz metin saklanmaz — sha256 hash'i tutulur (bkz. utils/otp.js).
CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash    TEXT NOT NULL,
    expires_at  TEXT NOT NULL,                          -- oluşturulmadan 10 dakika sonrası
    attempts    INTEGER NOT NULL DEFAULT 0,              -- yanlış OTP deneme sayacı (online brute-force'u sınırlar)
    used        INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id, expires_at);

-- =============================================================================
-- content_items: Makaleler, Dersler, Duyurular, Sunumlar, Objeler için tablo
-- =============================================================================
CREATE TABLE IF NOT EXISTS content_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL CHECK (type IN ('makale', 'ders', 'duyuru', 'sunum', 'obje', 'haber')),
    category     TEXT DEFAULT 'Mekanik',
    title        TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    summary      TEXT,
    body         TEXT,
    image_url    TEXT,
    file_url     TEXT,
    author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
    created_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_content_type ON content_items (type, created_at);
CREATE INDEX IF NOT EXISTS idx_content_cat  ON content_items (category);

-- =============================================================================
-- team_applications: Takım başvuru formları tablosu
-- =============================================================================
CREATE TABLE IF NOT EXISTS team_applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    class_name   TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT NOT NULL,
    experience   TEXT,
    department   TEXT NOT NULL,
    tools        TEXT,
    motivation   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_team_app_status ON team_applications (status, created_at);

-- =============================================================================
-- site_settings: Dinamik site ve duyuru ayarları
-- =============================================================================
CREATE TABLE IF NOT EXISTS site_settings (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,
    updated_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- sessions tablosu connect-sqlite3 store'u tarafından otomatik oluşturulur (referans amaçlı):
-- CREATE TABLE sessions (sid TEXT PRIMARY KEY, expired INTEGER NOT NULL, sess TEXT NOT NULL);

-- =============================================================================
-- PostgreSQL / MySQL taşıma notu: AUTOINCREMENT -> SERIAL / AUTO_INCREMENT,
-- STRFTIME(...) -> now() / NOW(), CHECK(...IN(0,1)) -> BOOLEAN. Şema mantığı
-- aynı kalır; yalnızca server/src/db.js içindeki sürücü değişir.
-- =============================================================================
