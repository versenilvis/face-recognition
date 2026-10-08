# Kế hoạch hệ thống điểm danh khuôn mặt

## "infer" nghĩa là gì?

**Inference** = chạy model AI để dự đoán kết quả. Sau khi model đã được train (học từ data), bạn đưa ảnh mới vào để model "suy luận" ra embedding/liveness = running inference. Thư mục `infer/` chứa Python service làm đúng việc đó.

---

## Kiến trúc tổng thể

```
[Browser - SvelteKit]
        │ HTTP
        ▼
[Go API - Fiber :8080]  ──────────────────────────────────
        │                                                  │
        │ HTTP (localhost only)              [SQLite file]
        ▼                                   face_reg.db
[Python service :8001]
  RetinaFace + ArcFace + MiniFASNetV2
```

Tất cả chạy local, không tunnel, đóng gói bằng Docker Compose.

---

## Database — tại sao SQLite thay vì PostgreSQL

| | SQLite | PostgreSQL |
|---|---|---|
| Cài đặt | Không cần, embedded trong Go | Cần riêng 1 process/container |
| RAM | ~5 MB | ~50–100 MB |
| Docker | 0 container thêm, 1 volume file | 1 container riêng |
| Concurrent write | WAL mode: OK cho quy mô này | Mạnh hơn nhiều, không cần |
| Backup | Copy 1 file `.db` | pg_dump |
| Query | Đủ dùng, sqlc hỗ trợ | Đủ dùng, sqlc hỗ trợ |

**Kết luận: dùng SQLite + WAL mode.** Quy mô 1 lớp ~50 SV, tốc độ ghi không phải bottleneck — model inference mới là bottleneck.

WAL mode bật 1 lần khi start:
```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

---

## Tech stack

| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Python service | Python 3.12 + Flask | 1 endpoint đơn giản |
| Face detect + embed | InsightFace `buffalo_s` | Đã verify trong notebook |
| Anti-spoofing | MiniFASNetV2 | Đã verify trong notebook |
| API + UI | Go + Fiber | Quen từ trước, serve template trực tiếp |
| Templating | Go `html/template` | Stdlib, không cần build step |
| Interactivity | HTMX (CDN) | Form, table refresh, toggle — không cần JS framework |
| Camera/Canvas | Vanilla JS | Chỉ ~100 dòng cho 2 trang webcam |
| Database | SQLite + WAL | Nhẹ, embedded, đủ cho local |
| ORM/Query | sqlc | Type-safe, quen từ trước |
| Deploy | Docker Compose | 2 container: infer + api |

---

## Cấu trúc thư mục

```
face-reg/
├── infer/                        # Python inference service
│   ├── app.py                    # Flask server — POST /infer, GET /health
│   ├── pipeline.py               # process_frame() → list[FaceResult]
│   ├── detector.py               # InsightFace: detect + ArcFace embed
│   ├── liveness.py               # MiniFASNetV2: real / fake
│   ├── config.py                 # thresholds, paths
│   ├── requirements.txt
│   ├── Dockerfile
│   └── Silent-Face-Anti-Spoofing/
│
├── api/                          # Go API + template server
│   ├── main.go
│   ├── go.mod
│   ├── config/config.go
│   ├── handlers/
│   │   ├── auth.go
│   │   ├── lop_hoc.go
│   │   ├── sinh_vien.go
│   │   ├── buoi_hoc.go
│   │   └── diem_danh.go
│   ├── db/
│   │   ├── migrations/001_init.sql
│   │   └── query/                # sqlc query files
│   ├── middleware/auth.go
│   ├── infer/client.go           # HTTP client gọi Python service
│   ├── templates/                # Go html/template files
│   │   ├── layout.html
│   │   ├── index.html            # trang chủ = check-in (webcam)
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── lop.html
│   │   ├── face_register.html    # webcam đăng ký mặt
│   │   └── buoi.html
│   ├── static/
│   │   ├── camera.js             # vanilla JS cho webcam/canvas
│   │   └── style.css
│   ├── .air.toml
│   └── Dockerfile
│
├── data/                         # SQLite file (gitignore)
│   └── face_reg.db
│
├── docs/
│   ├── plan.md
│   └── requirement.md
│
├── research/
│   └── ce201_pipeline_research.ipynb
│
├── docker-compose.yml
├── justfile
└── .env
```

---

## Docker Compose

```yaml
services:
  infer:
    build: ./infer
    networks: [internal]   # không expose port ra ngoài

  api:                     # serve cả API lẫn HTML templates
    build: ./api
    ports: ["8080:8080"]
    volumes:
      - ./data:/data       # SQLite file
    environment:
      - INFER_URL=http://infer:8001
      - DB_PATH=/data/face_reg.db
    depends_on: [infer]
    networks: [internal]

networks:
  internal:
