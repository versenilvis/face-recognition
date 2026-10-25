package attendance

import (
	"context"
	"database/sql"

	"github.com/versenilvis/face-recognition/db"
)

type Repo struct {
	db *db.DB
}

func NewRepo(d *db.DB) *Repo {
	return &Repo{db: d}
}

func (r *Repo) ListByBuoi(ctx context.Context, buoiID int) ([]AttendanceRecord, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select sv.id, sv.mssv, sv.ho_ten,
		       case when dd.sinh_vien_id is not null then 'present' else 'absent' end,
		       case when dd.thoi_gian is not null then datetime(dd.thoi_gian, '+7 hours') else null end as thoi_gian,
		       dd.similarity, dd.phuong_thuc
		from buoi_hoc bh
		join sinh_vien sv on bh.lop_hoc_id = sv.lop_hoc_id
		left join diem_danh dd on bh.id = dd.buoi_hoc_id and sv.id = dd.sinh_vien_id
		where bh.id = ?
		order by sv.mssv asc
	`, buoiID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []AttendanceRecord{}
	for rows.Next() {
		var rec AttendanceRecord
		if err := rows.Scan(&rec.SinhVienID, &rec.MSSV, &rec.HoTen, &rec.TrangThai, &rec.ThoiGian, &rec.Similarity, &rec.PhuongThuc); err != nil {
			return nil, err
		}
		ds = append(ds, rec)
	}
	return ds, rows.Err()
}

func (r *Repo) Record(ctx context.Context, buoiID, svID int, sim *float64, phuongThuc string) (int64, error) {
	var res sql.Result
	var err error
	if sim != nil {
		res, err = r.db.Write.ExecContext(ctx, `
			insert into diem_danh (buoi_hoc_id, sinh_vien_id, similarity, phuong_thuc)
			values (?, ?, ?, ?)
			on conflict (buoi_hoc_id, sinh_vien_id) do nothing
		`, buoiID, svID, *sim, phuongThuc)
	} else {
		res, err = r.db.Write.ExecContext(ctx, `
			insert into diem_danh (buoi_hoc_id, sinh_vien_id, phuong_thuc)
			values (?, ?, ?)
			on conflict (buoi_hoc_id, sinh_vien_id) do update set phuong_thuc = excluded.phuong_thuc
		`, buoiID, svID, phuongThuc)
	}
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *Repo) Cancel(ctx context.Context, buoiID, svID int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "delete from diem_danh where buoi_hoc_id = ? and sinh_vien_id = ?", buoiID, svID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

type ClassAttendanceExport struct {
	ClassName   string
	SubjectCode string
	SubjectName string
	Lessons     []LessonExportItem
	Students    []StudentExportItem
	Attendance  map[int]map[int]bool
}

type LessonExportItem struct {
	ID   int
	Ngay string
}

type StudentExportItem struct {
	ID    int
	MSSV  string
	HoTen string
}

func (r *Repo) GetClassAttendanceExport(ctx context.Context, classID int) (*ClassAttendanceExport, error) {
	export := &ClassAttendanceExport{
		Lessons:    []LessonExportItem{},
		Students:   []StudentExportItem{},
		Attendance: make(map[int]map[int]bool),
	}

	// lay thong tin lop
	err := r.db.Read.QueryRowContext(ctx, `
		select lh.ten, coalesce(mh.ma_mon, ''), coalesce(mh.ten, '')
		from lop_hoc lh
		left join mon_hoc mh on lh.mon_hoc_id = mh.id
		where lh.id = ?
	`, classID).Scan(&export.ClassName, &export.SubjectCode, &export.SubjectName)
	if err != nil {
		return nil, err
	}

	// lay danh sach buoi hoc cua lop
	lRows, err := r.db.Read.QueryContext(ctx, `
		select id, ngay
		from buoi_hoc
		where lop_hoc_id = ?
		order by ngay asc, bat_dau asc, id asc
	`, classID)
	if err != nil {
		return nil, err
	}
	defer lRows.Close()

	for lRows.Next() {
		var l LessonExportItem
		if err := lRows.Scan(&l.ID, &l.Ngay); err != nil {
			return nil, err
		}
		export.Lessons = append(export.Lessons, l)
	}
	if err := lRows.Err(); err != nil {
		return nil, err
	}

	// lay danh sach sinh vien thuoc lop
	sRows, err := r.db.Read.QueryContext(ctx, `
		select id, mssv, ho_ten
		from sinh_vien
		where lop_hoc_id = ?
		order by mssv asc
	`, classID)
	if err != nil {
		return nil, err
	}
	defer sRows.Close()

	for sRows.Next() {
		var s StudentExportItem
		if err := sRows.Scan(&s.ID, &s.MSSV, &s.HoTen); err != nil {
			return nil, err
		}
		export.Students = append(export.Students, s)
	}
	if err := sRows.Err(); err != nil {
		return nil, err
	}

	// lay tat ca ban ghi diem danh cua cac buoi hoc thuoc lop
	aRows, err := r.db.Read.QueryContext(ctx, `
		select dd.sinh_vien_id, dd.buoi_hoc_id
		from diem_danh dd
		join buoi_hoc bh on dd.buoi_hoc_id = bh.id
		where bh.lop_hoc_id = ?
	`, classID)
	if err != nil {
		return nil, err
	}
	defer aRows.Close()

	for aRows.Next() {
		var svID, bID int
		if err := aRows.Scan(&svID, &bID); err != nil {
			return nil, err
		}
		if export.Attendance[svID] == nil {
			export.Attendance[svID] = make(map[int]bool)
		}
		export.Attendance[svID][bID] = true
	}

	return export, aRows.Err()
}

