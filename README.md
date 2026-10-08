https://www.kaggle.com/code/cbg6682/ce201

- Go xử lý web, database, session cực nhanh và nhẹ
- Python lại có hệ sinh thái AI rất mạnh (InsightFace, OpenCV, PyTorch)
- Thay vì cố chạy model AI trong Go (rất phức tạp và thiếu thư viện), ta cho Python chạy một HTTP server nội bộ ở cổng 127.0.0.1:8001, Go chỉ cần gửi ảnh sang và nhận JSON kết quả

- Dự án này vốn ban đầu còn có thêm 1 thiết bị phần cứng nhỏ có camera, giúp sinh viên truyền tay nhau điểm danh cuối hoặc đầu giờ học. Nhưng vì chi phí quá cao nên đã đổi lại thành kết nối qua điện thoại

## Cách chạy:

Nếu có just file:

```bash
just up
```

Hoặc:

```bash
docker compose up
```

- Infer: http://localhost:8080/
- Web: http://localhost:8080/ (tài khoản mặc định: gv / gv123)
