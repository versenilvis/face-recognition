package lesson

type BuoiHoc struct {
	ID        int     `json:"id"`
	LopHocID  int     `json:"lop_hoc_id"`
	TenLop    string  `json:"ten_lop,omitempty"`
	Ngay      string  `json:"ngay"`
	BatDau    *string `json:"bat_dau,omitempty"`
	KetThuc   *string `json:"ket_thuc,omitempty"`
	TrangThai string  `json:"trang_thai"`
}
