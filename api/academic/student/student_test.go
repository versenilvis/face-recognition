package student_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/student"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
)

func setupStudentTest(t *testing.T) (*fiber.App, *http.Cookie) {
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

	protected := app.Group("/protected", auth.RequireAuth)
	protected.Post("/mon-hoc", subHandler.Create)
	protected.Post("/lop-hoc", clsHandler.Create)

	protected.Get("/lop-hoc/:id/sinh-vien", stuHandler.ListByClass)
	protected.Post("/lop-hoc/:id/sinh-vien", stuHandler.Create)
	protected.Delete("/sinh-vien/:id", stuHandler.Delete)

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

func TestStudentCRUD(t *testing.T) {
	app, cookie := setupStudentTest(t)

	// chuan bi mon hoc va lop hoc truoc
	createMhReq := httptest.NewRequest("POST", "/protected/mon-hoc", strings.NewReader(`{"ma_mon": "CS101", "ten": "Khoa hoc may tinh"}`))
	createMhReq.Header.Set("Content-Type", "application/json")
	createMhReq.AddCookie(cookie)
	_, _ = app.Test(createMhReq)

	createClassReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "K15-CNTT", "mon_hoc_id": 1}`))
	createClassReq.Header.Set("Content-Type", "application/json")
	createClassReq.AddCookie(cookie)
	_, _ = app.Test(createClassReq)

	// 1. them sinh vien hop le
	addSvReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/sinh-vien", strings.NewReader(`{"mssv": "2021001", "ho_ten": "Nguyen Van A"}`))
	addSvReq.Header.Set("Content-Type", "application/json")
	addSvReq.AddCookie(cookie)

	resp1, err := app.Test(addSvReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp1.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got: %d", resp1.StatusCode)
	}

	// 2. them sinh vien bi trung mssv -> phai tra ve 409
	dupSvReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/sinh-vien", strings.NewReader(`{"mssv": "2021001", "ho_ten": "Tran Van B"}`))
	dupSvReq.Header.Set("Content-Type", "application/json")
	dupSvReq.AddCookie(cookie)

	respDup, err := app.Test(dupSvReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respDup.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got: %d", respDup.StatusCode)
	}

	// 3. them vao lop hoc khong ton tai -> phai tra ve 400
	badClassReq := httptest.NewRequest("POST", "/protected/lop-hoc/999/sinh-vien", strings.NewReader(`{"mssv": "2021002", "ho_ten": "Le Van C"}`))
	badClassReq.Header.Set("Content-Type", "application/json")
	badClassReq.AddCookie(cookie)

	respBadClass, err := app.Test(badClassReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respBadClass.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got: %d", respBadClass.StatusCode)
	}

	// 4. lay danh sach sinh vien theo lop
	listReq := httptest.NewRequest("GET", "/protected/lop-hoc/1/sinh-vien", nil)
	listReq.AddCookie(cookie)

	respList, err := app.Test(listReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respList.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respList.StatusCode)
	}

	// 5. xoa sinh vien id = 1
	delReq := httptest.NewRequest("DELETE", "/protected/sinh-vien/1", nil)
	delReq.AddCookie(cookie)

	respDel, err := app.Test(delReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respDel.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respDel.StatusCode)
	}

	// 6. xoa lai sinh vien id = 1 -> phai tra ve 404
	delAgainReq := httptest.NewRequest("DELETE", "/protected/sinh-vien/1", nil)
	delAgainReq.AddCookie(cookie)

	respDelAgain, err := app.Test(delAgainReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respDelAgain.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got: %d", respDelAgain.StatusCode)
	}
}
