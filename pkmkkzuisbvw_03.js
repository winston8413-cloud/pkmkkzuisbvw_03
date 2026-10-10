    // Прямое сохранение файлов/изображений в папку Загрузки (Download) без системных диалогов (SocialSharing)
    function saveOrShareFile(fileName, dataOrBlob, mimeType) {
        if (window.cordova && window.resolveLocalFileSystemURL) {
            var storageLocation = cordova.file.externalRootDirectory 
                ? cordova.file.externalRootDirectory + "Download/" 
                : cordova.file.dataDirectory;

            window.resolveLocalFileSystemURL(storageLocation, function (dirEntry) {
                dirEntry.getFile(fileName, { create: true, exclusive: false }, function (fileEntry) {
                    fileEntry.createWriter(function (fileWriter) {
                        fileWriter.onwriteend = function () {
                            console.log("Файл успешно сохранен:", fileEntry.toURL());
                            if (window.plugins && window.plugins.toast) {
                                window.plugins.toast.showShortBottom("Сохранено в Загрузки: " + fileName);
                            } else {
                                customAlert('Успешно', "Сохранено в Загрузки: " + fileName);
                            }
                        };

                        fileWriter.onerror = function (e) {
                            console.error("Ошибка записи файла:", e.toString());
                            customAlert('Ошибка', 'Не удалось записать файл: ' + e.toString());
                        };

                        let blob;
                        if (dataOrBlob instanceof Blob) {
                            blob = dataOrBlob;
                        } else if (typeof dataOrBlob === 'string' && dataOrBlob.startsWith('data:')) {
                            const arr = dataOrBlob.split(',');
                            const bstr = atob(arr[1]);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) {
                                u8arr[n] = bstr.charCodeAt(n);
                            }
                            blob = new Blob([u8arr], { type: mimeType || 'application/octet-stream' });
                        } else {
                            blob = new Blob([dataOrBlob], { type: mimeType || 'text/plain' });
                        }
                        fileWriter.write(blob);
                    }, function (err) { customAlert('Ошибка', 'Ошибка создания writer'); });
                }, function (err) { customAlert('Ошибка', 'Ошибка создания файла'); });
            }, function (err) { customAlert('Ошибка', 'Ошибка доступа к папке Download'); });
        } else {
            // Фолбэк для традиционного браузерного окружения
            const a = document.createElement('a');
            if (dataOrBlob instanceof Blob) {
                a.href = URL.createObjectURL(dataOrBlob);
            } else {
                a.href = dataOrBlob;
            }
            a.download = fileName;
            a.click();
            if (dataOrBlob instanceof Blob) {
                URL.revokeObjectURL(a.href);
            }
        }
    }

    // Красивые заменители для alert и confirm
    function customAlert(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-alert-modal');
            document.getElementById('custom-alert-title').textContent = title || 'Уведомление';
            document.getElementById('custom-alert-msg').textContent = message || '';
            const cancelBtn = document.getElementById('custom-alert-cancel-btn');
            const okBtn = document.getElementById('custom-alert-ok-btn');

            cancelBtn.style.display = 'none';

            const onOk = () => {
                modal.classList.remove('active');
                checkModalState();
                okBtn.removeEventListener('click', onOk);
                resolve();
            };

            okBtn.addEventListener('click', onOk);
            modal.classList.add('active');
            checkModalState();
        });
    }

    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-alert-modal');
            document.getElementById('custom-alert-title').textContent = title || 'Подтверждение действия';
            document.getElementById('custom-alert-msg').textContent = message || '';
            const cancelBtn = document.getElementById('custom-alert-cancel-btn');
            const okBtn = document.getElementById('custom-alert-ok-btn');

            cancelBtn.style.display = 'inline-block';

            const onOk = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                modal.classList.remove('active');
                checkModalState();
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            modal.classList.add('active');
            checkModalState();
        });
    }

    // Функции открытия и закрытия модального окна чата
    function openChatModal() {
        document.getElementById('chat-modal').classList.add('active');
        checkModalState();
    }

    function closeChatModal() {
        document.getElementById('chat-modal').classList.remove('active');
        checkModalState();
    }

    // Вспомогательная функция для сортировки записей по дате смены (rawDate)
    function sortJournalEntries(entries) {
        return entries.sort((a, b) => {
            const dateA = parseEntryDateStr(a);
            const dateB = parseEntryDateStr(b);
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA); // Новые даты сверху
            }
            // Если даты одинаковые: ночные смены идут выше дневных
            if (a.shiftType !== b.shiftType) {
                return a.shiftType === 'night' ? -1 : 1;
            }
            // Если дата и тип смены совпадают — сортируем по id (времени создания)
            return (b.id || 0) - (a.id || 0);
        });
    }

    // Вспомогательные функции блокировки/разблокировки скролла
    function checkModalState() {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        if (activeModals.length > 0) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }

    // ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКА FIREBASE (БЕЗОПАСНАЯ ДЛЯ ОФЛАЙНА И СИНХРОНИЗАЦИИ)
    let db = null;
    let journalRef = null;
    let settingsRef = null;
    let isConnected = false;

    if (typeof firebase !== 'undefined') {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyAfA5iDg9ncQ7_s1cLzqXg0T4HjIfteb2Q",
                authDomain: "zhurnal2.firebaseapp.com",
                databaseURL: "https://zhurnal2-default-rtdb.firebaseio.com",
                projectId: "zhurnal2",
                storageBucket: "zhurnal2.firebasestorage.app",
                messagingSenderId: "834111888738",
                appId: "1:834111888738:web:2c8e48cf69419536bb203b"
            };

            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            journalRef = db.ref('kubaturnik_journal');
            settingsRef = db.ref('kubaturnik_settings');

            db.ref('.info/connected').on('value', (snap) => {
                if (snap.val() === true) {
                    isConnected = true;
                    syncLocalPendingItemsToServer();
                } else {
                    isConnected = false;
                }
            });
        } catch (e) {
            console.warn("Firebase не удалось инициализировать, работает в автономном режиме.", e);
        }
    }

    const LENGTH = 6;

    const groups = [
        { title: "Доска 65 мм", items: [{ id: "150_65", w: 150, h: 65 }] },
        { title: "Доска 50 мм", items: [{ id: "200_50", w: 200, h: 50 }, { id: "150_50", w: 150, h: 50 }, { id: "125_50", w: 125, h: 50 }, { id: "100_50", w: 100, h: 50 }] },
        { title: "Доска 47 мм", items: [{ id: "200_47", w: 200, h: 47 }, { id: "150_47", w: 150, h: 47 }] },
        { title: "Доска 40 мм", items: [{ id: "150_40", w: 150, h: 40 }, { id: "100_40", w: 100, h: 40 }] },
        { title: "Доска 25 мм", items: [{ id: "150_25", w: 150, h: 25 }, { id: "100_25", w: 100, h: 25 }] },
        { title: "Доска 22 мм", items: [{ id: "150_22", w: 150, h: 22 }] },
        { title: "Брус и Брусок", items: [{ id: "200_200", w: 200, h: 200 }, { id: "200_150", w: 200, h: 150 }, { id: "200_100", w: 200, h: 100 }, { id: "150_150", w: 150, h: 150 }, { id: "150_100", w: 150, h: 100 }, { id: "100_100", w: 100, h: 100 }, { id: "50_50", w: 50, h: 50 }] }
    ];

    let visibleItems = JSON.parse(localStorage.getItem('kubaturnik_visible_items')) || {};
    let savedQuantities = JSON.parse(localStorage.getItem('kubaturnik_saved_quantities')) || {};
    let journalData = JSON.parse(localStorage.getItem('kubaturnik_journal')) || [];
    
    let defaultWorkers = JSON.parse(localStorage.getItem('kubaturnik_workers')) || ["Рамщик", "Работник 1", "Работник 2"];
    let activeWorkers = JSON.parse(localStorage.getItem('kubaturnik_active_workers')) || [true, true, true];
    let currentShiftType = localStorage.getItem('kubaturnik_shift_type') || 'day';
    let cubicRate = parseFloat(localStorage.getItem('kubaturnik_rate')) || 1250;
    let sawdustRate = parseFloat(localStorage.getItem('kubaturnik_sawdust_rate')) || 300;

    let sawdustCarts = parseInt(localStorage.getItem('kubaturnik_sawdust_carts')) || 0;
    let cardSawdustOff = {};
    let openCardDetailsMap = {};
    let isModalSawdustActive = true;
    let currentTotalVol = 0;
    let currentTotalMoney = 0;
    let currentPerPerson = 0;

    function saveJournalToLocalStorage() {
        localStorage.setItem('kubaturnik_journal', JSON.stringify(journalData));
    }

    function syncJournalData() {
        saveJournalToLocalStorage();
        if (journalRef && isConnected) {
            journalRef.set(journalData).catch(err => console.error("Ошибка сохранения журнала в Firebase:", err));
        }
    }

    function syncLocalPendingItemsToServer() {
        if (!journalRef || !isConnected) return;
        
        let pendingExist = journalData.some(item => item.pendingSync);
        
        journalRef.once('value').then(snapshot => {
            let serverData = snapshot.val() || [];
            if (!Array.isArray(serverData)) {
                serverData = [];
            }
            
            let mergedMap = new Map();
            
            serverData.forEach(item => {
                if (item && item.id) mergedMap.set(item.id, item);
            });
            
            let hasChanges = false;
            journalData.forEach(item => {
                if (!item || !item.id) return;
                if (item.pendingSync) {
                    delete item.pendingSync;
                    mergedMap.set(item.id, item);
                    hasChanges = true;
                } else if (!mergedMap.has(item.id)) {
                    mergedMap.set(item.id, item);
                }
            });
            
            let newJournalList = Array.from(mergedMap.values());
            sortJournalEntries(newJournalList);
            
            journalData = newJournalList;
            saveJournalToLocalStorage();
            
            journalRef.set(journalData).catch(err => console.error("Ошибка синхронизации списка с Firebase:", err));
            
            if (document.getElementById('journal-view').style.display === 'block') {
                renderJournalList();
            }
        }).catch(err => console.error("Ошибка получения данных от Firebase при синхронизации:", err));
    }

    function syncSettingsData() {
        localStorage.setItem('kubaturnik_rate', cubicRate);
        localStorage.setItem('kubaturnik_sawdust_rate', sawdustRate);
        localStorage.setItem('kubaturnik_workers', JSON.stringify(defaultWorkers));
        localStorage.setItem('kubaturnik_visible_items', JSON.stringify(visibleItems));

        if (settingsRef && isConnected) {
            settingsRef.set({
                rate: cubicRate,
                sawdust_rate: sawdustRate,
                workers: defaultWorkers,
                visible_items: visibleItems
            }).catch(err => console.error("Ошибка сохранения настроек в Firebase:", err));
        }
    }

    if (journalRef) {
        journalRef.on('value', (snapshot) => {
            const serverData = snapshot.val();
            if (serverData && Array.isArray(serverData)) {
                let pendingMap = new Map();
                journalData.forEach(item => {
                    if (item && item.pendingSync) {
                        pendingMap.set(item.id, item);
                    }
                });

                let mergedMap = new Map();
                serverData.forEach(item => {
                    if (item && item.id) mergedMap.set(item.id, item);
                });

                pendingMap.forEach((item, id) => {
                    mergedMap.set(id, item);
                });

                journalData = Array.from(mergedMap.values());
                sortJournalEntries(journalData);

                saveJournalToLocalStorage();
                if (document.getElementById('journal-view').style.display === 'block') {
                    renderJournalList();
                }
            }
        });
    }

    if (settingsRef) {
        settingsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                if (data.rate !== undefined) {
                    cubicRate = data.rate;
                    localStorage.setItem('kubaturnik_rate', cubicRate);
                }
                if (data.sawdust_rate !== undefined) {
                    sawdustRate = data.sawdust_rate;
                    localStorage.setItem('kubaturnik_sawdust_rate', sawdustRate);
                }
                if (data.workers) {
                    defaultWorkers = data.workers;
                    localStorage.setItem('kubaturnik_workers', JSON.stringify(defaultWorkers));
                }
                if (data.visible_items) {
                    visibleItems = data.visible_items;
                    localStorage.setItem('kubaturnik_visible_items', JSON.stringify(visibleItems));
                }
                renderWorkersCheckboxes();
                renderMainList();
            }
        });
    }

    function initVisibleItemsDefaults() {
        groups.forEach(g => {
            g.items.forEach(i => {
                if (visibleItems[i.id] === undefined) {
                    visibleItems[i.id] = true;
                }
            });
        });
    }

    function clearInputField(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    function formatDateToYYYYMMDD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateToDDMMYYYY(dateStr) {
        if (!dateStr) return '';
        const p = dateStr.split('-');
        if (p.length !== 3) return dateStr;
        return `${p[2]}.${p[1]}.${p[0]}`;
    }

    function getSelectedPeriodText() {
        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        if (fromStr && toStr) {
            return `${formatDateToDDMMYYYY(fromStr)} / ${formatDateToDDMMYYYY(toStr)}`;
        } else if (fromStr) {
            return `с ${formatDateToDDMMYYYY(fromStr)}`;
        } else if (toStr) {
            return `по ${formatDateToDDMMYYYY(toStr)}`;
        }
        return "Всё время";
    }

    function toggleSawdustCarts() {
        sawdustCarts = (sawdustCarts + 1) % 4;
        localStorage.setItem('kubaturnik_sawdust_carts', sawdustCarts);
        updateSawdustBtnUI();
        calculateTotals();
    }

    function updateSawdustBtnUI() {
        const sawdustBtn = document.getElementById('sawdust-btn');
        sawdustBtn.textContent = sawdustCarts > 0 ? `🧹${sawdustCarts}` : '🧹';
    }

    function toggleModalSawdust() {
        isModalSawdustActive = !isModalSawdustActive;
        const modalBtn = document.getElementById('modal-sawdust-btn');
        if (isModalSawdustActive) {
            modalBtn.classList.remove('off');
        } else {
            modalBtn.classList.add('off');
        }
        updateWorkerMoneyModalData();
    }

    function toggleFilterPopover() {
        const popover = document.getElementById('filter-popover');
        popover.classList.toggle('open');
    }

    function setFirstHalfMonthFilter() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month, 15);

        document.getElementById('filter-date-from').value = formatDateToYYYYMMDD(startDate);
        document.getElementById('filter-date-to').value = formatDateToYYYYMMDD(endDate);
        renderJournalList();
    }

    function setSecondHalfMonthFilter() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const startDate = new Date(year, month, 16);
        const endDate = new Date(year, month + 1, 0);

        document.getElementById('filter-date-from').value = formatDateToYYYYMMDD(startDate);
        document.getElementById('filter-date-to').value = formatDateToYYYYMMDD(endDate);
        renderJournalList();
    }

    function setCurrentHalfMonthFilter() {
        const day = new Date().getDate();
        if (day <= 15) {
            setFirstHalfMonthFilter();
        } else {
            setSecondHalfMonthFilter();
        }
    }

    function setCurrentMonthFilter() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        document.getElementById('filter-date-from').value = formatDateToYYYYMMDD(startDate);
        document.getElementById('filter-date-to').value = formatDateToYYYYMMDD(endDate);
        renderJournalList();
    }

    function setCurrentYearFilter() {
        const now = new Date();
        const year = now.getFullYear();

        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        document.getElementById('filter-date-from').value = formatDateToYYYYMMDD(startDate);
        document.getElementById('filter-date-to').value = formatDateToYYYYMMDD(endDate);
        renderJournalList();
    }

    function setPreviousMonthFilter() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        document.getElementById('filter-date-from').value = formatDateToYYYYMMDD(startDate);
        document.getElementById('filter-date-to').value = formatDateToYYYYMMDD(endDate);
        renderJournalList();
    }

    function clearDateFilter() {
        if (journalData.length === 0) {
            document.getElementById('filter-date-from').value = '';
            document.getElementById('filter-date-to').value = '';
            renderJournalList();
            return;
        }

        const dates = journalData
            .map(item => parseEntryDateStr(item))
            .filter(Boolean)
            .sort();

        if (dates.length > 0) {
            document.getElementById('filter-date-from').value = dates[0];
            document.getElementById('filter-date-to').value = dates[dates.length - 1];
        } else {
            document.getElementById('filter-date-from').value = '';
            document.getElementById('filter-date-to').value = '';
        }

        renderJournalList();
    }

    function renderWorkersCheckboxes() {
        const container = document.getElementById('workers-checkbox-list');
        container.innerHTML = '';
        const fallbackNames = ["Рамщик", "Работник 1", "Работник 2"];
        const ramshikName = defaultWorkers[0] || fallbackNames[0];

        defaultWorkers.forEach((name, index) => {
            const currentName = name || fallbackNames[index];
            const isRamshik = (index === 0) || (currentName === ramshikName);
            const styleAttr = isRamshik ? 'style="color: #8B4513; font-weight: bold;"' : '';
            
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" ${activeWorkers[index] ? 'checked' : ''} onchange="toggleWorker(${index})">
                <span ${styleAttr}>${currentName}</span>
            `;
            container.appendChild(label);
        });
    }

    function toggleWorker(index) {
        activeWorkers[index] = !activeWorkers[index];
        localStorage.setItem('kubaturnik_active_workers', JSON.stringify(activeWorkers));
        calculateTotals();
    }

    function setShiftType(type) {
        currentShiftType = type;
        localStorage.setItem('kubaturnik_shift_type', type);
        document.getElementById('shift-day-btn').classList.toggle('active', type === 'day');
        document.getElementById('shift-night-btn').classList.toggle('active', type === 'night');
    }

    function renderMainList() {
        const listContainer = document.getElementById('calculator-list');
        listContainer.innerHTML = '';

        groups.forEach(group => {
            const activeItems = group.items.filter(item => visibleItems[item.id]);

            if (activeItems.length > 0) {
                const groupEl = document.createElement('div');
                groupEl.className = 'section-group';

                const titleEl = document.createElement('div');
                titleEl.className = 'group-title';
                titleEl.textContent = group.title;
                groupEl.appendChild(titleEl);

                activeItems.forEach(item => {
                    const unitVol = (item.w / 1000) * (item.h / 1000) * LENGTH;
                    const savedQty = savedQuantities[item.id] || '';

                    const rowEl = document.createElement('div');
                    rowEl.className = 'item-row';
                    rowEl.innerHTML = `
                        <div class="size-label">${item.w} / ${item.h}</div>
                        <div class="input-group">
                            <input type="number" 
                                   min="0" 
                                   step="1" 
                                   placeholder="0" 
                                   class="qty-input" 
                                   data-id="${item.id}"
                                   data-size="${item.w}/${item.h}"
                                   data-unit-vol="${unitVol}"
                                   value="${savedQty}"
                                   oninput="onQtyChange(this)">
                            <span class="unit-label">шт</span>
                        </div>
                        <div class="vol-output">
                            <span class="vol-val">0.0000</span> <span class="unit">куб</span>
                        </div>
                    `;
                    groupEl.appendChild(rowEl);
                });

                listContainer.appendChild(groupEl);
            }
        });

        calculateTotals();
    }

    function renderSettingsList() {
        document.getElementById('cubic-rate-input').value = cubicRate;
        document.getElementById('sawdust-rate-input').value = sawdustRate;
        document.getElementById('worker1-name').value = defaultWorkers[0] || '';
        document.getElementById('worker2-name').value = defaultWorkers[1] || '';
        document.getElementById('worker3-name').value = defaultWorkers[2] || '';

        const settingsContainer = document.getElementById('settings-list');
        settingsContainer.innerHTML = '';

        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'section-group';

            const titleEl = document.createElement('div');
            titleEl.className = 'group-title';
            titleEl.textContent = group.title;
            groupEl.appendChild(titleEl);

            group.items.forEach(item => {
                const isChecked = visibleItems[item.id] !== false;
                
                const rowEl = document.createElement('div');
                rowEl.className = 'setting-item-row';
                rowEl.innerHTML = `
                    <input type="checkbox" id="chk_${item.id}" data-id="${item.id}" ${isChecked ? 'checked' : ''}>
                    <label for="chk_${item.id}">Сечение ${item.w} / ${item.h}</label>
                `;
                groupEl.appendChild(rowEl);
            });

            settingsContainer.appendChild(groupEl);
        });
    }

    function onQtyChange(input) {
        const itemId = input.dataset.id;
        savedQuantities[itemId] = input.value;
        localStorage.setItem('kubaturnik_saved_quantities', JSON.stringify(savedQuantities));
        calculateTotals();
    }

    function calculateTotals() {
        const inputs = document.querySelectorAll('.qty-input');
        let totalVol = 0;

        inputs.forEach(input => {
            const pcs = parseInt(input.value) || 0;
            const unitVol = parseFloat(input.dataset.unitVol);
            const rowVol = pcs * unitVol;

            const rowVolEl = input.closest('.item-row').querySelector('.vol-val');
            rowVolEl.textContent = rowVol.toFixed(4);

            totalVol += rowVol;
        });

        currentTotalVol = totalVol;
        
        const sawdustBonus = sawdustCarts * sawdustRate;
        currentTotalMoney = Math.round(totalVol * cubicRate) + sawdustBonus;

        const activeCount = activeWorkers.filter(Boolean).length;
        currentPerPerson = activeCount > 0 ? Math.round(currentTotalMoney / activeCount) : 0;

        document.getElementById('total-vol').textContent = totalVol.toFixed(4) + ' м³';
        document.getElementById('total-money').textContent = `${currentTotalMoney.toLocaleString('ru-RU')} ₽ / ${currentPerPerson.toLocaleString('ru-RU')} ₽`;
    }

    function resetAll() {
        const inputs = document.querySelectorAll('.qty-input');
        inputs.forEach(input => {
            input.value = '';
        });
        savedQuantities = {};
        sawdustCarts = 0;
        localStorage.removeItem('kubaturnik_sawdust_carts');
        updateSawdustBtnUI();
        localStorage.removeItem('kubaturnik_saved_quantities');
        calculateTotals();
    }

    async function saveShiftToJournal() {
        if (currentTotalVol === 0 && sawdustCarts === 0) {
            await customAlert('Внимание', 'Сначала введите количество пиломатериала или телег с опилом!');
            return;
        }

        const presentWorkers = defaultWorkers.filter((_, idx) => activeWorkers[idx]);
        if (presentWorkers.length === 0) {
            await customAlert('Внимание', 'Выберите хотя бы одного работавшего человека!');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('shift-date-picker').value = today;

        document.getElementById('date-modal').classList.add('active');
        checkModalState();
    }

    function closeDateModal() {
        document.getElementById('date-modal').classList.remove('active');
        checkModalState();
    }

    async function confirmSaveShift() {
        const rawDate = document.getElementById('shift-date-picker').value;
        if (!rawDate) {
            await customAlert('Внимание', 'Пожалуйста, выберите дату!');
            return;
        }

        const parts = rawDate.split('-');
        const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;

        const presentWorkers = defaultWorkers.filter((_, idx) => activeWorkers[idx]);

        const itemsDetail = [];
        const inputs = document.querySelectorAll('.qty-input');
        inputs.forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
                const unitVol = parseFloat(input.dataset.unitVol);
                const vol = (qty * unitVol).toFixed(4);
                itemsDetail.push({
                    size: input.dataset.size,
                    qty: qty,
                    vol: vol
                });
            }
        });

        const isOffline = !navigator.onLine || !isConnected;

        const entry = {
            id: Date.now(),
            date: formattedDate,
            rawDate: rawDate,
            shiftType: currentShiftType,
            workers: presentWorkers,
            vol: currentTotalVol.toFixed(4),
            sawdustCarts: sawdustCarts,
            totalMoney: currentTotalMoney,
            perPerson: currentPerPerson,
            items: itemsDetail,
            pendingSync: isOffline
        };

        journalData.push(entry);
        sortJournalEntries(journalData);
        syncJournalData();

        closeDateModal();
        await customAlert('Успешно', 'Смена успешно сохранена в журнал! 📙');
    }

    function toggleCardDetails(cardId) {
        const detailsEl = document.getElementById(`details-${cardId}`);
        if (detailsEl) {
            const isOpen = detailsEl.classList.toggle('open');
            openCardDetailsMap[cardId] = isOpen;
        }
    }

    function parseEntryDateStr(item) {
        if (item.rawDate) return item.rawDate;
        if (item.date) {
            const p = item.date.split('.');
            return `${p[2]}-${p[1]}-${p[0]}`;
        }
        return '';
    }

    function exportData() {
        const backupData = {
            journal: JSON.parse(localStorage.getItem('kubaturnik_journal')) || [],
            workers: JSON.parse(localStorage.getItem('kubaturnik_workers')) || [],
            rate: localStorage.getItem('kubaturnik_rate'),
            sawdust_rate: localStorage.getItem('kubaturnik_sawdust_rate'),
            visible_items: JSON.parse(localStorage.getItem('kubaturnik_visible_items')) || {}
        };
        
        const fileName = `kubaturnik_backup_${new Date().toISOString().split('T')[0]}.json`;
        const jsonStr = JSON.stringify(backupData, null, 2);

        const blob = new Blob([jsonStr], { type: 'application/json' });
        saveOrShareFile(fileName, blob, 'application/json');
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.journal) {
                    journalData = data.journal;
                    sortJournalEntries(journalData);
                }
                if (data.workers) defaultWorkers = data.workers;
                if (data.rate) cubicRate = parseFloat(data.rate);
                if (data.sawdust_rate) sawdustRate = parseFloat(data.sawdust_rate);
                if (data.visible_items) visibleItems = data.visible_items;
                
                syncJournalData();
                syncSettingsData();

                await customAlert('Успешно', 'Данные успешно импортированы!');
                location.reload();
            } catch (err) {
                await customAlert('Ошибка', 'Ошибка при чтении файла резервной копии.');
            }
        };
        reader.readAsText(file);
    }

    function openAssortmentModal() {
        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        const filteredData = journalData.filter(item => {
            const dateStr = parseEntryDateStr(item);
            if (!dateStr) return true;
            if (fromStr && dateStr < fromStr) return false;
            if (toStr && dateStr > toStr) return false;
            return true;
        });

        const summaryMap = {};
        let totalCarts = 0;
        let totalVolSum = 0;

        filteredData.forEach(shift => {
            if (shift.sawdustCarts) {
                totalCarts += shift.sawdustCarts;
            }

            if (shift.items && shift.items.length > 0) {
                shift.items.forEach(item => {
                    if (!summaryMap[item.size]) {
                        summaryMap[item.size] = { qty: 0, vol: 0 };
                    }
                    summaryMap[item.size].qty += parseInt(item.qty) || 0;
                    summaryMap[item.size].vol += parseFloat(item.vol) || 0;
                    totalVolSum += parseFloat(item.vol) || 0;
                });
            }
        });

        const container = document.getElementById('assortment-modal-content');
        container.innerHTML = '';

        const sortedSizes = Object.keys(summaryMap);

        if (sortedSizes.length === 0 && totalCarts === 0) {
            container.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px 0;">За выбранный период выпиленного ассортимента нет.</div>';
        } else {
            let html = '';

            if (sortedSizes.length > 0) {
                html += '<div class="details-title" style="margin-top:4px;">Детализация по доске:</div>';
                sortedSizes.forEach(size => {
                    const data = summaryMap[size];
                    html += `
                        <div class="details-item" style="padding: 6px 0; border-bottom: 1px solid var(--border-color);">
                            <span>Сечение ${size} — ${data.qty} шт</span>
                            <span class="vol">${data.vol.toFixed(4)} м³</span>
                        </div>
                    `;
                });
            }

            let periodText = getSelectedPeriodText();

            html += `<div class="details-title" style="margin-top:8px; border-top: 1px dashed var(--border-color); padding-top: 6px; font-size: 0.82rem; color: #0f172a; text-transform: none; font-weight: normal;">Итого: ${periodText} <span style="float: right; font-weight: 600; color: #0f172a;">${totalVolSum.toFixed(4)} м³</span></div>`;

            if (totalCarts > 0) {
                html += `
                    <div class="details-item" style="padding: 4px 0; font-weight: 700; color: #16a34a;">
                        <span>🧹 Всего телег с опилом:</span>
                        <span>${totalCarts} шт</span>
                    </div>
                `;
            }

            container.innerHTML = html;
        }

        document.getElementById('assortment-modal').classList.add('active');
        checkModalState();
    }

    function closeAssortmentModal() {
        document.getElementById('assortment-modal').classList.remove('active');
        checkModalState();
    }

    async function saveAssortmentCardAsImage() {
        if (typeof html2canvas === 'undefined') {
            await customAlert('Внимание', "Функция сохранения изображения недоступна без интернет-соединения.");
            return;
        }
        const card = document.getElementById('assortment-modal-card');
        const actions = card.querySelector('.modal-actions');

        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        let periodName = 'все_время';

        if (fromStr && toStr) {
            if (fromStr === toStr) {
                periodName = formatDateToDDMMYYYY(fromStr);
            } else {
                periodName = `${formatDateToDDMMYYYY(fromStr)}-${formatDateToDDMMYYYY(toStr)}`;
            }
        } else if (fromStr) {
            periodName = `с_${formatDateToDDMMYYYY(fromStr)}`;
        } else if (toStr) {
            periodName = `по_${formatDateToDDMMYYYY(toStr)}`;
        }

        if (actions) actions.style.display = 'none';

        html2canvas(card, { scale: 2 }).then(canvas => {
            const fileName = `Ассортимент_${periodName}.png`;
            const dataUrl = canvas.toDataURL('image/png');

            // Прямое сохранение без системных диалогов
            saveOrShareFile(fileName, dataUrl, 'image/png');

            if (actions) actions.style.display = 'flex';
        }).catch(err => {
            console.error('Ошибка при сохранении изображения:', err);
            if (actions) actions.style.display = 'flex';
        });
    }

    function printAssortmentCard() {
        if (window.cordova && cordova.plugins && cordova.plugins.printer) {
            cordova.plugins.printer.print();
        } else {
            window.print();
        }
    }

    function updateWorkerMoneyModalData() {
        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        const filteredData = journalData.filter(item => {
            const dateStr = parseEntryDateStr(item);
            if (!dateStr) return true;
            if (fromStr && dateStr < fromStr) return false;
            if (toStr && dateStr > toStr) return false;
            return true;
        });

        let totalVol = 0;
        let totalMoney = 0;
        let totalPeriodSawdustCarts = 0;

        const workerStats = {};

        filteredData.forEach(item => {
            totalVol += parseFloat(item.vol) || 0;
            const carts = item.sawdustCarts || 0;
            totalPeriodSawdustCarts += carts;

            const workersArray = Array.isArray(item.workers) ? item.workers : (item.workers || '').split(' / ');
            const numWorkers = workersArray.length || 1;

            const sawdustBonus = carts * sawdustRate;
            let shiftTotalMoney = item.totalMoney || 0;

            if (!isModalSawdustActive) {
                shiftTotalMoney -= sawdustBonus;
            }

            const shiftPerPerson = numWorkers > 0 ? Math.round(shiftTotalMoney / numWorkers) : 0;
            totalMoney += shiftTotalMoney;

            workersArray.forEach(workerName => {
                const name = workerName.trim();
                if (!name) return;
                if (!workerStats[name]) {
                    workerStats[name] = { sum: 0, shifts: 0 };
                }
                workerStats[name].sum += shiftPerPerson;
                workerStats[name].shifts += 1;
            });
        });

        const modalBtn = document.getElementById('modal-sawdust-btn');
        if (modalBtn) {
            modalBtn.textContent = totalPeriodSawdustCarts > 0 ? `🧹${totalPeriodSawdustCarts}` : '🧹';
        }

        document.getElementById('wm-modal-vol').textContent = totalVol.toFixed(4) + ' м³';
        document.getElementById('wm-modal-money').textContent = `${totalMoney.toLocaleString('ru-RU')} ₽`;
        
        const periodDateEl = document.getElementById('wm-modal-period-date');
        if (periodDateEl) {
            periodDateEl.textContent = getSelectedPeriodText();
        }

        const listContainer = document.getElementById('worker-money-list');
        listContainer.innerHTML = '';

        const sortedWorkers = Object.keys(workerStats)
            .map(name => ({
                name,
                shifts: workerStats[name].shifts,
                sum: workerStats[name].sum
            }))
            .sort((a, b) => {
                if (b.shifts !== a.shifts) {
                    return b.shifts - a.shifts;
                }
                return b.sum - a.sum;
            });

        if (sortedWorkers.length === 0) {
            listContainer.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 10px 0;">Нет данных за выбранный период.</div>';
        } else {
            const ramshikName = defaultWorkers[0] || "Рамщик";

            sortedWorkers.forEach(worker => {
                const isRamshik = worker.name === ramshikName;
                const ramshikClass = isRamshik ? 'ramshik' : '';
                
                const row = document.createElement('div');
                row.className = 'worker-money-row';
                row.innerHTML = `
                    <div class="worker-money-name ${ramshikClass}">
                        ${worker.name}
                        <div class="worker-money-shifts">${worker.shifts} смен(ы)</div>
                    </div>
                    <div class="worker-money-val">${worker.sum.toLocaleString('ru-RU')} ₽</div>
                `;
                listContainer.appendChild(row);
            });
        }
    }

    function openWorkerMoneyModal() {
        isModalSawdustActive = true;
        const modalBtn = document.getElementById('modal-sawdust-btn');
        if (modalBtn) modalBtn.classList.remove('off');

        updateWorkerMoneyModalData();

        document.getElementById('worker-money-modal').classList.add('active');
        checkModalState();
    }

    function closeWorkerMoneyModal() {
        document.getElementById('worker-money-modal').classList.remove('active');
        checkModalState();
    }

    async function saveWorkerEarningsCardAsImage() {
        if (typeof html2canvas === 'undefined') {
            await customAlert('Внимание', "Функция сохранения изображения недоступна без интернет-соединения.");
            return;
        }
        const card = document.getElementById('worker-money-card');
        const actions = card.querySelector('.modal-actions');

        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        let periodName = 'все_время';

        if (fromStr && toStr) {
            if (fromStr === toStr) {
                periodName = formatDateToDDMMYYYY(fromStr);
            } else {
                periodName = `${formatDateToDDMMYYYY(fromStr)}-${formatDateToDDMMYYYY(toStr)}`;
            }
        } else if (fromStr) {
            periodName = `с_${formatDateToDDMMYYYY(fromStr)}`;
        } else if (toStr) {
            periodName = `по_${formatDateToDDMMYYYY(toStr)}`;
        }

        if (actions) actions.style.display = 'none';

        html2canvas(card, { scale: 2 }).then(canvas => {
            const fileName = `Зарплата_${periodName}.png`;
            const dataUrl = canvas.toDataURL('image/png');

            // Прямое сохранение без системных диалогов
            saveOrShareFile(fileName, dataUrl, 'image/png');

            if (actions) actions.style.display = 'flex';
        }).catch(err => {
            console.error('Ошибка при сохранении изображения:', err);
            if (actions) actions.style.display = 'flex';
        });
    }

    function printWorkerEarningsCard() {
        if (window.cordova && cordova.plugins && cordova.plugins.printer) {
            cordova.plugins.printer.print();
        } else {
            window.print();
        }
    }

    function toggleCardSawdust(id) {
        cardSawdustOff[id] = !cardSawdustOff[id];
        renderJournalList();
    }

    function renderJournalList() {
        sortJournalEntries(journalData);

        const fromStr = document.getElementById('filter-date-from').value;
        const toStr = document.getElementById('filter-date-to').value;

        const journalContainer = document.getElementById('journal-list');
        journalContainer.innerHTML = '';

        const filteredData = journalData.filter(item => {
            const dateStr = parseEntryDateStr(item);
            if (!dateStr) return true;

            if (fromStr && dateStr < fromStr) return false;
            if (toStr && dateStr > toStr) return false;
            return true;
        });

        let totalJournalVol = 0;
        let totalJournalMoney = 0;

        filteredData.forEach(item => {
            totalJournalVol += parseFloat(item.vol) || 0;
            const isSawdustOff = !!cardSawdustOff[item.id];
            const sawdustBonus = (item.sawdustCarts || 0) * sawdustRate;
            const shiftMoney = isSawdustOff ? Math.max(0, (item.totalMoney || 0) - sawdustBonus) : (item.totalMoney || 0);
            totalJournalMoney += shiftMoney;
        });

        const periodText = getSelectedPeriodText();

        const summaryCard = document.createElement('div');
        summaryCard.className = 'summary-card';
        summaryCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; gap: 10px;">
                <div class="summary-item">
                    <span class="summary-label">Итоговый объём</span>
                    <span class="summary-value highlight" style="font-size: 1.1rem;">${totalJournalVol.toFixed(4)} м³</span>
                </div>
                <div class="summary-item" style="align-items: flex-end;">
                    <span class="summary-label">Общая сумма</span>
                    <span class="summary-value money-highlight" style="font-size: 1.1rem;">${totalJournalMoney.toLocaleString('ru-RU')} ₽</span>
                </div>
            </div>
            <button class="btn-sandy" onclick="openAssortmentModal()">🪵 Выпиленный ассортимент</button>
            <div class="summary-period-date">${periodText}</div>
        `;
        journalContainer.appendChild(summaryCard);

        if (filteredData.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'empty-journal';
            emptyEl.innerHTML = 'За выбранный период записей не найдено.';
            journalContainer.appendChild(emptyEl);
            return;
        }

        const ramshikName = defaultWorkers[0] || "Рамщик";

        filteredData.forEach(item => {
            const isNight = item.shiftType === 'night';
            const icon = isNight ? '🌙' : '☀️';
            const badgeClass = isNight ? 'night' : 'day';
            const pinIconHtml = item.pendingSync ? `<span class="pending-pin" title="Ожидает выгрузки на сервер">📌</span>` : '';

            const workersArray = Array.isArray(item.workers) ? item.workers : (item.workers || '').split(' / ');
            const workersHtml = workersArray
                .map(w => {
                    const isRamshik = w.trim() === ramshikName;
                    const ramshikClass = isRamshik ? 'ramshik' : '';
                    return `<div class="journal-worker-item ${ramshikClass}">${w}</div>`;
                })
                .join('');

            let itemsHtml = '';
            if (item.items && item.items.length > 0) {
                itemsHtml = item.items.map(i => `
                    <div class="details-item">
                        <span>Сечение ${i.size} — ${i.qty} шт</span>
                        <span class="vol">${i.vol} м³</span>
                    </div>
                `).join('');
            } else {
                itemsHtml = '<div class="details-item" style="color: #94a3b8;">Подробности не сохранялись</div>';
            }

            if (item.sawdustCarts && item.sawdustCarts > 0) {
                itemsHtml += `
                    <div class="details-item" style="color: #16a34a; font-weight: 600;">
                        <span>🧹 Опил (${item.sawdustCarts} телеги)</span>
                        <span class="vol">+${item.sawdustCarts * sawdustRate} ₽</span>
                    </div>
                `;
            }

            const isSawdustOff = !!cardSawdustOff[item.id];
            const sawdustBonus = (item.sawdustCarts || 0) * sawdustRate;
            const shiftMoney = isSawdustOff ? Math.max(0, (item.totalMoney || 0) - sawdustBonus) : (item.totalMoney || 0);
            const numWorkers = workersArray.length || 1;
            const shiftPerPerson = numWorkers > 0 ? Math.round(shiftMoney / numWorkers) : 0;
            const isDetailsOpen = !!openCardDetailsMap[item.id];

            const card = document.createElement('div');
            card.className = 'journal-card-custom';
            card.setAttribute('onclick', `toggleCardDetails(${item.id})`);
            card.innerHTML = `
                <div class="journal-card-header">
                    <div class="journal-header-left">
                        <span class="shift-badge ${badgeClass}">${icon}</span>
                        ${pinIconHtml}
                        <span class="journal-date">${item.date}</span>
                    </div>
                    <div class="journal-workers-list">
                        ${workersHtml}
                    </div>
                </div>
                <div class="journal-card-row vol">
                    <div>Объём за смену <span class="vol-val">${item.vol} м³</span></div>
                    ${item.sawdustCarts ? `<button class="modal-icon-btn ${isSawdustOff ? 'off' : ''}" onclick="event.stopPropagation(); toggleCardSawdust(${item.id});" title="${isSawdustOff ? 'Показана сумма только за кубатуру. Нажмите, чтобы включить опил' : 'Нажмите, чтобы показать сумму только за кубатуру'}">🧹 ${item.sawdustCarts}</button>` : ''}
                </div>
                <div class="journal-card-row">
                    Сумма ${isSawdustOff ? '(Только кубатура)' : '(Всего)'} / На 1 чел
                </div>
                <div class="journal-card-footer">
                    <div class="journal-card-money">
                        ${shiftMoney.toLocaleString('ru-RU')} ₽&nbsp;/&nbsp;<span class="money-per-person">${shiftPerPerson.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    <button class="journal-del-btn" onclick="event.stopPropagation(); deleteJournalEntry(${item.id});" title="Удалить запись">🗑️</button>
                </div>
                
                <div class="journal-card-details ${isDetailsOpen ? 'open' : ''}" id="details-${item.id}">
                    <div class="details-title">Выпиленный ассортимент:</div>
                    ${itemsHtml}
                    <div class="details-hint">нажмите, чтобы свернуть</div>
                </div>
            `;
            journalContainer.appendChild(card);
        });
    }

    async function deleteJournalEntry(id) {
        const confirmed = await customConfirm('Удаление записи', 'Удалить эту запись из журнала?');
        if (confirmed) {
            journalData = journalData.filter(item => item.id !== id);
            syncJournalData();
            renderJournalList();
        }
    }

    async function clearJournal() {
        const confirmed = await customConfirm('Очистка журнала', 'Вы уверены, что хотите полностью очистить журнал записей?');
        if (confirmed) {
            journalData = [];
            syncJournalData();
            renderJournalList();
        }
    }

    function showMain() {
        document.getElementById('settings-view').style.display = 'none';
        document.getElementById('journal-view').style.display = 'none';
        document.getElementById('main-view').style.display = 'block';
    }

    function showSettings() {
        renderSettingsList();
        document.getElementById('main-view').style.display = 'none';
        document.getElementById('journal-view').style.display = 'none';
        document.getElementById('settings-view').style.display = 'block';
    }

    function showJournal() {
        document.getElementById('main-view').style.display = 'none';
        document.getElementById('settings-view').style.display = 'none';
        document.getElementById('journal-view').style.display = 'block';
        setCurrentHalfMonthFilter();
    }

    function saveSettings() {
        const newRate = parseFloat(document.getElementById('cubic-rate-input').value);
        if (!isNaN(newRate) && newRate >= 0) {
            cubicRate = newRate;
        }

        const newSawdustRate = parseFloat(document.getElementById('sawdust-rate-input').value);
        if (!isNaN(newSawdustRate) && newSawdustRate >= 0) {
            sawdustRate = newSawdustRate;
        }

        const w1 = document.getElementById('worker1-name').value.trim() || 'Рамщик';
        const w2 = document.getElementById('worker2-name').value.trim() || 'Работник 1';
        const w3 = document.getElementById('worker3-name').value.trim() || 'Работник 2';
        defaultWorkers = [w1, w2, w3];

        const checkboxes = document.querySelectorAll('#settings-list input[type="checkbox"]');
        checkboxes.forEach(chk => {
            const id = chk.dataset.id;
            visibleItems[id] = chk.checked;
        });

        syncSettingsData();

        renderWorkersCheckboxes();
        showMain();
        renderMainList();
    }

    function selectAll(status) {
        const checkboxes = document.querySelectorAll('#settings-list input[type="checkbox"]');
        checkboxes.forEach(chk => {
            chk.checked = status;
        });
    }

    // Слушатели подключения к сети
    window.addEventListener('online', () => {
        syncLocalPendingItemsToServer();
    });

    // Инициализация при старте
    initVisibleItemsDefaults();
    sortJournalEntries(journalData);
    setShiftType(currentShiftType);
    updateSawdustBtnUI();
    renderWorkersCheckboxes();
    renderMainList();