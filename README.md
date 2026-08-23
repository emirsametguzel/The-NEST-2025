# The Nest 2025 — Proje Mimarisi & Geliştirici Rehberi

Bu doküman, **The Nest 2025** platformunun mimari yapısını, güvenlik mekanizmalarını, bağımsız Admin panelini, e-posta OTP akışını ve kurulum adımlarını detaylandırmaktadır.

---

## 🎯 Öne Çıkan Sistemler & Yenilikler

### 1. Bağımsız Özel Admin Paneli & Güvenlik (`/admin.html`)
- **Özel Giriş Ekranı:** `/admin.html` sayfası doğrudan ziyaret edildiğinde yetkisiz kullanıcılara veya üyelere dashboard gösterilmez; bağımsız ve özel bir Admin Giriş Formu açılır.
- **Sıkı Kimlik Doğrulama:** Yalnızca `emirsametguzel@gmail.com` ve şifresi `emir2011` olan süper yönetici oturum açabilir.
- **API Koruması:** Tüm `/api/admin/*` rotaları `requireAdmin` middleware katmanı ile oturum ve rol denetiminden geçer.
- **Dashboard Sekmeleri (Pop-up/Modal Yerine Sayfa İçi Formlar):**
  - 👥 **Kullanıcı Yönetimi:** Kullanıcı listesi, anlık rol değiştirme, dondurma/aktifleştirme, inline şifre sıfırlama paneli ve güvenli silme.
  - 📝 **İçerik & CMS Yönetimi:** Makale, Ders, Obje ve Duyuru ekleme/düzenleme; inline düzenleyici panel ve yayınlama durumu.
  - 📥 **Takım Başvuruları:** Web sitesinden gelen başvuruları inceleme, CV indirme, durum güncelleme (Beklemede, İnceleniyor, Kabul, Red).
  - ⚙️ **Site Ayarları:** Dinamik duyuru bandı metni ve aktiflik kontrolü.

---

### 2. Katlanabilir Accordion & İçerik Motoru
- **Pürüzsüz CSS & JS Geçişi:** `js/main.js` içindeki `initAccordions` motoru, dinamik `scrollHeight` hesaplaması ve `transitionend` desteğiyle takılmasız açılıp kapanma sağlar.
- **Yüksek Kontrast & Tipografi:** `css/pages.css` stilleriyle koyu renkli okunabilir metinler, net liste yapıları, rozetler ve dosya açma/indirme butonları kusursuz şekilde görüntülenir.
- **CMS Entegrasyonu:** Admin panelinden eklenen zengin içerikler kategorilerine göre ilgili eğitim, makale veya sunum sayfalarında otomatik listelenir.

---

### 3. E-Posta (OTP) & Şifre Sıfırlama Akışı
- **Nodemailer Entegrasyonu:** `server/src/utils/mailer.js` üzerinden HTML şablonlu 6 haneli OTP kodu gönderimi.
- **SMTP & Geliştirme Fallback'i:** `.env` dosyasında SMTP bilgileri tanımlandığında gerçek e-posta iletilir; tanımlı olmadığında geliştirici kolaylığı için OTP kodu sunucu terminaline ve yanıt yüküne güvenle loglanır.
- **Güvenlik & Brute-Force Koruması:** Tek kullanımlık kodlar veritabanında `sha256` ile hash'lenir, 10 dakika geçerlidir ve 5 hatalı denemede otomatik geçersiz sayılır.

---

### 4. Çok Dilli Yapı (i18n) & Dinamik Bileşenler
- **Modüler Header & Footer:** `partials/header.html` ve `partials/footer.html` dosyaları `js/components.js` tarafından tüm sayfalara tek merkezden enjekte edilir.
- **Dil Desteği:** `i18n/tr.json` ve `i18n/en.json` sözlükleri üzerinden Türkçe/İngilizce dil geçişi `localStorage` ile kalıcı olarak korunur.

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js:** v18.0.0 veya üzeri
- **npm:** v9.0.0 veya üzeri

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Ortam Değişkenlerini Tanımlayın
`.env.example` dosyasını `.env` olarak kopyalayın ve yapılandırın:
```bash
cp .env.example .env
```

Örnek `.env` içeriği:
```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=the_nest_super_secret_session_key_2025
ADMIN_EMAIL=emirsametguzel@gmail.com
ADMIN_PASSWORD=emir2011

# SMTP E-posta Ayarları (Opsiyonel - Tanımlı değilse OTP konsola yazdırılır)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=The Nest <noreply@the-nest.com.tr>
```

### 3. Veritabanını Başlatın (SQLite)
```bash
npm run init-db
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm start
```
Sunucu başlatıldığında `http://localhost:3000` adresinden hem statik sayfalar hem de API servis edilir.

---

## 📁 Proje Dizin Yapısı

```
/
├── admin.html               # Bağımsız Admin Paneli & Giriş Ekranı
├── index.html               # Ana Sayfa & Başvuru Formu
├── dersler.html             # Eğitimler & Accordion Ders İçerikleri
├── makaleler.html           # Makaleler & 3D Çevirmeli Kartlar
├── sunumlar.html            # Sunum ve Jüri Slaytları
├── objeler.html             # 3D Modeller & CAD Parçaları
├── login.html               # Üye Giriş Sayfası
├── register.html            # Üye Kayıt Sayfası
├── forgot-password.html     # Şifre Sıfırlama (OTP İsteme)
├── reset-password.html      # Şifre Yenileme Formu
├── profile.html             # Kullanıcı Profil Sayfası
│
├── css/
│   ├── admin.css            # Admin Dashboard & Bağımsız Login Stilleri
│   ├── pages.css            # Accordion, 3D Kartlar & Sayfa Stilleri
│   ├── global.css           # Global Tipografi & Renkler
│   └── auth.css             # Giriş/Kayıt/Şifre Sıfırlama Stilleri
│
├── js/
│   ├── admin.js             # Admin Dashboard & Tab Yönetimi Mantığı
│   ├── main.js              # Accordion, 3D Kart ve CMS Yükleme Mantığı
│   ├── auth.js              # Kullanıcı Oturum & Şifre Yenileme Mantığı
│   ├── components.js        # Header/Footer Bileşen Enjektörü
│   └── i18n.js              # Çok Dilli Sözlük Motoru
│
├── partials/
│   ├── header.html          # Global Üst Menü
│   └── footer.html          # Global Alt Menü
│
└── server/
    ├── src/
    │   ├── app.js           # Express Uygulama Yapılandırması
    │   ├── db.js            # SQLite Veritabanı Bağlantısı
    │   ├── middleware/      # CSRF, Auth, Rate Limiter Ara Katmanları
    │   ├── routes/          # Auth, Admin, Content, Başvuru API Rotaları
    │   └── utils/           # Nodemailer, OTP ve Doğrulayıcılar
    └── db/
        └── schema.sql       # SQLite Tablo Şemaları
```

---

## 🔒 Güvenlik Notları
- **Admin Giriş Bilgileri:** Yalnızca yetkili yönetici (`emirsametguzel@gmail.com`) oturum açabilir.
- **CSRF Koruması:** Tüm POST/PATCH/DELETE istekleri `X-CSRF-Token` başlığı ile doğrulanır.
- **Şifre Güvenliği:** Parolalar en az 12-tur `bcrypt` ile hash'lenerek saklanır.
- **XSS & SQL Injection:** Parametreli SQLite sorguları ve `helmet` güvenlik başlıkları ile tam koruma sağlanır.
