// Camera & Realtime Face Checkin Controller with Supabase-style Slide Drawer

class CameraController {
    constructor() {
        this.video = document.getElementById('camera-stream');
        this.canvas = document.getElementById('overlay-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.lessonSelect = document.getElementById('lesson-select');
        this.liveCountEl = document.getElementById('live-count');
        this.liveListEl = document.getElementById('live-list');
        this.autoBtn = document.getElementById('auto-toggle-btn');
        this.captureBtn = document.getElementById('manual-capture-btn');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.soundBtn = document.getElementById('sound-btn');
        this.toggleStatusBtn = document.getElementById('btn-toggle-status');
        this.statusTextEl = document.getElementById('lesson-status-text');
        this.currentLessonLabel = document.getElementById('current-lesson-label');
        this.sidebarSubjectTitle = document.getElementById('sidebar-subject-title');
        this.sidebarClassTitle = document.getElementById('sidebar-class-title');
        this.searchInput = document.getElementById('live-search-input');
        this.faceCountEl = document.getElementById('hud-face-count');

        this.stream = null;
        this.intervalId = null;
        this.isProcessing = false;
        this.autoEnabled = true;
        this.soundEnabled = true;
        this.audioCtx = null;
        this.checkedInMap = new Map();
        this.currentLesson = null;
        this.labelToggleBtn = document.getElementById('label-toggle-btn');
        this.labelToggleText = document.getElementById('label-toggle-text');
        this.showLabels = localStorage.getItem('camera_show_labels') !== 'false';
        this.lastMatches = [];
        this.offscreenCanvas = document.createElement('canvas');
        this.autoTimeoutId = null;

        this.pendingAuthAction = null;
        this.pendingFaceBlob = null;
        this.overlayTimer = null;
        this.trackedFaces = [];
        this.faceCache = null;
        this.lastFrameScale = 1.0;
        this.renderLoopId = null;

        this.localFaceDetector = null;
        this.isInitializingDetector = false;
        this.lastVideoTimestamp = 0;
        this.cachedIdentity = null;
        this.recentOtherScans = new Map();
        this.lastOtherToastTime = 0;
        // temporal smoothing buffer for primary face detection
        this._rawRectBuf = [];
        this._RAW_BUF_SIZE = 3;

        this.kioskClassName = document.getElementById('kiosk-class-name');
        this.kioskLessonDate = document.getElementById('kiosk-lesson-date');
        this.finishLessonBtn = document.getElementById('btn-finish-lesson');
        this.emptyStateEl = document.getElementById('kiosk-empty-state');
        this.rosterList = [];
        this.scanCooldown = false;

        this.slideDrawer = document.getElementById('slide-manage-drawer');
        this.miniStream = null;
    }

    syncCanvasDimensions() {
        if (!this.canvas || !this.video) return;
        const vw = this.video.videoWidth || 1280;
        const vh = this.video.videoHeight || 720;
        if (this.canvas.width !== vw || this.canvas.height !== vh) {
            this.canvas.width = vw;
            this.canvas.height = vh;
        }
    }

    async init() {
        this.setupEventListeners();
        this.setupModalEvents();
        this.setupSlideDrawerEvents();
        this.setupLessonMenuDropdown();
        this.setupMinimalistCameraControls();
        this.startOverlayRenderLoop();
        // mediapipe short-range detector disabled: server insightface handles distant and close faces flawlessly

        const urlParams = new URLSearchParams(window.location.search);
        const lessonId = urlParams.get('lesson_id');

        if (lessonId) {
            await this.loadSpecificLesson(lessonId);
        } else {
            await this.loadActiveOrEmpty();
        }
    }

    async loadSpecificLesson(lessonId) {
        try {
            const lesson = await API.getLesson(lessonId);
            if (!lesson || !lesson.id) {
                this.showEmptyState('Buổi học không tồn tại', 'Vui lòng chọn một buổi học từ danh sách lớp');
                return;
            }

            this.currentLesson = lesson;
            this.updateHeaderLessonInfo(lesson);

            const isOpen = lesson.trang_thai === 'open' || lesson.status === 'open';
            if (!isOpen) {
                this.showEmptyState('Buổi học đã đóng', `Buổi học của lớp ${lesson.ten_lop || ''} ngày ${lesson.ngay} đã kết thúc`);
                return;
            }

            this.hideEmptyState();
            await this.startCamera();
            await this.syncAttendanceList();
            this.startAutoCapture();
            this.updateStatus('Hệ thống sẵn sàng', 'active');
        } catch (err) {
            console.error('loadSpecificLesson error:', err);
            this.showEmptyState('Không thể tải buổi học', err.message || 'Lỗi kết nối máy chủ');
        }
    }

    async loadActiveOrEmpty() {
        try {
            const openLessons = await API.listOpenLessons();
            if (openLessons && openLessons.length > 0) {
                await this.loadSpecificLesson(openLessons[0].id);
                return;
            }
            this.showEmptyState('Chưa mở buổi điểm danh nào', 'Bấm "Tạo buổi học ngay" để bắt đầu điểm danh qua camera');
        } catch (err) {
            this.showEmptyState('Chưa kết nối máy chủ', 'Vui lòng kiểm tra kết nối mạng');
        }
    }

    showEmptyState(title, desc) {
        this.stopCamera();
        this.stopAutoCapture();
        if (this.emptyStateEl) {
            this.emptyStateEl.style.display = 'flex';
            const titleEl = document.getElementById('empty-state-title');
            const descEl = document.getElementById('empty-state-desc');
            if (titleEl && title) titleEl.textContent = title;
            if (descEl && desc) descEl.textContent = desc;
        }
        const dock = document.querySelector('.camera-control-dock');
        if (dock) dock.style.display = 'none';

        const headerDot = document.getElementById('kiosk-header-dot');
        if (headerDot) headerDot.style.display = 'none';

        if (this.kioskClassName) this.kioskClassName.textContent = 'Chưa mở buổi học';
        if (this.kioskLessonDate) this.kioskLessonDate.textContent = '';
        if (this.finishLessonBtn) this.finishLessonBtn.style.display = 'none';
        if (this.sidebarSubjectTitle) this.sidebarSubjectTitle.textContent = 'Môn học';
        if (this.sidebarClassTitle) this.sidebarClassTitle.textContent = 'Chưa chọn lớp';
        if (this.currentLessonLabel) this.currentLessonLabel.textContent = 'Chưa chọn buổi học';
        if (this.liveListEl) {
            this.liveListEl.innerHTML = '<div class="text-slate-500 text-center mt-12 text-xs">Chưa có buổi học nào mở</div>';
        }
        if (this.liveCountEl) this.liveCountEl.textContent = '0/0';
        this.updateStatus('Chờ mở buổi học', 'paused');
        this.updateStatusBadge(false);
    }

    hideEmptyState() {
        if (this.emptyStateEl) {
            this.emptyStateEl.style.display = 'none';
        }
        const dock = document.querySelector('.camera-control-dock');
        if (dock) dock.style.display = 'flex';
    }

    updateHeaderLessonInfo(lesson) {
        if (this.kioskClassName) {
            this.kioskClassName.textContent = lesson.ten_lop || `Lớp #${lesson.lop_hoc_id}`;
        }
        if (this.kioskLessonDate) {
            this.kioskLessonDate.textContent = `· ${lesson.ngay}`;
        }
        const isOpen = lesson.trang_thai === 'open' || lesson.status === 'open';
        const headerDot = document.getElementById('kiosk-header-dot');
        if (headerDot) headerDot.style.display = isOpen ? 'inline-block' : 'none';
        if (this.finishLessonBtn) {
            this.finishLessonBtn.style.display = isOpen ? 'inline-flex' : 'none';
        }
        if (this.sidebarSubjectTitle) {
            this.sidebarSubjectTitle.textContent = lesson.ten_mon || 'Môn học';
        }
        if (this.sidebarClassTitle) {
            this.sidebarClassTitle.textContent = lesson.ten_lop || `Lớp #${lesson.lop_hoc_id}`;
        }
        if (this.currentLessonLabel) {
            this.currentLessonLabel.textContent = `Buổi ngày ${lesson.ngay}`;
        }
        this.updateStatusBadge(isOpen);
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.clearOverlay();
    }

    async loadOpenLessons(preferredLessonID = null) {
        if (preferredLessonID) {
            await this.loadSpecificLesson(preferredLessonID);
        } else {
            await this.loadActiveOrEmpty();
        }
    }

    updateStatusBadge(isOpen) {
        const pill = document.getElementById('lesson-status-pill');
        const textEl = document.getElementById('lesson-status-text');
        if (pill) {
            pill.style.display = isOpen ? 'flex' : 'none';
            if (isOpen) {
                pill.classList.remove('closed');
                if (textEl) textEl.textContent = 'Đang mở';
            } else {
                pill.classList.add('closed');
                if (textEl) textEl.textContent = 'Đã đóng';
            }
        }

        const navLessonName = document.getElementById('nav-lesson-name');
        if (navLessonName && this.currentLesson) {
            navLessonName.textContent = this.currentLesson.ten_lop || this.currentLesson.className || 'Buổi học';
        }
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                },
                audio: false,
            });
            this.video.srcObject = this.stream;

            const onMeta = () => this.syncCanvasDimensions();
            this.video.addEventListener('loadedmetadata', onMeta);
            this.video.addEventListener('play', onMeta);
            this.video.addEventListener('resize', onMeta);

            await this.video.play();
            this.syncCanvasDimensions();
        } catch (err) {
            console.error('Camera access error:', err);
            showToast('Không thể truy cập camera, vui lòng cấp quyền webcam!', 'error');
            this.updateStatus('Lỗi camera', 'paused');
        }
    }

    setupMinimalistCameraControls() {
        const stage = document.getElementById('video-stage');
        const dock = document.querySelector('.camera-control-dock');
        const hud = document.querySelector('.camera-hud-top');
        if (!stage || !dock) return;

        let idleTimer = null;
        const wakeUpControls = () => {
            dock.classList.add('dock-visible');
            if (hud) hud.classList.add('hud-visible');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                dock.classList.remove('dock-visible');
                if (hud) hud.classList.remove('hud-visible');
            }, 2600);
        };

        stage.addEventListener('mousemove', wakeUpControls);
        stage.addEventListener('touchstart', wakeUpControls, { passive: true });
        dock.addEventListener('mouseenter', () => clearTimeout(idleTimer));
        stage.addEventListener('mouseleave', () => {
            clearTimeout(idleTimer);
            dock.classList.remove('dock-visible');
            if (hud) hud.classList.remove('hud-visible');
        });
    }

    setupEventListeners() {
        if (this.finishLessonBtn) {
            this.finishLessonBtn.addEventListener('click', async () => {
                if (!this.currentLesson || !this.currentLesson.id) return;
                if (confirm('Xác nhận kết thúc buổi học này? Hệ thống sẽ đóng buổi và chuyển về trang quản lý.')) {
                    try {
                        await API.updateLessonStatus(this.currentLesson.id, 'closed');
                        showToast('Đã kết thúc buổi học', 'success');
                        setTimeout(() => {
                            window.location.href = '/dashboard.html';
                        }, 400);
                    } catch (err) {
                        showToast(err.message || 'Lỗi đóng buổi học', 'error');
                    }
                }
            });
        }

        // dock: auto toggle
        if (this.autoBtn) {
            this.updateLabelToggleUI();
            this.autoBtn.addEventListener('click', () => {
                this.autoEnabled = !this.autoEnabled;
                const textEl = document.getElementById('auto-toggle-text');
                if (this.autoEnabled) {
                    this.autoBtn.classList.remove('paused');
                    this.autoBtn.classList.add('active');
                    if (textEl) textEl.textContent = 'LIVE';
                    this.startAutoCapture();
                    showToast('Đã bật chế độ tự động quét', 'info');
                } else {
                    this.autoBtn.classList.add('paused');
                    this.autoBtn.classList.remove('active');
                    if (textEl) textEl.textContent = 'PAUSED';
                    this.stopAutoCapture();
                    showToast('Đã tạm dừng tự động quét', 'info');
                }
            });
        }

        // dock: capture
        if (this.captureBtn) {
            this.captureBtn.addEventListener('click', () => this.captureAndCheckin(true));
        }

        // dock: label toggle
        if (this.labelToggleBtn) {
            this.labelToggleBtn.addEventListener('click', () => {
                this.showLabels = !this.showLabels;
                localStorage.setItem('camera_show_labels', this.showLabels);
                this.updateLabelToggleUI();
                if (this.lastMatches && this.lastMatches.length > 0) {
                    this.clearOverlay();
                    this.lastMatches.forEach((m) => {
                        this.drawBoundingBox(m.bbox, m.ho_ten, m.mssv, m.similarity, m.status);
                    });
                }
                showToast(this.showLabels ? 'Đã bật hiển thị Tên & MSSV' : 'Đã ẩn nhãn Tên & MSSV', 'info');
            });
        }

        // dock: fullscreen
        if (this.fullscreenBtn) {
            this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // dock: sound
        if (this.soundBtn) {
            this.soundBtn.addEventListener('click', () => {
                this.soundEnabled = !this.soundEnabled;
                const icon = document.getElementById('sound-icon');
                if (this.soundEnabled) {
                    this.soundBtn.classList.add('active');
                    if (icon) icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
                    showToast('Đã bật âm thanh', 'info');
                } else {
                    this.soundBtn.classList.remove('active');
                    if (icon) icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
                    showToast('Đã tắt âm thanh', 'info');
                }
            });
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderLiveFeed());
        }

        const syncBtn = document.getElementById('btn-sync-attendance');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                await this.syncAttendanceList();
                showToast('Đã đồng bộ danh sách điểm danh', 'success');
            });
        }

        const exportBtn = document.getElementById('btn-export-csv');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (!this.currentLesson) {
                    showToast('Chưa chọn buổi học để xuất CSV', 'warning');
                    return;
                }
                window.location.href = API.getExportCSVUrl(this.currentLesson.id);
            });
        }
    }

    updateLabelToggleUI() {
        if (!this.labelToggleBtn) return;
        if (this.showLabels) {
            this.labelToggleBtn.classList.add('active');
        } else {
            this.labelToggleBtn.classList.remove('active');
        }
    }

    // Slide Drawer (Supabase style) management
    setupSlideDrawerEvents() {
        const btnAddStudent = document.getElementById('btn-open-add-student');
        const btnCreateLesson = document.getElementById('btn-open-create-lesson');
        const btnCreateClass = document.getElementById('btn-open-create-class');
        const btnEmptyLesson = document.getElementById('btn-empty-create-lesson');
        const btnClose = document.getElementById('btn-close-drawer');

        if (btnAddStudent) {
            btnAddStudent.addEventListener('click', () => {
                this.ensureTeacherAuth(() => this.openSlideDrawer('student'));
            });
        }
        if (btnCreateLesson) {
            btnCreateLesson.addEventListener('click', () => {
                this.ensureTeacherAuth(() => this.openSlideDrawer('lesson'));
            });
        }
        if (btnEmptyLesson) {
            btnEmptyLesson.addEventListener('click', () => {
                this.ensureTeacherAuth(() => this.openSlideDrawer('lesson'));
            });
        }
        if (btnCreateClass) {
            btnCreateClass.addEventListener('click', () => {
                this.ensureTeacherAuth(() => this.openSlideDrawer('class'));
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => this.closeSlideDrawer());
        }

        // Lesson form submit
        const lessonForm = document.getElementById('drawer-form-lesson');
        if (lessonForm) {
            lessonForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const classID = document.getElementById('quick-lesson-class').value;
                const ngay = document.getElementById('quick-lesson-date').value;
                const start = document.getElementById('quick-lesson-start').value;
                const end = document.getElementById('quick-lesson-end').value;
                const openNow = document.getElementById('quick-lesson-open-now').checked;

                if (!classID) { showToast('Vui lòng chọn lớp học', 'warning'); return; }
                try {
                    const newLesson = await API.createLesson(classID, ngay, start, end);
                    const lessonID = newLesson ? (newLesson.buoi_hoc_id || newLesson.id) : null;
                    if (openNow && lessonID) await API.updateLessonStatus(lessonID, 'open');
                    this.closeSlideDrawer();
                    showToast(openNow ? 'Tạo và mở buổi học thành công' : 'Tạo buổi học thành công', 'success');
                    await this.loadOpenLessons(lessonID);
                } catch (err) {
                    showToast(err.message || 'Lỗi tạo buổi học mới', 'error');
                }
            });
        }

        // Class form submit
        const classForm = document.getElementById('drawer-form-class');
        if (classForm) {
            classForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('quick-class-name').value.trim();
                const subjectId = document.getElementById('quick-class-subject').value;
                if (!name) { showToast('Vui lòng nhập tên lớp', 'warning'); return; }
                if (!subjectId) { showToast('Vui lòng chọn môn học', 'warning'); return; }

                try {
                    await API.createClass(name, subjectId);
                    showToast(`Đã tạo lớp ${name} thành công`, 'success');
                    document.getElementById('quick-class-name').value = '';
                    // Populate class select and switch to lesson tab
                    await this.populateClassSelect('quick-lesson-class');
                    this.switchDrawerTab('lesson');
                } catch (err) {
                    showToast(err.message || 'Lỗi tạo lớp học', 'error');
                }
            });
        }

        const classSelectStudent = document.getElementById('quick-student-class');
        const classSelectLesson = document.getElementById('quick-lesson-class');
        const subjectSelectClass = document.getElementById('quick-class-subject');

        if (classSelectStudent) enhanceCustomSelect(classSelectStudent, 'Chọn lớp cho sinh viên...');
        if (classSelectLesson) enhanceCustomSelect(classSelectLesson, 'Chọn lớp để tạo buổi...');
        if (subjectSelectClass) enhanceCustomSelect(subjectSelectClass, 'Chọn môn học...');

        const dateInput = document.getElementById('quick-lesson-date');
        if (dateInput) {
            if (!dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            enhanceCustomDatePicker(dateInput);
        }

        const startTimeInput = document.getElementById('quick-lesson-start');
        const endTimeInput = document.getElementById('quick-lesson-end');
        if (startTimeInput) enhanceCustomTimePicker(startTimeInput);
        if (endTimeInput) enhanceCustomTimePicker(endTimeInput);

        const btnSeedSubject = document.getElementById('btn-quick-seed-subject');
        if (btnSeedSubject) {
            btnSeedSubject.addEventListener('click', async () => {
                try {
                    await API.createSubject('IT001', 'Tin học đại cương');
                    showToast('Đã tạo môn học mẫu thành công', 'success');
                    await this.populateSubjectSelect('quick-class-subject');
                } catch (err) {
                    showToast(err.message || 'Lỗi tạo môn học mẫu', 'error');
                }
            });
        }
    }

    setupLessonMenuDropdown() {
        const btn = document.getElementById('btn-lesson-menu');
        const menu = document.getElementById('lesson-menu-dropdown');
        const chevron = document.getElementById('lesson-menu-chevron');
        const btnNew = document.getElementById('btn-dropdown-new-lesson');
        if (!btn || !menu) return;

        let isOpen = false;

        this.closeLessonMenu = () => {
            isOpen = false;
            menu.classList.remove('opacity-100', 'translate-y-0');
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            if (chevron) chevron.classList.remove('rotate-180');
        };

        const openMenu = async () => {
            isOpen = true;
            menu.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
            menu.classList.add('opacity-100', 'translate-y-0');
            if (chevron) chevron.classList.add('rotate-180');
            await this.renderLessonMenuList();
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isOpen) this.closeLessonMenu();
            else openMenu();
        });

        document.addEventListener('click', (e) => {
            if (isOpen && !menu.contains(e.target) && !btn.contains(e.target)) {
                this.closeLessonMenu();
            }
        });

        if (btnNew) {
            btnNew.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeLessonMenu();
                this.ensureTeacherAuth(() => this.openSlideDrawer('lesson'));
            });
        }
    }

    async renderLessonMenuList() {
        const list = document.getElementById('lesson-menu-list');
        if (!list) return;
        list.innerHTML = '<div class="text-[11px] text-slate-500 p-2.5 text-center">Đang tải danh sách...</div>';

        try {
            const openLessons = await API.listOpenLessons().catch(() => []);
            const classes = await API.listClasses().catch(() => []);
            const classMap = new Map();
            (classes || []).forEach((c) => classMap.set(c.id, c));

            list.innerHTML = '';

            if (openLessons && openLessons.length > 0) {
                const headerLive = document.createElement('div');
                headerLive.className = 'text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-1';
                headerLive.textContent = 'Đang diễn ra (LIVE)';
                list.appendChild(headerLive);

                openLessons.forEach((l) => {
                    const c = classMap.get(l.lop_hoc_id) || {};
                    const isCurrent = this.currentLesson && this.currentLesson.id === l.id;
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = `w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                        isCurrent
                            ? 'bg-blue-600/20 text-white font-semibold'
                            : 'bg-white/[0.03] hover:bg-white/10 text-slate-200'
                    }`;
                    item.innerHTML = `
                        <div class="min-w-0 pr-2">
                            <div class="flex items-center gap-1.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                <span class="text-xs font-semibold truncate text-white">${l.ten_lop || c.ten || 'Lớp học'}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 mt-0.5 truncate">${c.ten_mon || ''} · ${l.ngay || ''}</div>
                        </div>
                        ${isCurrent ? '<span class="text-[10px] text-blue-400 font-bold shrink-0">Đang chọn</span>' : ''}
                    `;
                    item.addEventListener('click', async () => {
                        this.closeLessonMenu?.();
                        await this.loadSpecificLesson(l.id);
                        showToast(`Đã chuyển sang lớp: ${l.ten_lop || c.ten || ''}`, 'info');
                    });
                    list.appendChild(item);
                });
            } else {
                const emptyNotice = document.createElement('div');
                emptyNotice.className = 'text-[11px] text-slate-400 p-3 text-center bg-white/[0.02] rounded-xl';
                emptyNotice.innerHTML = `
                    <p class="mb-1">Chưa có buổi học nào đang mở</p>
                    <button type="button" class="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer underline" onclick="cameraCtrl.openSlideDrawer('lesson')">Bấm vào đây để tạo buổi</button>
                `;
                list.appendChild(emptyNotice);
            }
        } catch (err) {
            list.innerHTML = '<div class="text-[11px] text-rose-400 p-2 text-center">Không thể tải danh sách buổi học</div>';
        }
    }

    openSlideDrawer(tab = 'student') {
        if (!this.slideDrawer) return;
        this.slideDrawer.classList.add('active');
        this.switchDrawerTab(tab);
    }

    closeSlideDrawer() {
        if (!this.slideDrawer) return;
        this.slideDrawer.classList.remove('active');
        this.stopMiniCamera();
    }

    setShiftTime(start, end) {
        const sEl = document.getElementById('quick-lesson-start');
        const eEl = document.getElementById('quick-lesson-end');
        if (sEl) {
            sEl.value = start;
            sEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (eEl) {
            eEl.value = end;
            eEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    async startMiniCamera() {
        const miniVideo = document.getElementById('face-reg-live-video');
        const canvas = document.getElementById('face-reg-canvas');
        const guide = document.getElementById('face-target-guide');
        if (!miniVideo) return;

        if (canvas) canvas.style.display = 'none';
        if (guide) guide.style.display = 'block';
        miniVideo.style.display = 'block';

        if (this.stream && this.stream.active && this.stream.getVideoTracks().some((t) => t.readyState === 'live')) {
            miniVideo.srcObject = this.stream;
            try {
                await miniVideo.play();
                return;
            } catch (reuseErr) {
                console.warn('could not play reused stream:', reuseErr);
            }
        }

        try {
            if (!this.miniStream || !this.miniStream.active || !this.miniStream.getVideoTracks().some((t) => t.readyState === 'live')) {
                this.miniStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                    audio: false
                });
            }
            miniVideo.srcObject = this.miniStream;
            await miniVideo.play();
        } catch (err) {
            console.warn('startMiniCamera error:', err);
            if (this.stream && this.stream.active) {
                miniVideo.srcObject = this.stream;
                await miniVideo.play().catch(() => {});
            } else {
                showToast('Chưa thể mở webcam, bạn có thể tải ảnh chụp sinh viên từ máy', 'warning');
            }
        }
    }

    stopMiniCamera() {
        if (this.miniStream && this.miniStream !== this.stream) {
            this.miniStream.getTracks().forEach((t) => t.stop());
            this.miniStream = null;
        }
        const miniVideo = document.getElementById('face-reg-live-video');
        if (miniVideo) {
            miniVideo.srcObject = null;
        }
    }

    async switchDrawerTab(tab) {
        const tabs = ['student', 'lesson', 'class'];
        tabs.forEach((t) => {
            const btn = document.getElementById(`tab-btn-${t}`);
            const pane = document.getElementById(`drawer-pane-${t}`);
            if (btn) {
                if (t === tab) btn.classList.add('active');
                else btn.classList.remove('active');
            }
            if (pane) {
                pane.style.display = t === tab ? 'flex' : 'none';
            }
        });

        const titleEl = document.getElementById('drawer-title');
        if (tab === 'student') {
            if (titleEl) titleEl.textContent = 'Thêm sinh viên';
            this.openAddStudentWizard();
        } else if (tab === 'lesson') {
            if (titleEl) titleEl.textContent = 'Tạo buổi học';
            await this.populateClassSelect('quick-lesson-class');
            const dateInput = document.getElementById('quick-lesson-date');
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            const startInput = document.getElementById('quick-lesson-start');
            if (startInput && !startInput.value) {
                startInput.value = '07:30';
            }
            const endInput = document.getElementById('quick-lesson-end');
            if (endInput && !endInput.value) {
                endInput.value = '11:30';
            }
        } else if (tab === 'class') {
            if (titleEl) titleEl.textContent = 'Tạo lớp học';
            await this.populateSubjectSelect('quick-class-subject');
        }
    }

    async populateSubjectSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return [];
        try {
            const subjects = await API.listSubjects();
            sel.innerHTML = '';
            const noSubAlert = document.getElementById('no-subject-alert');
            if (!subjects || subjects.length === 0) {
                sel.innerHTML = '<option value="">Chưa có môn học nào</option>';
                if (noSubAlert && selectId === 'quick-class-subject') noSubAlert.style.display = 'flex';
                if (sel._customDropdown) sel._customDropdown.renderOptions();
                return [];
            }
            if (noSubAlert && selectId === 'quick-class-subject') noSubAlert.style.display = 'none';
            subjects.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.ten} (${s.ma_mon})`;
                sel.appendChild(opt);
            });
            if (subjects.length > 0) {
                sel.value = subjects[0].id;
            }
            if (sel._customDropdown) sel._customDropdown.renderOptions();
            return subjects;
        } catch (e) {
            sel.innerHTML = '<option value="">Lỗi tải môn học</option>';
            if (sel._customDropdown) sel._customDropdown.renderOptions();
            return [];
        }
    }

    async populateClassSelect(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return [];
        try {
            const classes = await API.listClasses();
            sel.innerHTML = '';
            const noClassAlert = document.getElementById('no-classes-alert');
            if (!classes || classes.length === 0) {
                sel.innerHTML = '<option value="">Chưa có lớp nào</option>';
                if (noClassAlert && selectId === 'quick-student-class') noClassAlert.style.display = 'flex';
                if (sel._customDropdown) sel._customDropdown.renderOptions();
                return [];
            }
            if (noClassAlert && selectId === 'quick-student-class') noClassAlert.style.display = 'none';
            classes.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.ten} (${c.ten_mon || 'Môn học'})`;
                sel.appendChild(opt);
            });
            if (this.currentLesson && this.currentLesson.lop_hoc_id) {
                sel.value = this.currentLesson.lop_hoc_id;
            } else if (classes.length > 0) {
                sel.value = classes[0].id;
            }
            if (sel._customDropdown) sel._customDropdown.renderOptions();
            return classes;
        } catch (e) {
            sel.innerHTML = '<option value="">Lỗi tải danh sách lớp</option>';
            if (sel._customDropdown) sel._customDropdown.renderOptions();
            return [];
        }
    }

    async ensureTeacherAuth(callback) {
        try {
            await API.listClasses();
            if (callback) callback();
        } catch (e) {
            try {
                await API.login('gv123');
                if (callback) callback();
            } catch (loginErr) {
                this.pendingAuthAction = callback;
                openModal('modal-quick-auth');
            }
        }
    }

    setupModalEvents() {
        const authForm = document.getElementById('form-quick-auth');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = document.getElementById('quick-auth-code').value.trim();
                try {
                    await API.login(code);
                    closeModal('modal-quick-auth');
                    showToast('Xác thực giảng viên thành công', 'success');
                    if (this.pendingAuthAction) {
                        const act = this.pendingAuthAction;
                        this.pendingAuthAction = null;
                        act();
                    }
                } catch (err) {
                    showToast(err.message || 'Mã giảng viên không đúng', 'error');
                }
            });
        }

        // wizard step 1: MSSV lookup
        const mssvInput = document.getElementById('quick-student-mssv');
        if (mssvInput) {
            let lookupTimer = null;
            mssvInput.addEventListener('input', () => {
                clearTimeout(lookupTimer);
                const typed = mssvInput.value.trim();
                const nextBtn = document.getElementById('btn-wizard-next');
                const foundCard = document.getElementById('student-found-card');
                const newForm = document.getElementById('new-student-form');
                const spinner = document.getElementById('mssv-spinner');

                this.selectedExistingStudentId = null;
                this.selectedGlobalStudent = null;
                this.wizardFoundHasFace = false;
                if (foundCard) foundCard.style.display = 'none';
                if (newForm) newForm.style.display = 'none';
                if (nextBtn) nextBtn.disabled = true;
                const nextText = document.getElementById('btn-wizard-next-text');
                if (nextText) nextText.textContent = 'Tiếp theo';

                if (!typed) {
                    if (spinner) spinner.style.display = 'none';
                    return;
                }

                if (spinner) spinner.style.display = 'flex';

                lookupTimer = setTimeout(async () => {
                    if (spinner) spinner.style.display = 'none';
                    if (!mssvInput.value.trim()) return;

                    const inClass = (this.quickClassStudents || []).find(
                        (s) => s.mssv && s.mssv.toLowerCase() === typed.toLowerCase()
                    );

                    if (inClass) {
                        this.selectedExistingStudentId = inClass.id;
                        this.wizardFoundHasFace = inClass.has_face;
                        this.wizardStudentName = inClass.ho_ten;
                        this.wizardStudentMssv = inClass.mssv;
                        this._showFoundCard(inClass.mssv, inClass.ho_ten, inClass.has_face);
                        if (nextBtn) {
                            nextBtn.disabled = false;
                            const t = document.getElementById('btn-wizard-next-text');
                            if (t) t.textContent = inClass.has_face ? 'Thêm vào lớp' : 'Tiếp theo';
                        }
                        return;
                    }

                    try {
                        const lookup = await API.lookupStudent(typed);
                        if (lookup && lookup.exists) {
                            this.selectedGlobalStudent = lookup;
                            this.wizardFoundHasFace = lookup.has_face;
                            this.wizardStudentName = lookup.ho_ten;
                            this.wizardStudentMssv = lookup.mssv || typed;
                            this._showFoundCard(lookup.mssv || typed, lookup.ho_ten, lookup.has_face);
                            if (nextBtn) {
                                nextBtn.disabled = false;
                                const t = document.getElementById('btn-wizard-next-text');
                                if (t) t.textContent = lookup.has_face ? 'Thêm vào lớp' : 'Tiếp theo';
                            }
                        } else {
                            if (newForm) newForm.style.display = 'block';
                            if (nextBtn) nextBtn.disabled = false;
                        }
                    } catch (err2) {
                        if (newForm) newForm.style.display = 'block';
                        if (nextBtn) nextBtn.disabled = false;
                    }
                }, 280);
            });
        }

        const btnNext = document.getElementById('btn-wizard-next');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const classSelect = document.getElementById('quick-student-class');
                const classId = (classSelect && classSelect.value)
                    ? classSelect.value
                    : (this.currentLesson ? (this.currentLesson.lop_hoc_id || this.currentLesson.class_id) : null);

                if (!classId) {
                    showToast('Vui lòng chọn hoặc tạo lớp học trước khi tiếp tục', 'warning');
                    return;
                }

                const mssv = (document.getElementById('quick-student-mssv') || {}).value || '';
                if (!mssv.trim()) {
                    showToast('Vui lòng nhập MSSV', 'warning');
                    document.getElementById('quick-student-mssv')?.focus();
                    return;
                }

                const newForm = document.getElementById('new-student-form');
                if (newForm && newForm.style.display !== 'none') {
                    const name = (document.getElementById('quick-student-name') || {}).value || '';
                    if (!name.trim()) {
                        showToast('Vui lòng nhập họ và tên sinh viên', 'warning');
                        document.getElementById('quick-student-name')?.focus();
                        return;
                    }
                }

                if (this.wizardFoundHasFace) {
                    this._showWizardStep2(true);
                } else {
                    this._showWizardStep2(false);
                }
            });
        }

        const backBtn1 = document.getElementById('btn-back-step1');
        if (backBtn1) backBtn1.addEventListener('click', () => this._showWizardStep1());
        const backBtn1b = document.getElementById('btn-back-step1-b');
        if (backBtn1b) backBtn1b.addEventListener('click', () => this._showWizardStep1());

        const btnSnap = document.getElementById('btn-snap-webcam');
        if (btnSnap) {
            btnSnap.addEventListener('click', async () => {
                const miniVideo = document.getElementById('face-reg-live-video');
                const canvas = document.getElementById('face-reg-canvas');
                const guide = document.getElementById('face-target-guide');

                if (this.pendingFaceBlob) {
                    this.pendingFaceBlob = null;
                    if (miniVideo) miniVideo.style.display = 'block';
                    if (canvas) canvas.style.display = 'none';
                    if (guide) guide.style.display = 'block';
                    btnSnap.textContent = 'Chụp thử';
                    this.startMiniCamera();
                    return;
                }

                const blob = await this.captureMiniFrameBlob();
                if (blob) {
                    if (miniVideo) miniVideo.style.display = 'none';
                    if (canvas) canvas.style.display = 'block';
                    if (guide) guide.style.display = 'none';
                    btnSnap.textContent = 'Xem trực tiếp';
                    showToast('Đã chụp khung hình', 'info');
                } else {
                    showToast('Camera chưa sẵn sàng để chụp', 'warning');
                }
            });
        }

        const fileInput = document.getElementById('input-face-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (re) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.getElementById('face-reg-canvas');
                        const miniVideo = document.getElementById('face-reg-live-video');
                        const guide = document.getElementById('face-target-guide');
                        if (!canvas) return;

                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        if (miniVideo) miniVideo.style.display = 'none';
                        if (guide) guide.style.display = 'none';
                        canvas.style.display = 'block';

                        canvas.toBlob((blob) => {
                            this.pendingFaceBlob = blob;
                            showToast('Đã tải ảnh lên thành công', 'success');
                            if (btnSnap) btnSnap.textContent = 'Mở lại camera';
                        }, 'image/jpeg', 0.95);
                    };
                    img.src = re.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        const btnSubmitExisting = document.getElementById('btn-submit-student');
        if (btnSubmitExisting) {
            btnSubmitExisting.addEventListener('click', async () => {
                await this._submitStudentWizard(btnSubmitExisting);
            });
        }

        const btnSubmitNew = document.getElementById('btn-submit-student-new');
        if (btnSubmitNew) {
            btnSubmitNew.addEventListener('click', async () => {
                await this._submitStudentWizard(btnSubmitNew);
            });
        }
    }

    _showFoundCard(mssv, hoTen, hasFace) {
        const foundCard = document.getElementById('student-found-card');
        const foundAvatar = document.getElementById('found-avatar');
        const foundName = document.getElementById('found-name');
        const foundMssv = document.getElementById('found-mssv-display');
        const foundBadge = document.getElementById('found-face-badge');
        const newForm = document.getElementById('new-student-form');

        if (foundCard) foundCard.style.display = 'flex';
        if (foundAvatar) foundAvatar.textContent = (hoTen || 'SV').charAt(0).toUpperCase();
        if (foundName) foundName.textContent = hoTen || '';
        if (foundMssv) foundMssv.textContent = mssv || '';
        if (foundBadge) foundBadge.style.display = hasFace ? 'flex' : 'none';
        if (newForm) newForm.style.display = 'none';
    }

    _showWizardStep1() {
        const step1 = document.getElementById('wizard-step-1');
        const step2 = document.getElementById('wizard-step-2');
        const textStep = document.getElementById('ws-text-step');
        const prog = document.getElementById('ws-progress-bar');

        if (step1) step1.style.display = 'flex';
        if (step2) step2.style.display = 'none';
        if (textStep) textStep.textContent = 'Bước 1: Tìm MSSV';
        if (prog) prog.style.width = '50%';
    }

    _showWizardStep2(hasFace) {
        const step1 = document.getElementById('wizard-step-1');
        const step2 = document.getElementById('wizard-step-2');
        const caseA = document.getElementById('face-exists-confirm');
        const caseB = document.getElementById('face-capture-form');
        const textStep = document.getElementById('ws-text-step');
        const prog = document.getElementById('ws-progress-bar');

        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'flex';
        if (textStep) textStep.textContent = 'Bước 2: Đăng ký khuôn mặt';
        if (prog) prog.style.width = '100%';

        if (hasFace) {
            if (caseA) caseA.style.display = 'block';
            if (caseB) caseB.style.display = 'none';
        } else {
            if (caseA) caseA.style.display = 'none';
            if (caseB) caseB.style.display = 'flex';
            this.startMiniCamera();
        }
    }

    async openAddStudentWizard() {
        const classes = await this.populateClassSelect('quick-student-class');

        const classAlert = document.getElementById('no-classes-alert');
        if (!classes || classes.length === 0) {
            if (classAlert) classAlert.style.display = 'flex';
            showToast('Chưa có lớp học nào trong hệ thống, bạn cần tạo lớp học trước', 'warning');
        } else {
            if (classAlert) classAlert.style.display = 'none';
        }

        const classSelect = document.getElementById('quick-student-class');
        if (this.currentLesson && this.currentLesson.lop_hoc_id && classSelect) {
            classSelect.value = this.currentLesson.lop_hoc_id;
        } else if (classes && classes.length > 0 && classSelect && !classSelect.value) {
            classSelect.value = classes[0].id;
        }

        const classId = classSelect ? classSelect.value : (this.currentLesson ? (this.currentLesson.lop_hoc_id || this.currentLesson.class_id) : null);
        if (classId) {
            try {
                const refreshed = await API.listStudents(classId);
                this.quickClassStudents = Array.isArray(refreshed) ? refreshed : [];
            } catch (e) {
                this.quickClassStudents = [];
            }
        }

        if (classSelect) {
            classSelect.onchange = async () => {
                const newClassId = classSelect.value;
                if (newClassId) {
                    try {
                        const refreshed = await API.listStudents(newClassId);
                        this.quickClassStudents = Array.isArray(refreshed) ? refreshed : [];
                    } catch (e) {
                        this.quickClassStudents = [];
                    }
                }
            };
        }

        this.resetStudentForm();
    }

    async _submitStudentWizard(btn) {
        const mssv = (document.getElementById('quick-student-mssv') || {}).value || '';
        const nameInput = document.getElementById('quick-student-name');
        const hoTen = (nameInput ? nameInput.value : null) || this.wizardStudentName || '';

        const classSelect = document.getElementById('quick-student-class');
        const classId = (classSelect && classSelect.value)
            ? classSelect.value
            : (this.currentLesson ? (this.currentLesson.lop_hoc_id || this.currentLesson.class_id) : null);

        if (!classId) {
            showToast('Vui lòng chọn lớp học để thêm sinh viên', 'warning');
            return;
        }
        if (!mssv.trim()) {
            showToast('Vui lòng nhập MSSV', 'warning');
            return;
        }

        if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }

        try {
            let targetSvId = this.selectedExistingStudentId;
            let autoLinked = false;

            if (!targetSvId) {
                const inClass = (this.quickClassStudents || []).find(
                    (s) => s.mssv && s.mssv.toLowerCase() === mssv.toLowerCase()
                );
                if (inClass) {
                    targetSvId = inClass.id;
                } else {
                    try {
                        const res = await API.createStudent(classId, mssv, hoTen);
                        targetSvId = res.sinh_vien_id || res.id;
                        autoLinked = res.auto_linked_face;
                    } catch (createErr) {
                        if (createErr.message && createErr.message.includes('sinh vien da co trong lop nay')) {
                            const refreshed = await API.listStudents(classId);
                            this.quickClassStudents = Array.isArray(refreshed) ? refreshed : [];
                            const found = this.quickClassStudents.find(
                                (s) => s.mssv && s.mssv.toLowerCase() === mssv.toLowerCase()
                            );
                            targetSvId = found ? found.id : null;
                            if (!targetSvId) throw createErr;
                        } else {
                            throw createErr;
                        }
                    }
                }
            }

            const doRegister = async (blob) => {
                try {
                    await API.registerFace(targetSvId, blob);
                    showToast(`Đã lưu khuôn mặt: ${hoTen || mssv}`, 'success');
                } catch (regErr) {
                    if (regErr.data && regErr.data.error === 'face_conflict') {
                        const conflict = regErr.data.conflict_student || {};
                        const confirmMsg = `Khuôn mặt này đã được đăng ký cho ${conflict.ho_ten || 'sinh viên khác'} (${conflict.mssv}). Bạn có chắc muốn cập nhật và chuyển quyền khuôn mặt này sang cho ${hoTen || mssv} không?`;
                        if (confirm(confirmMsg)) {
                            await API.registerFace(targetSvId, blob, true);
                            showToast(`Đã chuyển quyền khuôn mặt sang ${hoTen || mssv}`, 'success');
                        } else {
                            showToast('Đã hủy cập nhật khuôn mặt', 'info');
                        }
                    } else {
                        throw regErr;
                    }
                }
            };

            if (this.pendingFaceBlob) {
                if (btn) btn.textContent = 'Đang phân tích AI...';
                await doRegister(this.pendingFaceBlob);
            } else if (autoLinked || (this.selectedGlobalStudent && this.selectedGlobalStudent.has_face) || this.wizardFoundHasFace) {
                showToast(`Đã thêm ${hoTen || mssv} vào lớp với khuôn mặt sẵn có`, 'success');
            } else {
                const blob = await this.captureMiniFrameBlob();
                if (blob) {
                    if (btn) btn.textContent = 'Đang phân tích AI...';
                    await doRegister(blob);
                } else {
                    showToast(`Đã thêm ${hoTen || mssv} vào lớp (chưa có khuôn mặt)`, 'info');
                }
            }

            this.closeSlideDrawer();
            this.resetStudentForm();
            if (this.currentLesson) {
                await this.syncAttendanceList();
            }
        } catch (err) {
            showToast(err.message || 'Lỗi đăng ký sinh viên', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.style.opacity = ''; }
        }
    }

    captureMiniFrameBlob() {
        return new Promise((resolve) => {
            const canvas = document.getElementById('face-reg-canvas');
            const miniVideo = document.getElementById('face-reg-live-video');
            const videoSrc = (miniVideo && miniVideo.videoWidth > 0) ? miniVideo : this.video;
            if (!videoSrc || videoSrc.readyState < 2) {
                return resolve(null);
            }

            canvas.width = videoSrc.videoWidth || 640;
            canvas.height = videoSrc.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoSrc, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            const flash = document.getElementById('face-snap-flash');
            if (flash) {
                flash.style.opacity = '0.8';
                setTimeout(() => { flash.style.opacity = '0'; }, 160);
            }

            canvas.toBlob((blob) => {
                this.pendingFaceBlob = blob;
                resolve(blob);
            }, 'image/jpeg', 0.92);
        });
    }

    resetStudentForm() {
        this.pendingFaceBlob = null;
        this.selectedExistingStudentId = null;
        this.selectedGlobalStudent = null;
        this.wizardFoundHasFace = false;
        this.wizardStudentName = '';
        this.wizardStudentMssv = '';

        this.stopMiniCamera();
        this._showWizardStep1();

        const canvas = document.getElementById('face-reg-canvas');
        const miniVideo = document.getElementById('face-reg-live-video');
        const guide = document.getElementById('face-target-guide');
        const btnSnap = document.getElementById('btn-snap-webcam');
        const mssvEl = document.getElementById('quick-student-mssv');
        const nameEl = document.getElementById('quick-student-name');
        const foundCard = document.getElementById('student-found-card');
        const newForm = document.getElementById('new-student-form');
        const nextBtn = document.getElementById('btn-wizard-next');
        const nextText = document.getElementById('btn-wizard-next-text');

        if (mssvEl) mssvEl.value = '';
        if (nameEl) nameEl.value = '';
        if (foundCard) foundCard.style.display = 'none';
        if (newForm) newForm.style.display = 'none';
        if (nextBtn) nextBtn.disabled = true;
        if (nextText) nextText.textContent = 'Tiếp theo';

        if (miniVideo) {
            miniVideo.style.display = 'block';
            if (this.stream) miniVideo.srcObject = this.stream;
        }
        if (canvas) canvas.style.display = 'none';
        if (guide) guide.style.display = 'block';
        if (btnSnap) btnSnap.textContent = 'Chụp thử';
    }

    // Camera auto & checkin logic
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    startAutoCapture() {
        this.stopAutoCapture();
        this.autoEnabled = true;

        const loop = async () => {
            if (!this.autoEnabled) return;
            const isOpen = this.currentLesson && (this.currentLesson.trang_thai === 'open' || this.currentLesson.status === 'open');
            if (!this.isProcessing && !this.scanCooldown && isOpen && this.video && this.video.readyState >= 2) {
                await this.captureAndCheckin(false);
            }
            if (this.autoEnabled) {
                // fast polling: 140ms when searching for faces, 200ms when face is tracked
                let delay = 140;
                if (this.scanCooldown) {
                    delay = 1500;
                } else if (this.faceCache && this.faceCache.opacity > 0.7) {
                    delay = 200;
                }
                this.autoTimeoutId = setTimeout(loop, delay);
            }
        };

        this.autoTimeoutId = setTimeout(loop, 150);
    }

    stopAutoCapture() {
        if (this.autoTimeoutId) {
            clearTimeout(this.autoTimeoutId);
            this.autoTimeoutId = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.faceCache = null;
        this.trackedFaces = [];
        this.clearOverlay();
    }

    async captureAndCheckin(isManual = false) {
        if (!this.currentLesson || !this.currentLesson.id) {
            if (isManual) showToast('Vui lòng chọn hoặc tạo một buổi học trước', 'warning');
            return;
        }
        if (this.video.readyState !== 4) {
            if (isManual) showToast('Camera đang khởi động, vui lòng chờ trong giây lát', 'warning');
            return;
        }

        this.isProcessing = true;
        this.updateStatus('Đang quét...', 'active');

        try {
            const blob = await this.grabFrameBlob();
            if (!blob) return;

            const res = await API.checkin(this.currentLesson.id, blob);
            this.handleCheckinResult(res, isManual);
        } catch (err) {
            console.warn('Checkin frame warning:', err.message);
            if (isManual) {
                if (err.message.includes('Failed to fetch') || err.message.includes('infer error')) {
                    showToast('Không kết nối được server AI infer. Hãy đảm bảo container infer đang chạy', 'error');
                } else {
                    showToast(err.message || 'Lỗi nhận diện khuôn mặt', 'error');
                }
            }
        } finally {
            this.isProcessing = false;
            this.updateStatus('Hệ thống sẵn sàng', 'active');
        }
    }

    grabFrameBlob() {
        return new Promise((resolve) => {
            if (!this.offscreenCanvas) {
                this.offscreenCanvas = document.createElement('canvas');
            }
            const offscreen = this.offscreenCanvas;
            const vw = this.video.videoWidth || 1280;
            const vh = this.video.videoHeight || 720;

            // send native 1280 resolution with high JPEG quality for crystal-clear distant face detection
            const maxDimension = 1280;
            const scale = Math.min(1.0, maxDimension / Math.max(vw, vh));
            const sendW = Math.round(vw * scale);
            const sendH = Math.round(vh * scale);
            this.lastFrameScale = scale;

            if (offscreen.width !== sendW || offscreen.height !== sendH) {
                offscreen.width = sendW;
                offscreen.height = sendH;
            }
            const ctx = offscreen.getContext('2d');
            ctx.drawImage(this.video, 0, 0, sendW, sendH);
            offscreen.toBlob(resolve, 'image/jpeg', 0.88);
        });
    }

    async initLocalDetector() {
        if (this.localFaceDetector || this.isInitializingDetector) return;
        this.isInitializingDetector = true;
        try {
            const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
            const wasmFileset = await vision.FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
            this.localFaceDetector = await vision.FaceDetector.createFromOptions(wasmFileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO'
            });
            this.lastVideoTimestamp = 0;
            console.log('[mediapipe] local face detector initialized');
        } catch (err) {
            console.warn('[mediapipe] local detector fallback to server:', err.message);
            this.localFaceDetector = null;
        } finally {
            this.isInitializingDetector = false;
        }
    }

    startOverlayRenderLoop() {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
        const render = () => {
            this.renderOverlayFrame();
            this.renderLoopId = requestAnimationFrame(render);
        };
        this.renderLoopId = requestAnimationFrame(render);
    }

    renderOverlayFrame() {
        if (!this.ctx || !this.canvas) return;
        this.syncCanvasDimensions();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const now = performance.now();
        const vw = this.canvas.width;
        const vh = this.canvas.height;

        // local mediapipe blazeface detection at 60 fps directly on video stream
        if (this.localFaceDetector && this.video && this.video.readyState >= 2 && !this.video.paused) {
            try {
                let timestamp = Math.max(now, (this.lastVideoTimestamp || 0) + 1);
                this.lastVideoTimestamp = timestamp;
                const result = this.localFaceDetector.detectForVideo(this.video, timestamp);
                const detections = (result && result.detections) ? result.detections : [];
                this.processLocalDetections(detections, now, vw, vh);
            } catch (e) {
                // ignore transient frame sync errors
            }
        }

        // render active primary face at 60 fps
        if (this.faceCache) {
            const age = now - this.faceCache.lastSeen;

            if (age > 800) {
                this.faceCache.opacity -= 0.05;
                if (this.faceCache.opacity <= 0) {
                    this.faceCache = null;
                }
            } else {
                // smooth lerp at 60 fps
                const dx = this.faceCache.targetRect[0] - this.faceCache.currentRect[0];
                const dy = this.faceCache.targetRect[1] - this.faceCache.currentRect[1];
                const dist = Math.hypot(dx, dy);
                const k = dist > 60 ? 0.40 : 0.25;
                this.faceCache.currentRect[0] += dx * k;
                this.faceCache.currentRect[1] += dy * k;
                this.faceCache.currentRect[2] += (this.faceCache.targetRect[2] - this.faceCache.currentRect[2]) * k;
                this.faceCache.currentRect[3] += (this.faceCache.targetRect[3] - this.faceCache.currentRect[3]) * k;

                this.drawTrackedBox(this.faceCache);
            }
        }

        // render secondary faces if present
        for (let i = this.trackedFaces.length - 1; i >= 0; i--) {
            const face = this.trackedFaces[i];
            const age = now - face.lastSeen;

            if (age > 450) {
                face.opacity -= 0.08;
                if (face.opacity <= 0) {
                    this.trackedFaces.splice(i, 1);
                    continue;
                }
            }

            const k = 0.12;
            face.currentRect[0] += (face.targetRect[0] - face.currentRect[0]) * k;
            face.currentRect[1] += (face.targetRect[1] - face.currentRect[1]) * k;
            face.currentRect[2] += (face.targetRect[2] - face.currentRect[2]) * k;
            face.currentRect[3] += (face.targetRect[3] - face.currentRect[3]) * k;

            this.drawTrackedBox(face);
        }
    }

    processLocalDetections(detections, now, vw, vh) {
        if (this.faceCountEl) {
            this.faceCountEl.textContent = `${detections.length} mặt phát hiện`;
        }

        // filter low-confidence detections and prefer topmost (lowest Y = face, not belly)
        const MIN_CONFIDENCE = 0.45;
        const validDetections = detections
            .filter(d => {
                const score = d.categories?.[0]?.score ?? 1.0;
                if (score < MIN_CONFIDENCE) return false;

                const kp = d.keypoints;
                if (kp && kp.length >= 4) {
                    const eyeDx = Math.abs(kp[1].x - kp[0].x);
                    const eyeDy = Math.abs(kp[1].y - kp[0].y);
                    if (eyeDy > eyeDx * 1.0) return false;

                    const eyeY = (kp[0].y + kp[1].y) / 2;
                    const noseY = kp[2].y;
                    const mouthY = kp[3].y;
                    if (eyeY >= noseY || noseY >= mouthY) return false;

                    if (kp.length >= 6) {
                        const rightEarY = kp[4].y;
                        const leftEarY = kp[5].y;
                        if (rightEarY < eyeY - 0.08 || leftEarY < eyeY - 0.08) return false;
                    }
                }

                const b = d.boundingBox;
                if (b && b.originY > vh * 0.65) return false;
                return true;
            })
            .sort((a, b) => a.boundingBox.originY - b.boundingBox.originY); // topmost first

        if (validDetections.length === 0) {
            if (this.faceCache) {
                this.faceCache.lossCount = (this.faceCache.lossCount || 0) + 1;
                if (this.faceCache.lossCount >= 3) {
                    this.faceCache.lastSeen = now - 400;
                }
            }
            return;
        }

        const localRects = validDetections.map((d) => {
            const b = d.boundingBox;
            // blazeface short_range bbox is loose, crop it down to face-only area
            // keep center X, shift center Y down slightly
            const SW = 0.82;
            const SH = 0.90;
            const SY = 0.02;
            const rawX = vw - (b.originX + b.width);
            const rawY = b.originY;
            const rawW = b.width;
            const rawH = b.height;
            const cx = rawX + rawW / 2;
            const cy = rawY + rawH * (0.5 + SY);
            const screenW = rawW * SW;
            const screenH = rawH * SH;
            const screenX = cx - screenW / 2;
            const screenY = cy - screenH / 2;
            const lms = (d.keypoints || []).map(kp => [vw - (kp.x * vw), kp.y * vh]);
            return [screenX, screenY, screenW, screenH, lms];
        });

        // temporal smoothing: average last N raw rects for primary face to kill model noise
        const rawPrimary = localRects[0] ? localRects[0].slice(0, 4) : null;
        let smoothedPrimary;
        if (rawPrimary) {
            this._rawRectBuf.push(rawPrimary);
            if (this._rawRectBuf.length > this._RAW_BUF_SIZE) this._rawRectBuf.shift();
            smoothedPrimary = this._rawRectBuf.reduce(
                (acc, r) => [acc[0] + r[0], acc[1] + r[1], acc[2] + r[2], acc[3] + r[3]],
                [0, 0, 0, 0]
            ).map(v => v / this._rawRectBuf.length);
        } else {
            this._rawRectBuf = [];
        }

        const DEAD_ZONE = 3;

        if (this.faceCache) {
            const ccx = this.faceCache.currentRect[0] + this.faceCache.currentRect[2] / 2;
            const ccy = this.faceCache.currentRect[1] + this.faceCache.currentRect[3] / 2;
            let closestRect = null;
            let minDist = Math.max(this.faceCache.currentRect[2], this.faceCache.currentRect[3]) * 2.5;

            for (const r of localRects) {
                const rcx = r[0] + r[2] / 2;
                const rcy = r[1] + r[3] / 2;
                const dist = Math.hypot(ccx - rcx, ccy - rcy);
                if (dist < minDist) {
                    minDist = dist;
                    closestRect = r;
                }
            }

            const chosenRect = closestRect || localRects[0];

            if (chosenRect) {
                const targetCoords = chosenRect === localRects[0] && smoothedPrimary ? smoothedPrimary : chosenRect.slice(0, 4);
                const dx = Math.abs(targetCoords[0] - this.faceCache.targetRect[0]);
                const dy = Math.abs(targetCoords[1] - this.faceCache.targetRect[1]);
                const dw = Math.abs(targetCoords[2] - this.faceCache.targetRect[2]);
                const dh = Math.abs(targetCoords[3] - this.faceCache.targetRect[3]);
                if (dx > DEAD_ZONE || dy > DEAD_ZONE || dw > DEAD_ZONE || dh > DEAD_ZONE) {
                    this.faceCache.targetRect = targetCoords;
                }
                this.faceCache.landmarks = chosenRect[4] || [];
                this.faceCache.lastSeen = now;
                this.faceCache.lossCount = 0;
                this.faceCache.opacity = 1.0;
            } else {
                this.faceCache.lossCount = (this.faceCache.lossCount || 0) + 1;
            }
        } else if (smoothedPrimary) {
            const identity = this.cachedIdentity;
            const isFresh = identity && (now - (identity.timestamp || 0) < 4000);
            this.faceCache = {
                name: isFresh ? identity.name : '',
                mssv: isFresh ? identity.mssv : '',
                status: isFresh ? identity.status : 'scanning',
                similarity: isFresh ? identity.similarity : 0,
                currentRect: [...smoothedPrimary],
                targetRect: [...smoothedPrimary],
                landmarks: localRects[0] ? (localRects[0][4] || []) : [],
                lastSeen: now,
                lossCount: 0,
                opacity: 1.0,
            };
        }

        for (let i = 1; i < localRects.length; i++) {
            const r = localRects[i];
            const rcx = r[0] + r[2] / 2;
            const rcy = r[1] + r[3] / 2;
            let matched = false;

            for (const tf of this.trackedFaces) {
                const fcx = tf.targetRect[0] + tf.targetRect[2] / 2;
                const fcy = tf.targetRect[1] + tf.targetRect[3] / 2;
                if (Math.hypot(rcx - fcx, rcy - fcy) < Math.max(r[2], r[3]) * 1.5) {
                    tf.targetRect = r;
                    tf.lastSeen = now;
                    tf.opacity = 1.0;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                this.trackedFaces.push({
                    currentRect: [...r],
                    targetRect: [...r],
                    name: '',
                    mssv: '',
                    status: 'scanning',
                    lastSeen: now,
                    opacity: 1.0,
                });
            }
        }
    }

    handleCheckinResult(res, isManual = false) {
        if (!res) return;

        const facesDetected = res.faces_detected || 0;
        if (!this.localFaceDetector && this.faceCountEl) {
            this.faceCountEl.textContent = `${facesDetected} mặt phát hiện`;
        }

        const matches = res.matches || [];
        this.lastMatches = matches;

        if (matches.length === 0) {
            if (!this.localFaceDetector && this.faceCache) {
                this.faceCache.lossCount = (this.faceCache.lossCount || 0) + 1;
                if (this.faceCache.lossCount >= 2) {
                    this.faceCache = null;
                }
            }
            if (isManual) {
                if (facesDetected === 0) {
                    showToast('Không phát hiện khuôn mặt nào trước camera', 'warning');
                } else {
                    showToast('Có khuôn mặt nhưng không khớp sinh viên trong lớp', 'warning');
                }
            }
            return;
        }

        const canvasWidth = this.canvas.width || 1280;
        const scale = this.lastFrameScale || 1.0;
        const now = performance.now();

        matches.forEach((m) => {
            const cleanName = (m.ho_ten || '').replace(/^['"]|['"]$/g, '').trim();
            const cleanMssv = (m.mssv || '').replace(/^['"]|['"]$/g, '').trim();

            this.cachedIdentity = {
                name: cleanName,
                mssv: cleanMssv,
                status: m.status,
                similarity: m.similarity,
                timestamp: now,
            };

            let screenX = 0, screenY = 0, screenW = 0, screenH = 0;
            if (m.bbox && m.bbox.length >= 4) {
                const rawX1 = m.bbox[0] / scale;
                const y1 = m.bbox[1] / scale;
                const rawX2 = m.bbox[2] / scale;
                const y2 = m.bbox[3] / scale;
                screenX = canvasWidth - rawX2;
                screenY = y1;
                screenW = rawX2 - rawX1;
                screenH = y2 - y1;
            }

            if (screenW > 0) {
                const serverRect = [screenX, screenY, screenW, screenH];
                if (!this.faceCache) {
                    this.faceCache = {
                        name: cleanName,
                        mssv: cleanMssv,
                        similarity: m.similarity,
                        status: m.status,
                        currentRect: [...serverRect],
                        targetRect: [...serverRect],
                        lastSeen: now,
                        lossCount: 0,
                        opacity: 1.0,
                    };
                } else {
                    this.faceCache.name = cleanName;
                    this.faceCache.mssv = cleanMssv;
                    this.faceCache.similarity = m.similarity;
                    this.faceCache.status = m.status;
                    this.faceCache.targetRect = [...serverRect];
                    this.faceCache.lastSeen = now;
                    this.faceCache.lossCount = 0;
                    this.faceCache.opacity = 1.0;
                }
            }

            const nowDate = new Date();
            const timeStr = nowDate.toTimeString().split(' ')[0];

            if (m.status === 'new') {
                this.playSuccessChime();
                showToast(`Điểm danh thành công: ${cleanName}`, 'success');

                const target = (this.rosterList || []).find((r) => r.mssv === cleanMssv);
                if (target) {
                    target.trang_thai = 'present';
                    target.thoi_gian = timeStr;
                    target.similarity = m.similarity;
                }
                this.renderLiveFeed();

                this.scanCooldown = true;
                setTimeout(() => {
                    this.scanCooldown = false;
                }, 1500);
            } else if (m.status === 'already') {
                if (isManual) showToast(`${cleanName}: Đã có mặt rồi`, 'info');
            } else if (m.status === 'other_class') {
                const nowMs = Date.now();
                if (!this.lastOtherToastTime || nowMs - this.lastOtherToastTime > 4000) {
                    this.lastOtherToastTime = nowMs;
                    showToast(`${cleanName} (${cleanMssv}): Không thuộc danh sách lớp này`, 'warning');
                }
                if (cleanMssv) {
                    this.recentOtherScans.set(cleanMssv, {
                        name: cleanName,
                        mssv: cleanMssv,
                        time: timeStr,
                        timestamp: nowMs,
                    });
                    this.renderLiveFeed();
                }
            } else if (m.status === 'fake') {
                showToast('Cảnh báo: Phát hiện khuôn mặt giả mạo!', 'error');
            }
        });
    }

    drawTrackedBox(face) {
        if (!this.ctx || !face) return;
        const [x, y, w, h] = face.currentRect;
        const opacity = Math.max(0, Math.min(1, face.opacity || 1.0));

        let strokeColor = '#2563eb';
        let glowColor = '#3b82f6';
        let bgColor = 'rgba(15, 23, 42, 0.92)';

        if (face.status === 'new' || face.status === 'already') {
            strokeColor = '#10b981';
            glowColor = '#34d399';
            bgColor = 'rgba(6, 78, 59, 0.94)';
        } else if (face.status === 'other_class') {
            strokeColor = '#f59e0b';
            glowColor = '#fbbf24';
            bgColor = 'rgba(120, 53, 15, 0.94)';
        } else if (face.status === 'fake') {
            strokeColor = '#ef4444';
            glowColor = '#f43f5e';
            bgColor = 'rgba(127, 29, 29, 0.94)';
        } else {
            strokeColor = '#3b82f6';
            glowColor = '#60a5fa';
            bgColor = 'rgba(15, 23, 42, 0.92)';
        }

        this.ctx.save();
        this.ctx.globalAlpha = opacity;

        // Draw glowing face frame with rounded corners
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = 12;
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = strokeColor;
        this.roundRect(x, y, w, h, 14);
        this.ctx.stroke();

        // Corner accents for high-tech aesthetic
        const cornerLen = Math.min(18, w * 0.2);
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = glowColor;
        // Top-left
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + cornerLen);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + cornerLen, y);
        this.ctx.stroke();
        // Top-right
        this.ctx.beginPath();
        this.ctx.moveTo(x + w - cornerLen, y);
        this.ctx.lineTo(x + w, y);
        this.ctx.lineTo(x + w, y + cornerLen);
        this.ctx.stroke();
        // Bottom-left
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + h - cornerLen);
        this.ctx.lineTo(x, y + h);
        this.ctx.lineTo(x + cornerLen, y + h);
        this.ctx.stroke();
        // Bottom-right
        this.ctx.beginPath();
        this.ctx.moveTo(x + w - cornerLen, y + h);
        this.ctx.lineTo(x + w, y + h);
        this.ctx.lineTo(x + w, y + h - cornerLen);
        this.ctx.stroke();

        if (this.showLabels) {
            let labelText = '';
            if (face.status === 'other_class') {
                labelText = face.name ? (face.mssv ? `${face.name} (${face.mssv}) · Khác lớp` : `${face.name} · Khác lớp`) : 'Khác lớp';
            } else if (face.status === 'fake') {
                labelText = 'Cảnh báo giả mạo';
            } else if (face.name && face.name !== 'Chưa đăng ký') {
                labelText = face.mssv ? `${face.name} (${face.mssv})` : face.name;
            } else {
                labelText = 'Chưa đăng ký';
            }

            this.ctx.font = '600 13px "Poppins", sans-serif';
            const textMetrics = this.ctx.measureText(labelText);
            const badgeWidth = textMetrics.width + 24;
            const badgeHeight = 28;
            const badgeY = y > badgeHeight + 10 ? y - badgeHeight - 6 : y + 6;

            // Obsidian pill badge
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillStyle = bgColor;
            this.roundRect(x, badgeY, badgeWidth, badgeHeight, 8);
            this.ctx.fill();

            // Status indicator dot
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = glowColor;
            this.ctx.beginPath();
            this.ctx.arc(x + 12, badgeY + badgeHeight / 2, 3.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Label text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(labelText, x + 22, badgeY + badgeHeight / 2);
        }

        this.ctx.restore();
    }

    roundRect(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, r);
        this.ctx.arcTo(x + w, y + h, x, y + h, r);
        this.ctx.arcTo(x, y + h, x, y, r);
        this.ctx.arcTo(x, y, x + w, y, r);
        this.ctx.closePath();
    }

    clearOverlay() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    showHudBanner() {
        // hud banner is removed to keep camera view minimalist
    }

    async quickAddOtherStudent(mssv, hoTen) {
        if (!this.currentLesson) {
            showToast('Chưa chọn buổi học nào', 'warning');
            return;
        }
        const classId = this.currentLesson.lop_hoc_id || this.currentLesson.class_id;
        if (!classId) {
            showToast('Không tìm thấy thông tin lớp học của buổi này', 'warning');
            return;
        }

        this.ensureTeacherAuth(async () => {
            try {
                const res = await API.createStudent(classId, mssv, hoTen);
                showToast(`Đã thêm ${hoTen} (${mssv}) vào lớp`, 'success');
                this.recentOtherScans.delete(mssv);
                await this.syncAttendanceList();

                const svId = res ? (res.sinh_vien_id || res.id) : null;
                if (svId && this.currentLesson && this.currentLesson.id) {
                    await API.manualCheckin(this.currentLesson.id, svId);
                    await this.syncAttendanceList();
                    showToast(`Đã điểm danh cho ${hoTen}`, 'success');
                }
            } catch (err) {
                showToast(err.message || 'Lỗi thêm sinh viên vào lớp', 'error');
            }
        });
    }

    // Compact Roster Rendering
    renderLiveFeed() {
        if (!this.liveListEl) return;
        const query = this.searchInput ? this.searchInput.value.trim().toLowerCase() : '';
        let items = this.rosterList || [];

        const presentCount = items.filter((r) => r.trang_thai === 'present').length;
        const totalCount = items.length;

        if (this.liveCountEl) {
            this.liveCountEl.textContent = `${presentCount}/${totalCount}`;
        }

        if (query) {
            items = items.filter(
                (it) =>
                    (it.ho_ten && it.ho_ten.toLowerCase().includes(query)) ||
                    (it.mssv && it.mssv.toLowerCase().includes(query))
            );
        }

        let otherHtml = '';
        if (this.recentOtherScans && this.recentOtherScans.size > 0) {
            const list = Array.from(this.recentOtherScans.values());
            otherHtml = `
                <div class="mb-2 p-2.5 rounded-2xl bg-amber-500/10 flex flex-col gap-1.5">
                    <div class="text-[11px] font-bold text-amber-400 flex items-center justify-between">
                        <span>Sinh viên khác lớp vừa quét</span>
                        <span class="text-[10px] text-amber-400/70 font-mono">${list.length}</span>
                    </div>
                    ${list.map((item) => `
                        <div class="flex items-center justify-between gap-2 py-1">
                            <div class="min-w-0 flex-1">
                                <div class="text-xs font-semibold text-white truncate leading-tight">${item.name}</div>
                                <div class="text-[10px] font-mono text-amber-300/80 leading-tight">${item.mssv} · ${item.time}</div>
                            </div>
                            <button onclick="cameraCtrl.quickAddOtherStudent('${item.mssv}', '${item.name.replace(/'/g, "\\'")}')" class="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-semibold transition cursor-pointer shrink-0">
                                + Thêm vào lớp
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (items.length === 0) {
            this.liveListEl.innerHTML = otherHtml + `
                <div class="text-slate-500 text-center mt-12 text-xs">
                    ${query ? 'Không tìm thấy sinh viên phù hợp' : 'Chưa có sinh viên nào trong danh sách lớp'}
                </div>
            `;
            return;
        }

        const rosterHtml = items
            .map((s) => {
                const isPresent = s.trang_thai === 'present';
                const timeOnly = s.thoi_gian ? s.thoi_gian.split(' ')[1] || s.thoi_gian : '';
                const studentId = s.sinh_vien_id || s.id;

                return `
                <div class="live-item ${isPresent ? 'is-present' : 'is-absent'}">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span class="w-2 h-2 rounded-full shrink-0 ${isPresent ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-slate-600'}"></span>
                        <div class="min-w-0 flex-1">
                            <div class="text-xs font-semibold text-white truncate leading-tight">${s.ho_ten}</div>
                            <div class="text-[10px] font-mono text-slate-400 leading-tight">${s.mssv}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${
                            isPresent
                                ? `
                            <span class="font-mono text-[10px] text-emerald-400 font-semibold">${timeOnly || '✓'}</span>
                            <button class="w-5 h-5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center text-xs transition cursor-pointer" onclick="cameraCtrl.toggleManualAttendance(${studentId}, false)" title="Hủy điểm danh">
                                &times;
                            </button>
                        `
                                : `
                            <button class="px-2 py-0.5 rounded-lg bg-blue-600/15 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-semibold transition cursor-pointer" onclick="cameraCtrl.toggleManualAttendance(${studentId}, true)" title="Điểm danh thủ công">
                                + Có mặt
                            </button>
                        `
                        }
                    </div>
                </div>
            `;
            })
            .join('');

        this.liveListEl.innerHTML = otherHtml + rosterHtml;
    }

    async toggleManualAttendance(svId, markPresent) {
        if (!this.currentLesson || !this.currentLesson.id) return;
        try {
            if (markPresent) {
                await API.manualCheckin(this.currentLesson.id, svId);
                showToast('Đã đánh dấu có mặt', 'success');
            } else {
                await API.manualCancel(this.currentLesson.id, svId);
                showToast('Đã hủy điểm danh', 'info');
            }
            await this.syncAttendanceList();
        } catch (err) {
            showToast(err.message || 'Lỗi thao tác điểm danh thủ công', 'error');
        }
    }

    async syncAttendanceList() {
        if (!this.currentLesson || !this.currentLesson.id) return;
        try {
            const list = await API.listAttendance(this.currentLesson.id);
            if (Array.isArray(list)) {
                this.rosterList = list;
                this.renderLiveFeed();
            }
        } catch (e) {
            console.warn('syncAttendanceList error:', e);
        }
    }

    updateStatus(text, state) {
        const textEl = document.getElementById('hud-status-text');
        const dotEl = document.getElementById('hud-status-dot');
        if (textEl) textEl.textContent = text;
        if (dotEl) {
            dotEl.className = `hud-status-indicator ${state === 'paused' ? 'paused' : ''}`;
        }
    }

    playSuccessChime() {
        if (!this.soundEnabled) return;
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.35);
        } catch (e) {
            // browser audio policy handling
        }
    }
}

// Modal helper functions
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Auto init on page load
document.addEventListener('DOMContentLoaded', () => {
    const cam = new CameraController();
    window.cameraCtrl = cam;
    cam.init();
});
