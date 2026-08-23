# The Nest — Refactor Sonrası Proje Rehberi

Bu doküman, code review geri bildirimlerine göre yapılan refactor'ü ve projeyi
nasıl çalıştırıp deploy edeceğinizi anlatır.
---

## 1) Header & Footer — Artık Dinamik ve Tek Kaynaklı

**Sorun neydi:** Her sayfada header/footer elle kopyalanmıştı.
`sunumlar.html`'de footer tamamen eksikti, `team.html`'de nav class'ı bozuktu
(`"nav-a-00 , navbar"`), footer'daki Instagram/LinkedIn/YouTube linkleri
hepsi `href="#"` idi, ve her sayfanın sonunda **`</body>` etiketinden SONRA**
duran, bozuk, tekrarlanan bir dil-değiştirme `<script>` bloğu vardı (geçersiz
HTML — tarayıcı sessizce tolere ediyordu ama bakımı imkansızdı).

**Çözüm:**
- `partials/header.html` ve `partials/footer.html` artık **tek kaynak**.
- `js/components.js`, sayfa yüklenince bu partial'ları `fetch` ile çekip
  `<div id="app-header" data-component="header"></div>` /
  `<div id="app-footer" data-component="footer"></div>` yer tutucularının
  yerine enjekte ediyor.
- Footer'daki sosyal medya linkleri gerçek hesaplara bağlandı (Instagram,
  LinkedIn, YouTube — @7611amalhawks).
- 9 sayfanın hepsindeki bozuk/eksik/tekrarlı nav-footer kodu ve `</body>`
  sonrasındaki geçersiz script blokları temizlendi.

**Bundan sonra header/footer'da bir şey değiştirmek isterseniz** yalnızca
`partials/header.html` veya `partials/footer.html`'i düzenlemeniz yeterli —
9 sayfanın hepsine otomatik yansır.

## 2) Responsive Düzeltmeleri

- CSS genelinde tarandı: çoğu `px` kullanımı (ikon boyutları, kenarlık
  kalınlıkları, toggle switch'in 5px'lik iç noktası) zaten UI mikro-detayı,
  responsive'i bozmuyor — bunlara dokunulmadı.
- **Gerçek sorun bulundu:** `css/pages.css` içindeki sidebar navigasyon
  bileşeni (`makaleler.html`, `dersler.html`, `objeler.html`'de kullanılıyor
  — orijinali bir CodePen demosundan alınmış) `position: fixed; width: 256px`
  ile sabitlenmişti ve **hiçbir mobil/tablet küçültmesi yoktu**. 375px'lik bir
  telefon ekranında bu sidebar genişliğin %68'ini kaplıyordu.
  → `css/mobile.css` sonuna `@media (max-width:500px)` bloğu eklenerek
  sidebar genişliği mobilde 200px'e (masaüstünde 256px), daraltılmış hali de
  60px'e indirildi ve ana içerik boşluğu buna göre otomatik ayarlandı.
- Kalan `position:absolute` kullanımları (dropdown menü, footer bullet
  noktaları, toggle switch topuzu) `%`/`vh`/`vw` veya `0` offsetleriyle zaten
  responsive; bunlar UI standardı, "hardcoded konumlandırma" hatası değil.

## 3) Kimlik Doğrulama — PHP'den Node.js/Express'e Geçiş

Legacy `login.php`, `register.php`, `profile.php`, `logout.php`,
`lib/*.php`, `config/`, `sql/` **tamamen silindi**. Yerine `server/`
klasöründe tam bir Node.js/Express backend'i geldi.

### Neden bcrypt (Argon2id değil)?
İkisi de kabul edilebilir; bcrypt'i seçtim çünkü Node ekosisteminde daha
yaygın test edilmiş, native binding'i olgun ve deploy sorunsuz. İsterseniz
`argon2` paketiyle değiştirmek tek dosyada (`server/src/routes/auth.js`)
birkaç satırlık bir iş.

