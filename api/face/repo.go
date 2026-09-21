package face

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/versenilvis/face-recognition/db"
)

type Repo struct {
	db *db.DB
}

func NewRepo(d *db.DB) *Repo {
	return &Repo{db: d}
}

func (r *Repo) CheckSinhVienExists(ctx context.Context, id int) (bool, error) {
	var dummy int
	err := r.db.Read.QueryRowContext(ctx, "select 1 from sinh_vien where id = ?", id).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *Repo) GetBuoiHoc(ctx context.Context, id int) (int, string, error) {
	var lopHocID int
	var trangThai string
	err := r.db.Read.QueryRowContext(ctx, "select lop_hoc_id, trang_thai from buoi_hoc where id = ?", id).Scan(&lopHocID, &trangThai)
	if err != nil {
		return 0, "", err
	}
	return lopHocID, trangThai, nil
}

func (r *Repo) GetRosterWithEmbeddings(ctx context.Context, lopID int) ([]RosterStudent, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select sv.id, sv.mssv, sv.ho_ten, fe.embedding
		from sinh_vien sv
		join face_embedding fe on sv.id = fe.sinh_vien_id
		where sv.lop_hoc_id = ?
	`, lopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roster []RosterStudent
	for rows.Next() {
		var s RosterStudent
		var embedStr string
		if err := rows.Scan(&s.ID, &s.MSSV, &s.HoTen, &embedStr); err != nil {
			continue
		}
		if err := json.Unmarshal([]byte(embedStr), &s.Embedding); err == nil {
			roster = append(roster, s)
		}
	}
	return roster, rows.Err()
}

func (r *Repo) SaveFaceEmbedding(ctx context.Context, svID int, embeddingJSON string) error {
	_, err := r.db.Write.ExecContext(ctx, `
		insert into face_embedding (sinh_vien_id, embedding, registered_at)
		values (?, ?, CURRENT_TIMESTAMP)
		on conflict (sinh_vien_id) do update set embedding = excluded.embedding, registered_at = CURRENT_TIMESTAMP
	`, svID, embeddingJSON)
	return err
}

func (r *Repo) DeleteFaceEmbedding(ctx context.Context, svID int) (int64, error) {
	res, err := r.db.Write.ExecContext(ctx, "delete from face_embedding where sinh_vien_id = ?", svID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// RecordAttendance ghi nhận có mặt vào bảng diem_danh với phương thức face và lưu độ tương đồng
func (r *Repo) RecordAttendance(ctx context.Context, buoiID, svID int, sim *float64, phuongThuc string) (int64, error) {
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
