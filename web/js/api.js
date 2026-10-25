// api client wrapper for face recognition attendance system

const API = {
    async request(url, options = {}) {
        try {
            const resp = await fetch(url, options);
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const errorMsg = data.message || data.error || `HTTP error ${resp.status}`;
                const err = new Error(errorMsg);
                err.status = resp.status;
                err.data = data;
                throw err;
            }
            return data;
        } catch (err) {
            console.error(`API Error on ${url}:`, err);
            throw err;
        }
    },

    // auth
    async login(loginCode) {
        return this.request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login_code: loginCode }),
        });
    },

    async logout() {
        return this.request('/logout', { method: 'POST' });
    },

    // môn học
    async listSubjects() {
        return this.request('/protected/mon-hoc');
    },

    async createSubject(maMon, ten) {
        return this.request('/protected/mon-hoc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ma_mon: maMon, ten }),
        });
    },

    async deleteSubject(id) {
        return this.request(`/protected/mon-hoc/${id}`, { method: 'DELETE' });
    },

    // lớp học
    async listClasses() {
        return this.request('/protected/lop-hoc');
    },

    async createClass(ten, monHocID) {
        return this.request('/protected/lop-hoc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ten, mon_hoc_id: Number(monHocID) }),
        });
    },

    async deleteClass(id) {
        return this.request(`/protected/lop-hoc/${id}`, { method: 'DELETE' });
    },

    // sinh viên
    async listStudents(classID) {
        return this.request(`/protected/lop-hoc/${classID}/sinh-vien`);
    },

    async listAllStudents() {
        return this.request('/protected/sinh-vien/all');
    },

    async lookupStudent(mssv) {
        return this.request(`/protected/sinh-vien/lookup/${encodeURIComponent(mssv)}`);
    },

    async createStudent(classID, mssv, hoTen) {
        return this.request(`/protected/lop-hoc/${classID}/sinh-vien`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mssv, ho_ten: hoTen }),
        });
    },

    async bulkCreateStudents(classID, students) {
        return this.request(`/protected/lop-hoc/${classID}/sinh-vien/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(students),
        });
    },

    async deleteStudent(id) {
        return this.request(`/protected/sinh-vien/${id}`, { method: 'DELETE' });
    },

    // buổi học
    async listLessonsByClass(classID) {
        return this.request(`/protected/lop-hoc/${classID}/buoi-hoc`);
    },

    async listOpenLessons() {
        return this.request('/buoi-hoc/open');
    },

    async getLesson(id) {
        return this.request(`/buoi-hoc/${id}`);
    },

    async startTodayLesson(classID) {
        return this.request(`/protected/lop-hoc/${classID}/buoi-hoc/today`, {
            method: 'POST',
        });
    },

    async createLesson(classID, ngay, batDau, ketThuc) {
        return this.request(`/protected/lop-hoc/${classID}/buoi-hoc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ngay,
                bat_dau: batDau || null,
                ket_thuc: ketThuc || null,
            }),
        });
    },

    async updateLessonStatus(id, status) {
        return this.request(`/protected/buoi-hoc/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: status }),
        });
    },

    async deleteLesson(id) {
        return this.request(`/protected/buoi-hoc/${id}`, { method: 'DELETE' });
    },

    // điểm danh
    async listAttendance(lessonID) {
        return this.request(`/buoi-hoc/${lessonID}/diem-danh`);
    },

    async manualCheckin(lessonID, svID) {
        return this.request(`/protected/buoi-hoc/${lessonID}/diem-danh/${svID}`, {
            method: 'POST',
        });
    },

    async manualCancel(lessonID, svID) {
        return this.request(`/protected/buoi-hoc/${lessonID}/diem-danh/${svID}`, {
            method: 'DELETE',
        });
    },

    getExportCSVUrl(lessonID) {
        return `/protected/buoi-hoc/${lessonID}/export`;
    },

    getClassExportCSVUrl(classID) {
        return `/protected/lop-hoc/${classID}/export`;
    },

    // Face Recognition
    async registerFace(svID, imageBlob, override = false) {
        const formData = new FormData();
        formData.append('image', imageBlob, 'register.jpg');
        if (override) {
            formData.append('override', 'true');
        }
        return this.request(`/protected/sinh-vien/${svID}/face`, {
            method: 'POST',
            body: formData,
        });
    },

    async deleteFace(svID) {
        return this.request(`/protected/sinh-vien/${svID}/face`, {
            method: 'DELETE',
        });
    },

    async checkin(lessonID, imageBlob) {
        const formData = new FormData();
        formData.append('image', imageBlob, 'checkin.jpg');
        return this.request(`/buoi-hoc/${lessonID}/checkin`, {
            method: 'POST',
            body: formData,
        });
    },
};

// toast notification utility
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// custom promise-based confirmation dialog
function showConfirm({
    title = 'Xác nhận thao tác',
    message = 'Bạn có chắc chắn muốn thực hiện thao tác này?',
    itemText = '',
    itemSubtext = '',
    confirmText = 'Xác nhận xóa',
    cancelText = 'Hủy',
    type = 'danger',
} = {}) {
    return new Promise((resolve) => {
        const oldModal = document.getElementById('custom-confirm-modal');
        if (oldModal) oldModal.remove();

        const isDanger = type === 'danger';
        const isWarning = type === 'warning';

        const confirmBtnClass = isDanger ? 'btn btn-danger' : (isWarning ? 'btn btn-primary' : 'btn btn-primary');

        const modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.className = 'confirm-dialog-backdrop';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 16px;
            opacity: 0;
            transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        const itemPreviewHtml = itemText ? `
            <div style="display: flex; flex-direction: column; padding: 10px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 12px; margin: 12px 0 16px 0;">
                <span style="font-size: 13px; font-weight: 600; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${itemText}</span>
                ${itemSubtext ? `<span style="font-size: 11px; color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">${itemSubtext}</span>` : ''}
            </div>
        ` : '';

        modal.innerHTML = `
            <div class="confirm-dialog-card" style="
                background: linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(10, 13, 22, 0.98) 100%);
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 20px;
                padding: 24px;
                max-width: 420px;
                width: 100%;
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08);
                transform: scale(0.92) translateY(8px);
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
                position: relative;
            ">
                <div style="margin-bottom: 14px;">
                    <h3 style="font-size: 16px; font-weight: 700; color: #ffffff; margin: 0 0 6px 0; letter-spacing: -0.01em;">${title}</h3>
                    <p style="font-size: 13px; color: #94a3b8; line-height: 1.55; margin: 0;">${message}</p>
                </div>

                ${itemPreviewHtml}

                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px;">
                    <button id="confirm-modal-cancel" class="btn btn-secondary" style="height: 36px; padding: 0 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        ${cancelText}
                    </button>
                    <button id="confirm-modal-ok" class="${confirmBtnClass}" style="height: 36px; padding: 0 18px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            const card = modal.querySelector('.confirm-dialog-card');
            if (card) card.style.transform = 'scale(1) translateY(0)';
        });

        const close = (result) => {
            modal.style.opacity = '0';
            const card = modal.querySelector('.confirm-dialog-card');
            if (card) card.style.transform = 'scale(0.95) translateY(4px)';
            cleanup();
            setTimeout(() => {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
                resolve(result);
            }, 180);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                close(true);
            }
        };

        const onBackdropClick = (e) => {
            if (e.target === modal) {
                close(false);
            }
        };

        const cleanup = () => {
            document.removeEventListener('keydown', onKeyDown);
            modal.removeEventListener('click', onBackdropClick);
        };

        document.addEventListener('keydown', onKeyDown);
        modal.addEventListener('click', onBackdropClick);

        const btnCancel = modal.querySelector('#confirm-modal-cancel');
        const btnOk = modal.querySelector('#confirm-modal-ok');

        if (btnCancel) {
            btnCancel.addEventListener('click', () => close(false));
            btnCancel.focus();
        }
        if (btnOk) {
            btnOk.addEventListener('click', () => close(true));
        }
    });
}
window.showConfirm = showConfirm;

