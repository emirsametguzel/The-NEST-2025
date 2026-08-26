// =============================================================================
// server/db/init-db.js
// Veritabanı Başlangıç Tohumlama (Seed & Initialize)
// =============================================================================

const bcrypt = require("bcryptjs");
const db = require("../src/db");

async function initDatabase() {
    console.log("🚀 Veritabanı başlatılıyor ve kontrol ediliyor...");

    try {
        // 1. Admin Kullanıcısını Kontrol Et ve Oluştur/Güncelle
        const adminPassHash = await bcrypt.hash("emir2011", 12);
        let existingAdmin = await db.getUserByEmail("emirsametguzel@gmail.com");

        if (existingAdmin) {
            await db.updateUser(existingAdmin.id, {
                username: "emirsametguzel",
                password_hash: adminPassHash,
                display_name: "Emir Samet Güzel",
                role: "admin",
                is_active: 1,
            });
            console.log("👤 Admin hesabı doğrulandı/güncellendi: emirsametguzel@gmail.com (rol: admin)");
        } else {
            existingAdmin = await db.createUser({
                username: "emirsametguzel",
                email: "emirsametguzel@gmail.com",
                password_hash: adminPassHash,
                display_name: "Emir Samet Güzel",
                role: "admin",
                is_active: 1,
            });
            console.log("👤 Özel Yönetici hesabı oluşturuldu: emirsametguzel@gmail.com");
        }

        // 2. Varsayılan Site Ayarlarını Kontrol Et ve Ekle
        const existingSettings = await db.getSiteSettings();
        const defaultSettings = {
            site_title: "The Nest | FRC & STEAM Topluluk Platformu",
            announcement_banner: "7611 Amal Hawks yeni sezon takım alımları devam ediyor! Hemen başvurun.",
            announcement_active: "1",
            contact_email: "amalhawksrobotics@gmail.com",
            applications_open: "1",
            footer_text: "The Nest, STEAM toplulukları için açık kaynaklı eğitim ve paylaşım merkezidir.",
        };

        const missingSettings = {};
        for (const [k, v] of Object.entries(defaultSettings)) {
            if (existingSettings[k] === undefined) {
                missingSettings[k] = v;
            }
        }
        if (Object.keys(missingSettings).length > 0) {
            await db.updateSiteSettings(missingSettings);
            console.log("⚙️ Varsayılan site ayarları veritabanına kaydedildi.");
        }

        // 3. Başlangıç İçeriklerini Kontrol Et ve Ekle (Boşsa)
        const items = await db.getContentItems();
        if (!items || items.length === 0) {
            console.log("📚 Başlangıç eğitimleri ve içerikleri veritabanına yükleniyor...");

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
                    file_url: "assets/pdf/makale1.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "Yazılım",
                    title: "WPILib ve Command-Based Robot Mimarisi",
                    slug: "wpilib-ve-command-based-robot-mimarisi",
                    summary: "Java ve C++ ile modern FRC robot yazılımı, alt sistemler (Subsystems), komutlar (Commands) ve Trigger tabanlı kontrol.",
                    body: "Command-Based programlama modeli ile robot bileşenlerini modüler hale getirin. PID kontrolleri, Trajectory Generator (Yol Planlama), PathPlanner entegrasyonu ve AutoBuilder ile otonom dönemde 15 saniyelik kusursuz rutinler hazırlayın.",
                    image_url: "images/yazilim.jpg",
                    file_url: "assets/pdf/makale2.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "Sunum Becerileri",
                    title: "FIRST Impact (Chairman's) Ödülü ve Jüri Sunumu Stratejileri",
                    slug: "first-impact-odulu-ve-juri-sunumu-stratejileri",
                    summary: "Jüri odasında etkileyici konuşma, STEAM etki raporu hazırlama ve video sunum teknikleri.",
                    body: "Impact Award jürisine takımınızın toplumdaki etkisini, STEAM yaygınlaştırma projelerini ve sürdürülebilirlik vizyonunu 7 dakikalık sunum ve 5 dakikalık soru-cevap seansında en etkili şekilde aktarma yöntemleri.",
                    image_url: "images/placeholders/sunum-thumb-placeholder.svg",
                    file_url: "assets/pdf/makale3.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "Tasarım",
                    title: "SolidWorks & Onshape ile Parametrik Robot Modelleme",
                    slug: "solidworks-ve-onshape-ile-parametrik-robot-modelleme",
                    summary: "Parametrik parça tasarımı, FeatureScript kullanımı ve 3D yazıcı üretim toleransları.",
                    body: "Hızlı prototipleme, lazer kesim toleransları (kerf payı), sac büküm hesaplamaları ve FDM 3D baskı parçalarının mukavemet yönelimleri (infill & wall thickness) detaylandırılmıştır.",
                    image_url: "images/mk/4.jpg",
                    file_url: "assets/pdf/makale4.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "Sponsorluk",
                    title: "Kurumsal Sponsorluk Dosyası Hazırlama ve Bütçe Yönetimi",
                    slug: "kurumsal-sponsorluk-dosyasi-hazirlama-ve-butce-yonetimi",
                    summary: "Şirketlerle profesyonel iletişim, sponsor paketleri (Platin, Altın, Gümüş) ve bütçe planlaması.",
                    body: "FRC takımlarının malzeme tedariği, seyahat giderleri ve yarışma kayıt ücretlerini karşılamak amacıyla kurumsal firmalara sunulacak etkili sponsorluk sunumu hazırlama rehberi.",
                    image_url: "images/mk/5.jpg",
                    file_url: "assets/pdf/makale5.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "Elektronik",
                    title: "FRC Kontrol Sistemi: RoboRIO, PDP/PDH ve CAN Bus Ağı",
                    slug: "frc-kontrol-sistemi-roborio-pdp-can-bus",
                    summary: "Robot kablolaması, sigorta yerleşimi, CAN kablolama topolojisi ve güvenlik anahtarı standartları.",
                    body: "Power Distribution Hub (PDH), Radio Power Module (RPM), Talon FX / Spark Max motor sürücülerinin CAN Bus hattı üzerinden konfigürasyonu ve elektriksel gürültü filtreleme teknikleri.",
                    image_url: "images/mk/1.jpg",
                    file_url: "assets/pdf/makale1.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "ders",
                    category: "FRC",
                    title: "Yarışma Stratejisi, Scouting ve İttifak Seçimi",
                    slug: "yarisma-stratejisi-scouting-ve-ittifak-secimi",
                    summary: "Veriye dayalı maç analizi, QR kodlu scouting sistemleri ve Playoff stratejisi.",
                    body: "Saha analizi, robot döngü süreleri (cycle time) ölçümü ve Tableau / Python veri analitiği ile play-off aşamasında en uyumlu ittifak partnerlerini belirleme taktikleri.",
                    image_url: "images/frc-comp.jpg",
                    file_url: "assets/pdf/makale2.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
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
                    file_url: "assets/pdf/makale1.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "makale",
                    category: "Yazılım",
                    title: "Bilgisayarlı Görü ve AprilTag Takibi ile Hassas Hedefleme",
                    slug: "bilgisayarli-goru-ve-apriltag-takibi",
                    summary: "Limelight ve PhotonVision kameraları kullanarak AprilTag 3D koordinat kestirimi ve PID hizalama.",
                    body: "Saha üzerindeki AprilTag hedeflerini 6-DOF uzayında tespit ederek robotunuzu milimetrik hassasiyetle hedef noktaya yönlendirin. Kalman filtreleme ve Poz Kestirimi algoritmaları incelenmiştir.",
                    image_url: "images/mk/2.jpg",
                    file_url: "assets/pdf/makale2.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "makale",
                    category: "Elektronik",
                    title: "Elektrik Kullanımında Güvenlik ve Hata Ayıklama",
                    slug: "elektrik-kullaniminda-guvenlik-ve-hata-ayiklama",
                    summary: "Kısa devre koruması, akım çekiş logları ve pil sağlığı izleme yöntemleri.",
                    body: "Yüksek akım çeken fırçasız motorların voltaj dalgalanmalarını engellemek için doğru kablo kesitleri ve terminal pabuç pensesi teknikleri.",
                    image_url: "images/mk/3.jpg",
                    file_url: "assets/pdf/makale3.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },

                // SUNUMLAR & OBJELER & HABERLER
                {
                    type: "sunum",
                    category: "Mekanik",
                    title: "Mekanik Parçaların Montajı ve İş Güvenliği",
                    slug: "mekanik-parcalarin-montaji-ve-is-guvenligi",
                    summary: "Atölye iş güvenliği, el aletleri kullanımı ve somun sabitleyici (Loctite) standartları.",
                    body: "Titreşimli ortamlarda çalışan robot mekanizmalarında nyloc somunlar, tork anahtarı kullanımı ve koruyucu gözlük kuralları.",
                    image_url: "images/placeholders/sunum-thumb-placeholder.svg",
                    file_url: "assets/pdf/makale1.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "obje",
                    category: "Tasarım",
                    title: "Swerve Drive Modül Kovanı (CAD & STL)",
                    slug: "swerve-drive-modul-kovani-cad-stl",
                    summary: "Falcon 500 / Kraken X60 uyumlu, 3D baskı TPU / PETG dişli koruma kovanı.",
                    body: "Açık kaynaklı 3D yazıcı dostu CAD dosyaları. STEP ve STL formatlarında doğrudan indirilebilir.",
                    image_url: "images/mk/4.jpg",
                    file_url: "assets/pdf/makale4.pdf",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                },
                {
                    type: "haber",
                    category: "Duyuru",
                    title: "The Nest Platformu Yeni Özellikleriyle Yayında!",
                    slug: "the-nest-platformu-yeni-ozellikleriyle-yayinda",
                    summary: "Eğitim modülleri, makaleler, dinamik sunumlar ve takım başvuru sistemi artık aktif.",
                    body: "STEAM ve FRC topluluklarına yönelik olarak hazırlanan The Nest platformumuz; kullanıcı profilleri, açık kaynaklı eğitim içerikleri ve interaktif dokümanlarla tüm takımların hizmetine açılmıştır.",
                    image_url: "images/favicon.png",
                    file_url: "",
                    author_username: "emirsametguzel",
                    author_display_name: "Emir Samet Güzel",
                }
            ];

            for (const item of initialContent) {
                await db.createContentItem(item);
            }
            console.log(`✅ ${initialContent.length} adet başlangıç içeriği veritabanına eklendi.`);
        }

        console.log("🎉 Veritabanı ve Başlangıç Verileri Hazır!");
    } catch (err) {
        console.error("Veritabanı Başlatma / Tohumlama Hatası:", err.message);
    }
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase };
