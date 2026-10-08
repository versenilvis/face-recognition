Nội dung đề tài:NGHIÊN CỨU VÀ THIẾT KẾ HỆ THỐNG ĐIỂM DANH DỰA TRÊN NHẬN DIỆN KHUÔN MẶT
Tổng quan đề tài:
Điểm danh là công việc lặp lại thường xuyên trong các cơ sở giáo dục và doanh nghiệp, nhưng các phương pháp truyền thống đều còn hạn chế riêng:
Gọi tên/ký sổ tốn thời gian đầu giờ học và dễ xảy ra tình trạng ký hộ, điểm danh hộ nhau.
Thẻ từ tuy nhanh hơn nhưng có thể bị mượn hoặc quẹt hộ cho người vắng mặt.
Vân tay tuy khó nhờ người khác điểm danh hộ hơn, nhưng lại yêu cầu tiếp xúc trực tiếp từng người một, độ chính xác dễ bị ảnh hưởng bởi vết bẩn, mồ hôi hoặc tổn thương trên da tay, từ đó có thể làm chậm trễ quá trình điểm danh, gây ảnh hưởng tới mọi người.
Nhận diện khuôn mặt là hướng tiếp cận không tiếp xúc, khó giả mạo hơn thẻ/sổ, và đã được nghiên cứu, ứng dụng khá rộng rãi trong vài năm gần đây:
Các mô hình nhận diện khuôn mặt hiện đại như FaceNet, ArcFace, hay các bộ mô hình mã nguồn mở như InsightFace (buffalo_l) đạt độ chính xác cao trên các bộ dữ liệu benchmark, và đã có nhiều nghiên cứu trong nước áp dụng các mô hình này để điểm danh sinh viên tại phòng thực hành hoặc lớp học, kết hợp mạng học sâu phát hiện khuôn mặt với FaceNet để mã hóa và một bộ phân lớp để so khớp.
Trên thị trường đã có các sản phẩm thương mại (máy chấm công AI tích hợp Face ID, hệ thống quản lý giáo dục có module điểm danh khuôn mặt) với tốc độ nhận diện nhanh (dưới 1 giây/lượt) và được nhiều trường học, doanh nghiệp triển khai để kiểm soát ra vào và chấm công.
Đồng thời cũng có nhiều dự án mã nguồn mở (ví dụ các hệ thống điểm danh dùng FastAPI + OpenCV + InsightFace, hoặc dùng SFace) cho phép đăng ký khuôn mặt, điểm danh check-in/check-out theo thời gian thực và lưu trữ vào cơ sở dữ liệu.
Thực trạng và khoảng trống:
Phần lớn các giải pháp thương mại có chi phí triển khai cao, phụ thuộc vào phần cứng/camera chuyên dụng và không phù hợp để tùy biến cho quy mô một lớp học/phòng thực hành cụ thể. Ngược lại, các đồ án/dự án mã nguồn mở sẵn có thường chỉ dừng ở mức xây dựng được luồng nhận diện - lưu điểm danh cơ bản, còn thiếu các yếu tố:
(1) Cơ chế chống giả mạo trước ảnh/video giả.
(2) Khả năng quản lý theo lớp học/môn học/buổi học như thực tế đào tạo tại trường đại học.
(3) Giao diện quản trị cho giảng viên để theo dõi, xuất báo cáo điểm danh.
Đây là lý do nhóm chọn thực hiện đề tài này: xây dựng một hệ thống điểm danh bằng khuôn mặt có kiến trúc rõ ràng, dễ triển khai trong quy mô lớp học/phòng thực hành, có xét đến chống giả mạo cơ bản và cung cấp công cụ quản lý cho giảng viên.

Mục tiêu của đề tài:
* Mục tiêu tổng quát:
Nghiên cứu và xây dựng một hệ thống điểm danh tự động dựa trên nhận diện khuôn mặt, có thể triển khai thử nghiệm cho quy mô một lớp học/phòng thực hành.
* Mục tiêu cụ thể:
Xây dựng module phát hiện và nhận diện khuôn mặt đạt độ chính xác chấp nhận được (đề xuất ≥ 90–95% trên tập dữ liệu khuôn mặt thu thập từ chính nhóm/lớp thử nghiệm), thời gian xử lý mỗi lượt điểm danh trong khoảng vài giây.
Bổ sung cơ chế chống giả mạo cơ bản (liveness detection – ví dụ yêu cầu chớp mắt/quay đầu, hoặc phân tích độ sâu/độ tương phản khung hình), đây là điểm cải tiến so với phần lớn đồ án sinh viên hiện có vốn chỉ dừng ở so khớp khuôn mặt tĩnh, dễ bị đánh lừa bằng ảnh in hoặc ảnh trên điện thoại.
Xây dựng hệ thống quản lý điểm danh theo lớp học/môn học/buổi học (không chỉ ghi nhận check-in/check-out chung chung như các dự án mã nguồn mở tham khảo), cho phép giảng viên xem và xuất báo cáo.
Thiết kế kiến trúc hệ thống có khả năng mở rộng (tách rời phần xử lý nhận diện khuôn mặt và phần quản lý nghiệp vụ), thuận tiện để bảo trì và phát triển thêm ở giai đoạn khóa luận sau này.

