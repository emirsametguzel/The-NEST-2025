// ==========================================================================
// The Nest — main.js
// ==========================================================================

// --- Giriş durumu kontrolü (Node.js/Express oturumu, /api/auth/me) ---
document.addEventListener('nest:partials-loaded', function () {
    const loginLink = document.getElementById('login-link');
    const loginIcon = document.getElementById('login-icon');
    const loginAvatar = document.getElementById('login-avatar');
    const loginLabel = document.getElementById('login-label');

    const base = document.documentElement.getAttribute('data-base-path') || '';

    // Oturum Kontrolü
    if (loginLink && loginIcon) {
        fetch(`${base}api/auth/me`, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                if (!res.ok) throw new Error('not authenticated');
                return res.json();
            })
            .then(function (data) {
                const user = data.user;
                loginLink.href = `${base}profile.html`;
                loginLink.setAttribute('title', 'Profil');
                loginLink.removeAttribute('data-i18n');

                if (user.avatar_path) {
                    loginAvatar.src = `${base}${user.avatar_path}`;
                    loginAvatar.hidden = false;
                    loginIcon.hidden = true;
                } else {
                    loginIcon.classList.remove('fa-right-to-bracket');
                    loginIcon.classList.add('fa-user');
                }

                if (loginLabel) {
                    loginLabel.textContent = user.display_name || user.username;
                    loginLabel.removeAttribute('data-i18n');
                }
            })
            .catch(function () {
                loginLink.href = `${base}login.html`;
            });
    }

    // Site Ayarlarını & Duyuru Bandını Yükle
    fetch(`${base}api/settings`, { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            const s = data.settings || {};
            if (s.announcement_active === '1' && s.announcement_banner) {
                let banner = document.getElementById('nest-announcement-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'nest-announcement-banner';
                    banner.style.cssText = `
                        background: linear-gradient(90deg, #1d4ed8, #042C62);
                        color: #ffffff;
                        text-align: center;
                        padding: 8px 16px;
                        font-size: 0.9rem;
                        font-weight: 600;
                        position: relative;
                        z-index: 100;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    `;
                    document.body.prepend(banner);
                }
                banner.innerHTML = `<i class="fa-solid fa-bullhorn" style="margin-right: 8px;"></i> ${escapeHtml(s.announcement_banner)}`;
            }
        })
        .catch(() => {});
});

// --- Katlanabilir Accordion Etkileşimi (Pürüzsüz CSS Geçişi & Zengin İçerik) ---
function initAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        // Çift dinleyiciyi önle
        if (header.dataset.accordionBound === 'true') return;
        header.dataset.accordionBound = 'true';

        header.addEventListener('click', function (e) {
            e.preventDefault();
            const item = this.closest('.accordion-item');
            if (!item) return;
            const body = item.querySelector('.accordion-body');
            if (!body) return;

            const isOpen = item.classList.contains('is-open');

            if (isOpen) {
                // Kapanma animasyonu: Önce tam yüksekliği sabitle, sonra 0'a çek
                body.style.maxHeight = body.scrollHeight + 'px';
                void body.offsetHeight; // Zorunlu reflow
                body.style.maxHeight = '0px';
                item.classList.remove('is-open');
            } else {
                // Açılma animasyonu: 0'dan gerçek scrollHeight'e akıcı animasyon
                item.classList.add('is-open');
                body.style.maxHeight = body.scrollHeight + 'px';

                const onEnd = function (event) {
                    if (event.propertyName === 'max-height' && item.classList.contains('is-open')) {
                        body.style.maxHeight = 'none';
                        body.removeEventListener('transitionend', onEnd);
                    }
                };
                body.addEventListener('transitionend', onEnd);
            }
        });
    });
}

// --- 3D Kart Flip Etkileşimi (Click & Touch) ---
function initCardFlips() {
    document.querySelectorAll('.col').forEach(col => {
        if (col.dataset.flipBound) return;
        col.dataset.flipBound = 'true';

        col.addEventListener('click', function (e) {
            // PDF veya linke tıklandıysa flip yapma
            if (e.target.closest('a[href]')) return;
            this.classList.toggle('flipped');
        });
    });
}

