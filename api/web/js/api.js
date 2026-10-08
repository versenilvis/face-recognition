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
