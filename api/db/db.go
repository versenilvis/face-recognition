// https://theitsolutions.io/blog/modernc.org-sqlite-with-go

package db

import (
	"context"
	"database/sql"
	_ "embed"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/001_init.sql
var migrationSQL string

type DB struct {
	Read  *sql.DB
	Write *sql.DB
}

const pragmas = `
PRAGMA journal_mode = WAL; -- Cho phép người đọc (readers) không chặn người ghi (writers) và người ghi không chặn người đọc
PRAGMA synchronous = NORMAL; -- Cho phép người đọc (readers) không chặn người ghi (writers) và người ghi không chặn người đọc
PRAGMA foreign_keys = ON; -- Mặc định SQLite tắt ràng buộc khóa ngoại; lệnh này bật tính năng kiểm tra khóa ngoại (foreign keys).
PRAGMA busy_timeout = 5000; -- Nếu database đang bị khóa (bận), nó sẽ đợi tối đa 5000ms (5 giây) trước khi ném ra lỗi database is locked.
`

func New(ctx context.Context, path string) (*DB, error) {
	write, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		return nil, err
	}
	write.SetMaxOpenConns(1)
	write.SetConnMaxIdleTime(time.Minute)

	if _, err = write.ExecContext(ctx, pragmas); err != nil {
		return nil, err
	}

	read, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		return nil, err
	}
	read.SetMaxOpenConns(10)
	read.SetConnMaxIdleTime(time.Minute)

	return &DB{Read: read, Write: write}, nil
}

func (db *DB) Migrate(ctx context.Context) error {
	_, err := db.Write.ExecContext(ctx, migrationSQL)
	return err
}

func (db *DB) Close() {
	db.Read.Close()
	db.Write.Close()
}

func (db *DB) InTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := db.Write.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}
