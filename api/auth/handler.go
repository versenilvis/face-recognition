package auth

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	repo *Repo
}

type LoginRq struct {
	LoginCode string `json:"login_code"`
}

func NewHandler(r *Repo) *Handler {
	return &Handler{repo: r}
}

func (h *Handler) Login(c fiber.Ctx) error {
	var rq LoginRq
	if err := c.Bind().Body(&rq); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request",
		})
	}

	hBytes := sha256.Sum256([]byte(rq.LoginCode))
	hashCode := hex.EncodeToString(hBytes[:])

	gv, err := h.repo.GetGiangVienByHash(c.Context(), hashCode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid login code",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	token, err := GenerateToken()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "token error",
		})
	}
	SaveSession(token)

	c.Cookie(&fiber.Cookie{
		Name:     "session_id",
		Value:    token,
		HTTPOnly: true,
		SameSite: "Lax",
	})
	return c.JSON(fiber.Map{
		"message": "login success",
		"ho_ten":  gv.HoTen,
	})
}

func (h *Handler) Logout(c fiber.Ctx) error {
	token := c.Cookies("session_id")
	if token != "" {
		DeleteSession(token)
	}
	c.ClearCookie("session_id")
	return c.JSON(fiber.Map{
		"message": "logout success",
	})
}
