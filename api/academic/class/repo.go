package class

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

func (r *Repo) List(ctx context.Context) ([]LopHoc, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select l.id, l.ten, l.mon_hoc_id, m.ten, m.ma_mon, l.giang_vien_id,
		       (select count(*) from sinh_vien sv where sv.lop_hoc_id = l.id) as total_students,
		       (select count(*) from sinh_vien sv join face_embedding fe on sv.id = fe.sinh_vien_id where sv.lop_hoc_id = l.id) as students_with_face,
		       (select count(*) from buoi_hoc bh where bh.lop_hoc_id = l.id) as total_lessons
		from lop_hoc l
		join mon_hoc m on l.mon_hoc_id = m.id
		order by l.id desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []LopHoc{}
	for rows.Next() {
		var lh LopHoc
		if err := rows.Scan(&lh.ID, &lh.Ten, &lh.MonHocID, &lh.TenMon, &lh.MaMon, &lh.GiangVienID, &lh.TotalStudents, &lh.StudentsWithFace, &lh.TotalLessons); err != nil {
			return nil, err
		}
		ds = append(ds, lh)
	}
	return ds, rows.Err()
}

func (r *Repo) GetByID(ctx context.Context, id int) (*LopHoc, error) {
	var lh LopHoc
	err := r.db.Read.QueryRowContext(ctx, `
		select l.id, l.ten, l.mon_hoc_id, m.ten, m.ma_mon, l.giang_vien_id,
		       (select count(*) from sinh_vien sv where sv.lop_hoc_id = l.id) as total_students,
		       (select count(*) from sinh_vien sv join face_embedding fe on sv.id = fe.sinh_vien_id where sv.lop_hoc_id = l.id) as students_with_face,
		       (select count(*) from buoi_hoc bh where bh.lop_hoc_id = l.id) as total_lessons
		from lop_hoc l
		join mon_hoc m on l.mon_hoc_id = m.id
		where l.id = ?
	`, id).Scan(&lh.ID, &lh.Ten, &lh.MonHocID, &lh.TenMon, &lh.MaMon, &lh.GiangVienID, &lh.TotalStudents, &lh.StudentsWithFace, &lh.TotalLessons)
	if err != nil {
		return nil, err
	}
	return &lh, nil
}

func (r *Repo) Create(ctx context.Context, ten string, monHocID int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "insert into lop_hoc (ten, mon_hoc_id, giang_vien_id) values (?, ?, 1)", ten, monHocID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) Delete(ctx context.Context, id int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "delete from lop_hoc where id = ?", id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *Repo) CheckExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from lop_hoc where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *Repo) CheckMonHocExists(ctx context.Context, monHocID int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from mon_hoc where id = ?", monHocID).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}
