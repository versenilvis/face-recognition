package face

// RosterStudent: Lưu thông tin sinh viên trong lớp kèm vector 512 chiều đã đăng ký
type RosterStudent struct {
	ID        int
	MSSV      string
	HoTen     string
	Embedding []float64
}

// CheckinMatch: Kết quả của 1 khuôn mặt được nhận diện thành công
type CheckinMatch struct {
	SinhVienID int     `json:"sinh_vien_id"`
	MSSV        string  `json:"mssv"`
	HoTen       string  `json:"ho_ten"`
	Similarity  float64 `json:"similarity"`
	Status      string  `json:"status"` // "new"/ "already"
	BBox        []int   `json:"bbox"` // Tọa độ [x1, y1, x2, y2] để frontend vẽ khung chữ nhật đè lên mặt người đó trên video
}

// CheckinResult: Danh sách tất cả người khớp trong 1 khung hình và tổng số mặt phát hiện được
type CheckinResult struct {
	Matches []CheckinMatch `json:"matches"`
	Faces   int            `json:"faces_detected"`
}
