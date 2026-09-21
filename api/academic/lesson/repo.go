package lesson

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

func (r *Repo) ListByLop(ctx context.Context, lopID int) ([]BuoiHoc, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select b.id, b.lop_hoc_id, b.ngay, b.bat_dau, b.ket_thuc, b.trang_thai,
		       count(distinct dd.sinh_vien_id) as present_count,
		       (select count(*) from sinh_vien sv where sv.lop_hoc_id = b.lop_hoc_id) as total_students
		from buoi_hoc b
		left join diem_danh dd on b.id = dd.buoi_hoc_id
		where b.lop_hoc_id = ?
		group by b.id
		order by b.ngay desc, b.id desc
	`, lopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []BuoiHoc{}
	for rows.Next() {
		var b BuoiHoc
		if err := rows.Scan(&b.ID, &b.LopHocID, &b.Ngay, &b.BatDau, &b.KetThuc, &b.TrangThai, &b.PresentCount, &b.TotalStudents); err != nil {
			return nil, err
		}
		ds = append(ds, b)
	}
	return ds, rows.Err()
}

func (r *Repo) ListOpen(ctx context.Context) ([]BuoiHoc, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select b.id, b.lop_hoc_id, l.ten, b.ngay, b.bat_dau, b.ket_thuc, b.trang_thai
		from buoi_hoc b
		join lop_hoc l on b.lop_hoc_id = l.id
		where b.trang_thai = 'open'
		order by b.id desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []BuoiHoc{}
	for rows.Next() {
		var b BuoiHoc
		if err := rows.Scan(&b.ID, &b.LopHocID, &b.TenLop, &b.Ngay, &b.BatDau, &b.KetThuc, &b.TrangThai); err != nil {
			return nil, err
		}
		ds = append(ds, b)
	}
	return ds, rows.Err()
}

func (r *Repo) GetByID(ctx context.Context, id int) (*BuoiHoc, error) {
	var b BuoiHoc
	err := r.db.Read.QueryRowContext(ctx, "select id, lop_hoc_id, ngay, bat_dau, ket_thuc, trang_thai from buoi_hoc where id = ?", id).Scan(&b.ID, &b.LopHocID, &b.Ngay, &b.BatDau, &b.KetThuc, &b.TrangThai)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *Repo) Create(ctx context.Context, lopID int, ngay string, batDau, ketThuc *string) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, `
		insert into buoi_hoc (lop_hoc_id, ngay, bat_dau, ket_thuc, trang_thai)
		values (?, ?, ?, ?, 'closed')
	`, lopID, ngay, batDau, ketThuc)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateStatus(ctx context.Context, id int, status string) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "update buoi_hoc set trang_thai = ? where id = ?", status, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *Repo) Delete(ctx context.Context, id int) (int64, error) {
	var affected int64
	err := r.db.InTransaction(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "delete from diem_danh where buoi_hoc_id = ?", id); err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx, "delete from buoi_hoc where id = ?", id)
		if err != nil {
			return err
		}
		var errRows error
		affected, errRows = res.RowsAffected()
		return errRows
	})
	return affected, err
}


func (r *Repo) CheckLopHocExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from lop_hoc where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}
