// ==========================================================================
// The Nest — main.js
// ==========================================================================

// --- Giriş durumu kontrolü (Node.js/Express oturumu, /api/auth/me) ---
// Not: login-link artık partials/header.html içinde enjekte edildiği için,
// bu kod DOMContentLoaded yerine "nest:partials-loaded" olayını bekler
// (bkz. js/components.js). Böylece header henüz DOM'a eklenmeden
// getElementById çağrılıp null dönmesi hatası oluşmaz.
document.addEventListener('nest:partials-loaded', function () {
    const loginLink = document.getElementById('login-link');
    const loginIcon = document.getElementById('login-icon');
    const loginAvatar = document.getElementById('login-avatar');
    const loginLabel = document.getElementById('login-label');
    if (!loginLink || !loginIcon) {
        return;
    }

    const base = document.documentElement.getAttribute('data-base-path') || '';

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
            loginLink.removeAttribute('data-i18n'); // kullanıcı adı artık i18n'e değil, gerçek isme bağlı

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

            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.role === 'admin') {
                adminLink.hidden = false;
            }
        })
        .catch(function () {
            loginLink.href = `${base}login.html`;
        });
});

// --- Başvuru afişi modalı + Takım Başvuru Formu gönderimi (yalnızca index.html'de mevcutsa çalışır) ---
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('modal');
    const closeModal = document.getElementById('close-modal');
    const form = document.getElementById('team-application-form');
    const feedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('submit-button');
    const department = document.getElementById('department');

    if (!modal || !form) return;

    const FEEDBACK_ICON = 'images/placeholders/feedback-icon-placeholder.svg';

    modal.style.display = 'block';

    closeModal.onclick = function () {
        modal.style.display = 'none';
    };

    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    let lastSubmitTime = 0;
    const submitCooldown = 30000;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (!department.value) {
            feedback.innerHTML = `<img src="${FEEDBACK_ICON}" alt="Hata" class="feedback-img">Lütfen bir departman seçin.`;
            feedback.style.color = 'red';
            return;
        }

        const currentTime = Date.now();
        if (currentTime - lastSubmitTime < submitCooldown) {
            feedback.innerHTML = `<img src="${FEEDBACK_ICON}" alt="Hata" class="feedback-img">Lütfen 30 saniye bekleyin ve tekrar deneyin.`;
            feedback.style.color = 'red';
            return;
        }

        const honeypot = document.getElementById('honeypot').value;
        if (honeypot !== '') {
            feedback.innerHTML = `<img src="${FEEDBACK_ICON}" alt="Hata" class="feedback-img">Bot algılandı!`;
            feedback.style.color = 'red';
            return;
        }

        submitButton.disabled = true;
        const formData = new FormData(form);

        // TODO: team_application.html placeholder'dır; gerçek bir backend
        // endpoint'ine (örn. /api/team-application) bağlanana kadar çalışmaz.
        fetch('team_application.html', {
            method: 'POST',
            body: formData
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => {
                feedback.innerHTML = '';
                const imageUrl = data.image_url || FEEDBACK_ICON;
                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = data.success ? 'Başvuru Başarılı' : 'Hata';
                img.className = 'feedback-img';
                feedback.appendChild(img);

                const message = document.createElement('span');
                message.textContent = data.message || 'Bilinmeyen hata';
                feedback.appendChild(message);

                feedback.style.color = data.success ? 'green' : 'red';
                if (data.success) {
                    form.reset();
                    lastSubmitTime = currentTime;
                    setTimeout(() => { feedback.innerHTML = ''; }, 5000);
                }
                submitButton.disabled = false;

                img.onerror = function () {
                    feedback.innerHTML = `<span>${data.message} (Görüntü yüklenemedi)</span>`;
                    feedback.style.color = data.success ? 'orange' : 'red';
                };
            })
            .catch(err => {
                feedback.innerHTML = `<img src="${FEEDBACK_ICON}" alt="Hata" class="feedback-img">Hata: ` + err.message;
                feedback.style.color = 'red';
                submitButton.disabled = false;
            });
    });
});