// --- Dinamik CMS İçerik Yükleyici ---
async function loadDynamicContent() {
    const mother = document.querySelector('.mother-1-1[data-content-type]');
    if (!mother) return;

    const contentType = mother.dataset.contentType;
    const base = document.documentElement.getAttribute('data-base-path') || '';

    try {
        const res = await fetch(`${base}api/content?type=${contentType}`);
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) return;

        // Kategori eşlemeleri
        const catMap = {
            'Mekanik': 'a1',
            'Yazılım': 'a2',
            'Sunum Becerileri': 'a3',
            'PR': 'a3',
            'Tasarım': 'a4',
            'Sponsorluk': 'a5',
            'Elektronik': 'a6',
            'FRC': 'a7',
            'FYF': 'a8',
        };

        items.forEach(item => {
            const sectionId = catMap[item.category] || 'a1';
            const targetWrapper = document.getElementById(sectionId);
            if (!targetWrapper) return;

            // Eğer body uzun ise accordion olarak ekle, kısa ise 3D kart olarak
            if (item.body && item.body.length > 100) {
                let accWrap = targetWrapper.querySelector('.accordion-wrapper');
                if (!accWrap) {
                    accWrap = document.createElement('div');
                    accWrap.className = 'accordion-wrapper';
                    targetWrapper.appendChild(accWrap);
                }

                // Önceden eklenmiş mi kontrol et
                if (accWrap.querySelector(`[data-cms-id="${item.id}"]`)) return;

                const accItem = document.createElement('div');
                accItem.className = 'accordion-item';
                accItem.setAttribute('data-cms-id', item.id);
                accItem.innerHTML = `
                    <button class="accordion-header" type="button">
                        <div class="accordion-title-group">
                            <div class="accordion-icon"><i class="fa-solid fa-graduation-cap"></i></div>
                            <div class="accordion-title-text">
                                <h3 class="accordion-title">${escapeHtml(item.title)}</h3>
                                <span class="accordion-category-badge">${escapeHtml(item.category)} • ${escapeHtml(item.author_display_name || item.author_username || 'Yönetici')}</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-down accordion-chevron"></i>
                    </button>
                    <div class="accordion-body">
                        <div class="accordion-content">
                            ${item.summary ? `<p style="font-weight:600;">${escapeHtml(item.summary)}</p>` : ''}
                            <p>${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>
                            ${item.file_url ? `
                                <div class="accordion-actions">
                                    <a href="${escapeHtml(item.file_url)}" target="_blank" class="card-btn" style="background:#042C62; color:#fff; padding:8px 16px; border-radius:6px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                                        <i class="fa-solid fa-file-pdf"></i> Ekli Dosyayı Aç
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                accWrap.appendChild(accItem);
            } else {
                let colsWrap = targetWrapper.querySelector('.cols');
                if (!colsWrap) {
                    colsWrap = document.createElement('div');
                    colsWrap.className = 'cols';
                    targetWrapper.prepend(colsWrap);
                }

                if (colsWrap.querySelector(`[data-cms-id="${item.id}"]`)) return;

                const colEl = document.createElement('div');
                colEl.className = 'col';
                colEl.setAttribute('data-cms-id', item.id);
                const bgImage = item.image_url ? `url('${escapeHtml(item.image_url)}')` : "url('images/mk/1.jpg')";
                colEl.innerHTML = `
                    <div class="container">
                        <div class="front" style="background-image: ${bgImage};">
                            <div class="inner">
                                <span class="card-badge">${escapeHtml(item.category)}</span>
                                <p>${escapeHtml(item.title)}</p>
                            </div>
                        </div>
                        <div class="back">
                            <div class="inner">
                                <span class="card-badge">${escapeHtml(item.category)}</span>
                                <p>${escapeHtml(item.summary || item.title)}</p>
                                ${item.file_url ? `
                                    <a href="${escapeHtml(item.file_url)}" target="_blank" class="card-btn" onclick="event.stopPropagation();">
                                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Aç
                                    </a>
                                ` : `
                                    <span class="card-btn"><i class="fa-solid fa-check"></i> Detay</span>
                                `}
                            </div>
                        </div>
                    </div>
                `;
                colsWrap.appendChild(colEl);
            }
        });

        // Yeni eklenen elemanları bağla
        initAccordions();
        initCardFlips();
    } catch (_) {}
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Takım Başvuru Formu Gönderimi (index.html) ---
document.addEventListener('DOMContentLoaded', function () {
    initAccordions();
    initCardFlips();
    loadDynamicContent();

    const modal = document.getElementById('modal');
    const closeModal = document.getElementById('close-modal');
    const modalApplyBtn = document.getElementById('modal-apply-btn') || document.querySelector('.modal-button');
    const heroApplyBtn = document.getElementById('hero_apply_button');
    const heroPosterBtn = document.getElementById('hero_poster_button');
    const form = document.getElementById('team-application-form');
    const feedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('submit-button');
    const department = document.getElementById('department');

    // Başvuru formuna pürüzsüz kaydırma fonksiyonu
    function scrollToApplicationForm(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        if (modal) {
            modal.style.display = 'none';
        }

        const formSection = document.getElementById('application-form-section') || document.getElementById('team-application-form');
        if (formSection) {
            const headerOffset = 80;
            const elementPosition = formSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: Math.max(0, offsetPosition),
                behavior: 'smooth'
            });

            setTimeout(() => {
                const nameInput = document.getElementById('name');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.style.outline = '3px solid #007bff';
                    setTimeout(() => { nameInput.style.outline = ''; }, 1800);
                }
            }, 600);
        }
    }

    // Modal açılış ve kapanış kontrolleri
    if (modal) {
        modal.style.display = 'block';
        if (closeModal) {
            closeModal.onclick = function () {
                modal.style.display = 'none';
            };
        }
        window.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display !== 'none') {
                modal.style.display = 'none';
            }
        });
    }

    // Modal içi "Başvuru Formuna Git" butonu
    if (modalApplyBtn) {
        modalApplyBtn.addEventListener('click', scrollToApplicationForm);
    }

    // Hero alanı "Başvuru Formuna Git" butonu
    if (heroApplyBtn) {
        heroApplyBtn.addEventListener('click', scrollToApplicationForm);
    }

    // Hero alanı "Afişi Görüntüle" butonu (Modali tekrar açar)
    if (heroPosterBtn && modal) {
        heroPosterBtn.addEventListener('click', function (e) {
            e.preventDefault();
            modal.style.display = 'block';
        });
    }

    // [data-action="scroll-apply"] veya href="#application-form-section" bağlantıları
    document.querySelectorAll('[data-action="scroll-apply"], a[href="#application-form-section"]').forEach(el => {
        el.addEventListener('click', scrollToApplicationForm);
    });

    if (form) {
        let lastSubmitTime = 0;
        const submitCooldown = 15000;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            if (department && !department.value) {
                if (feedback) {
                    feedback.textContent = typeof NestI18n !== 'undefined' ? NestI18n.t('form.feedback.selectDepartment', 'Lütfen bir departman seçin.') : 'Lütfen bir departman seçin.';
                    feedback.style.color = 'red';
                }
                return;
            }

            const currentTime = Date.now();
            if (currentTime - lastSubmitTime < submitCooldown) {
                if (feedback) {
                    feedback.textContent = typeof NestI18n !== 'undefined' ? NestI18n.t('form.feedback.cooldown', 'Lütfen 15 saniye bekleyin ve tekrar deneyin.') : 'Lütfen 15 saniye bekleyin ve tekrar deneyin.';
                    feedback.style.color = 'red';
                }
                return;
            }

            const honeypot = document.getElementById('honeypot');
            if (honeypot && honeypot.value !== '') {
                if (feedback) {
                    feedback.textContent = 'Bot algılandı!';
                    feedback.style.color = 'red';
                }
                return;
            }

            if (submitButton) submitButton.disabled = true;
            const formData = new FormData(form);

            fetch('/api/team-application', {
                method: 'POST',
                body: formData
            })
                .then(res => res.json())
                .then(data => {
                    if (feedback) {
                        feedback.textContent = data.message || (data.success ? 'Başvurunuz alındı!' : 'Hata oluştu.');
                        feedback.style.color = data.success ? 'green' : 'red';
                    }
                    if (data.success) {
                        form.reset();
                        lastSubmitTime = currentTime;
                        setTimeout(() => {
                            if (feedback) feedback.textContent = '';
                        }, 5000);
                    }
                    if (submitButton) submitButton.disabled = false;
                })
                .catch(err => {
                    if (feedback) {
                        feedback.textContent = 'Hata: ' + err.message;
                        feedback.style.color = 'red';
                    }
                    if (submitButton) submitButton.disabled = false;
                });
        });
    }
});
