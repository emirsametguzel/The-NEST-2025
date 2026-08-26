// ==========================================================================
// THE NEST — MODERN CONTENT HUB LOGIC & INTERACTIONS (content-hub.js)
// ==========================================================================

(function () {
    'use strict';

    let allItems = [];
    let currentFilter = 'all';
    let currentSearch = '';
    let currentView = 'grid'; // 'grid' or 'list'

    // DOM Element Referansları
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

    // Sayfa Yüklendiğinde Başlat
    document.addEventListener('DOMContentLoaded', function () {
        initDOMElements();
        collectStaticItems();
        setupEventListeners();
        loadCMSContent();
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

    // Statik kartları veri dizisine al
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

    // Olay Dinleyicilerini Kur
    function setupEventListeners() {
        // Arama Girişi
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                currentSearch = this.value.trim().toLowerCase();
                if (clearSearchBtn) {
                    clearSearchBtn.classList.toggle('is-visible', currentSearch.length > 0);
                }
                filterAndRender();
            });
        }

        // Aramayı Temizle Butonu
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

        // Boş Durumdaki Sıfırlama Butonu
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

        // Departman Filtre Butonları
        categoryPills.forEach(pill => {
            pill.addEventListener('click', function () {
                categoryPills.forEach(p => p.classList.remove('is-active'));
                this.classList.add('is-active');
                currentFilter = (this.dataset.filter || 'all').toLowerCase();
                filterAndRender();
            });
        });

        // Grid / List Görünüm Değiştirici
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

        // Kart Tıklama & Okuma Modalı Açma
        document.addEventListener('click', function (e) {
            // İncele / Oku Butonları
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

            // Kartın Kendisine Tıklama (Aksiyon linkleri hariç)
            const clickedCard = e.target.closest('.ch-card');
            if (clickedCard && !e.target.closest('a') && !e.target.closest('button')) {
                const itemId = clickedCard.dataset.itemId;
                openReaderModal(itemId);
            }
        });

        // Modal Kapatma
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

    // Filtreleme ve Sonuçları Gösterme
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

        // Boş Durum Gösterimi
        if (emptyState) {
            emptyState.classList.toggle('is-visible', visibleCount === 0);
        }

        updateCounter(visibleCount);
    }

    function updateCounter(count) {
        if (itemCounter) {
            itemCounter.textContent = `${count} İçerik Listeleniyor`;
        }
    }

    // Detaylı Okuma Modalını Aç
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
            modalCategory.textContent = item.category.toUpperCase();
            modalCategory.className = `ch-badge-dept dept-${item.category}`;
        }
        if (modalReadTime) modalReadTime.innerHTML = `<i class="fa-solid fa-clock"></i> ${item.readTime || '4 dk okuma'}`;
        if (modalTitle) modalTitle.textContent = item.title;
        if (modalAuthor) modalAuthor.textContent = item.author;
        if (modalDate) modalDate.textContent = item.date || 'The Nest Arşivi';
        if (modalBody) modalBody.innerHTML = item.fullContent;

        if (modalFileBtn) {
            if (item.fileUrl) {
                modalFileBtn.href = item.fileUrl;
                modalFileBtn.style.display = 'inline-flex';
            } else {
                modalFileBtn.style.display = 'none';
            }
        }

        if (modalShareBtn) {
            modalShareBtn.onclick = function () {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href);
                    modalShareBtn.innerHTML = '<i class="fa-solid fa-check"></i> Kopyalandı';
                    setTimeout(() => {
                        modalShareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Paylaş';
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

    // Dinamik CMS İçeriklerini Yükle
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

            items.forEach(item => {
                // Eğer statik olarak zaten varsa atla
                if (allItems.some(i => i.id == `cms-${item.id}`)) return;

                const deptSlug = (item.category || 'genel').toLowerCase();
                const cardEl = document.createElement('article');
                cardEl.className = 'ch-card';
                cardEl.dataset.itemId = `cms-${item.id}`;
                cardEl.dataset.category = deptSlug;
                cardEl.dataset.type = contentType;
                cardEl.dataset.fileUrl = item.file_url || '';

                const bgImage = item.image_url || 'images/mk/1.jpg';
                const authorName = item.author_display_name || item.author_username || 'The Nest Yönetimi';
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
                                    <i class="fa-solid fa-book-open"></i> Oku
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