### Neden JWT değil, session?
JWT'nin en büyük zayıflığı **iptal edilememesi** — şifre değiştirilse veya
hesap askıya alınsa bile token süresi dolana kadar geçerli kalır. Sunucu
taraflı session (SQLite store ile kalıcı) anında iptal edilebilir ve
"tüm cihazlardan çıkış" gibi işlemler trivial.

### Güvenlik katmanları (hepsi `server/src/`)
| Katman | Dosya | Ne yapıyor |
|---|---|---|
| Şifre hash | `routes/auth.js` | bcrypt, 12 round |
| SQL Injection | `db.js` + tüm route'lar | better-sqlite3 parametreli sorgular |
| XSS | `utils/validators.js` | `.escape()` ile girdi temizleme + `helmet` CSP header'ları |
| CSRF | `middleware/csrf.js` | Senkronize token deseni (session'a bağlı, header ile doğrulanan) |
| Brute-force (IP) | `middleware/rateLimiter.js` | 15 dakikada 5 giriş denemesi/IP |
| Brute-force (hesap) | `routes/auth.js` | 5 başarısız denemede hesap 15 dk kilitlenir |
| Session cookie | `app.js` | `httpOnly`, `SameSite=Strict`, üretimde `Secure` |
| Session fixation | `routes/auth.js` | Girişte `session.regenerate()` |
| Timing attack | `routes/auth.js` | Kullanıcı bulunamasa bile sahte bcrypt karşılaştırması |

### Veritabanı şeması
`server/db/schema.sql` — `users` (id, username, email, password_hash,
display_name, bio, avatar_path, role, is_active, failed_attempts,
locked_until, created_at, updated_at, last_login_at) ve `login_attempts`
tabloları. PostgreSQL'e taşıma notları dosyanın sonunda.

### API Uç Noktaları
```
GET  /api/auth/csrf-token   CSRF token al
POST /api/auth/register     Kayıt ol
POST /api/auth/login        Giriş yap
POST /api/auth/logout       Çıkış yap
GET  /api/auth/me           Oturum durumu (frontend header'daki login/profil ikonunu bunun sonucuna göre değiştirir)
POST /api/auth/forgot-password  Şifre sıfırlama OTP'si iste (bkz. aşağıdaki bölüm)
POST /api/auth/reset-password   OTP ile yeni şifre belirle
PATCH /api/profile          Görünen ad / bio güncelle
POST /api/profile/avatar    Avatar yükle (JPEG/PNG/WebP, 2MB, sharp ile 512px'e küçültülür)
```

### Hesap Kilitleme Kaldırıldı (ürün kararı)
`POST /api/auth/login`'de hatalı şifrede artık **hiçbir kilitleme mekanizması
yok** — ne hesap bazlı (`failed_attempts`/`locked_until`), ne de login'e özel
IP rate limiti. Her hatalı denemede yalnızca genel bir
`"E-posta veya şifre hatalı."` mesajı döner, kaç deneme yapıldığına
bakılmaksızın. `users` tablosundaki `failed_attempts`/`locked_until`
kolonları şemada duruyor (geriye dönük uyumluluk için silinmedi) ama artık
hiçbir yerde okunup yazılmıyor.

**Bilinen trade-off:** Bu, çevrimiçi brute-force (parola tahmin) saldırılarına
karşı korumayı zayıflatır. İleride istenirse CAPTCHA (örn. hCaptcha) veya
daha hafif bir IP bazlı gecikme eklenebilir — şu an bilinçli olarak yok.

### Şifremi Unuttum / Şifre Sıfırlama (OTP)
- `forgot-password.html` → e-posta girilir → `POST /api/auth/forgot-password`
  → kullanıcı bulunursa 6 haneli bir OTP üretilip `password_resets`
  tablosuna **sha256 hash'i** olarak (düz metin değil) 10 dakika geçerlilikle
  kaydedilir, `server/src/utils/mailer.js` üzerinden e-postayla gönderilir.
- **Kullanıcı var/yok fark etmeksizin aynı genel mesaj döner** ("Bu e-posta
  kayıtlıysa, doğrulama kodu gönderildi.") — e-posta keşfi (enumeration)
  engellenir.
- `reset-password.html` → e-posta + OTP + yeni şifre girilir →
  `POST /api/auth/reset-password` → OTP doğrulanır (yanlış OTP'de deneme
  sayacı artar, 5 yanlış denemeden sonra o OTP tamamen geçersiz sayılır —
  bu, madde 1'de kaldırılan login-kilidinden farklı, düşük-entropili
  6 haneli kodun çevrimiçi brute-force'una karşı ayrı bir koruma), doğruysa
  şifre bcrypt ile yeniden hash'lenip güncellenir, OTP tek kullanımlık
  olduğu için `used=1` işaretlenir.
- **SMTP tanımlı değilse (`.env`'de `SMTP_HOST` boş):** e-posta gerçekten
  gönderilmez, OTP kodu yalnızca sunucu terminaline yazdırılır
  (`server/src/utils/mailer.js` → `sendOtpEmail`). Geliştirme ortamında SMTP
  kurmadan test edebilmek için tasarlandı. Gerçek gönderim için `.env`'e
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` girin
  (örn. Gmail SMTP, SendGrid, Mailgun vb.).

### Frontend entegrasyonu
- `login.html`, `register.html`, `profile.html`, `forgot-password.html`,
  `reset-password.html` — gerçek sayfalar.
- `js/auth.js` — bu sayfalardaki formları `fetch` ile API'ye bağlar, CSRF
  token akışını yönetir.
- `js/main.js` — header'daki giriş ikonu artık `localStorage`'a değil,
  gerçek `/api/auth/me` sonucuna bakıyor (eskiden `localStorage.isLoggedIn`
  gibi istemci tarafında taklit edilebilir bir bayrak kullanılıyordu — bu
  güvenlik açığı da kapatıldı).

## 4) Çoklu Dil Desteği (i18n) — Tamamen Yeniden Yazıldı

**Sorun neydi:** `team.html`, `dersler.html`, `objeler.html` gibi sayfaların
`</body>` etiketinden SONRA (geçersiz HTML) duran, ID'leri elle
`document.getElementById(...).innerHTML = '...'` ile değiştiren, kopya-yapıştır
kırık bir script vardı. Yazım hataları içeriyordu (`"linkdIn"`), yalnızca
belirli sayfalarda çalışıyordu, sayfa geçişinde dil sıfırlanıyordu.

**Yeni sistem:**
- `i18n/tr.json`, `i18n/en.json` — anahtar/değer sözlükleri.
- `js/i18n.js` — HTML'de `data-i18n="anahtar"` / `data-i18n-placeholder="anahtar"`
  ile işaretlenmiş elemanları bulup sözlükten dolduran motor.
- Seçilen dil `localStorage`'da saklanır → **sayfa geçişinde kalıcı**.
- Header/footer partial olduğu için nav/footer çevirileri artık **her
  sayfada** otomatik çalışıyor (eskiden yalnızca index.html'de çalışıyordu).
- `index.html`'deki form/hero içeriği de `data-i18n` ile işaretlendi.
- Diğer alt sayfaların (team/news/dersler vb.) gövde içerikleri şu an
  yalnızca Türkçe — bunlara `data-i18n` eklemek, her biri için ayrı sözlük
  anahtarı yazmayı gerektiren bir sonraki adım (istenirse yapılabilir).

## 5) Modüler JS Mimarisi

Tam bir React/SPA dönüşümü ayrı, büyük bir proje olurdu (build aracı,
routing, state yönetimi gerektirir). Bunun yerine **framework'süz, build
aracı gerektirmeyen modüler bir yapı** kuruldu:

- `js/components.js` — header/footer'ı fetch edip enjekte eden yükleyici
  (native Web Components mantığına yakın, bağımlılıksız).
- `js/i18n.js`, `js/auth.js`, `js/main.js` — her biri tek sorumluluk,
  birbirinden bağımsız, olay tabanlı (`nest:partials-loaded` custom event)
  haberleşiyor.
- Bu yapı sayesinde artık **kod tekrarı yok**: header/footer'ı değiştirmek
  için 9 dosya yerine 1 dosya düzenleniyor.

**Not:** Gerçek bir React geçişi istenirse, bu modüler JS yapısı zaten
component sınırlarını netleştirdiği için geçiş nispeten kolay olur (her
partial bir React component'ine, her `js/*.js` dosyası bir hook/modüle
karşılık gelir) — ayrı bir görev olarak ele alınmalı.

---

## 6) Admin Paneli (Aşama 4)

### Yetkilendirme
`server/src/middleware/requireAuth.js` içindeki `requireAdmin` middleware'i
`req.session.role !== 'admin'` ise 403 döner. **Önemli:** rol bilgisi
session'da tutulur, DB'de değişse bile kullanıcı tekrar giriş yapana kadar
session'daki eski rol geçerli kalır (test ederken bunu göz önünde bulundurun
— bir kullanıcıyı admin yaptıktan sonra o kullanıcının çıkış/giriş yapması
gerekir).

Tüm `/api/admin/*` rotaları `server/src/routes/admin.js` içinde tek bir
router altında `router.use(requireAdmin)` ile toplu korunur — her rotaya
ayrı ayrı middleware eklemeye gerek yok.

### API Uç Noktaları
```
GET    /api/admin/users              Tüm kullanıcıları listele
PATCH  /api/admin/users/:id/role     Rol güncelle ({ role: "member"|"admin" })
DELETE /api/admin/users/:id          Kullanıcı sil

GET    /api/admin/content            İçerikleri listele (?type=makale|ders|duyuru)
POST   /api/admin/content            Yeni içerik oluştur
PATCH  /api/admin/content/:id        İçerik güncelle (gönderilmeyen alanlar korunur)
DELETE /api/admin/content/:id        İçerik sil
```

### Self-Protection Kuralları
- Bir admin **kendi rolünü** değiştiremez (400) — yanlışlıkla kendini
  sistemden düşürmesini önler.
- Bir admin **kendi hesabını** panelden silemez (400).
- Bir kullanıcı silindiğinde, o kullanıcının yazdığı içerikler **silinmez**;
  `author_id` alanı `NULL`'a döner (`ON DELETE SET NULL`), içerik kalıcı olarak korunur.

### İçerik Modeli
`content_items` tablosu — makale/ders/duyuru tek bir tabloda `type`
alanıyla ayrıştırılır (üç ayrı şema yerine tek CRUD seti). Başlıktan
otomatik, benzersiz bir `slug` üretilir (Türkçe karakterler dönüştürülür,
çakışma varsa `-2`, `-3`... eklenir).

**Not:** Bu aşamada yalnızca admin panelinin CRUD'u kuruldu; içeriklerin
`makaleler.html`/`dersler.html` gibi genel (public) sayfalarda otomatik
listelenmesi kapsam dışıdır — o sayfalar hâlâ statik HTML. İstenirse ayrı
bir adımda bu içerikleri public sayfalara bağlayan bir "içerik render"
katmanı eklenebilir.

### Arayüz
- `admin.html` + `js/admin.js` + `css/admin.css` — sekmeli (Kullanıcılar /
  İçerikler) tek sayfalık panel. Giriş anında `/api/auth/me` ile admin
  kontrolü yapılır, admin değilse anasayfaya yönlendirilir.
- Kullanıcı tablosunda rol, bir `<select>` ile anında (sayfa yenilenmeden)
  değiştirilebilir; silme işlemleri `confirm()` ile onay ister.
- İçerik ekleme/düzenleme bir modal form üzerinden yapılır.
- Dar ekranlarda (≤700px) tablolar otomatik kart görünümüne döner
  (`css/admin.css` içindeki responsive blok).
- Header'daki "Admin Paneli" ikonu (`partials/header.html` → `#admin-link`)
  yalnızca `role === 'admin'` olan kullanıcılara `js/main.js` tarafından
  gösterilir; diğerlerinde `hidden` kalır.

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
Node.js 18+ (better-sqlite3 ve sharp native modülleri için).

### 1. Backend'i kur
```bash
cd server
npm install
cp .env.example .env
```

`.env` dosyasını açıp `SESSION_SECRET`'i rastgele bir değerle doldurun:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Çıktıyı `.env` içindeki `SESSION_SECRET=` satırına yapıştırın.

### 2. Veritabanını oluştur
```bash
npm run init-db
```

### 3. Sunucuyu başlat
```bash
npm start
```
API `http://localhost:3000` üzerinde çalışır.

### 4. Statik siteyi servis et
Geliştirme sırasında proje kökünde basit bir statik sunucu:
```bash
cd ..   # proje kökü (server/ değil)
python3 -m http.server 8080
```
Tarayıcıda `http://localhost:8080` açın. `login.html`/`register.html`
formları `fetch('api/...')` çağırdığı için, **API ve statik site farklı
portlarda çalışırken tarayıcı CORS hatası verecektir** — bu geliştirme
kurulumunda normal. Üretimde (aşağıya bakın) ikisi aynı domain altında
birleştirileceği için bu sorun olmaz.

### 5. Üretim (production) deployment

**Önerilen mimari:** Nginx, statik dosyaları (`index.html`, `css/`, `js/`
vb.) doğrudan servis eder; `/api/` ile başlayan istekleri Node.js
sürecine (port 3000, `pm2` veya `systemd` ile arka planda çalışan)
reverse proxy yapar. Böylece hem statik site hem API **aynı domain**
altında görünür, CORS'a hiç gerek kalmaz, cookie'ler sorunsuz çalışır.

Örnek Nginx bloğu:
```nginx
server {
    listen 443 ssl;
    server_name the-nest.com.tr;

    root /var/www/the-nest;   # statik dosyaların bulunduğu proje kökü
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Node sürecini kalıcı çalıştırmak için:
```bash
cd server
npm install --production
npm install -g pm2
NODE_ENV=production pm2 start server.js --name the-nest-api
pm2 save
pm2 startup
```

`.env` dosyasında `NODE_ENV=production` yapmayı unutmayın — bu, session
cookie'sinin `Secure` bayrağını otomatik açar (yalnızca HTTPS üzerinden
gönderilir).

**Önemli:** InfinityFree gibi paylaşımlı, yalnızca-PHP hosting'ler Node.js
süreçlerini çalıştıramaz. Bu backend için Node destekleyen bir sunucu
gerekir (örn. bir VPS — DigitalOcean/Hetzner, veya Render/Railway gibi
Node destekli PaaS'lar).

---

## 📁 Değişen/Eklenen Dosyalar Özeti

```
server/                     🆕 Tüm backend (Node.js/Express)
i18n/tr.json, en.json        🆕 Çeviri sözlükleri
partials/header.html, footer.html   🆕 Tek kaynak header/footer
js/components.js             🆕 Partial yükleyici
js/i18n.js                    🆕 i18n motoru
js/auth.js                    🆕 Login/register/profil frontend mantığı
js/main.js                    ✏️ localStorage kontrolü kaldırıldı, gerçek API'ye bağlandı
js/translate.js               ❌ silindi (js/i18n.js ile değiştirildi)
login.html, register.html      🆕 Gerçek giriş/kayıt sayfaları
profile.html                   ✏️ Artık gerçek profil verisi gösteriyor (yönlendirme placeholder'ı değil)
index.html + 8 alt sayfa        ✏️ partial sistemine geçirildi, kırık inline script'ler temizlendi
css/mobile.css                  ✏️ Sidebar responsive düzeltmesi eklendi
login.php, register.php, profile.php, logout.php, lib/, config/, sql/, router.php, api/, scripts/   ❌ silindi
```
