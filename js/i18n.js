// =============================================================================
// js/i18n.js — The Nest Çoklu Dil (i18n) Gelişmiş Çeviri Motoru
// =============================================================================

const NestI18n = (() => {
    const STORAGE_KEY = "nest-lang";
    const DEFAULT_LANG = "tr";
    const SUPPORTED = ["tr", "en"];

    let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    let dictionaries = {};

    async function loadDictionary(lang) {
        if (dictionaries[lang] && Object.keys(dictionaries[lang]).length > 0) {
            return dictionaries[lang];
        }
        try {
            const base = document.documentElement.getAttribute("data-base-path") || "";
            const res = await fetch(`${base}i18n/${lang}.json?v=${Date.now()}`);
            if (!res.ok) throw new Error(`i18n/${lang}.json yüklenemedi (HTTP ${res.status})`);
            dictionaries[lang] = await res.json();
        } catch (err) {
            console.error("[i18n] Sözlük yüklenemedi:", err);
            dictionaries[lang] = dictionaries[lang] || {};
        }
        return dictionaries[lang];
    }

    function t(key, fallback = "") {
        const dict = dictionaries[currentLang] || {};
        if (dict[key] !== undefined) return dict[key];
        const trDict = dictionaries["tr"] || {};
        if (trDict[key] !== undefined) return trDict[key];
        return fallback || key;
    }

    function applyTranslations(root = document) {
        const dict = dictionaries[currentLang] || {};
        if (!dict || Object.keys(dict).length === 0) return;

        // 1. Düz Metin İçeriği (data-i18n)
        root.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (dict[key] !== undefined) {
                if (el.hasAttribute("data-i18n-html")) {
                    el.innerHTML = dict[key];
                } else {
                    // Eğer element içinde ikon (i, svg vb.) varsa, ikonu koru ve yanındaki metni güncelle
                    const iconEl = el.querySelector("i, svg");
                    if (iconEl) {
                        const iconHtml = iconEl.outerHTML;
                        el.innerHTML = `${iconHtml} <span>${dict[key]}</span>`;
                    } else {
                        el.textContent = dict[key];
                    }
                }
            }
        });

        // 2. HTML İçeriği (data-i18n-html)
        root.querySelectorAll("[data-i18n-html]").forEach((el) => {
            const key = el.getAttribute("data-i18n-html") || el.getAttribute("data-i18n");
            if (key && dict[key] !== undefined) {
                el.innerHTML = dict[key];
            }
        });

        // 3. Placeholder (data-i18n-placeholder)
        root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (dict[key] !== undefined) {
                el.placeholder = dict[key];
            }
        });

        // 4. Genel Attribute Çevirisi (title, aria-label vb.)
        root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
            const attrName = el.getAttribute("data-i18n-attr");
            const key = el.getAttribute("data-i18n-attr-key") || el.getAttribute("data-i18n");
            if (key && dict[key] !== undefined && attrName) {
                el.setAttribute(attrName, dict[key]);
            }
        });

        // 5. Title Etiketi
        if (root === document) {
            const titleEl = document.querySelector("title[data-i18n]");
            if (titleEl) {
                const key = titleEl.getAttribute("data-i18n");
                if (dict[key] !== undefined) document.title = dict[key];
            }
            document.documentElement.setAttribute("lang", currentLang);
        }
    }

    async function setLanguage(lang) {
        if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        
        await loadDictionary(lang);
        applyTranslations(document);

        // Dil değiştirme anahtarını senkronize et
        const switchEl = document.getElementById("switch");
        if (switchEl) {
            switchEl.checked = lang === "tr";
        }

        // Dil değişti olayını fırlat (diğer modüllerin dinleyebilmesi için)
        document.dispatchEvent(new CustomEvent("nest:lang-changed", {
            detail: { lang: currentLang, dict: dictionaries[currentLang] }
        }));
    }

    async function init() {
        // İki dili de önceden yükle
        await Promise.all([loadDictionary("tr"), loadDictionary(currentLang)]);
        await setLanguage(currentLang);

        const switchEl = document.getElementById("switch");
        if (switchEl) {
            switchEl.checked = currentLang === "tr";
            switchEl.onchange = () => {
                setLanguage(switchEl.checked ? "tr" : "en");
            };
        }
    }

    return {
        init,
        setLanguage,
        getCurrentLang: () => currentLang,
        t,
        applyTranslations,
        loadDictionary
    };
})();

// Header/footer partial'ları enjekte edildikten SONRA çalışması için
document.addEventListener("nest:partials-loaded", () => {
    NestI18n.init();
});

// Yedek tetikleyici:
document.addEventListener("DOMContentLoaded", () => {
    if (!document.querySelector("[data-component]")) {
        NestI18n.init();
    }
});

