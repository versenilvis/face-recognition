package student

type SinhVien struct {
	ID           int    `json:"id"`
	MSSV         string `json:"mssv"`
	HoTen        string `json:"ho_ten"`
	LopHocID     int    `json:"lop_hoc_id"`
	HasFace      bool   `json:"has_face"`
	RegisteredAt string `json:"registered_at,omitempty"`
}

type StudentLookup struct {
	Exists     bool     `json:"exists"`
	MSSV       string   `json:"mssv"`
	HoTen      string   `json:"ho_ten"`
	HasFace    bool     `json:"has_face"`
	ClassNames []string `json:"class_names"`
	ClassIDs   []int    `json:"class_ids"`
}

type GlobalStudent struct {
	MSSV       string   `json:"mssv"`
	HoTen      string   `json:"ho_ten"`
	HasFace    bool     `json:"has_face"`
	ClassNames []string `json:"class_names"`
	ClassIDs   []int    `json:"class_ids"`
}

