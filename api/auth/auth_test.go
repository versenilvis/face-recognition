package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/auth"
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
	r := auth.NewRepo(database)
	h := auth.NewHandler(r)
	app.Post("/login", h.Login)
	app.Post("/logout", h.Logout)
	protected := app.Group("/protected", auth.RequireAuth)
	protected.Get("/me", func(c fiber.Ctx) error {
		return c.SendString("ok")
	})
	return app
}

func TestAuthFlow(t *testing.T) {
	app := setupApp(t)

	// test login code sai
	bodyWrong := strings.NewReader(`{"login_code": "wrong"}`)
	req1 := httptest.NewRequest("POST", "/login", bodyWrong)
	req1.Header.Set("Content-Type", "application/json")

	resp1, err := app.Test(req1)
	if err != nil {
		t.Fatalf("cannot login: %v", err)
	}
	if resp1.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got: %d", resp1.StatusCode)
	}

	// test login code dung
	bodyRight := strings.NewReader(`{"login_code": "gv123"}`)
	req2 := httptest.NewRequest("POST", "/login", bodyRight)
	req2.Header.Set("Content-Type", "application/json")

	resp2, err := app.Test(req2)
	if err != nil {
		t.Fatalf("requested failed: %v", err)
	}
	if resp2.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", resp2.StatusCode)
	}

	var sessionCookie *http.Cookie
	for _, cookie := range resp2.Cookies() {
		if cookie.Name == "session_id" {
			sessionCookie = cookie
			break
		}
	}
	if sessionCookie == nil {
		t.Fatalf("session cookie not found")
	}

	// test route duoc bao ve kem cookie -> 200
	req3 := httptest.NewRequest("GET", "/protected/me", nil)
	req3.AddCookie(sessionCookie)
	resp3, err := app.Test(req3)
	if err != nil {
		t.Fatalf("requested failed: %v", err)
	}
	if resp3.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", resp3.StatusCode)
	}

	// test route duoc bao ve khong kem cookie -> 401
	req4 := httptest.NewRequest("GET", "/protected/me", nil)
	resp4, err := app.Test(req4)
	if err != nil {
		t.Fatalf("requested failed: %v", err)
	}
	if resp4.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got: %d", resp4.StatusCode)
	}

	// test logout
	req5 := httptest.NewRequest("POST", "/logout", nil)
	req5.AddCookie(sessionCookie)
	resp5, err := app.Test(req5)
	if err != nil {
		t.Fatalf("requested failed: %v", err)
	}
	if resp5.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got: %d", resp5.StatusCode)
	}
}
