package class_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
)

func setupLopHocTest(t *testing.T) (*fiber.App, *http.Cookie) {
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

	protected := app.Group("/protected", auth.RequireAuth)
	protected.Get("/mon-hoc", subHandler.List)
	protected.Post("/mon-hoc", subHandler.Create)
	protected.Delete("/mon-hoc/:id", subHandler.Delete)

	protected.Get("/lop-hoc", clsHandler.List)
	protected.Get("/lop-hoc/:id", clsHandler.GetByID)
	protected.Post("/lop-hoc", clsHandler.Create)
	protected.Delete("/lop-hoc/:id", clsHandler.Delete)

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

func TestLopHocCRUD(t *testing.T) {
	app, cookie := setupLopHocTest(t)

	// tao mon hoc truoc de lay mon_hoc_id
	createMhReq := httptest.NewRequest("POST", "/protected/mon-hoc", strings.NewReader(`{"ma_mon": "INT101", "ten": "Lap trinh C"}`))
	createMhReq.Header.Set("Content-Type", "application/json")
	createMhReq.AddCookie(cookie)

	mhResp, err := app.Test(createMhReq)
	if err != nil {
		t.Fatalf("failed to create mon hoc: %v", err)
	}
	if mhResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 for mon hoc, got: %d", mhResp.StatusCode)
	}

	// 1. tao lop hoc voi mon_hoc_id = 1
	createReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "L01", "mon_hoc_id": 1}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.AddCookie(cookie)

	resp1, err := app.Test(createReq)
	if err != nil {
		t.Fatalf("failed to create lop hoc: %v", err)
	}
	if resp1.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got: %d", resp1.StatusCode)
	}

	// 2. tao lop hoc voi mon_hoc_id khong ton tai -> phai tra ve 400
	badReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "L02", "mon_hoc_id": 999}`))
	badReq.Header.Set("Content-Type", "application/json")
	badReq.AddCookie(cookie)

	respBad, err := app.Test(badReq)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if respBad.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got: %d", respBad.StatusCode)
	}

	// 3. lay danh sach lop hoc
	listReq := httptest.NewRequest("GET", "/protected/lop-hoc", nil)
	listReq.AddCookie(cookie)

	respList, err := app.Test(listReq)
	if err != nil {
		t.Fatalf("failed to get list: %v", err)
	}
	if respList.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respList.StatusCode)
	}

	// 4. lay chi tiet lop hoc id = 1
	detailReq := httptest.NewRequest("GET", "/protected/lop-hoc/1", nil)
	detailReq.AddCookie(cookie)

	respDetail, err := app.Test(detailReq)
	if err != nil {
		t.Fatalf("failed to get detail: %v", err)
	}
	if respDetail.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respDetail.StatusCode)
	}

	// 5. xoa lop hoc id = 1
	delReq := httptest.NewRequest("DELETE", "/protected/lop-hoc/1", nil)
	delReq.AddCookie(cookie)

	respDel, err := app.Test(delReq)
	if err != nil {
		t.Fatalf("failed to delete: %v", err)
	}
	if respDel.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", respDel.StatusCode)
	}
}
