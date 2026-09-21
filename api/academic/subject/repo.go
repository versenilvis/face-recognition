package subject

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

func (r *Repo) List(ctx context.Context) ([]MonHoc, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select m.id, m.ma_mon, m.ten,
		       (select count(*) from lop_hoc l where l.mon_hoc_id = m.id) as total_classes
		from mon_hoc m
		order by m.id desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ds := []MonHoc{}
	for rows.Next() {
		var mh MonHoc
		if err := rows.Scan(&mh.ID, &mh.MaMon, &mh.Ten, &mh.TotalClasses); err != nil {
			return nil, err
		}
		ds = append(ds, mh)
	}
	return ds, rows.Err()
}

func (r *Repo) Create(ctx context.Context, maMon, ten string) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "insert into mon_hoc (ma_mon, ten) values (?, ?)", maMon, ten)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) Delete(ctx context.Context, id int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "delete from mon_hoc where id = ?", id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *Repo) CheckExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from mon_hoc where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}
