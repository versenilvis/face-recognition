package lesson_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/lesson"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
)

func setupLessonTest(t *testing.T) (*fiber.App, *http.Cookie) {
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
	subRepo := subject.NewRepo(database)
	subHandler := subject.NewHandler(subRepo)
	clsRepo := class.NewRepo(database)
	clsHandler := class.NewHandler(clsRepo)
	lesRepo := lesson.NewRepo(database)
	lesHandler := lesson.NewHandler(lesRepo)

	app.Get("/buoi-hoc/open", lesHandler.ListOpen)

	protected := app.Group("/protected", auth.RequireAuth)
	protected.Post("/mon-hoc", subHandler.Create)
	protected.Post("/lop-hoc", clsHandler.Create)

	protected.Get("/lop-hoc/:id/buoi-hoc", lesHandler.ListByClass)
	protected.Post("/lop-hoc/:id/buoi-hoc", lesHandler.Create)
	protected.Patch("/buoi-hoc/:id/status", lesHandler.UpdateStatus)
	protected.Delete("/buoi-hoc/:id", lesHandler.Delete)

	token, err := auth.GenerateToken()
	if err != nil {
		t.Fatalf("cannot generate token: %v", err)
	}
	auth.SaveSession(token)

	cookie := &http.Cookie{
		Name:  "session_id",
		Value: token,
	}

	return app, cookie
}

func TestLessonCRUD(t *testing.T) {
	app, cookie := setupLessonTest(t)

	// chuan bi mon hoc va lop hoc
	createMhReq := httptest.NewRequest("POST", "/protected/mon-hoc", strings.NewReader(`{"ma_mon": "PHY101", "ten": "Vat ly"}`))
	createMhReq.Header.Set("Content-Type", "application/json")
	createMhReq.AddCookie(cookie)
	_, _ = app.Test(createMhReq)

	createClassReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "L01-PHY", "mon_hoc_id": 1}`))
	createClassReq.Header.Set("Content-Type", "application/json")
	createClassReq.AddCookie(cookie)
	_, _ = app.Test(createClassReq)

	// 1. tao buoi hoc moi
	createLessonReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/buoi-hoc", strings.NewReader(`{"ngay": "2026-09-19"}`))
	createLessonReq.Header.Set("Content-Type", "application/json")
	createLessonReq.AddCookie(cookie)

	resp1, err := app.Test(createLessonReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp1.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got: %d", resp1.StatusCode)
	}

	// 2. lay danh sach buoi hoc theo lop
	listReq := httptest.NewRequest("GET", "/protected/lop-hoc/1/buoi-hoc", nil)
	listReq.AddCookie(cookie)

	respList, err := app.Test(listReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respList.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respList.StatusCode)
	}

	// 3. cap nhat trang thai sang open de diem danh
	openReq := httptest.NewRequest("PATCH", "/protected/buoi-hoc/1/status", strings.NewReader(`{"trang_thai": "open"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openReq.AddCookie(cookie)

	respOpen, err := app.Test(openReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respOpen.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respOpen.StatusCode)
	}

	// 4. goi api public lay cac buoi dang open
	openPublicReq := httptest.NewRequest("GET", "/buoi-hoc/open", nil)
	respOpenPublic, err := app.Test(openPublicReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respOpenPublic.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respOpenPublic.StatusCode)
	}

	// 5. cap nhat trang thai sai -> phai tra ve 400
	badStatusReq := httptest.NewRequest("PATCH", "/protected/buoi-hoc/1/status", strings.NewReader(`{"trang_thai": "invalid"}`))
	badStatusReq.Header.Set("Content-Type", "application/json")
	badStatusReq.AddCookie(cookie)

	respBadStatus, err := app.Test(badStatusReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respBadStatus.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got: %d", respBadStatus.StatusCode)
	}

	// 6. xoa buoi hoc id = 1
	delReq := httptest.NewRequest("DELETE", "/protected/buoi-hoc/1", nil)
	delReq.AddCookie(cookie)

	respDel, err := app.Test(delReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respDel.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respDel.StatusCode)
	}

	// 7. xoa lai buoi hoc da xoa -> phai tra ve 404
	delAgainReq := httptest.NewRequest("DELETE", "/protected/buoi-hoc/1", nil)
	delAgainReq.AddCookie(cookie)

	respDelAgain, err := app.Test(delAgainReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respDelAgain.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got: %d", respDelAgain.StatusCode)
	}
}
