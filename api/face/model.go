package face

type RosterStudent struct {
	ID        int
	MSSV      string
	HoTen     string
	Embedding []float64
}

type CheckinMatch struct {
	SinhVienID int     `json:"sinh_vien_id"`
	MSSV        string  `json:"mssv"`
	HoTen       string  `json:"ho_ten"`
	Similarity  float64 `json:"similarity"`
	Status      string  `json:"status"`
	BBox        []int   `json:"bbox"`
}

type CheckinResult struct {
	Matches []CheckinMatch `json:"matches"`
	Faces   int            `json:"faces_detected"`
}
