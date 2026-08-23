// =============================================================================
// js/i18n.js — The Nest Çoklu Dil (i18n) Motoru
//
// Eski js/translate.js'in yerini alır. Neden değiştirildi?
//   - Eski sistem: her metin ID'sini elle bulup innerHTML ile değiştiriyordu,
//     yalnızca index.html'de çalışıyordu, sayfa değiştirince dil sıfırlanıyordu.
//   - Yeni sistem: HTML elemanları `data-i18n="anahtar"` ile işaretlenir,
//     çeviriler i18n/tr.json ve i18n/en.json sözlüklerinden JSON olarak
//     yüklenir, seçilen dil localStorage'da saklanır (sayfa geçişlerinde
//     kalıcıdır) ve her sayfada otomatik uygulanır (header/footer dahil,
//     çünkü partial'lar js/components.js ile enjekte edildikten SONRA
//     bu script çalışır).
//
// Kullanım (HTML tarafında):
//   <h1 data-i18n="index.title">The Nest</h1>                 -> metin içeriği
//   <input data-i18n-placeholder="form.name.placeholder">     -> placeholder
//   <label data-i18n-attr="title" data-i18n="nav.profile">    -> herhangi bir attribute
// =============================================================================

const NestI18n = (() => {
    const STORAGE_KEY = "nest-lang";
    const DEFAULT_LANG = "tr";
    const SUPPORTED = ["tr", "en"];

    let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    let dictionaries = {};

    async function loadDictionary(lang) {
        if (dictionaries[lang]) return dictionaries[lang];
        try {
            // Sayfa hangi klasör derinliğinde olursa olsun doğru çalışması için
            // <html data-base-path="..."> üzerinden köke göreli yol alınır
            // (bkz. js/components.js — partial enjeksiyonunda aynı mekanizma kullanılır).
            const base = document.documentElement.getAttribute("data-base-path") || "";
            const res = await fetch(`${base}i18n/${lang}.json`);
            if (!res.ok) throw new Error(`i18n/${lang}.json yüklenemedi (HTTP ${res.status})`);
            dictionaries[lang] = await res.json();
        } catch (err) {
            console.error("[i18n] Sözlük yüklenemedi:", err);
            dictionaries[lang] = {};
        }
        return dictionaries[lang];
    }

    function applyTranslations(dict) {
        // Metin içeriği
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (dict[key] !== undefined) {
                el.textContent = dict[key];
            }
        });

        // Placeholder
        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (dict[key] !== undefined) {
                el.placeholder = dict[key];
            }
        });

        // Genel attribute çevirisi (title, aria-label vb.)
        document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
            const attrName = el.getAttribute("data-i18n-attr");
            const key = el.getAttribute("data-i18n");
            if (key && dict[key] !== undefined) {
                el.setAttribute(attrName, dict[key]);
            }
        });

        document.documentElement.setAttribute("lang", currentLang);
    }

    async function setLanguage(lang) {
        if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        const dict = await loadDictionary(lang);
        applyTranslations(dict);

        // Dil değiştirme anahtarını (checkbox) mevcut dille senkronize et
        const switchEl = document.getElementById("switch");
        if (switchEl) switchEl.checked = lang === "tr";
    }

    async function init() {
        await setLanguage(currentLang);

        const switchEl = document.getElementById("switch");
        if (switchEl) {
            switchEl.checked = currentLang === "tr";
            switchEl.addEventListener("change", () => {
                setLanguage(switchEl.checked ? "tr" : "en");
            });
        }
    }

    return { init, setLanguage, getCurrentLang: () => currentLang };
})();

// Header/footer partial'ları enjekte edildikten SONRA çalışması gerektiği için
// başlatma işlemi js/components.js tarafından tetiklenir (bkz. o dosyadaki
// `document.dispatchEvent(new CustomEvent('nest:partials-loaded'))`).
document.addEventListener("nest:partials-loaded", () => {
    NestI18n.init();
});

// Eğer sayfada partial yükleyici yoksa (örn. ileride saf statik bir sayfa
// eklenirse) yine de DOMContentLoaded'da çalışsın diye yedek tetikleyici:
document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector("[data-component]")) {
        NestI18n.init();
    }
});
