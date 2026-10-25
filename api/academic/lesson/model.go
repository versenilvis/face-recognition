package lesson

type BuoiHoc struct {
	ID            int     `json:"id"`
	LopHocID      int     `json:"lop_hoc_id"`
	TenLop        string  `json:"ten_lop,omitempty"`
	TenMon        string  `json:"ten_mon,omitempty"`
	MaMon         string  `json:"ma_mon,omitempty"`
	Ngay          string  `json:"ngay"`
	BatDau        *string `json:"bat_dau,omitempty"`
	KetThuc       *string `json:"ket_thuc,omitempty"`
	TrangThai     string  `json:"trang_thai"`
	PresentCount  int     `json:"present_count"`
	TotalStudents int     `json:"total_students"`
}
