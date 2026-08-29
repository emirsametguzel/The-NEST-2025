// ==========================================================================
// THE NEST — MODERN CONTENT HUB LOGIC & INTERACTIONS (content-hub.js)
// ==========================================================================

(function () {
    'use strict';

    let allItems = [];
    let currentFilter = 'all';
    let currentSearch = '';
    let currentView = 'grid'; // 'grid' or 'list'

    // DOM Element References
    let searchInput;
    let clearSearchBtn;
    let categoryPills;
    let gridViewBtn;
    let listViewBtn;
    let cardsGrid;
    let emptyState;
    let itemCounter;
    let modalOverlay;
    let modalWindow;
    let modalCloseBtn;

    // Start on DOM ready
    document.addEventListener('DOMContentLoaded', function () {
        initDOMElements();
        collectStaticItems();
        setupEventListeners();
        loadCMSContent();
        refreshTranslations();
    });

    // Listen for language change events from NestI18n
    document.addEventListener('nest:lang-changed', function () {
        refreshTranslations();
        filterAndRender();
    });

    function initDOMElements() {
        searchInput = document.getElementById('ch-search-input');
        clearSearchBtn = document.getElementById('ch-search-clear');
        categoryPills = document.querySelectorAll('.ch-pill-btn');
        gridViewBtn = document.getElementById('ch-view-grid');
        listViewBtn = document.getElementById('ch-view-list');
        cardsGrid = document.getElementById('ch-cards-grid');
        emptyState = document.getElementById('ch-empty-state');
        itemCounter = document.getElementById('ch-item-counter');
        modalOverlay = document.getElementById('ch-reader-modal');
        modalCloseBtn = document.getElementById('ch-modal-close');
    }

    function getI18nText(key, fallback) {
        if (window.NestI18n && typeof window.NestI18n.t === 'function') {
            return window.NestI18n.t(key, fallback);
        }
        return fallback;
    }

    function refreshTranslations() {
        if (!itemCounter) return;
        const currentLang = (window.NestI18n && typeof window.NestI18n.getCurrentLang === 'function') ? window.NestI18n.getCurrentLang() : 'tr';
        
        // Re-translate card action buttons that might have static text
        document.querySelectorAll('.ch-btn-action').forEach(btn => {
            const isRead = btn.getAttribute('data-action') === 'read-modal';
            const icon = btn.querySelector('i') ? btn.querySelector('i').outerHTML : '<i class="fa-solid fa-book-open"></i>';
            if (isRead) {
                const label = getI18nText('hub.btn.read', 'Oku');
                btn.innerHTML = `${icon} ${label}`;
            }
        });
    }

    // Collect all static cards in DOM into dataset
    function collectStaticItems() {
        const cardElements = document.querySelectorAll('.ch-card[data-item-id]');
        allItems = [];

        cardElements.forEach(card => {
            const id = card.dataset.itemId;
            const category = card.dataset.category || 'genel';
            const type = card.dataset.type || 'makale';
            const title = card.querySelector('.ch-card-title') ? card.querySelector('.ch-card-title').textContent.trim() : '';
            const excerpt = card.querySelector('.ch-card-excerpt') ? card.querySelector('.ch-card-excerpt').textContent.trim() : '';
            const author = card.querySelector('.ch-author-name') ? card.querySelector('.ch-author-name').textContent.trim() : 'The Nest';
            const date = card.querySelector('.ch-card-date') ? card.querySelector('.ch-card-date').textContent.trim() : '';
            const readTime = card.querySelector('.ch-badge-time') ? card.querySelector('.ch-badge-time').textContent.trim() : '';
            const img = card.querySelector('.ch-card-img') ? card.querySelector('.ch-card-img').src : '';
            const fileUrl = card.dataset.fileUrl || '';
            const fullContentEl = card.querySelector('.ch-full-content-source');
            const fullContent = fullContentEl ? fullContentEl.innerHTML : excerpt;

            allItems.push({
                element: card,
                id: id,
                category: category.toLowerCase(),
                type: type.toLowerCase(),
                title: title,
                excerpt: excerpt,
                author: author,
                date: date,
                readTime: readTime,
                img: img,
                fileUrl: fileUrl,
                fullContent: fullContent,
                isDynamic: false
            });
        });

        updateCounter(allItems.length);
    }

    // Setup event listeners
    function setupEventListeners() {
        // Search Input
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                currentSearch = this.value.trim().toLowerCase();
                if (clearSearchBtn) {
                    clearSearchBtn.classList.toggle('is-visible', currentSearch.length > 0);
                }
                filterAndRender();
            });
        }

        // Clear Search Button
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function () {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                currentSearch = '';
                clearSearchBtn.classList.remove('is-visible');
                filterAndRender();
            });
        }

        // Empty state reset button
        const resetBtn = document.getElementById('ch-reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                currentSearch = '';
                currentFilter = 'all';
                if (searchInput) searchInput.value = '';
                if (clearSearchBtn) clearSearchBtn.classList.remove('is-visible');
                
                categoryPills.forEach(pill => {
                    pill.classList.toggle('is-active', pill.dataset.filter === 'all');
                });
                
                filterAndRender();
            });
        }

        // Category pills
        categoryPills.forEach(pill => {
            pill.addEventListener('click', function () {
                categoryPills.forEach(p => p.classList.remove('is-active'));
                this.classList.add('is-active');
                currentFilter = (this.dataset.filter || 'all').toLowerCase();
                filterAndRender();
            });
        });

        // Grid / List toggle
        if (gridViewBtn && listViewBtn && cardsGrid) {
            gridViewBtn.addEventListener('click', function () {
                currentView = 'grid';
                gridViewBtn.classList.add('is-active');
                listViewBtn.classList.remove('is-active');
                cardsGrid.classList.remove('is-list-view');
            });

            listViewBtn.addEventListener('click', function () {
                currentView = 'list';
                listViewBtn.classList.add('is-active');
                gridViewBtn.classList.remove('is-active');
                cardsGrid.classList.add('is-list-view');
            });
        }

        // Reader Modal trigger delegation
        document.addEventListener('click', function (e) {
            // Check button click
            const readTrigger = e.target.closest('[data-action="read-modal"]');
            if (readTrigger) {
                e.preventDefault();
                const card = readTrigger.closest('.ch-card') || readTrigger.closest('.ch-featured-card');
                if (card) {
                    const itemId = card.dataset.itemId;
                    openReaderModal(itemId);
                }
                return;
            }

            // Click card body
            const clickedCard = e.target.closest('.ch-card');
            if (clickedCard && !e.target.closest('a') && !e.target.closest('button')) {
                const itemId = clickedCard.dataset.itemId;
                openReaderModal(itemId);
            }
        });

        // Modal close
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function (e) {
                if (e.target === modalOverlay) {
                    closeReaderModal();
                }
            });
        }

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeReaderModal);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('is-active')) {
                closeReaderModal();
            }
        });
    }

    // Filter and Render
    function filterAndRender() {
        let visibleCount = 0;

        allItems.forEach(item => {
            const matchesCategory = (currentFilter === 'all') || (item.category === currentFilter);
            const matchesSearch = (currentSearch === '') || 
                (item.title.toLowerCase().includes(currentSearch)) || 
                (item.excerpt.toLowerCase().includes(currentSearch)) ||
                (item.author.toLowerCase().includes(currentSearch));

            const isVisible = matchesCategory && matchesSearch;

            if (item.element) {
                item.element.style.display = isVisible ? '' : 'none';
            }

            if (isVisible) visibleCount++;
        });

        // Empty state visibility
        if (emptyState) {
            emptyState.classList.toggle('is-visible', visibleCount === 0);
        }

        updateCounter(visibleCount);
    }

    function updateCounter(count) {
        if (itemCounter) {
            const template = getI18nText('hub.counter.text', '{count} İçerik Listeleniyor');
            itemCounter.textContent = template.replace('{count}', count);
        }
    }

    // Open detailed reader modal
    function openReaderModal(itemId) {
        const item = allItems.find(i => i.id == itemId);
        if (!item || !modalOverlay) return;

        const modalCategory = document.getElementById('ch-modal-category');
        const modalReadTime = document.getElementById('ch-modal-time');
        const modalTitle = document.getElementById('ch-modal-title');
        const modalAuthor = document.getElementById('ch-modal-author');
        const modalDate = document.getElementById('ch-modal-date');
        const modalBody = document.getElementById('ch-modal-body');
        const modalFileBtn = document.getElementById('ch-modal-file-btn');
        const modalShareBtn = document.getElementById('ch-modal-share-btn');

        if (modalCategory) {
            const deptKey = `hub.filter.${item.category}`;
            modalCategory.textContent = getI18nText(deptKey, item.category).toUpperCase();
            modalCategory.className = `ch-badge-dept dept-${item.category}`;
        }
        if (modalReadTime) {
            const timeText = item.readTime || getI18nText('hub.readTime', '5 dk okuma').replace('{time}', '5');
            modalReadTime.innerHTML = `<i class="fa-solid fa-clock"></i> ${timeText}`;
        }
        if (modalTitle) modalTitle.textContent = item.title;
        if (modalAuthor) modalAuthor.textContent = item.author;
        if (modalDate) modalDate.textContent = item.date || getI18nText('hub.archiveDate', 'The Nest Arşivi');
        if (modalBody) modalBody.innerHTML = item.fullContent;

        if (modalFileBtn) {
            if (item.fileUrl) {
                modalFileBtn.href = item.fileUrl;
                modalFileBtn.style.display = 'inline-flex';
                let btnText = getI18nText('hub.btn.downloadPdf', 'PDF Olarak İndir');
                if (item.type === 'objeler' || item.type === 'tasarim') {
                    btnText = getI18nText('hub.btn.downloadCad', 'STEP / CAD İndir');
                } else if (item.type === 'dersler' || item.type === 'egitim') {
                    btnText = getI18nText('hub.btn.downloadCurriculum', 'Müfredatı İndir (PDF)');
                }
                modalFileBtn.innerHTML = `<i class="fa-solid fa-download"></i> ${btnText}`;
            } else {
                modalFileBtn.style.display = 'none';
            }
        }

        if (modalShareBtn) {
            const shareLabel = getI18nText('hub.btn.share', 'Paylaş');
            const copiedLabel = getI18nText('hub.btn.copied', 'Kopyalandı');
            modalShareBtn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> ${shareLabel}`;
            modalShareBtn.onclick = function () {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href);
                    modalShareBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${copiedLabel}`;
                    setTimeout(() => {
                        modalShareBtn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> ${shareLabel}`;
                    }, 2000);
                }
            };
        }

        modalOverlay.classList.add('is-active');
        document.body.style.overflow = 'hidden';
    }

    function closeReaderModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('is-active');
        document.body.style.overflow = '';
    }

    // Dynamic CMS Content loading
    async function loadCMSContent() {
        const rootContainer = document.querySelector('[data-cms-type]');
        if (!rootContainer || !cardsGrid) return;

        const contentType = rootContainer.dataset.cmsType;
        const base = document.documentElement.getAttribute('data-base-path') || '';

        try {
            const res = await fetch(`${base}api/content?type=${contentType}`);
            if (!res.ok) return;
            const data = await res.json();
            const items = data.items || [];
            if (items.length === 0) return;

            const readBtnLabel = getI18nText('hub.btn.read', 'Oku');

            items.forEach(item => {
                if (allItems.some(i => i.id == `cms-${item.id}`)) return;

                const deptSlug = (item.category || 'genel').toLowerCase();
                const cardEl = document.createElement('article');
                cardEl.className = 'ch-card';
                cardEl.dataset.itemId = `cms-${item.id}`;
                cardEl.dataset.category = deptSlug;
                cardEl.dataset.type = contentType;
                cardEl.dataset.fileUrl = item.file_url || '';

                const bgImage = item.image_url || 'images/mk/1.jpg';
                const authorName = item.author_display_name || item.author_username || 'The Nest Team';
                const publishDate = item.created_at ? new Date(item.created_at).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Güncel';

                cardEl.innerHTML = `
                    <div class="ch-card-header">
                        <img src="${escapeHtml(bgImage)}" alt="${escapeHtml(item.title)}" class="ch-card-img" loading="lazy">
                        <div class="ch-card-overlay"></div>
                        <div class="ch-card-badges">
                            <span class="ch-badge-dept dept-${deptSlug}">${escapeHtml(item.category || 'Genel')}</span>
                            <span class="ch-badge-time"><i class="fa-solid fa-clock"></i> 5 dk okuma</span>
                        </div>
                    </div>
                    <div class="ch-card-body">
                        <h3 class="ch-card-title">${escapeHtml(item.title)}</h3>
                        <p class="ch-card-excerpt">${escapeHtml(item.summary || item.body || '')}</p>
                        <div class="ch-card-footer">
                            <div class="ch-author-info">
                                <div class="ch-author-avatar"><i class="fa-solid fa-user-astronaut"></i></div>
                                <div class="ch-author-text">
                                    <span class="ch-author-name">${escapeHtml(authorName)}</span>
                                    <span class="ch-card-date">${escapeHtml(publishDate)}</span>
                                </div>
                            </div>
                            <div class="ch-card-actions">
                                <button type="button" class="ch-btn-action" data-action="read-modal">
                                    <i class="fa-solid fa-book-open"></i> ${readBtnLabel}
                                </button>
                                ${item.file_url ? `
                                    <a href="${escapeHtml(item.file_url)}" target="_blank" class="ch-btn-icon" title="Dosyayı İndir" onclick="event.stopPropagation();">
                                        <i class="fa-solid fa-file-pdf"></i>
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="ch-full-content-source" style="display:none;">
                        ${item.summary ? `<div class="ch-callout-box"><strong>Özet:</strong> ${escapeHtml(item.summary)}</div>` : ''}
                        <div class="ch-modal-body-text">
                            ${escapeHtml(item.body).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}
                        </div>
                    </div>
                `;

                cardsGrid.appendChild(cardEl);

                allItems.push({
                    element: cardEl,
                    id: `cms-${item.id}`,
                    category: deptSlug,
                    type: contentType,
                    title: item.title,
                    excerpt: item.summary || item.body || '',
                    author: authorName,
                    date: publishDate,
                    readTime: '5 dk okuma',
                    img: bgImage,
                    fileUrl: item.file_url || '',
                    fullContent: item.body ? escapeHtml(item.body).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>') : '',
                    isDynamic: true
                });
            });

            filterAndRender();
        } catch (_) {}
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
