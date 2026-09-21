package student

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

func (r *Repo) ListByLop(ctx context.Context, lopID int) ([]SinhVien, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select sv.id, sv.mssv, sv.ho_ten, sv.lop_hoc_id,
		       case when fe.sinh_vien_id is not null then 1 else 0 end,
		       coalesce(fe.registered_at, '')
		from sinh_vien sv
		left join face_embedding fe on sv.id = fe.sinh_vien_id
		where sv.lop_hoc_id = ?
		order by sv.mssv asc
	`, lopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []SinhVien{}
	for rows.Next() {
		var sv SinhVien
		var hasFaceInt int
		if err := rows.Scan(&sv.ID, &sv.MSSV, &sv.HoTen, &sv.LopHocID, &hasFaceInt, &sv.RegisteredAt); err != nil {
			return nil, err
		}
		sv.HasFace = hasFaceInt == 1
		ds = append(ds, sv)
	}
	return ds, rows.Err()
}

func (r *Repo) CheckLopHocExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from lop_hoc where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *Repo) CheckExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from sinh_vien where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *Repo) Create(ctx context.Context, mssv, hoTen string, lopID int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "insert into sinh_vien (mssv, ho_ten, lop_hoc_id) values (?, ?, ?)", mssv, hoTen, lopID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) Delete(ctx context.Context, id int) (int64, error) {
	var affected int64
	err := r.db.InTransaction(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "delete from diem_danh where sinh_vien_id = ?", id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "delete from face_embedding where sinh_vien_id = ?", id); err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx, "delete from sinh_vien where id = ?", id)
		if err != nil {
			return err
		}
		var errRows error
		affected, errRows = res.RowsAffected()
		return errRows
	})
	return affected, err
}

