package class

type LopHoc struct {
	ID          int    `json:"id"`
	Ten         string `json:"ten"`
	MonHocID    int    `json:"mon_hoc_id"`
	TenMon      string `json:"ten_mon,omitempty"`
	MaMon       string `json:"ma_mon,omitempty"`
	GiangVienID      int    `json:"giang_vien_id"`
	TotalStudents    int    `json:"total_students"`
	StudentsWithFace int    `json:"students_with_face"`
	TotalLessons     int    `json:"total_lessons"`
}
