package student

type SinhVien struct {
	ID           int    `json:"id"`
	MSSV         string `json:"mssv"`
	HoTen        string `json:"ho_ten"`
	LopHocID     int    `json:"lop_hoc_id"`
	HasFace      bool   `json:"has_face"`
	RegisteredAt string `json:"registered_at,omitempty"`
}
