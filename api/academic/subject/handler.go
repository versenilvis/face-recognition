package subject

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
)

type CreateRq struct {
	MaMon  string `json:"ma_mon"`
	TenMon string `json:"ten,omitempty"`
}

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler {
	return &Handler{repo: r}
}

func (h *Handler) Create(c fiber.Ctx) error {
	var rq CreateRq
	if err := c.Bind().Body(&rq); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request",
		})
	}
	if rq.MaMon == "" || rq.TenMon == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request",
		})
	}

	id, err := h.repo.Create(c.Context(), rq.MaMon, rq.TenMon)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "db error",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":        "create success",
		"mon_hoc_id":     id,
		"mon_hoc_mamon":  rq.MaMon,
		"mon_hoc_tenmon": rq.TenMon,
	})
}

func (h *Handler) List(c fiber.Ctx) error {
	ds, err := h.repo.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	return c.JSON(ds)
}

func (h *Handler) Delete(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request",
		})
	}

	affected, err := h.repo.Delete(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "db error",
		})
	}
	if affected == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "now row affected",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "delete success",
		"affected_rows": affected,
	})
}
