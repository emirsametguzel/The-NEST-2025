// =============================================================================
// js/auth.js — Giriş/Kayıt/Profil Frontend Mantığı
// login.html, register.html ve profile.html tarafından kullanılır.
// CSRF token akışı: her form gönderiminden önce sunucudan taze bir token
// alınır ve X-CSRF-Token header'ında geri gönderilir (bkz. server/src/middleware/csrf.js).
// =============================================================================

(function () {
    const base = document.documentElement.getAttribute('data-base-path') || '';
    const API = `${base}api`;

    async function getCsrfToken() {
        const res = await fetch(`${API}/auth/csrf-token`, { credentials: 'same-origin' });
        const data = await res.json();
        return data.csrfToken;
    }

    async function postJson(path, body) {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`${API}${path}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    function showFeedback(el, message, isError) {
        if (!el) return;
        el.textContent = message;
        el.classList.toggle('is-error', !!isError);
    }

    // -------------------------------------------------------------------------
    // login.html
    // -------------------------------------------------------------------------
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('auth-feedback');
            const submitBtn = document.getElementById('login-submit');
            submitBtn.disabled = true;
            showFeedback(feedback, '', false);

            const identifier = document.getElementById('identifier').value;
            const password = document.getElementById('password').value;

            const { ok, data } = await postJson('/auth/login', { identifier, password });

            if (ok) {
                window.location.href = `${base}profile.html`;
            } else {
                showFeedback(feedback, data.error || 'Giriş başarısız.', true);
                submitBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------------------
    // register.html
    // -------------------------------------------------------------------------
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('auth-feedback');
            const submitBtn = document.getElementById('register-submit');
            submitBtn.disabled = true;
            showFeedback(feedback, '', false);

            const username = document.getElementById('username').value;
            const displayName = document.getElementById('displayName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const { ok, data } = await postJson('/auth/register', { username, displayName, email, password });

            if (ok) {
                window.location.href = `${base}profile.html`;
            } else {
                const detail = data.details?.[0]?.msg;
                showFeedback(feedback, detail || data.error || 'Kayıt başarısız.', true);
                submitBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------------------
    // forgot-password.html
    // -------------------------------------------------------------------------
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('auth-feedback');
            const submitBtn = document.getElementById('forgot-password-submit');
            submitBtn.disabled = true;

            const email = document.getElementById('email').value.trim();
            if (!email) {
                showFeedback(feedback, 'Lütfen geçerli bir e-posta adresi girin.', true);
                submitBtn.disabled = false;
                return;
            }

            try {
                sessionStorage.setItem('resetEmail', email);
            } catch (_) {}

            let clientResetSuccess = false;
            let errorMessage = '';

            // 1. İstemci (Frontend) Firebase Client SDK ile doğrudan e-posta gönderimi
            if (window.FirebaseClient && typeof window.FirebaseClient.sendPasswordResetEmail === 'function') {
                try {
                    await window.FirebaseClient.sendPasswordResetEmail(email);
                    clientResetSuccess = true;
                } catch (firebaseErr) {
                    console.warn('Firebase Client sendPasswordResetEmail hatası:', firebaseErr.message);
                    if (firebaseErr.code === 'auth/user-not-found') {
                        errorMessage = 'Bu e-posta adresine ait bir hesap bulunamadı.';
                    } else if (firebaseErr.code === 'auth/invalid-email') {
                        errorMessage = 'Geçersiz e-posta adresi biçimi.';
                    }
                }
            }

            // 2. Backend bildirim ve loglama isteği
            try {
                const { ok, data } = await postJson('/auth/forgot-password', { email });
                if (ok) {
                    clientResetSuccess = true;
                } else if (!clientResetSuccess && data && data.error) {
                    errorMessage = data.error;
                }
            } catch (_) {}

            if (clientResetSuccess) {
                showFeedback(feedback, 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi!', false);
                // Butonu devre dışı bırakıp başarı durumunu koru
                submitBtn.textContent = 'Gönderildi';
            } else {
                showFeedback(feedback, errorMessage || 'Şifre sıfırlama işlemi sırasında bir hata oluştu. Lütfen tekrar deneyin.', true);
                submitBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------------------
    // reset-password.html
    // -------------------------------------------------------------------------
    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) {
        try {
            const savedEmail = sessionStorage.getItem('resetEmail');
            if (savedEmail) {
                const emailInput = document.getElementById('email');
                if (emailInput && !emailInput.value) emailInput.value = savedEmail;
            }
            const savedOtp = sessionStorage.getItem('lastDevOtp');
            if (savedOtp) {
                const otpInput = document.getElementById('otp');
                if (otpInput && !otpInput.value) otpInput.value = savedOtp;
            }
        } catch (_) {}

        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('auth-feedback');
            const submitBtn = document.getElementById('reset-password-submit');
            submitBtn.disabled = true;

            const email = document.getElementById('email').value.trim();
            const otp = document.getElementById('otp').value.trim();
            const newPassword = document.getElementById('newPassword').value;

            const { ok, data } = await postJson('/auth/reset-password', { email, otp, newPassword });

            if (ok) {
                try {
                    sessionStorage.removeItem('resetEmail');
                    sessionStorage.removeItem('lastDevOtp');
                } catch (_) {}
                showFeedback(feedback, data.message || 'Şifre güncellendi. Giriş sayfasına yönlendiriliyorsunuz...', false);
                setTimeout(() => { window.location.href = `${base}login.html`; }, 1500);
            } else {
                const detail = data.details?.[0]?.msg;
                showFeedback(feedback, detail || data.error || 'İşlem başarısız.', true);
                submitBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------------------
    // profile.html
    // -------------------------------------------------------------------------
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        const avatarPreview = document.getElementById('profile-avatar-preview');
        const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');

        function renderAvatar(avatarPath) {
            if (avatarPath) {
                avatarPreview.src = `${base}${avatarPath}?t=${Date.now()}`; // önbellek kırma
                avatarPreview.hidden = false;
                avatarPlaceholder.hidden = true;
            } else {
                avatarPreview.hidden = true;
                avatarPlaceholder.hidden = false;
            }
        }

        (async () => {
            const loadingEl = document.getElementById('profile-loading');
            const contentEl = document.getElementById('profile-content');

            try {
                const res = await fetch(`${API}/auth/me`, { credentials: 'same-origin' });
                if (!res.ok) throw new Error('unauthenticated');
                const { user } = await res.json();

                document.getElementById('profile-username').textContent = user.display_name || user.username;
                document.getElementById('profile-email').textContent = user.email;
                document.getElementById('displayName').value = user.display_name || '';
                document.getElementById('bio').value = user.bio || '';
                renderAvatar(user.avatar_path);

                loadingEl.hidden = true;
                contentEl.hidden = false;
            } catch {
                window.location.href = `${base}login.html`;
            }
        })();

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('profile-feedback');
            const displayName = document.getElementById('displayName').value;
            const bio = document.getElementById('bio').value;

            const csrfToken = await getCsrfToken();
            const res = await fetch(`${API}/profile`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ displayName, bio }),
            });
            const data = await res.json().catch(() => ({}));

            showFeedback(feedback, res.ok ? 'Profil güncellendi.' : (data.error || 'Güncelleme başarısız.'), !res.ok);
        });

        // --- Avatar yükleme: dosya seçilir seçilmez otomatik gönderilir ---
        const avatarInput = document.getElementById('avatar-input');
        avatarInput.addEventListener('change', async () => {
            const file = avatarInput.files[0];
            if (!file) return;

            const feedback = document.getElementById('avatar-feedback');
            showFeedback(feedback, 'Yükleniyor...', false);

            const formData = new FormData();
            formData.append('avatar', file);

            const csrfToken = await getCsrfToken();
            const res = await fetch(`${API}/profile/avatar`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': csrfToken }, // Content-Type'ı tarayıcı otomatik ayarlar (multipart boundary)
                body: formData,
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                renderAvatar(data.avatarPath);
                showFeedback(feedback, 'Fotoğraf güncellendi.', false);
            } else {
                showFeedback(feedback, data.error || 'Yükleme başarısız.', true);
            }
            avatarInput.value = ''; // aynı dosyayı tekrar seçebilmek için sıfırla
        });
    }

    // -------------------------------------------------------------------------
    // Çıkış yap (profile.html)
    // -------------------------------------------------------------------------
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const csrfToken = await getCsrfToken();
            await fetch(`${API}/auth/logout`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': csrfToken },
            });
            window.location.href = `${base}index.html`;
        });
    }
})();
