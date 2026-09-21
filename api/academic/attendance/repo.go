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
		       dd.thoi_gian, dd.similarity, dd.phuong_thuc
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
