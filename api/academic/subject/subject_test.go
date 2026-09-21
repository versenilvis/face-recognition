package subject_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/db"
)

func setupApp(t *testing.T) *fiber.App {
	ctx := context.Background()

	dbPath := filepath.Join(t.TempDir(), "test.db")
	database, err := db.New(ctx, dbPath)
	if err != nil {
		t.Fatalf("cannot init db: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	if err := database.Migrate(ctx); err != nil {
		t.Fatalf("cannot migrate db: %v", err)
	}

	app := fiber.New()
	r := subject.NewRepo(database)
	h := subject.NewHandler(r)
	app.Get("/mon-hoc", h.List)
	app.Post("/mon-hoc", h.Create)
	app.Delete("/mon-hoc/:id", h.Delete)
	return app
}

func TestSubjectCRUD(t *testing.T) {
	app := setupApp(t)

	// list empty
	req := httptest.NewRequest("GET", "/mon-hoc", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", resp.StatusCode)
	}

	// create
	body := strings.NewReader(`{"ma_mon": "CS101", "ten": "Nhap mon LT"}`)
	req = httptest.NewRequest("POST", "/mon-hoc", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got: %d", resp.StatusCode)
	}

	// delete
	req = httptest.NewRequest("DELETE", "/mon-hoc/1", nil)
	resp, err = app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", resp.StatusCode)
	}
}