```

2 container. Không Caddy. Không node. Không SvelteKit.

---

## Xử lý nhiều khuôn mặt — không race condition

### Vấn đề

Camera gửi 1 frame lên → frame có thể chứa 3–8 khuôn mặt → phải xử lý nhanh, đồng đều, không SV nào bị bỏ qua, không ghi trùng.

### Giải pháp — 3 tầng phòng thủ

**Tầng 1 — Python xử lý tuần tự trong 1 frame (không cần lock)**

```
1 request /infer → Python xử lý tuần tự từng mặt trong frame đó
→ trả về list kết quả tất cả mặt trong frame cùng lúc
```

Python Flask chạy single-threaded → chỉ 1 request inference tại 1 thời điểm → không có race condition ở đây. Đây là đúng vì chúng ta chỉ có 1 camera gửi 1 frame tại 1 thời điểm.

**Tầng 2 — Go serialize call đến Python bằng semaphore**

```go
// infer/client.go
var inferSem = make(chan struct{}, 1) // chỉ 1 goroutine gọi Python tại 1 thời điểm

func CallInfer(imgBytes []byte) (*InferResponse, error) {
    inferSem <- struct{}{}
    defer func() { <-inferSem }()
    // ... gọi HTTP đến Python
}
```

Bảo vệ trường hợp edge case: nếu client gửi 2 frame liên tiếp nhanh, Go queue request thứ 2 lại thay vì thổi Python.

**Tầng 3 — DB chặn ghi trùng bằng PRIMARY KEY**

```sql
-- checkin 2 lần cùng buổi → tự động bị ignore
INSERT INTO diem_danh (buoi_hoc_id, sinh_vien_id, ...)
VALUES (?, ?, ...)
ON CONFLICT (buoi_hoc_id, sinh_vien_id) DO NOTHING;
```

Không cần check trước rồi insert — 1 câu SQL duy nhất, atomic, không race condition dù có 2 request đồng thời.

### Timeline 1 frame 5 mặt (CPU laptop 7840HS)

```
0ms      RetinaFace detect toàn frame                ~200ms
200ms    ArcFace embed mặt 1                          ~30ms
230ms    Liveness mặt 1                               ~70ms
300ms    ArcFace embed mặt 2                          ~30ms
330ms    Liveness mặt 2                               ~70ms
...
600ms    xong tất cả 5 mặt
         Go nhận, cosine sim ×5 (~1ms mỗi cái)
         INSERT 5 rows
         trả response
```

**~600ms / frame** → auto-capture interval 3 giây → có thừa thời gian đệm. Mỗi mặt thực tế tốn ~120ms compute.

---

## Database schema (SQLite)

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE giang_vien (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    ho_ten        TEXT NOT NULL
);

CREATE TABLE mon_hoc (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_mon TEXT UNIQUE NOT NULL,
    ten    TEXT NOT NULL
);

CREATE TABLE lop_hoc (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ten           TEXT NOT NULL,
    mon_hoc_id    INTEGER REFERENCES mon_hoc(id),
    giang_vien_id INTEGER REFERENCES giang_vien(id)
);

CREATE TABLE sinh_vien (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mssv       TEXT UNIQUE NOT NULL,
    ho_ten     TEXT NOT NULL,
    lop_hoc_id INTEGER REFERENCES lop_hoc(id)
);

-- lưu dưới dạng JSON string "[-0.12, 0.34, ...]" — đơn giản nhất cho SQLite
-- Go đọc ra, JSON unmarshal → []float64 → cosine sim
CREATE TABLE face_embedding (
    sinh_vien_id  INTEGER PRIMARY KEY REFERENCES sinh_vien(id) ON DELETE CASCADE,
    embedding     TEXT NOT NULL,   -- JSON array 512 floats
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE buoi_hoc (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    lop_hoc_id INTEGER REFERENCES lop_hoc(id),
    ngay       TEXT NOT NULL,       -- "2026-09-17"
    bat_dau    DATETIME,
    ket_thuc   DATETIME,
    trang_thai TEXT DEFAULT 'closed' -- 'open' | 'closed'
);

CREATE TABLE diem_danh (
    buoi_hoc_id  INTEGER REFERENCES buoi_hoc(id),
    sinh_vien_id INTEGER REFERENCES sinh_vien(id),
    thoi_gian    DATETIME DEFAULT CURRENT_TIMESTAMP,
    similarity   REAL,
    phuong_thuc  TEXT DEFAULT 'face',  -- 'face' | 'manual'
    PRIMARY KEY (buoi_hoc_id, sinh_vien_id)
);
```

**Embedding lưu JSON string** — không cần extension, SQLite đọc/ghi nhanh với 50 SV.

---

## Go API endpoints

### Auth (không cần JWT middleware)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | email + password → JWT token |

### Môn học
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/mon-hoc` | danh sách |
| POST | `/api/mon-hoc` | tạo mới |
| DELETE | `/api/mon-hoc/:id` | xóa |

### Lớp học
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/lop-hoc` | danh sách |
| POST | `/api/lop-hoc` | tạo mới |
| GET | `/api/lop-hoc/:id` | chi tiết + danh sách SV |

