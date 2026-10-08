// ui components module: custom select, custom time picker, and custom date picker

class UIComponents {
    static init(root = document) {
        root.querySelectorAll('select.custom-select-auto').forEach((sel) => {
            this.select(sel);
        });
        root.querySelectorAll('input[type="time"]').forEach((inp) => {
            this.timePicker(inp);
        });
        root.querySelectorAll('input[type="date"]').forEach((inp) => {
            this.datePicker(inp);
        });
    }

    // custom select component
    static select(selectEl, placeholder = 'Chọn...') {
        if (!selectEl || selectEl._customDropdown) return selectEl._customDropdown;

        selectEl.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper relative w-full select-none';
        selectEl.parentNode.insertBefore(wrapper, selectEl);
        wrapper.appendChild(selectEl);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger w-full px-3 py-2 bg-[#0b1222] hover:bg-[#0e172a] rounded-xl text-white text-xs flex items-center justify-between transition-all cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/40 text-left';
        trigger.innerHTML = `
            <span class="custom-select-label truncate text-slate-300 font-medium">${placeholder}</span>
            <svg class="custom-select-chevron shrink-0 ml-2 text-slate-400 transition-transform duration-100" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        `;
        wrapper.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'custom-select-menu absolute left-0 right-0 top-full mt-1.5 bg-[#080f21]/95 backdrop-blur-2xl rounded-2xl p-1.5 shadow-2xl z-50 opacity-0 pointer-events-none -translate-y-2 transition-all duration-100';
        wrapper.appendChild(menu);

        const searchWrap = document.createElement('div');
        searchWrap.className = 'custom-select-search px-1 pb-1.5 mb-1';
        searchWrap.innerHTML = `
            <div class="relative">
                <input type="text" placeholder="Tìm kiếm nhanh..." class="w-full px-2.5 py-1.5 bg-[#0e172a] rounded-lg text-white text-[11px] outline-none placeholder:text-slate-500 focus:bg-[#13203b] transition-all">
            </div>
        `;
        menu.appendChild(searchWrap);
        const searchInput = searchWrap.querySelector('input');

        const list = document.createElement('div');
        list.className = 'custom-select-list flex flex-col gap-0.5 max-h-48 overflow-y-auto pr-0.5';
        menu.appendChild(list);

        let isOpen = false;

        const closeMenu = () => {
            isOpen = false;
            menu.classList.remove('open', 'opacity-100', 'translate-y-0');
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            trigger.querySelector('.custom-select-chevron')?.classList.remove('rotate-180');
            if (searchInput) searchInput.value = '';
            filterOptions('');
        };

        const openMenu = () => {
            document.querySelectorAll('.custom-select-menu.open, .custom-time-menu.open, .custom-date-menu.open').forEach((m) => {
                if (m !== menu) {
                    m.classList.remove('open', 'opacity-100', 'translate-y-0');
                    m.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
                    m.parentElement?.querySelector('.custom-select-chevron, .custom-time-chevron, .custom-date-chevron')?.classList.remove('rotate-180');
                }
            });
            isOpen = true;
            menu.classList.add('open');
            menu.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            menu.classList.add('opacity-100', 'translate-y-0');
            trigger.querySelector('.custom-select-chevron')?.classList.add('rotate-180');
            if (searchInput && list.children.length > 4) {
                searchWrap.style.display = 'block';
                setTimeout(() => searchInput.focus(), 50);
            } else if (searchWrap) {
                searchWrap.style.display = 'none';
            }
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isOpen) closeMenu();
            else openMenu();
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !wrapper.contains(e.target)) closeMenu();
        });

        const filterOptions = (term) => {
            const query = term.toLowerCase().trim();
            let matchCount = 0;
            Array.from(list.children).forEach((item) => {
                if (item.classList.contains('empty-notice')) return;
                const text = (item.getAttribute('data-text') || '').toLowerCase();
                if (!query || text.includes(query)) {
                    item.style.display = 'flex';
                    matchCount++;
                } else {
                    item.style.display = 'none';
                }
            });
            let emptyEl = list.querySelector('.empty-notice');
            if (matchCount === 0) {
                if (!emptyEl) {
                    emptyEl = document.createElement('div');
                    emptyEl.className = 'empty-notice text-[11px] text-slate-500 p-2 text-center';
                    emptyEl.textContent = 'Không có kết quả';
                    list.appendChild(emptyEl);
                }
                emptyEl.style.display = 'block';
            } else if (emptyEl) {
                emptyEl.style.display = 'none';
            }
        };

        if (searchInput) {
            searchInput.addEventListener('input', (e) => filterOptions(e.target.value));
            searchInput.addEventListener('click', (e) => e.stopPropagation());
        }

        const renderOptions = () => {
            list.innerHTML = '';
            const options = Array.from(selectEl.options);
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const label = trigger.querySelector('.custom-select-label');

            if (selectedOpt && selectedOpt.value) {
                label.textContent = selectedOpt.textContent;
                label.classList.remove('text-slate-400');
                label.classList.add('text-white');
            } else {
                label.textContent = (selectedOpt && selectedOpt.textContent) || placeholder;
                label.classList.remove('text-white');
                label.classList.add('text-slate-400');
            }

            options.forEach((opt) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.setAttribute('data-value', opt.value);
                item.setAttribute('data-text', opt.textContent);
                const isSelected = opt.value === selectEl.value;
                item.className = `w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between text-left transition-all cursor-pointer ${
                    isSelected
                        ? 'bg-blue-600/20 text-blue-400 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`;
                item.innerHTML = `
                    <span class="truncate">${opt.textContent}</span>
                    ${isSelected ? '<svg class="w-3.5 h-3.5 text-blue-400 shrink-0 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                `;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    renderOptions();
                    closeMenu();
                });
                list.appendChild(item);
            });
        };

        renderOptions();

        const observer = new MutationObserver(() => {
            renderOptions();
        });
        observer.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });

        selectEl.addEventListener('change', () => {
            renderOptions();
        });

        const instance = {
            wrapper,
            trigger,
            renderOptions,
            close: closeMenu,
            open: openMenu,
        };
        selectEl._customDropdown = instance;
        return instance;
    }

    // custom time picker component (24h format, zero shift)
    static timePicker(inputEl) {
        if (!inputEl || inputEl._customTimePicker) return inputEl._customTimePicker;

        inputEl.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-time-wrapper relative w-full select-none';
        inputEl.parentNode.insertBefore(wrapper, inputEl);
        wrapper.appendChild(inputEl);

        if (!inputEl.value) {
            inputEl.value = '07:30';
        }

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-time-trigger w-full px-3 py-2 bg-[#0b1222] hover:bg-[#0f1930] rounded-xl text-white text-xs flex items-center justify-between transition-all cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/40 text-left';
        trigger.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400 shrink-0"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span class="custom-time-display font-mono font-semibold text-white tracking-wider truncate">${inputEl.value}</span>
            </div>
            <svg class="custom-time-chevron shrink-0 text-slate-400 transition-transform duration-100" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        `;
        wrapper.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'custom-time-menu absolute top-full mt-1.5 w-44 bg-[#080f21]/95 backdrop-blur-2xl rounded-2xl p-2.5 shadow-2xl z-50 opacity-0 pointer-events-none -translate-y-2 transition-all duration-100';
        wrapper.appendChild(menu);

        menu.innerHTML = `
            <div class="grid grid-cols-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                <span>Giờ</span>
                <span>Phút</span>
            </div>
            <div class="grid grid-cols-2 gap-1.5">
                <div class="custom-time-hours flex flex-col gap-0.5 overflow-y-auto max-h-36 pr-0.5 scrollbar-thin"></div>
                <div class="custom-time-minutes flex flex-col gap-0.5 overflow-y-auto max-h-36 pr-0.5 scrollbar-thin"></div>
            </div>
        `;

        const hoursContainer = menu.querySelector('.custom-time-hours');
        const minutesContainer = menu.querySelector('.custom-time-minutes');

        const hours = [];
        for (let h = 6; h <= 23; h++) {
            hours.push(h < 10 ? `0${h}` : `${h}`);
        }

        const minutes = [];
        for (let m = 0; m < 60; m += 5) {
            minutes.push(m < 10 ? `0${m}` : `${m}`);
        }

        let isOpen = false;

        const updateDisplay = () => {
            const disp = trigger.querySelector('.custom-time-display');
            if (disp) disp.textContent = inputEl.value;
        };

        const renderColumns = () => {
            const [hVal, mVal] = (inputEl.value || '07:30').split(':');

            hoursContainer.innerHTML = '';
            hours.forEach((h) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isSel = h === hVal;
                btn.className = `w-full py-1 text-xs font-mono rounded-lg transition-all cursor-pointer text-center ${
                    isSel ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`;
                btn.textContent = h;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const curM = (inputEl.value || '07:30').split(':')[1] || '30';
                    inputEl.value = `${h}:${curM}`;
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    updateDisplay();
                    renderColumns();
                });
                hoursContainer.appendChild(btn);
            });

            minutesContainer.innerHTML = '';
            minutes.forEach((m) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isSel = m === mVal;
                btn.className = `w-full py-1 text-xs font-mono rounded-lg transition-all cursor-pointer text-center ${
                    isSel ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`;
                btn.textContent = m;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const curH = (inputEl.value || '07:30').split(':')[0] || '07';
                    inputEl.value = `${curH}:${m}`;
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    updateDisplay();
                    renderColumns();
                    closeMenu();
                });
                minutesContainer.appendChild(btn);
            });
        };

        const scrollToSelected = () => {
            const selH = hoursContainer.querySelector('.bg-blue-600');
            const selM = minutesContainer.querySelector('.bg-blue-600');
            if (selH) {
                hoursContainer.scrollTop = selH.offsetTop - hoursContainer.clientHeight / 2 + selH.clientHeight / 2;
            }
            if (selM) {
                minutesContainer.scrollTop = selM.offsetTop - minutesContainer.clientHeight / 2 + selM.clientHeight / 2;
            }
        };

        const closeMenu = () => {
            isOpen = false;
            menu.classList.remove('open', 'opacity-100', 'translate-y-0');
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            trigger.querySelector('.custom-time-chevron')?.classList.remove('rotate-180');
        };

        const openMenu = () => {
            document.querySelectorAll('.custom-select-menu.open, .custom-time-menu.open, .custom-date-menu.open').forEach((m) => {
                if (m !== menu) {
                    m.classList.remove('open', 'opacity-100', 'translate-y-0');
                    m.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
                    m.parentElement?.querySelector('.custom-select-chevron, .custom-time-chevron, .custom-date-chevron')?.classList.remove('rotate-180');
                }
            });

            // check bounds: if in second column or near right edge, align right
            const rect = wrapper.getBoundingClientRect();
            if (wrapper.offsetLeft > 60 || rect.left + 180 > window.innerWidth - 20) {
                menu.style.right = '0';
                menu.style.left = 'auto';
            } else {
                menu.style.left = '0';
                menu.style.right = 'auto';
            }

            isOpen = true;
            menu.classList.add('open');
            menu.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            menu.classList.add('opacity-100', 'translate-y-0');
            trigger.querySelector('.custom-time-chevron')?.classList.add('rotate-180');
            renderColumns();
            setTimeout(scrollToSelected, 20);
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isOpen) closeMenu();
            else openMenu();
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !wrapper.contains(e.target)) closeMenu();
        });

        inputEl.addEventListener('change', () => {
            updateDisplay();
            renderColumns();
        });

        renderColumns();
        updateDisplay();

        const instance = {
            wrapper,
            trigger,
            updateDisplay,
            close: closeMenu,
            open: openMenu,
        };
        inputEl._customTimePicker = instance;
        return instance;
    }

    // custom date picker component (zero border, obsidian glassmorphism)
    static datePicker(inputEl) {
        if (!inputEl || inputEl._customDatePicker) return inputEl._customDatePicker;

        inputEl.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-date-wrapper relative w-full select-none';
        inputEl.parentNode.insertBefore(wrapper, inputEl);
        wrapper.appendChild(inputEl);

        const todayStr = new Date().toISOString().split('T')[0];
        if (!inputEl.value) {
            inputEl.value = todayStr;
        }

        const formatDisplay = (val) => {
            if (!val) return 'Chọn ngày...';
            const [y, m, d] = val.split('-');
            return `${d}/${m}/${y}`;
        };

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-date-trigger w-full px-3 py-2 bg-[#0b1222] hover:bg-[#0f1930] rounded-xl text-white text-xs flex items-center justify-between transition-all cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/40 text-left';
        trigger.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400 shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span class="custom-date-display font-mono font-semibold text-white tracking-wider truncate">${formatDisplay(inputEl.value)}</span>
            </div>
            <svg class="custom-date-chevron shrink-0 text-slate-400 transition-transform duration-100" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        `;
        wrapper.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'custom-date-menu absolute top-full mt-1.5 w-64 bg-[#080f21]/95 backdrop-blur-2xl rounded-2xl p-3 shadow-2xl z-50 opacity-0 pointer-events-none -translate-y-2 transition-all duration-100';
        wrapper.appendChild(menu);

        const [initY, initM] = (inputEl.value || todayStr).split('-').map(Number);
        let viewYear = initY;
        let viewMonth = initM - 1;

        let isOpen = false;

        const updateDisplay = () => {
            const disp = trigger.querySelector('.custom-date-display');
            if (disp) disp.textContent = formatDisplay(inputEl.value);
        };

        const renderCalendar = () => {
            const monthNames = [
                'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
            ];

            menu.innerHTML = `
                <div class="flex items-center justify-between mb-2.5 px-0.5">
                    <button type="button" class="btn-prev-month w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition-all cursor-pointer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <span class="font-bold text-xs text-white">${monthNames[viewMonth]}, ${viewYear}</span>
                    <button type="button" class="btn-next-month w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition-all cursor-pointer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
                <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 mb-1">
                    <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
                </div>
                <div class="calendar-days-grid grid grid-cols-7 gap-1"></div>
                <div class="flex items-center justify-between mt-2.5 pt-1.5">
                    <button type="button" class="btn-pick-today text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-all cursor-pointer">Hôm nay</button>
                    <button type="button" class="btn-close-date text-[11px] font-medium text-slate-400 hover:text-white transition-all cursor-pointer">Đóng</button>
                </div>
            `;

            menu.querySelector('.btn-prev-month').addEventListener('click', (e) => {
                e.stopPropagation();
                viewMonth--;
                if (viewMonth < 0) {
                    viewMonth = 11;
                    viewYear--;
                }
                renderCalendar();
            });

            menu.querySelector('.btn-next-month').addEventListener('click', (e) => {
                e.stopPropagation();
                viewMonth++;
                if (viewMonth > 11) {
                    viewMonth = 0;
                    viewYear++;
                }
                renderCalendar();
            });

            menu.querySelector('.btn-pick-today').addEventListener('click', (e) => {
                e.stopPropagation();
                inputEl.value = todayStr;
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                updateDisplay();
                closeMenu();
            });

            menu.querySelector('.btn-close-date').addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
            });

            const grid = menu.querySelector('.calendar-days-grid');
            const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
            const startOffset = (firstDayIndex + 6) % 7;
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

            // previous month padding days
            for (let i = startOffset - 1; i >= 0; i--) {
                const dayNum = prevMonthDays - i;
                const cell = document.createElement('div');
                cell.className = 'w-7 h-7 flex items-center justify-center text-[11px] text-slate-600 select-none';
                cell.textContent = dayNum;
                grid.appendChild(cell);
            }

            // current month days
            const [selY, selM, selD] = (inputEl.value || '').split('-').map(Number);
            const [nowY, nowM, nowD] = todayStr.split('-').map(Number);

            for (let d = 1; d <= daysInMonth; d++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isSelected = selY === viewYear && selM === viewMonth + 1 && selD === d;
                const isToday = nowY === viewYear && nowM === viewMonth + 1 && nowD === d;

                btn.className = `w-7 h-7 rounded-lg text-[11px] font-mono flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                        : isToday
                        ? 'text-blue-400 font-bold bg-blue-500/10 hover:bg-blue-500/20'
                        : 'text-slate-200 hover:bg-white/10'
                }`;
                btn.textContent = d;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const mm = String(viewMonth + 1).padStart(2, '0');
                    const dd = String(d).padStart(2, '0');
                    inputEl.value = `${viewYear}-${mm}-${dd}`;
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    updateDisplay();
                    closeMenu();
                });

                grid.appendChild(btn);
            }
        };

        const closeMenu = () => {
            isOpen = false;
            menu.classList.remove('open', 'opacity-100', 'translate-y-0');
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            trigger.querySelector('.custom-date-chevron')?.classList.remove('rotate-180');
        };

        const openMenu = () => {
            document.querySelectorAll('.custom-select-menu.open, .custom-time-menu.open, .custom-date-menu.open').forEach((m) => {
                if (m !== menu) {
                    m.classList.remove('open', 'opacity-100', 'translate-y-0');
                    m.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
                    m.parentElement?.querySelector('.custom-select-chevron, .custom-time-chevron, .custom-date-chevron')?.classList.remove('rotate-180');
                }
            });

            // boundary check
            const rect = wrapper.getBoundingClientRect();
            if (rect.left + 260 > window.innerWidth - 16) {
                menu.style.right = '0';
                menu.style.left = 'auto';
            } else {
                menu.style.left = '0';
                menu.style.right = 'auto';
            }

            const [curY, curM] = (inputEl.value || todayStr).split('-').map(Number);
            viewYear = curY;
            viewMonth = curM - 1;

            isOpen = true;
            menu.classList.add('open');
            menu.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            menu.classList.add('opacity-100', 'translate-y-0');
            trigger.querySelector('.custom-date-chevron')?.classList.add('rotate-180');
            renderCalendar();
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isOpen) closeMenu();
            else openMenu();
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !wrapper.contains(e.target)) closeMenu();
        });

        inputEl.addEventListener('change', () => {
            updateDisplay();
        });

        updateDisplay();

        const instance = {
            wrapper,
            trigger,
            updateDisplay,
            close: closeMenu,
            open: openMenu,
        };
        inputEl._customDatePicker = instance;
        return instance;
    }
}

// global exports
window.UI = UIComponents;
window.enhanceCustomSelect = (el, p) => UIComponents.select(el, p);
window.enhanceCustomTimePicker = (el) => UIComponents.timePicker(el);
window.enhanceCustomDatePicker = (el) => UIComponents.datePicker(el);
