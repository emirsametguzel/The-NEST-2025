// =============================================================================
// js/components.js — Modüler Header/Footer Yükleyici
//
// Sorun: Her sayfada header/footer HTML'i elle kopyalanmıştı. Sonuç: sayfalar
// arasında tutarsızlık (bozuk class isimleri, eksik footer, yazım hataları,
// çalışmayan linkler — bkz. code review geri bildirimi).
//
// Çözüm: partials/header.html ve partials/footer.html TEK KAYNAK (single
// source of truth) olarak tutulur. Her sayfa yalnızca boş bir yer tutucu
// içerir:
//   <div id="app-header" data-component="header"></div>
//   ... sayfa içeriği ...
//   <div id="app-footer" data-component="footer"></div>
// Bu script sayfa yüklenince partial'ları fetch eder, içine enjekte eder.
// Bu yaklaşım build aracı gerektirmeyen, framework'süz "Web Components"
// mantığına dayanan modüler bir JS mimarisidir (native <template>/fetch
// API'leri dışında bağımlılık yoktur).
//
// Alt klasör derinliği: index.html kökte, ama partials/header.html'deki
// bağlantılar (`{{base}}index.html` vb.) her sayfada doğru çözülmeli. Bu
// yüzden her sayfanın <html> etiketine `data-base-path=""` (kök için) ya da
// alt klasördeyse `data-base-path="../"` yazılır ve {{base}} bu değerle
// değiştirilir. Şu an tüm sayfalar kökte olduğu için data-base-path="" yeterli
// ama ileride /blog/post.html gibi alt sayfalar eklenirse tek satır değişir.
// =============================================================================

(async function () {
    const base = document.documentElement.getAttribute("data-base-path") || "";

    async function loadPartial(selector, fileName) {
        const target = document.querySelector(selector);
        if (!target) return;

        try {
            const res = await fetch(`${base}partials/${fileName}`);
            if (!res.ok) throw new Error(`${fileName} yüklenemedi (HTTP ${res.status})`);
            let html = await res.text();
            html = html.replaceAll("{{base}}", base);
            target.outerHTML = html;
        } catch (err) {
            console.error(`[components] ${fileName} yüklenemedi:`, err);
            // Sessiz başarısızlık yerine kullanıcıya görünür bir iz bırak (geliştirici için)
            target.innerHTML = `<!-- ${fileName} yüklenemedi: ${err.message} -->`;
        }
    }

    await Promise.all([
        loadPartial('[data-component="header"]', "header.html"),
        loadPartial('[data-component="footer"]', "footer.html"),
    ]);

    // main.js (login durumu) ve i18n.js (çeviri) header/footer DOM'a
    // eklendikten SONRA çalışmalı — bu olay onları tetikler.
    document.dispatchEvent(new CustomEvent("nest:partials-loaded"));
})();
