package attendance

type AttendanceRecord struct {
	SinhVienID int      `json:"sinh_vien_id"`
	MSSV        string   `json:"mssv"`
	HoTen       string   `json:"ho_ten"`
	TrangThai   string   `json:"trang_thai"`
	ThoiGian    *string  `json:"thoi_gian,omitempty"`
	Similarity  *float64 `json:"similarity,omitempty"`
	PhuongThuc  *string  `json:"phuong_thuc,omitempty"`
}
