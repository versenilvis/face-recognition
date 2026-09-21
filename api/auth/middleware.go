package auth

import (
	"github.com/gofiber/fiber/v3"
)

func RequireAuth(c fiber.Ctx) error {
	token := c.Cookies("session_id")
	if token == "" || !ValidSession(token) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}
	return c.Next()
}