Phương pháp thực hiện:
* Cách tiếp cận:
Hệ thống được chia thành 3 thành phần chính, giao tiếp qua API, để tách biệt phần xử lý AI (thay đổi/nâng cấp mô hình dễ dàng) khỏi phần nghiệp vụ:
Client/thiết bị điểm danh: ứng dụng web hoặc thiết bị có camera (laptop/webcam lớp học, …) chụp/stream khuôn mặt gửi lên hệ thống.
Face Recognition Service (Python): dùng các thư viện đã được kiểm chứng (OpenCV để xử lý ảnh/video; một mô hình phát hiện khuôn mặt như MTCNN/RetinaFace; một mô hình trích xuất đặc trưng khuôn mặt như FaceNet hoặc ArcFace/InsightFace) để phát hiện, mã hóa khuôn mặt thành vector đặc trưng và so khớp với dữ liệu đã đăng ký; có bước kiểm tra liveness trước khi xác nhận.
Backend quản lý nghiệp vụ (Golang): xây dựng bằng Golang (ngôn ngữ được chọn bởi thành viên vì đã có kiến thức từ trước) nhằm để tận dụng thế mạnh về hiệu năng và xử lý đồng thời khi nhiều lượt điểm danh gửi lên cùng lúc (đầu giờ học); chịu trách nhiệm quản lý lớp học/môn học/buổi học/sinh viên, gọi sang Face Recognition Service để xác thực, ghi nhận kết quả vào cơ sở dữ liệu và cung cấp API cho giao diện quản trị của giảng viên.
Cơ sở dữ liệu: lưu thông tin sinh viên, vector đặc trưng khuôn mặt đã đăng ký, lớp học/môn học/buổi học và lịch sử điểm danh.
* Sơ đồ tổng quan đề tài:
Luồng hoạt động: sinh viên đăng ký khuôn mặt một lần (đầu kỳ) → đến mỗi buổi học, sinh viên đưa mặt vào camera → hệ thống phát hiện, kiểm tra liveness, nhận diện và gửi kết quả về backend → backend ghi nhận điểm danh cho đúng buổi học đang diễn ra → giảng viên xem/xuất báo cáo trên giao diện quản trị.

Các nội dung chính và giới hạn của đề tài:
* Nội dung thực hiện (chia theo mốc công việc):
Tìm hiểu tổng quan về các kỹ thuật phát hiện và nhận diện khuôn mặt (MTCNN/RetinaFace, FaceNet/ArcFace/InsightFace) và các hệ thống điểm danh khuôn mặt hiện có.
Phân tích, xác định yêu cầu bài toán và phạm vi hệ thống (đối tượng dùng: sinh viên và giảng viên một lớp/môn học thử nghiệm).
Thiết kế kiến trúc hệ thống và cơ sở dữ liệu (lớp học, môn học, buổi học, sinh viên, vector khuôn mặt, lịch sử điểm danh).
Hiện thực module phát hiện & nhận diện khuôn mặt, kèm cơ chế chống giả mạo cơ bản.
Hiện thực backend quản lý nghiệp vụ bằng Golang (API quản lý lớp học/buổi học, ghi nhận điểm danh, phân quyền giảng viên).
Hiện thực giao diện quản trị cho giảng viên (xem danh sách điểm danh theo buổi học, xuất báo cáo).
Hiện thực client điểm danh (thu ảnh/video từ camera, gửi lên hệ thống).
Thử nghiệm và đánh giá hệ thống: đo độ chính xác nhận diện (tỷ lệ nhận đúng/nhận nhầm), thời gian xử lý trung bình mỗi lượt điểm danh, và hiệu quả của cơ chế chống giả mạo (thử với ảnh in/ảnh trên màn hình điện thoại).
* Kịch bản demo dự kiến:
Thiết lập một lớp học/buổi học mẫu với danh sách sinh viên (thành viên nhóm và một số bạn tình nguyện đăng ký khuôn mặt). Trong buổi demo, từng người lần lượt điểm danh qua camera; hệ thống hiển thị kết quả nhận diện theo thời gian thực và giảng viên (người dùng thử) xem được danh sách điểm danh, đồng thời thử một lượt giả mạo bằng ảnh in để kiểm chứng cơ chế chống giả mạo.
* Giới hạn của đề tài (phạm vi đồ án 1):
Chỉ triển khai thử nghiệm ở quy mô một lớp học/phòng thực hành với số lượng sinh viên giới hạn (chưa xử lý bài toán ở quy mô toàn trường).
Cơ chế chống giả mạo dừng ở mức cơ bản (liveness detection đơn giản), chưa xử lý các kỹ thuật giả mạo tinh vi (deepfake, mặt nạ 3D).
Chưa tối ưu sâu về hiệu năng khi số lượng khuôn mặt đã đăng ký rất lớn (bài toán tìm kiếm vector trên tập dữ liệu lớn).
