package class

import (
	"database/sql"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v3"
)

type CreateRq struct {
	Ten      string `json:"ten"`
	MonHocID int    `json:"mon_hoc_id"`
}

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler {
	return &Handler{repo: r}
}

func (h *Handler) List(c fiber.Ctx) error {
	ds, err := h.repo.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	return c.JSON(ds)
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	lh, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "lop hoc not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	return c.JSON(lh)
}

func (h *Handler) Create(c fiber.Ctx) error {
	var rq CreateRq
	if err := c.Bind().Body(&rq); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if rq.Ten == "" || rq.MonHocID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	exists, err := h.repo.CheckMonHocExists(c.Context(), rq.MonHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if !exists {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mon hoc khong ton tai"})
	}

	id, err := h.repo.Create(c.Context(), rq.Ten, rq.MonHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":    "create success",
		"lop_hoc_id": id,
	})
}

func (h *Handler) Delete(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	affected, err := h.repo.Delete(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "lop hoc not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "delete success",
		"affected_rows": affected,
	})
}
