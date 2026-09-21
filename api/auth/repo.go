package auth

import (
	"context"

	"github.com/versenilvis/face-recognition/db"
)

type GiangVien struct {
	ID            int    `json:"id"`
	LoginCodeHash string `json:"-"`
	HoTen         string `json:"ho_ten"`
}

type Repo struct {
	db *db.DB
}

func NewRepo(d *db.DB) *Repo {
	return &Repo{db: d}
}

func (r *Repo) GetGiangVienByHash(ctx context.Context, hash string) (*GiangVien, error) {
	var gv GiangVien
	err := r.db.Read.QueryRowContext(ctx, "select id, ho_ten from giang_vien where login_code_hash = ?", hash).Scan(&gv.ID, &gv.HoTen)
	if err != nil {
		return nil, err
	}
	return &gv, nil
}
