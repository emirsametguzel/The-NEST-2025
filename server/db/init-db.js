// =============================================================================
// server/db/init-db.js
// Veritabanı dosyasını ve tablolarını schema.sql'den oluşturur.
// Çalıştırmak için: npm run init-db  (package.json script'i çağırır)
// =============================================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "the-nest.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function initDatabase() {
    // data/ klasörü yoksa oluştur
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = OFF");

    // content_items tablosunu yeni şema ile güncelle (CHECK kısıtlamalarını genişletmek için)
    try {
        const tableCheck = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content_items'").get();
        if (tableCheck && (!tableCheck.sql.includes('sunum') || !tableCheck.sql.includes('category'))) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS content_items_v2 (
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
                INSERT OR IGNORE INTO content_items_v2 (id, type, title, slug, summary, body, author_id, is_published, created_at, updated_at)
                SELECT id, type, title, slug, summary, body, author_id, is_published, created_at, updated_at FROM content_items;
                DROP TABLE content_items;
                ALTER TABLE content_items_v2 RENAME TO content_items;
            `);
        }
    } catch (_) {}

    db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema);

    // Admin kullanıcısını oluştur veya güncelle (emirsametguzel@gmail.com / emir2011)
    const adminPassHash = bcrypt.hashSync("emir2011", 12);
    const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get("emirsametguzel@gmail.com");
    if (existingAdmin) {
        db.prepare(
            `UPDATE users SET username = 'emirsametguzel', password_hash = ?, display_name = 'Emir Samet Güzel', role = 'admin', is_active = 1 WHERE id = ?`
        ).run(adminPassHash, existingAdmin.id);
        console.log("👤 Yönetici kullanıcısı güncellendi: emirsametguzel@gmail.com (rol: admin)");
    } else {
        db.prepare(
            `INSERT INTO users (username, email, password_hash, display_name, role, is_active)
             VALUES ('emirsametguzel', 'emirsametguzel@gmail.com', ?, 'Emir Samet Güzel', 'admin', 1)`
        ).run(adminPassHash);
        console.log("👤 Özel yönetici hesabı oluşturuldu: emirsametguzel@gmail.com (şifre: emir2011)");
    }

    // Site varsayılan ayarlarını oluştur
    const defaultSettings = [
        { key: "site_title", value: "The Nest | FRC & STEAM Topluluk Platformu" },
        { key: "announcement_banner", value: "7611 Amal Hawks yeni sezon takım alımları devam ediyor! Hemen başvurun." },
        { key: "announcement_active", value: "1" },
        { key: "contact_email", value: "amalhawksrobotics@gmail.com" },
        { key: "applications_open", value: "1" },
        { key: "footer_text", value: "The Nest, STEAM toplulukları için açık kaynaklı eğitim ve paylaşım merkezidir." }
    ];
    const insertSetting = db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)");
    for (const setting of defaultSettings) {
        insertSetting.run(setting.key, setting.value);
    }

    // Başlangıç içeriklerini ekle (eğer boşsa)
    const contentCount = db.prepare("SELECT COUNT(*) as count FROM content_items").get().count;
    if (contentCount === 0) {
        const insertContent = db.prepare(`
            INSERT INTO content_items (type, category, title, slug, summary, body, image_url, file_url, is_published)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        const initialContent = [
            // EĞİTİMLER (DERSLER)
            {
                type: "ders",
                category: "Mekanik",
                title: "Robotik Şase Tasarımı ve Güç Aktarım Sistemleri",
                slug: "robotik-sase-tasarimi-ve-guc-aktarim-sistemleri",
                summary: "FRC robotlarında Tank Drive, Swerve Drive ve Mecanum şaselerin karşılaştırılması, dişli oranı hesaplamaları ve ağırlık merkezi optimizasyonu.",
                body: "Bu eğitimde FRC robot şaselerinin mekanik hesaplamaları, motor tork analizi, planet dişli kutuları ve zincir/kayış gergi mekanizmaları adım adım incelenmektedir. Tasarımda alüminyum profil seçimi, CNC router kesimleri ve rijitlik kriterleri örnek CAD çizimleriyle aktarılır.",
                image_url: "images/first.jpg",
                file_url: "assets/pdf/makale1.pdf"
            },
            {
                type: "ders",
                category: "Yazılım",
                title: "WPILib ve Command-Based Robot Mimarisi",
                slug: "wpilib-ve-command-based-robot-mimarisi",
                summary: "Java ve C++ ile modern FRC robot yazılımı, alt sistemler (Subsystems), komutlar (Commands) ve Trigger tabanlı kontrol.",
                body: "Command-Based programlama modeli ile robot bileşenlerini modüler hale getirin. PID kontrolleri, Trajectory Generator (Yol Planlama), PathPlanner entegrasyonu ve AutoBuilder ile otonom dönemde 15 saniyelik kusursuz rutinler hazırlayın.",
                image_url: "images/yazilim.jpg",
                file_url: "assets/pdf/makale2.pdf"
            },
            {
                type: "ders",
                category: "Sunum Becerileri",
                title: "FIRST Impact (Chairman's) Ödülü ve Jüri Sunumu Stratejileri",
                slug: "first-impact-odulu-ve-juri-sunumu-stratejileri",
                summary: "Jüri odasında etkileyici konuşma, STEAM etki raporu hazırlama ve video sunum teknikleri.",
                body: "Impact Award jürisine takımınızın toplumdaki etkisini, STEAM yaygınlaştırma projelerini ve sürdürülebilirlik vizyonunu 7 dakikalık sunum ve 5 dakikalık soru-cevap seansında en etkili şekilde aktarma yöntemleri.",
                image_url: "images/placeholders/sunum-thumb-placeholder.svg",
                file_url: "assets/pdf/makale3.pdf"
            },
            {
                type: "ders",
                category: "Tasarım",
                title: "SolidWorks & Onshape ile Parametrik Robot Modelleme",
                slug: "solidworks-ve-onshape-ile-parametrik-robot-modelleme",
                summary: "Parametrik parça tasarımı, FeatureScript kullanımı ve 3D yazıcı üretim toleransları.",
                body: "Hızlı prototipleme, lazer kesim toleransları (kerf payı), sac büküm hesaplamaları ve FDM 3D baskı parçalarının mukavemet yönelimleri (infill & wall thickness) detaylandırılmıştır.",
                image_url: "images/mk/4.jpg",
                file_url: "assets/pdf/makale4.pdf"
            },
            {
                type: "ders",
                category: "Sponsorluk",
                title: "Kurumsal Sponsorluk Dosyası Hazırlama ve Bütçe Yönetimi",
                slug: "kurumsal-sponsorluk-dosyasi-hazirlama-ve-butce-yonetimi",
                summary: "Şirketlerle profesyonel iletişim, sponsor paketleri (Platin, Altın, Gümüş) ve bütçe planlaması.",
                body: "FRC takımlarının malzeme tedariği, seyahat giderleri ve yarışma kayıt ücretlerini karşılamak amacıyla kurumsal firmalara sunulacak etkili sponsorluk sunumu hazırlama rehberi.",
                image_url: "images/mk/5.jpg",
                file_url: "assets/pdf/makale5.pdf"
            },
            {
                type: "ders",
                category: "Elektronik",
                title: "FRC Kontrol Sistemi: RoboRIO, PDP/PDH ve CAN Bus Ağı",
                slug: "frc-kontrol-sistemi-roborio-pdp-can-bus",
                summary: "Robot kablolaması, sigorta yerleşimi, CAN kablolama topolojisi ve güvenlik anahtarı standartları.",
                body: "Power Distribution Hub (PDH), Radio Power Module (RPM), Talon FX / Spark Max motor sürücülerinin CAN Bus hattı üzerinden konfigürasyonu ve elektriksel gürültü filtreleme teknikleri.",
                image_url: "images/mk/1.jpg",
                file_url: "assets/pdf/makale1.pdf"
            },
            {
                type: "ders",
                category: "FRC",
                title: "Yarışma Stratejisi, Scouting ve İttifak Seçimi",
                slug: "yarisma-stratejisi-scouting-ve-ittifak-secimi",
                summary: "Veriye dayalı maç analizi, QR kodlu scouting sistemleri ve Playoff stratejisi.",
                body: "Saha analizi, robot döngü süreleri (cycle time) ölçümü ve Tableau / Python veri analitiği ile play-off aşamasında en uyumlu ittifak partnerlerini belirleme taktikleri.",
                image_url: "images/frc-comp.jpg",
                file_url: "assets/pdf/makale2.pdf"
            },
            {
                type: "ders",
                category: "FYF",
                title: "Fikret Yüksel Vakfı ve Türkiye FRC Ekosistemi",
                slug: "fikret-yuksel-vakfi-ve-turkiye-frc-ekosistemi",
                summary: "Türkiye'de FIRST programlarının gelişimi, bölgesel yarışmalar (Regional) ve takım hibe imkanları.",
                body: "Fikret Yüksel Vakfı'nın ülkemizde düzenlediği resmi etkinlikler, gönüllü hakemlik (volunteer) rolleri ve yeni kurulan takımlara sağlanan başlangıç destekleri.",
                image_url: "images/fy-logo.png",
                file_url: "assets/pdf/makale3.pdf"
            },

            // MAKALELER
            {
                type: "makale",
                category: "Mekanik",
                title: "Mekanik Sistem Optimizasyonu Nasıl Yapılmalı?",
                slug: "mekanik-sistem-optimizasyonu-nasil-yapilmali",
                summary: "Ağırlık tasarrufu, sürtünme azaltma ve malzeme mukavemet hesapları üzerine kapsamlı makale.",
                body: "Robotik yarışmalarda mekanik sistemlerin hafifliği ve dayanıklılığı maç kazanmada belirleyicidir. Bu makalede 6061-T6 Alüminyum, Polikarbonat ve Karbon Fiber malzemelerin doğru yerde kullanımı anlatılmaktadır.",
                image_url: "images/mk/1.jpg",
                file_url: "assets/pdf/makale1.pdf"
            },
            {
                type: "makale",
                category: "Yazılım",
                title: "Bilgisayarlı Görü ve AprilTag Takibi ile Hassas Hedefleme",
                slug: "bilgisayarli-goru-ve-apriltag-takibi",
                summary: "Limelight ve PhotonVision kameraları kullanarak AprilTag 3D koordinat kestirimi ve PID hizalama.",
                body: "Saha üzerindeki AprilTag hedeflerini 6-DOF uzayında tespit ederek robotunuzu milimetrik hassasiyetle hedef noktaya yönlendirin. Kalman filtreleme ve Poz Kestirimi (Pose Estimation) algoritmaları incelenmiştir.",
                image_url: "images/mk/2.jpg",
                file_url: "assets/pdf/makale2.pdf"
            },
            {
                type: "makale",
                category: "Elektronik",
                title: "Elektrik Kullanımında Güvenlik ve Hata Ayıklama",
                slug: "elektrik-kullaniminda-guvenlik-ve-hata-ayiklama",
                summary: "Kısa devre koruması, akım çekiş logları ve pil sağlığı izleme yöntemleri.",
                body: "Yüksek akım çeken fırçasız (brushless) motorların voltaj dalgalanmalarını engellemek için doğru kablo kesitleri (AWG) ve terminal pabuç pensesi teknikleri.",
                image_url: "images/mk/3.jpg",
                file_url: "assets/pdf/makale3.pdf"
            },
            {
                type: "makale",
                category: "PR",
                title: "Sosyal Medya ve Marka Yönetiminde Başarı Stratejileri",
                slug: "sosyal-medya-ve-marka-yonetiminde-basari",
                summary: "Robotik takımları için içerik üretimi, kurumsal kimlik rehberi ve kriz iletişimi.",
                body: "Takım logoları, tipografi standartları, YouTube maç özetleri ve sponsor görünürlüğü için sosyal medya etkileşimini artırma ipuçları.",
                image_url: "images/mk/4.jpg",
                file_url: "assets/pdf/makale4.pdf"
            },
            {
                type: "makale",
                category: "Tasarım",
                title: "Generative Design ve Topoloji Optimizasyonu",
                slug: "generative-design-ve-topoloji-optimizasyonu",
                summary: "Yapay zeka destekli parça hafifletme ve 3D metal/plastik üretim.",
                body: "Gerilme analizleri (FEA) sonucunda yük taşımayan bölgelerin boşaltılması ile %40'a varan ağırlık kazanımı sağlama yöntemleri.",
                image_url: "images/mk/5.jpg",
                file_url: "assets/pdf/makale5.pdf"
            },

            // SUNUMLAR
            {
                type: "sunum",
                category: "Mekanik",
                title: "Mekanik Parçaların Montajı ve İş Güvenliği",
                slug: "mekanik-parcalarin-montaji-ve-is-guvenligi",
                summary: "Atölye iş güvenliği, el aletleri kullanımı ve somun sabitleyici (Loctite) standartları.",
                body: "Titreşimli ortamlarda çalışan robot mekanizmalarında nyloc somunlar, tork anahtarı kullanımı ve koruyucu gözlük kuralları.",
                image_url: "images/placeholders/sunum-thumb-placeholder.svg",
                file_url: "assets/pdf/makale1.pdf"
            },
            {
                type: "sunum",
                category: "Yazılım",
                title: "Robot Kontrolünde PID ve Feedforward Teorisi",
                slug: "robot-kontrolunde-pid-ve-feedforward-teorisi",
                summary: "Oransal, İntegral ve Türev kontrolcüler ile motor hız ve pozisyon kontrolü.",
                body: "Swerve modüllerinin açısal kontrolü ve asansör sistemlerinin yerçekimi dengelenmesi için PIDF katsayılarının SysId aracıyla otomatik ayarlanması.",
                image_url: "images/yazilim.jpg",
                file_url: "assets/pdf/makale2.pdf"
            },

            // TASARIMLAR / OBJELER
            {
                type: "obje",
                category: "Tasarım",
                title: "Swerve Drive Modül Kovanı (CAD & STL)",
                slug: "swerve-drive-modul-kovani-cad-stl",
                summary: "Falcon 500 / Kraken X60 uyumlu, 3D baskı TPU / PETG dişli koruma kovanı.",
                body: "Açık kaynaklı 3D yazıcı dostu CAD dosyaları. STEP ve STL formatlarında doğrudan indirilebilir.",
                image_url: "images/mk/4.jpg",
                file_url: "assets/pdf/makale4.pdf"
            },
            {
                type: "obje",
                category: "Tasarım",
                title: "RoboRIO 2.0 Titreşim Emici Montaj Yuvası",
                slug: "roborio-titresim-emici-montaj-yuvasi",
                summary: "Robot sarsıntılarından dahili jiroskop ve ivmeölçeri koruyan TPU damper yuvası.",
                body: "CAD tasarımı vidalama delikleriyle hazır montaj desteği sunar.",
                image_url: "images/mk/3.jpg",
                file_url: "assets/pdf/makale3.pdf"
            },

            // HABERLER & DUYURULAR
            {
                type: "haber",
                category: "Duyuru",
                title: "The Nest Platformu Yeni Özellikleriyle Yayında!",
                slug: "the-nest-platformu-yeni-ozellikleriyle-yayinda",
                summary: "Eğitim modülleri, makaleler, dinamik sunumlar ve takım başvuru sistemi artık aktif.",
                body: "STEAM ve FRC topluluklarına yönelik olarak hazırlanan The Nest platformumuz; kullanıcı profilleri, açık kaynaklı eğitim içerikleri ve interaktif dokümanlarla tüm takımların hizmetine açılmıştır.",
                image_url: "images/favicon.png",
                file_url: ""
            },
            {
                type: "haber",
                category: "Duyuru",
                title: "2025-2026 Sezonu Takım Başvuruları Başladı",
                slug: "2025-2026-sezonu-takim-basvurulari-basladi",
                summary: "Mekanik, Yazılım, PR, Elektronik ve Tasarım departmanlarımıza yeni takım arkadaşları arıyoruz.",
                body: "Robotik ve mühendisliğe tutku duyan tüm lise öğrencilerini ailemizin bir parçası olmaya davet ediyoruz. Ana sayfadaki başvuru formunu doldurarak ilk adımı atabilirsiniz.",
                image_url: "images/kurum.jpg",
                file_url: ""
            }
        ];

        for (const item of initialContent) {
            insertContent.run(
                item.type,
                item.category,
                item.title,
                item.slug,
                item.summary,
                item.body,
                item.image_url,
                item.file_url
            );
        }
        console.log(`📚 ${initialContent.length} adet başlangıç içeriği veritabanına eklendi.`);
    }

    console.log(`✅ Veritabanı hazır: ${DB_PATH}`);
    db.close();
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase, DB_PATH };
