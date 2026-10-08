// dashboard controller for academic management & face registration

class DashboardController {
    constructor() {
        this.currentMainTab = 'classes';
        this.currentView = 'list';
        this.currentSubTab = 'lessons';
        this.studentFilter = 'all';

        this.subjects = [];
        this.classes = [];
        this.currentClass = null;
        this.currentStudents = [];
        this.currentLessons = [];

        this.parsedCSV = [];
        this.selectedLessonId = null;

        // webcam registration
        this.regStream = null;
        this.regVideo = document.getElementById('reg-video');
        this.regCanvas = document.getElementById('reg-canvas');
        this.currentRegSvId = null;
    }

    async init() {
        this.setupNavigation();
        this.setupModals();
        this.setupCSVDropzone();
        const startInput = document.getElementById('new-lesson-start');
        const endInput = document.getElementById('new-lesson-end');
        if (startInput) enhanceCustomTimePicker(startInput);
        if (endInput) enhanceCustomTimePicker(endInput);
        const dateInput = document.getElementById('new-lesson-date');
        if (dateInput) {
            if (!dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            enhanceCustomDatePicker(dateInput);
        }
        await this.loadSubjects();
        await this.loadClasses();
    }

    setupNavigation() {
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await API.logout();
                } catch (e) {}
                window.location.href = '/login.html';
            });
        }
    }

    switchMainTab(tabName) {
        this.currentMainTab = tabName;
        document.querySelectorAll('.nav-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-pane').forEach((p) => {
            p.classList.toggle('active', p.id === `tab-${tabName}`);
        });

        if (tabName === 'classes') {
            if (this.currentView === 'list') {
                this.renderClassesTable();
            }
        } else if (tabName === 'subjects') {
            this.renderSubjectsTable();
        }
    }

    // ==========================================
    // Môn học (Subjects)
    // ==========================================
    async loadSubjects() {
        try {
            this.subjects = await API.listSubjects();
            this.renderSubjectsTable();
            this.populateSubjectSelects();
        } catch (err) {
            if (err.message && err.message.includes('unauthorized')) {
                window.location.href = '/login.html';
            }
        }
    }

    renderSubjectsTable() {
        const tbody = document.getElementById('subject-tbody');
        if (!tbody) return;

        const query = (document.getElementById('filter-subject-search')?.value || '').trim().toLowerCase();
        let items = this.subjects || [];
        if (query) {
            items = items.filter((s) => s.ma_mon.toLowerCase().includes(query) || s.ten.toLowerCase().includes(query));
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-dim);">Chưa có môn học nào phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = items
            .map((s) => {
                // count classes under this subject
                const classesInSubject = (this.classes || []).filter((c) => c.mon_hoc_id === s.id);
                const classCount = classesInSubject.length;

                return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight:600;">#${s.id}</td>
                    <td><span class="badge badge-neutral" style="font-family: var(--font-mono); font-size: 0.85rem;">${s.ma_mon}</span></td>
                    <td style="font-weight:700;">${s.ten}</td>
                    <td>
                        <span class="badge ${classCount > 0 ? 'badge-success' : 'badge-neutral'}">
                            ${classCount} lớp học
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 8px;">
                            <button class="btn btn-secondary btn-sm" onclick="dashboard.toggleSubjectDrawer(${s.id})">
                                Xem các lớp (${classCount})
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="dashboard.deleteSubject(${s.id})">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
                <tr id="subject-drawer-${s.id}" class="class-subject-drawer">
                    <td colspan="5">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 0;">
                            <span style="font-size: 0.82rem; color: var(--text-muted);">Các lớp thuộc môn ${s.ten}:</span>
                            ${
                                classesInSubject.length === 0
                                    ? '<span style="font-size: 0.82rem; color: var(--text-dim);">Chưa có lớp nào mở cho môn này</span>'
                                    : classesInSubject
                                          .map(
                                              (c) => `
                                    <button class="class-badge-link" onclick="dashboard.openClassDetail(${c.id})">
                                        <span>${c.ten}</span>
                                        <span style="font-size: 0.75rem; opacity: 0.8;">(${c.total_students || 0} SV)</span>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </button>
                                `
                                          )
                                          .join('')
                            }
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');
    }

    filterSubjectsTable() {
        this.renderSubjectsTable();
    }

    toggleSubjectDrawer(id) {
        const row = document.getElementById(`subject-drawer-${id}`);
        if (row) {
            row.classList.toggle('active');
        }
    }

    async createSubject() {
        const maMon = document.getElementById('new-subject-code').value.trim();
        const ten = document.getElementById('new-subject-name').value.trim();
        if (!maMon || !ten) return showToast('Vui lòng điền đủ thông tin', 'error');

        try {
            await API.createSubject(maMon, ten);
            showToast('Tạo môn học thành công', 'success');
            this.closeModal('modal-add-subject');
            document.getElementById('new-subject-code').value = '';
            document.getElementById('new-subject-name').value = '';
            await this.loadSubjects();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async deleteSubject(id) {
        if (!confirm('Bạn có chắc chắn muốn xóa môn học này?')) return;
        try {
            await API.deleteSubject(id);
            showToast('Đã xóa môn học', 'success');
            await this.loadSubjects();
            await this.loadClasses();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ==========================================
    // Lớp học (Classes Overview & Detail)
    // ==========================================
    async loadClasses() {
        try {
            this.classes = await API.listClasses();
            this.updateOverviewStats();
            this.renderClassesTable();
            this.populateSubjectSelects();
        } catch (err) {
            console.error(err);
        }
    }

    updateOverviewStats() {
        let totalClasses = this.classes.length;
        let totalStudents = 0;
        let totalFaces = 0;
        let openLessons = 0;

        this.classes.forEach((c) => {
            totalStudents += c.total_students || 0;
            totalFaces += c.students_with_face || 0;
        });

        // calculate face rate
        const rate = totalStudents > 0 ? Math.round((totalFaces / totalStudents) * 100) : 0;

        const elClasses = document.getElementById('stat-total-classes');
        const elStudents = document.getElementById('stat-total-students');
        const elFaceRate = document.getElementById('stat-face-rate');
        const elFaceDetail = document.getElementById('stat-face-detail');
        const elOpenLessons = document.getElementById('stat-open-lessons');

        if (elClasses) elClasses.textContent = totalClasses;
        if (elStudents) elStudents.textContent = totalStudents;
        if (elFaceRate) elFaceRate.textContent = `${rate}%`;
        if (elFaceDetail) elFaceDetail.textContent = `${totalFaces}/${totalStudents} đã có mặt`;

        // fetch open lessons count
        API.listOpenLessons()
            .then((lessons) => {
                if (elOpenLessons) elOpenLessons.textContent = lessons ? lessons.length : 0;
            })
            .catch(() => {});
    }

    populateSubjectSelects() {
        const filterSubject = document.getElementById('filter-class-subject');
        const modalSubject = document.getElementById('new-class-subject');

        const opts = (this.subjects || [])
            .map((s) => `<option value="${s.id}">${s.ma_mon} - ${s.ten}</option>`)
            .join('');

        if (filterSubject) {
            filterSubject.innerHTML = '<option value="">Tất cả môn học</option>' + opts;
            enhanceCustomSelect(filterSubject, 'Tất cả môn học');
        }
        if (modalSubject) {
            modalSubject.innerHTML = opts || '<option value="">-- Chưa có môn học nào --</option>';
            enhanceCustomSelect(modalSubject, 'Chọn môn học...');
        }
    }

    filterClassesTable() {
        this.renderClassesTable();
    }

    renderClassesTable() {
        const tbody = document.getElementById('class-tbody');
        if (!tbody) return;

        const searchQuery = (document.getElementById('filter-class-search')?.value || '').trim().toLowerCase();
        const selectedSubject = document.getElementById('filter-class-subject')?.value || '';

        let items = this.classes || [];
        if (selectedSubject) {
            items = items.filter((c) => String(c.mon_hoc_id) === String(selectedSubject));
        }
        if (searchQuery) {
            items = items.filter(
                (c) =>
                    c.ten.toLowerCase().includes(searchQuery) ||
                    (c.ten_mon && c.ten_mon.toLowerCase().includes(searchQuery)) ||
                    (c.ma_mon && c.ma_mon.toLowerCase().includes(searchQuery))
            );
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-dim);">Chưa có lớp học nào phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = items
            .map((c) => {
                const totalStudents = c.total_students || 0;
                const faces = c.students_with_face || 0;
                const facePercent = totalStudents > 0 ? Math.round((faces / totalStudents) * 100) : 0;
                const totalLessons = c.total_lessons || 0;

                return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight:600;">#${c.id}</td>
                    <td>
                        <button onclick="dashboard.openClassDetail(${c.id})" style="background:none; text-align:left; color: inherit; cursor:pointer;">
                            <div style="font-weight:700; font-size: 1rem; color: #fff; hover:color:var(--primary);">${c.ten}</div>
                        </button>
                    </td>
                    <td>
                        <span class="badge badge-neutral" style="font-family: var(--font-mono);">${c.ma_mon || ''}</span>
                        <span style="font-size: 0.85rem; color: var(--text-muted); margin-left: 6px;">${c.ten_mon || ''}</span>
                    </td>
                    <td style="font-family: var(--font-mono); font-weight: 600;">
                        ${totalStudents} SV
                    </td>
                    <td>
                        <div class="attendance-progress">
                            <div class="attendance-progress-text">
                                <span style="color: ${facePercent === 100 ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${faces}/${totalStudents}</span>
                                <span style="font-weight: 700;">${facePercent}%</span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill" style="width: ${facePercent}%;"></div>
                            </div>
                        </div>
                    </td>
                    <td style="font-family: var(--font-mono); color: var(--text-muted);">
                        ${totalLessons} buổi
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <div style="display: inline-flex; gap: 8px; white-space: nowrap;">
                            <button class="btn btn-success btn-sm" onclick="dashboard.startTodayAttendance(${c.id})" title="Điểm danh hôm nay" style="display: inline-flex; align-items: center; gap: 5px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                Điểm danh ngay
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="dashboard.openClassDetail(${c.id})">
                                Chi tiết lớp
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="dashboard.deleteClass(${c.id})">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');
    }

    async startTodayAttendance(classId) {
        if (!classId) return;
        try {
            const lesson = await API.startTodayLesson(classId);
            showToast('Đang chuyển sang màn hình điểm danh...', 'success');
            setTimeout(() => {
                window.location.href = `/?lesson_id=${lesson.id}`;
            }, 300);
        } catch (err) {
            showToast(err.message || 'Lỗi mở buổi điểm danh', 'error');
        }
    }

    toggleQuickSubjectInClassModal() {
        const box = document.getElementById('quick-subject-box');
        if (box) {
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
        }
    }

    async createClass() {
        const ten = document.getElementById('new-class-name').value.trim();
        let monHocID = document.getElementById('new-class-subject').value;
        const quickBox = document.getElementById('quick-subject-box');
        const isQuickSubOpen = quickBox && quickBox.style.display !== 'none';

        if (isQuickSubOpen) {
            const quickCode = (document.getElementById('quick-sub-code')?.value || '').trim();
            const quickName = (document.getElementById('quick-sub-name')?.value || '').trim();
            if (quickCode && quickName) {
                try {
                    const subRes = await API.createSubject(quickCode, quickName);
                    await this.loadSubjects();
                    monHocID = subRes.id;
                } catch (err) {
                    return showToast(`Lỗi tạo môn học: ${err.message}`, 'error');
                }
            }
        }

        if (!ten || !monHocID) return showToast('Vui lòng nhập tên lớp và chọn môn', 'error');

        try {
            const classRes = await API.createClass(ten, monHocID);
            const classId = classRes.id;

            const pastedText = (document.getElementById('new-class-students-paste')?.value || '').trim();
            let studentCount = 0;
            if (pastedText && classId) {
                const parsed = this._parseStudentText(pastedText);
                if (parsed.length > 0) {
                    const bulkRes = await API.bulkCreateStudents(classId, parsed);
                    studentCount = bulkRes.created || parsed.length;
                }
            }

            showToast(`Tạo lớp thành công${studentCount > 0 ? ` (đã thêm ${studentCount} SV)` : ''}`, 'success');
            this.closeModal('modal-add-class');
            document.getElementById('new-class-name').value = '';
            const pasteEl = document.getElementById('new-class-students-paste');
            if (pasteEl) pasteEl.value = '';
            if (quickBox) quickBox.style.display = 'none';
            await this.loadClasses();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async deleteClass(id) {
        if (!confirm('Xóa lớp học sẽ xóa toàn bộ sinh viên, dữ liệu khuôn mặt và buổi học của lớp?')) return;
        try {
            await API.deleteClass(id);
            showToast('Đã xóa lớp học', 'success');
            if (this.currentClass && this.currentClass.id === id) {
                this.backToClassesList();
            }
            await this.loadClasses();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ==========================================
    // Master-Detail View: Chi tiết Lớp học
    // ==========================================
    async openClassDetail(classId) {
        const cls = (this.classes || []).find((c) => c.id === classId);
        this.currentClass = cls || { id: classId, ten: `Lớp #${classId}` };
        this.currentView = 'detail';

        // update breadcrumb and banner
        document.getElementById('detail-class-breadcrumb').textContent = this.currentClass.ten;
        document.getElementById('detail-class-name').textContent = this.currentClass.ten;
        document.getElementById('detail-class-subject').textContent = `${this.currentClass.ma_mon || ''} • ${this.currentClass.ten_mon || 'Môn học'}`;
        document.getElementById('detail-class-subtext').textContent = `Quản lý buổi học, điểm danh và danh sách sinh viên của lớp ${this.currentClass.ten}`;
        document.getElementById('import-csv-class-name').textContent = `Import danh sách sinh viên cho lớp: ${this.currentClass.ten}`;

        // toggle view visibility
        document.getElementById('view-classes-list').style.display = 'none';
        document.getElementById('view-class-detail').style.display = 'block';

        // load both lessons and students data for this class
        await Promise.all([this.loadLessons(classId), this.loadStudents(classId)]);

        // maintain active subtab
        this.switchSubTab(this.currentSubTab || 'lessons');
    }

    backToClassesList() {
        this.currentView = 'list';
        this.currentClass = null;
        document.getElementById('view-class-detail').style.display = 'none';
        document.getElementById('view-classes-list').style.display = 'block';
        this.loadClasses();
    }

    switchSubTab(subTabName) {
        this.currentSubTab = subTabName;
        document.querySelectorAll('.subnav-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.subtab === subTabName);
        });
        document.querySelectorAll('.sub-pane').forEach((p) => {
            p.classList.toggle('active', p.id === `subpane-${subTabName}`);
        });

        if (subTabName === 'lessons') {
            this.renderLessonsTable();
        } else if (subTabName === 'students') {
            this.renderStudentsTable();
        }
    }

    // ==========================================
    // Buổi học & Điểm danh (Lessons of Class)
    // ==========================================
    async loadLessons(classId) {
        try {
            this.currentLessons = await API.listLessonsByClass(classId);
            const countBadge = document.getElementById('badge-count-lessons');
            const statLessons = document.getElementById('detail-stat-lessons');
            const count = this.currentLessons ? this.currentLessons.length : 0;

            if (countBadge) countBadge.textContent = count;
            if (statLessons) statLessons.textContent = `${count} buổi`;

            this.renderLessonsTable();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    renderLessonsTable() {
        const tbody = document.getElementById('detail-lesson-tbody');
        if (!tbody) return;

        if (!this.currentLessons || this.currentLessons.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-dim); padding: 32px 0;">Lớp chưa có buổi học nào. Hãy bấm "+ Tạo buổi học mới" ở trên để bắt đầu</td></tr>';
            return;
        }

        tbody.innerHTML = this.currentLessons
            .map((l) => {
                const isOpen = l.trang_thai === 'open';
                const presentCount = l.present_count || 0;
                const totalStudents = l.total_students || (this.currentStudents ? this.currentStudents.length : 0);
                const percent = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

                return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight:600;">#${l.id}</td>
                    <td style="font-weight:700;">${l.ngay}</td>
                    <td style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-muted);">
                        ${l.bat_dau || '--:--'} - ${l.ket_thuc || '--:--'}
                    </td>
                    <td>
                        ${
                            isOpen
                                ? `<span class="badge badge-success"><span class="badge-dot"></span>Đang mở</span>`
                                : `<span class="badge badge-neutral"><span class="badge-dot"></span>Đã đóng</span>`
                        }
                    </td>
                    <td>
                        <div class="attendance-progress">
                            <div class="attendance-progress-text">
                                <span style="font-weight: 700; color: ${percent > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${presentCount}/${totalStudents} có mặt</span>
                                <span>${percent}%</span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill" style="width: ${percent}%;"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            ${
                                isOpen
                                    ? `<button class="btn btn-secondary btn-sm" onclick="dashboard.toggleLessonStatus(${l.id}, 'closed')">Đóng buổi</button>`
                                    : `<button class="btn btn-success btn-sm" onclick="dashboard.toggleLessonStatus(${l.id}, 'open')">Mở điểm danh</button>`
                            }
                            <button class="btn btn-primary btn-sm" onclick="dashboard.openAttendanceModal(${l.id}, '${l.ngay}')">
                                Sổ điểm danh
                            </button>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <button class="btn btn-danger btn-sm" onclick="dashboard.deleteLesson(${l.id})">
                            Xóa
                        </button>
                    </td>
                </tr>
            `;
            })
            .join('');
    }

    async createLesson() {
        if (!this.currentClass) return showToast('Chưa chọn lớp học', 'error');
        const ngay = document.getElementById('new-lesson-date').value;
        const batDau = document.getElementById('new-lesson-start').value;
        const ketThuc = document.getElementById('new-lesson-end').value;
        if (!ngay) return showToast('Vui lòng chọn ngày học', 'error');

        try {
            await API.createLesson(this.currentClass.id, ngay, batDau, ketThuc);
            showToast('Tạo buổi học thành công', 'success');
            this.closeModal('modal-add-lesson');
            await this.loadLessons(this.currentClass.id);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async toggleLessonStatus(id, newStatus) {
        try {
            await API.updateLessonStatus(id, newStatus);
            showToast(`Đã ${newStatus === 'open' ? 'mở' : 'đóng'} buổi học`, 'success');
            if (this.currentClass) {
                await this.loadLessons(this.currentClass.id);
            }
            this.updateOverviewStats();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async deleteLesson(id) {
        if (!confirm('Xác nhận xóa buổi học này?')) return;
        try {
            await API.deleteLesson(id);
            showToast('Đã xóa buổi học', 'success');
            if (this.currentClass) {
                await this.loadLessons(this.currentClass.id);
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // Modal Sổ Điểm danh & Export CSV
    async openAttendanceModal(lessonId, date) {
        this.selectedLessonId = lessonId;
        document.getElementById('att-modal-title').textContent = `Sổ Điểm danh • Buổi #${lessonId} (${date})`;
        document.getElementById('btn-export-csv').href = API.getExportCSVUrl(lessonId);
        this.openModal('modal-attendance');
        await this.loadAttendanceTable(lessonId);
    }

    async loadAttendanceTable(lessonId) {
        const tbody = document.getElementById('attendance-tbody');
        if (!tbody) return;
        try {
            const records = await API.listAttendance(lessonId);
            if (!records || records.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-dim); padding: 24px 0;">Chưa có sinh viên trong danh sách</td></tr>';
                return;
            }

            tbody.innerHTML = records
                .map((r) => {
                    const isPresent = r.trang_thai === 'present';
                    const simScore = r.similarity ? `${Math.round(r.similarity * 100)}%` : '-';
                    const method = r.phuong_thuc === 'face' ? 'Webcam AI' : (r.phuong_thuc === 'manual' ? 'Thủ công' : '-');

                    return `
                    <tr>
                        <td style="font-family: var(--font-mono); font-weight:700;">${r.mssv}</td>
                        <td style="font-weight:600;">${r.ho_ten}</td>
                        <td>
                            ${
                                isPresent
                                    ? `<span class="badge badge-success"><span class="badge-dot"></span>Có mặt</span>`
                                    : `<span class="badge badge-danger"><span class="badge-dot"></span>Vắng</span>`
                            }
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${r.thoi_gian || '-'}</td>
                        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${simScore} (${method})</td>
                        <td style="text-align: right;">
                            ${
                                isPresent
                                    ? `<button class="btn btn-danger btn-sm" onclick="dashboard.manualCancel(${r.sinh_vien_id})">Hủy có mặt</button>`
                                    : `<button class="btn btn-success btn-sm" onclick="dashboard.manualCheckin(${r.sinh_vien_id})">Đánh dấu có mặt</button>`
                            }
                        </td>
                    </tr>
                `;
                })
                .join('');
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async manualCheckin(svId) {
        try {
            await API.manualCheckin(this.selectedLessonId, svId);
            showToast('Đã điểm danh thủ công', 'success');
            await this.loadAttendanceTable(this.selectedLessonId);
            if (this.currentClass) await this.loadLessons(this.currentClass.id);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async manualCancel(svId) {
        try {
            await API.manualCancel(this.selectedLessonId, svId);
            showToast('Đã hủy điểm danh', 'success');
            await this.loadAttendanceTable(this.selectedLessonId);
            if (this.currentClass) await this.loadLessons(this.currentClass.id);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ==========================================
    // Sinh viên & Khuôn mặt (Students of Class)
    // ==========================================
    async loadStudents(classId) {
        try {
            this.currentStudents = await API.listStudents(classId);
            const count = this.currentStudents ? this.currentStudents.length : 0;
            const faces = (this.currentStudents || []).filter((s) => s.has_face).length;

            const badgeCount = document.getElementById('badge-count-students');
            const statStudents = document.getElementById('detail-stat-students');
            const statFaces = document.getElementById('detail-stat-faces');

            if (badgeCount) badgeCount.textContent = count;
            if (statStudents) statStudents.textContent = `${count} SV`;
            if (statFaces) statFaces.textContent = `${faces}/${count} đã có mặt`;

            this.renderStudentsTable();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    filterStudents(filterType) {
        this.studentFilter = filterType;
        document.querySelectorAll('.filter-pill').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.filter === filterType);
        });
        this.renderStudentsTable();
    }

    renderStudentsTable() {
        const tbody = document.getElementById('detail-student-tbody');
        if (!tbody) return;

        const searchQuery = (document.getElementById('filter-student-search')?.value || '').trim().toLowerCase();
        let items = this.currentStudents || [];

        // filter by face status
        if (this.studentFilter === 'has_face') {
            items = items.filter((s) => s.has_face);
        } else if (this.studentFilter === 'no_face') {
            items = items.filter((s) => !s.has_face);
        }

        // search query
        if (searchQuery) {
            items = items.filter((s) => s.mssv.toLowerCase().includes(searchQuery) || s.ho_ten.toLowerCase().includes(searchQuery));
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-dim); padding: 32px 0;">Không tìm thấy sinh viên nào phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = items
            .map((s) => {
                const regDate = s.registered_at ? s.registered_at.split('T')[0] : '--';

                return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight:600;">#${s.id}</td>
                    <td style="font-family: var(--font-mono); font-weight:700;">${s.mssv}</td>
                    <td style="font-weight:600;">${s.ho_ten}</td>
                    <td>
                        ${
                            s.has_face
                                ? `<span class="badge badge-success"><span class="badge-dot"></span>Đã có mặt</span>`
                                : `<span class="badge badge-neutral"><span class="badge-dot"></span>Chưa có</span>`
                        }
                    </td>
                    <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">${regDate}</td>
                    <td style="text-align: right;">
                        <div class="row-actions">
                            <button class="btn ${s.has_face ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="dashboard.openFaceModal(${s.id}, '${s.ho_ten}', '${s.mssv}')">
                                ${s.has_face ? 'Chụp lại' : 'Chụp mặt'}
                            </button>
                            ${
                                s.has_face
                                    ? `<button class="btn btn-secondary btn-sm" onclick="dashboard.deleteFace(${s.id})">Xóa mặt</button>`
                                    : ''
                            }
                            <button class="btn btn-danger btn-sm" onclick="dashboard.deleteStudent(${s.id})">
                                Xóa SV
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');
    }

    async createStudent() {
        if (!this.currentClass) return showToast('Vui lòng chọn lớp học', 'error');
        const mssv = document.getElementById('new-student-mssv').value.trim();
        const hoTen = document.getElementById('new-student-name').value.trim();
        if (!mssv || !hoTen) return showToast('Vui lòng nhập MSSV và Họ tên', 'error');

        try {
            await API.createStudent(this.currentClass.id, mssv, hoTen);
            showToast('Thêm sinh viên thành công', 'success');
            this.closeModal('modal-add-student');
            document.getElementById('new-student-mssv').value = '';
            document.getElementById('new-student-name').value = '';
            await this.loadStudents(this.currentClass.id);
            this.updateOverviewStats();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async deleteStudent(id) {
        if (!confirm('Bạn có chắc muốn xóa sinh viên này khỏi lớp?')) return;
        try {
            await API.deleteStudent(id);
            showToast('Đã xóa sinh viên', 'success');
            if (this.currentClass) {
                await this.loadStudents(this.currentClass.id);
            }
            this.updateOverviewStats();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async deleteFace(id) {
        if (!confirm('Xác nhận xóa vector khuôn mặt của sinh viên?')) return;
        try {
            await API.deleteFace(id);
            showToast('Đã xóa dữ liệu khuôn mặt', 'success');
            if (this.currentClass) {
                await this.loadStudents(this.currentClass.id);
            }
            this.updateOverviewStats();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ==========================================
    // Import CSV Sinh viên
    // ==========================================
    setupCSVDropzone() {
        const dropzone = document.getElementById('csv-dropzone');
        if (!dropzone) return;

        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files[0]) {
                this.handleCSVFile(files[0]);
            }
        });
    }

    handleCSVFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            this.parseCSVText(text);
        };
        reader.readAsText(file);
    }

    switchImportMode(mode) {
        const pasteTab = document.getElementById('tab-btn-paste');
        const fileTab = document.getElementById('tab-btn-file');
        const pasteBox = document.getElementById('import-mode-paste');
        const fileBox = document.getElementById('import-mode-file');

        if (mode === 'paste') {
            if (pasteTab) pasteTab.className = 'btn btn-primary btn-sm';
            if (fileTab) fileTab.className = 'btn btn-secondary btn-sm';
            if (pasteBox) pasteBox.style.display = 'block';
            if (fileBox) fileBox.style.display = 'none';
        } else {
            if (pasteTab) pasteTab.className = 'btn btn-secondary btn-sm';
            if (fileTab) fileTab.className = 'btn btn-primary btn-sm';
            if (pasteBox) pasteBox.style.display = 'none';
            if (fileBox) fileBox.style.display = 'block';
        }
    }

    handlePasteInput(text) {
        if (!text || !text.trim()) {
            this.parsedCSV = [];
            this._renderCSVPreview();
            return;
        }
        this.parsedCSV = this._parseStudentText(text);
        this._renderCSVPreview();
    }

    _parseStudentText(text) {
        const lines = text.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
            if (parts.length < 2) continue;

            const mssv = parts[0];
            const hoTen = parts[1];

            if (i === 0 && (mssv.toLowerCase().includes('mssv') || mssv.toLowerCase().includes('mã') || hoTen.toLowerCase().includes('tên'))) {
                continue;
            }

            if (mssv && hoTen) {
                result.push({ mssv, ho_ten: hoTen });
            }
        }
        return result;
    }

    parseCSVText(text) {
        this.parsedCSV = this._parseStudentText(text);
        if (this.parsedCSV.length === 0) {
            showToast('Không tìm thấy dữ liệu hợp lệ (cần ít nhất 2 cột: MSSV và Họ Tên)', 'error');
            return;
        }
        this._renderCSVPreview();
    }

    _renderCSVPreview() {
        const previewCount = document.getElementById('csv-preview-count');
        const previewTbody = document.getElementById('csv-preview-tbody');
        const previewContainer = document.getElementById('csv-preview-container');
        const dropzone = document.getElementById('csv-dropzone');
        const submitBtn = document.getElementById('btn-submit-csv');

        if (!this.parsedCSV || this.parsedCSV.length === 0) {
            if (previewContainer) previewContainer.style.display = 'none';
            if (dropzone) dropzone.style.display = 'block';
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        if (previewCount) previewCount.textContent = `Đã nhận diện ${this.parsedCSV.length} sinh viên`;
        if (previewTbody) {
            previewTbody.innerHTML = this.parsedCSV
                .slice(0, 50)
                .map(
                    (s, idx) => `
                <tr>
                    <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dim);">${idx + 1}</td>
                    <td style="font-family: var(--font-mono); font-weight:700;">${s.mssv}</td>
                    <td style="font-weight:600;">${s.ho_ten}</td>
                </tr>
            `
                )
                .join('');
        }

        if (previewContainer) previewContainer.style.display = 'block';
        if (submitBtn) submitBtn.disabled = false;
    }

    resetCSVImport() {
        this.parsedCSV = [];
        const previewContainer = document.getElementById('csv-preview-container');
        const dropzone = document.getElementById('csv-dropzone');
        const submitBtn = document.getElementById('btn-submit-csv');
        const fileInput = document.getElementById('csv-file-input');
        const pasteTextarea = document.getElementById('csv-paste-textarea');

        if (fileInput) fileInput.value = '';
        if (pasteTextarea) pasteTextarea.value = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (dropzone) dropzone.style.display = 'block';
        if (submitBtn) submitBtn.disabled = true;
    }

    async executeCSVImport() {
        if (!this.currentClass || !this.parsedCSV || this.parsedCSV.length === 0) return;

        const submitBtn = document.getElementById('btn-submit-csv');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang import...';
        }

        try {
            const res = await API.bulkCreateStudents(this.currentClass.id, this.parsedCSV);
            showToast(`Import hoàn tất: ${res.created} mới, ${res.skipped} bỏ qua/đã có`, 'success');
            this.closeModal('modal-import-csv');
            this.resetCSVImport();
            await this.loadStudents(this.currentClass.id);
            this.updateOverviewStats();
        } catch (err) {
            showToast(err.message || 'Lỗi import sinh viên', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Tiến hành Import';
            }
        }
    }

    // ==========================================
    // Webcam Face Registration Modal
    // ==========================================
    async openFaceModal(svId, name, mssv) {
        this.currentRegSvId = svId;
        document.getElementById('face-modal-sv-name').textContent = `${name} (${mssv})`;
        document.getElementById('face-modal-status').textContent = 'Đang bật camera...';
        this.openModal('modal-face-reg');

        try {
            this.regStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
            this.regVideo.srcObject = this.regStream;
            await this.regVideo.play();
            document.getElementById('face-modal-status').textContent = 'Hãy nhìn thẳng vào camera và nhấn Chụp';
        } catch (e) {
            document.getElementById('face-modal-status').textContent = 'Không mở được camera. Bạn có thể chọn tải ảnh từ máy tính!';
        }
    }

    closeFaceModal() {
        if (this.regStream) {
            this.regStream.getTracks().forEach((t) => t.stop());
            this.regStream = null;
        }
        this.closeModal('modal-face-reg');
    }

    async captureFacePhoto() {
        if (!this.regVideo || this.regVideo.readyState !== 4) return;
        const canvas = this.regCanvas;
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.regVideo, 0, 0, 640, 480);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            await this.submitFaceBlob(blob);
        }, 'image/jpeg', 0.9);
    }

    async handleUploadFace(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        await this.submitFaceBlob(file);
    }

    async submitFaceBlob(blob, override = false) {
        const statusEl = document.getElementById('face-modal-status');
        statusEl.textContent = 'Đang phân tích khuôn mặt & kiểm tra chống giả mạo...';

        try {
            await API.registerFace(this.currentRegSvId, blob, override);
            showToast('Đăng ký khuôn mặt thành công!', 'success');
            this.closeFaceModal();
            if (this.currentClass) {
                await this.loadStudents(this.currentClass.id);
            }
            this.updateOverviewStats();
        } catch (err) {
            if (err.data && err.data.error === 'face_conflict') {
                const conflict = err.data.conflict_student || {};
                const confirmMsg = `Khuôn mặt này đã được đăng ký cho ${conflict.ho_ten || 'sinh viên khác'} (${conflict.mssv}). Bạn có chắc muốn cập nhật và chuyển quyền khuôn mặt này sang cho sinh viên hiện tại không?`;
                if (confirm(confirmMsg)) {
                    await this.submitFaceBlob(blob, true);
                    return;
                }
            }
            statusEl.innerHTML = `<span style="color: var(--accent-rose)">Lỗi: ${err.message}</span>`;
        }
    }

    // Modal Helpers
    setupModals() {
        document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    if (backdrop.id === 'modal-face-reg') this.closeFaceModal();
                    else backdrop.classList.remove('active');
                }
            });
        });
    }

    openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    }
}

// Global instance
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new DashboardController();
    dashboard.init();
});
