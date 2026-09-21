CREATE TABLE IF NOT EXISTS giang_vien (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    login_code_hash    TEXT UNIQUE NOT NULL,
    ho_ten        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mon_hoc (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_mon TEXT UNIQUE NOT NULL,
    ten    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lop_hoc (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ten           TEXT NOT NULL,
    mon_hoc_id    INTEGER REFERENCES mon_hoc(id),
    giang_vien_id INTEGER REFERENCES giang_vien(id)
);

CREATE TABLE IF NOT EXISTS sinh_vien (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mssv       TEXT UNIQUE NOT NULL,
    ho_ten     TEXT NOT NULL,
    lop_hoc_id INTEGER REFERENCES lop_hoc(id)
);

CREATE TABLE IF NOT EXISTS face_embedding (
    sinh_vien_id  INTEGER PRIMARY KEY REFERENCES sinh_vien(id) ON DELETE CASCADE,
    embedding     TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buoi_hoc (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    lop_hoc_id INTEGER REFERENCES lop_hoc(id),
    ngay       TEXT NOT NULL,
    bat_dau    DATETIME,
    ket_thuc   DATETIME,
    trang_thai TEXT DEFAULT 'closed'
);

CREATE TABLE IF NOT EXISTS diem_danh (
    buoi_hoc_id  INTEGER REFERENCES buoi_hoc(id),
    sinh_vien_id INTEGER REFERENCES sinh_vien(id),
    thoi_gian    DATETIME DEFAULT CURRENT_TIMESTAMP,
    similarity   REAL,
    phuong_thuc  TEXT DEFAULT 'face',
    PRIMARY KEY (buoi_hoc_id, sinh_vien_id)
);

-- code: gv123
-- Dùng INSERT OR IGNORE để nếu đã có dòng id = 1 rồi thì SQLite sẽ bỏ qua, không bị báo lỗi trùng lặp khi khởi động lại server
INSERT OR IGNORE INTO giang_vien (id, login_code_hash, ho_ten)
VALUES (1, '65ca356b8df5add62427391f621eeaefff7e6c601bdd61cbb38e302366b790ea', 'Giảng viên 1');