// vietnam timezone helper
window.VNTime = {
    // get current YYYY-MM-DD in Vietnam timezone
    getTodayDate() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    },
    // get current HH:MM in Vietnam timezone
    getCurrentTime() {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(new Date());
    },
    // get current HH:MM:SS in Vietnam timezone
    getCurrentTimeFull() {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date());
    },
    // evaluate lesson status based on Vietnam date and shift hours
    evaluateLesson(lesson) {
        if (!lesson) {
            return {
                code: 'none',
                isLive: false,
                label: 'Chưa có buổi học',
                badgeText: 'Chưa mở',
                dotClass: 'bg-zinc-500',
                isPulse: false
            };
        }
        const today = this.getTodayDate();
        const nowTime = this.getCurrentTime();
        const lessonDate = lesson.ngay || '';
        const isOpen = lesson.trang_thai === 'open' || lesson.status === 'open';

        if (lessonDate < today) {
            return {
                code: 'past',
                isLive: false,
                label: 'Ngày cũ',
                badgeText: 'Ngày cũ',
                badgeClass: 'badge-neutral',
                dotClass: 'bg-zinc-500',
                isPulse: false,
                desc: `Đã kết thúc (${lessonDate})`
            };
        }

        if (lessonDate > today) {
            return {
                code: 'future',
                isLive: false,
                label: 'Sắp tới',
                badgeText: 'Sắp tới',
                badgeClass: 'badge-neutral',
                dotClass: 'bg-blue-400',
                isPulse: false,
                desc: `Lịch ngày ${lessonDate}`
            };
        }

        // today
        if (!isOpen) {
            return {
                code: 'closed_today',
                isLive: false,
                label: 'Đã đóng',
                badgeText: 'Đã đóng',
                badgeClass: 'badge-neutral',
                dotClass: 'bg-zinc-500',
                isPulse: false,
                desc: 'Đã đóng điểm danh'
            };
        }

        const batDau = lesson.bat_dau || '';
        const ketThuc = lesson.ket_thuc || '';

        if (batDau && ketThuc) {
            let isLive = false;
            let isUpcoming = false;
            let isPast = false;

            if (batDau <= ketThuc) {
                if (nowTime < batDau) isUpcoming = true;
                else if (nowTime > ketThuc) isPast = true;
                else isLive = true;
            } else {
                if (nowTime >= batDau || nowTime <= ketThuc) isLive = true;
                else isPast = true;
            }

            if (isUpcoming) {
                return {
                    code: 'upcoming_shift',
                    isLive: false,
                    label: `Chưa tới giờ (${batDau})`,
                    badgeText: 'Chưa tới ca',
                    badgeClass: 'badge-info',
                    dotClass: 'bg-sky-400',
                    isPulse: false,
                    desc: `Ca học: ${batDau} - ${ketThuc}`
                };
            }
            if (isPast) {
                return {
                    code: 'past_shift',
                    isLive: false,
                    label: `Hết giờ ca (${ketThuc})`,
                    badgeText: 'Hết giờ ca',
                    badgeClass: 'badge-warning',
                    dotClass: 'bg-amber-400',
                    isPulse: false,
                    desc: `Ca học đã qua: ${batDau} - ${ketThuc}`
                };
            }
            return {
                code: 'live_shift',
                isLive: true,
                label: 'Đang diễn ra (LIVE)',
                badgeText: 'LIVE',
                badgeClass: 'badge-success',
                dotClass: 'bg-emerald-400',
                isPulse: true,
                desc: `Đang trong giờ ca: ${batDau} - ${ketThuc}`
            };
        }

        return {
            code: 'live_open',
            isLive: true,
            label: 'Đang diễn ra (LIVE)',
            badgeText: 'LIVE',
            badgeClass: 'badge-success',
            dotClass: 'bg-emerald-400',
            isPulse: true,
            desc: 'Đang mở điểm danh hôm nay'
        };
    }
};
