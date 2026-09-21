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

func (r *Repo) Create(ctx context.Context, mssv, hoTen string, lopID int) (int64, bool, error) {
	var newID int64
	var autoLinked bool

	err := r.db.InTransaction(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, "insert into sinh_vien (mssv, ho_ten, lop_hoc_id) values (?, ?, ?)", mssv, hoTen, lopID)
		if err != nil {
			return err
		}
		newID, err = res.LastInsertId()
		if err != nil {
			return err
		}

		// inherit face embedding if student registered face in another class
		var existingEmbedding string
		err = tx.QueryRowContext(ctx, `
			select fe.embedding
			from face_embedding fe
			join sinh_vien sv on fe.sinh_vien_id = sv.id
			where sv.mssv = ?
			limit 1
		`, mssv).Scan(&existingEmbedding)

		if err == nil && existingEmbedding != "" {
			_, err = tx.ExecContext(ctx, `
				insert into face_embedding (sinh_vien_id, embedding, registered_at)
				values (?, ?, CURRENT_TIMESTAMP)
			`, newID, existingEmbedding)
			if err != nil {
				return err
			}
			autoLinked = true
		} else if err != nil && err != sql.ErrNoRows {
			return err
		}

		return nil
	})

	if err != nil {
		return 0, false, err
	}
	return newID, autoLinked, nil
}

func (r *Repo) LookupByMSSV(ctx context.Context, mssv string) (*StudentLookup, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select sv.ho_ten, sv.lop_hoc_id, coalesce(l.ten, ''),
		       case when fe.sinh_vien_id is not null then 1 else 0 end
		from sinh_vien sv
		left join lop_hoc l on sv.lop_hoc_id = l.id
		left join face_embedding fe on sv.id = fe.sinh_vien_id
		where sv.mssv = ?
	`, mssv)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	lookup := &StudentLookup{
		Exists:     false,
		MSSV:       mssv,
		ClassNames: []string{},
		ClassIDs:   []int{},
	}

	for rows.Next() {
		var hoTen, className string
		var classID, hasFaceInt int
		if err := rows.Scan(&hoTen, &classID, &className, &hasFaceInt); err != nil {
			return nil, err
		}
		lookup.Exists = true
		lookup.HoTen = hoTen
		if hasFaceInt == 1 {
			lookup.HasFace = true
		}
		if className != "" {
			lookup.ClassNames = append(lookup.ClassNames, className)
		}
		lookup.ClassIDs = append(lookup.ClassIDs, classID)
	}

	return lookup, rows.Err()
}

func (r *Repo) ListAllUniqueStudents(ctx context.Context) ([]GlobalStudent, error) {
	rows, err := r.db.Read.QueryContext(ctx, `
		select sv.mssv, sv.ho_ten, sv.lop_hoc_id, coalesce(l.ten, ''),
		       case when fe.sinh_vien_id is not null then 1 else 0 end
		from sinh_vien sv
		left join lop_hoc l on sv.lop_hoc_id = l.id
		left join face_embedding fe on sv.id = fe.sinh_vien_id
		order by sv.mssv asc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	studentMap := make(map[string]*GlobalStudent)
	order := []string{}

	for rows.Next() {
		var mssv, hoTen, className string
		var classID, hasFaceInt int
		if err := rows.Scan(&mssv, &hoTen, &classID, &className, &hasFaceInt); err != nil {
			return nil, err
		}

		item, ok := studentMap[mssv]
		if !ok {
			item = &GlobalStudent{
				MSSV:       mssv,
				HoTen:      hoTen,
				HasFace:    false,
				ClassNames: []string{},
				ClassIDs:   []int{},
			}
			studentMap[mssv] = item
			order = append(order, mssv)
		}
		if hasFaceInt == 1 {
			item.HasFace = true
		}
		if className != "" {
			item.ClassNames = append(item.ClassNames, className)
		}
		item.ClassIDs = append(item.ClassIDs, classID)
	}

	result := make([]GlobalStudent, 0, len(order))
	for _, mssv := range order {
		result = append(result, *studentMap[mssv])
	}
	return result, rows.Err()
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