### Sinh viên
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/lop-hoc/:id/sinh-vien` | thêm 1 SV thủ công |
| POST | `/api/lop-hoc/:id/sinh-vien/import` | import CSV (mssv, ho_ten) |
| DELETE | `/api/sinh-vien/:id` | xóa SV |
| POST | `/api/sinh-vien/:id/face` | upload 3 ảnh → infer × 3 → trung bình embedding → lưu |
| DELETE | `/api/sinh-vien/:id/face` | xóa embedding (đăng ký lại) |

### Buổi học
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/lop-hoc/:id/buoi-hoc` | danh sách buổi của lớp |
| POST | `/api/lop-hoc/:id/buoi-hoc` | tạo buổi |
| PATCH | `/api/buoi-hoc/:id/status` | `{"status": "open"}` hoặc `"closed"` |
| GET | `/api/buoi-hoc/:id/diem-danh` | danh sách điểm danh |
| PATCH | `/api/buoi-hoc/:id/diem-danh/:sv_id` | sửa thủ công |
| GET | `/api/buoi-hoc/:id/export` | trả về CSV |

### Điểm danh (public — không cần JWT)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/buoi-hoc/open` | danh sách buổi đang mở (cho trang chủ dropdown) |
| POST | `/api/buoi-hoc/:id/checkin` | nhận frame → infer → cosine sim → ghi DB → trả kết quả |

**Logic checkin chi tiết:**
```
1. kiểm tra buoi_hoc.trang_thai = 'open' → 403 nếu không
2. Go gọi Python /infer (qua semaphore — xếp hàng)
3. Python trả list face:
   - embedding (512 chiều)
   - liveness label + score
4. Go lọc: chỉ xử lý face có liveness = "Real"
5. Load roster: tất cả sinh_vien trong lớp đó có face_embedding
6. Với mỗi real face: cosine_sim với từng embedding trong roster
   → lấy max → nếu >= 0.45 → matched_sv_id
7. INSERT INTO diem_danh ... ON CONFLICT DO NOTHING
8. Trả về: [{sv_id, ho_ten, similarity, mssv, status: "new"|"already"}]
```

---

## Python inference response format

```json
{
  "faces": [
    {
      "bbox": [120, 80, 300, 320],
      "det_score": 0.98,
      "embedding": [0.12, -0.34, 0.07, ...],
      "liveness": {
        "label": "Real",
        "score": 0.94
      }
    },
    {
      "bbox": [400, 60, 580, 290],
      "det_score": 0.95,
      "embedding": [-0.08, 0.22, ...],
      "liveness": {
        "label": "Fake",
        "score": 0.21
      }
    }
  ]
}
```

---

## SvelteKit — các trang

| Route | Mô tả |
|---|---|
| `/` | trang chủ = màn hình điểm danh (camera mở ngay, public) |
| `/login` | đăng nhập |
| `/dashboard` | overview: các lớp + buổi hôm nay |
| `/lop/[id]` | danh sách SV, badge mặt, nút thêm SV / import CSV |
| `/lop/[id]/face-register` | webcam đăng ký mặt SV |
| `/buoi/[id]` | danh sách điểm danh, toggle mở/đóng, sửa, export |

### Màn hình điểm danh (trang `/`)

```
┌────────────────────────────────────────────────────────┐
│  Buổi học: [dropdown chọn buổi đang open]              │
├────────────────────────┬───────────────────────────────┤
│                        │  ĐÃ ĐIỂM DANH (12/50)         │
│    CAMERA LIVE FEED    │  ─────────────────────         │
│                        │  ✅ Nguyễn Văn A  09:01       │
│  [bbox vẽ lên video]   │  ✅ Trần Thị B    09:02       │
│  [tên SV hiện overlay] │  ✅ Lê Văn C      09:03       │
│                        │  ...                           │
├────────────────────────┴───────────────────────────────┤
│  ● Đang quét  /  ✅ Nhận diện thành công  /  ⚠️ Giả mạo│
└────────────────────────────────────────────────────────┘
```

Auto-capture 3 giây → POST /checkin → nhận response → vẽ bbox + tên lên canvas overlay → cập nhật danh sách bên phải.

---

## Thresholds (tunable)

| Param | Giá trị | Ý nghĩa |
|---|---|---|
| `DET_THRESH` | 0.5 | confidence detect khuôn mặt |
| `LIVENESS_THRESH` | 0.60 | score >= 60% → mặt thật |
| `RECOG_THRESH` | 0.45 | cosine sim >= 45% → nhận ra người |
| capture interval | 3s | tần suất gửi frame lên server |

---

## Chạy local (Docker)

```bash
docker compose up --build
# → http://localhost:8080
```

Không cần tunnel, không cần Postgres, không cần gì ngoài Docker.

---

## Benchmark từ notebook (dùng cho báo cáo — không cần chạy lại)

- **Recognition accuracy** CASIA-WebFace 50 người: cell 9
- **Liveness F1** CASIA-FASD full dataset: cell 10
- **Detection confidence** LFW 300 ảnh: cell 8
