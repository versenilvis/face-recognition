package attendance_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/attendance"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/lesson"
	"github.com/versenilvis/face-recognition/academic/student"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
)

func setupAttendanceTest(t *testing.T) (*fiber.App, *http.Cookie) {
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
	stuRepo := student.NewRepo(database)
	stuHandler := student.NewHandler(stuRepo)
	lesRepo := lesson.NewRepo(database)
	lesHandler := lesson.NewHandler(lesRepo)
	attRepo := attendance.NewRepo(database)
	attHandler := attendance.NewHandler(attRepo)

	protected := app.Group("/protected", auth.RequireAuth)
	protected.Post("/mon-hoc", subHandler.Create)
	protected.Post("/lop-hoc", clsHandler.Create)
	protected.Post("/lop-hoc/:id/sinh-vien", stuHandler.Create)
	protected.Post("/lop-hoc/:id/buoi-hoc", lesHandler.Create)

	protected.Get("/buoi-hoc/:id/diem-danh", attHandler.ListByLesson)
	protected.Post("/buoi-hoc/:id/diem-danh/:sv_id", attHandler.ManualCheckin)
	protected.Delete("/buoi-hoc/:id/diem-danh/:sv_id", attHandler.ManualCancel)
	protected.Get("/buoi-hoc/:id/export", attHandler.ExportCSV)

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

func TestAttendanceFlow(t *testing.T) {
	app, cookie := setupAttendanceTest(t)

	// chuan bi du lieu lop va sinh vien
	createMhReq := httptest.NewRequest("POST", "/protected/mon-hoc", strings.NewReader(`{"ma_mon": "MATH101", "ten": "Toan cao cap"}`))
	createMhReq.Header.Set("Content-Type", "application/json")
	createMhReq.AddCookie(cookie)
	_, _ = app.Test(createMhReq)

	createClassReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "L01-MATH", "mon_hoc_id": 1}`))
	createClassReq.Header.Set("Content-Type", "application/json")
	createClassReq.AddCookie(cookie)
	_, _ = app.Test(createClassReq)

	createSvReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/sinh-vien", strings.NewReader(`{"mssv": "SV001", "ho_ten": "Hoang Van D"}`))
	createSvReq.Header.Set("Content-Type", "application/json")
	createSvReq.AddCookie(cookie)
	_, _ = app.Test(createSvReq)

	createLessonReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/buoi-hoc", strings.NewReader(`{"ngay": "2026-09-19"}`))
	createLessonReq.Header.Set("Content-Type", "application/json")
	createLessonReq.AddCookie(cookie)
	_, _ = app.Test(createLessonReq)

	// 1. lay danh sach diem danh ban dau -> phai la absent
	listReq := httptest.NewRequest("GET", "/protected/buoi-hoc/1/diem-danh", nil)
	listReq.AddCookie(cookie)
	respList, err := app.Test(listReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respList.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respList.StatusCode)
	}

	// 2. diem danh thu cong cho sinh vien id = 1
	checkinReq := httptest.NewRequest("POST", "/protected/buoi-hoc/1/diem-danh/1", nil)
	checkinReq.AddCookie(cookie)
	respCheckin, err := app.Test(checkinReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respCheckin.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respCheckin.StatusCode)
	}

	// 3. export file csv
	exportReq := httptest.NewRequest("GET", "/protected/buoi-hoc/1/export", nil)
	exportReq.AddCookie(cookie)
	respExport, err := app.Test(exportReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respExport.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respExport.StatusCode)
	}
	if !strings.Contains(respExport.Header.Get("Content-Type"), "text/csv") {
		t.Errorf("expected text/csv, got: %s", respExport.Header.Get("Content-Type"))
	}

	// 4. huy diem danh thu cong
	cancelReq := httptest.NewRequest("DELETE", "/protected/buoi-hoc/1/diem-danh/1", nil)
	cancelReq.AddCookie(cookie)
	respCancel, err := app.Test(cancelReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respCancel.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respCancel.StatusCode)
	}
}
