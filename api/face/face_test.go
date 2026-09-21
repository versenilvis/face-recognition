package face_test

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/lesson"
	"github.com/versenilvis/face-recognition/academic/student"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
	"github.com/versenilvis/face-recognition/face"
	"github.com/versenilvis/face-recognition/infer"
)

func setupFaceTest(t *testing.T, mockInferURL string) (*fiber.App, *http.Cookie) {
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

	inferClient := infer.NewClient(mockInferURL)
	app := fiber.New()

	subRepo := subject.NewRepo(database)
	subHandler := subject.NewHandler(subRepo)
	clsRepo := class.NewRepo(database)
	clsHandler := class.NewHandler(clsRepo)
	stuRepo := student.NewRepo(database)
	stuHandler := student.NewHandler(stuRepo)
	lesRepo := lesson.NewRepo(database)
	lesHandler := lesson.NewHandler(lesRepo)

	faceRepo := face.NewRepo(database)
	faceService := face.NewService(faceRepo, inferClient)
	faceHandler := face.NewHandler(faceRepo, faceService)

	app.Post("/buoi-hoc/:id/checkin", faceHandler.Checkin)

	protected := app.Group("/protected", auth.RequireAuth)
	protected.Post("/mon-hoc", subHandler.Create)
	protected.Post("/lop-hoc", clsHandler.Create)
	protected.Post("/lop-hoc/:id/sinh-vien", stuHandler.Create)
	protected.Post("/lop-hoc/:id/buoi-hoc", lesHandler.Create)
	protected.Patch("/buoi-hoc/:id/status", lesHandler.UpdateStatus)

	protected.Post("/sinh-vien/:id/face", faceHandler.RegisterFace)
	protected.Delete("/sinh-vien/:id/face", faceHandler.DeleteFace)

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

func createMultipartReq(method, path string, fieldName, filename string, content []byte) *http.Request {
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	part, _ := w.CreateFormFile(fieldName, filename)
	_, _ = part.Write(content)
	_ = w.Close()

	req := httptest.NewRequest(method, path, &b)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func TestFaceAndCheckin(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"faces": [
				{
					"bbox": [50, 50, 200, 200],
					"det_score": 0.99,
					"embedding": [1.0, 0.0, 0.0],
					"liveness": {"label": "Real", "score": 0.98}
				}
			]
		}`))
	}))
	defer mockServer.Close()

	app, cookie := setupFaceTest(t, mockServer.URL)

	// chuan bi lop, sinh vien, buoi hoc
	createMhReq := httptest.NewRequest("POST", "/protected/mon-hoc", strings.NewReader(`{"ma_mon": "AI101", "ten": "Tri tue nhan tao"}`))
	createMhReq.Header.Set("Content-Type", "application/json")
	createMhReq.AddCookie(cookie)
	_, _ = app.Test(createMhReq)

	createClassReq := httptest.NewRequest("POST", "/protected/lop-hoc", strings.NewReader(`{"ten": "AI-K1", "mon_hoc_id": 1}`))
	createClassReq.Header.Set("Content-Type", "application/json")
	createClassReq.AddCookie(cookie)
	_, _ = app.Test(createClassReq)

	createSvReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/sinh-vien", strings.NewReader(`{"mssv": "AI001", "ho_ten": "Vu Dinh E"}`))
	createSvReq.Header.Set("Content-Type", "application/json")
	createSvReq.AddCookie(cookie)
	_, _ = app.Test(createSvReq)

	createLessonReq := httptest.NewRequest("POST", "/protected/lop-hoc/1/buoi-hoc", strings.NewReader(`{"ngay": "2026-09-19"}`))
	createLessonReq.Header.Set("Content-Type", "application/json")
	createLessonReq.AddCookie(cookie)
	_, _ = app.Test(createLessonReq)

	// 1. dang ky khuon mat cho sinh vien id = 1
	regReq := createMultipartReq("POST", "/protected/sinh-vien/1/face", "image", "face.jpg", []byte("fake_jpg"))
	regReq.AddCookie(cookie)
	respReg, err := app.Test(regReq)
	if err != nil {
		t.Fatalf("register face failed: %v", err)
	}
	if respReg.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for register face, got: %d", respReg.StatusCode)
	}

	// 2. diem danh khi buoi hoc chua mo -> phai tra ve 403
	checkinClosedReq := createMultipartReq("POST", "/buoi-hoc/1/checkin", "image", "frame.jpg", []byte("fake_frame"))
	respClosed, err := app.Test(checkinClosedReq)
	if err != nil {
		t.Fatalf("checkin failed: %v", err)
	}
	if respClosed.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 when lesson closed, got: %d", respClosed.StatusCode)
	}

	// 3. mo buoi hoc
	openReq := httptest.NewRequest("PATCH", "/protected/buoi-hoc/1/status", strings.NewReader(`{"trang_thai": "open"}`))
	openReq.Header.Set("Content-Type", "application/json")
	openReq.AddCookie(cookie)
	_, _ = app.Test(openReq)

	// 4. diem danh khi buoi hoc da mo -> phai tra ve 200
	checkinOpenReq := createMultipartReq("POST", "/buoi-hoc/1/checkin", "image", "frame.jpg", []byte("fake_frame"))
	respOpen, err := app.Test(checkinOpenReq)
	if err != nil {
		t.Fatalf("checkin failed: %v", err)
	}
	if respOpen.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for checkin, got: %d", respOpen.StatusCode)
	}

	// 5. xoa khuon mat sinh vien
	delFaceReq := httptest.NewRequest("DELETE", "/protected/sinh-vien/1/face", nil)
	delFaceReq.AddCookie(cookie)
	respDelFace, err := app.Test(delFaceReq)
	if err != nil {
		t.Fatalf("delete face failed: %v", err)
	}
	if respDelFace.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for delete face, got: %d", respDelFace.StatusCode)
	}
}
