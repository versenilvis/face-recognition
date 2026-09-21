package student

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
)

type CreateRq struct {
	MSSV  string `json:"mssv"`
	HoTen string `json:"ho_ten"`
}

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler {
	return &Handler{repo: r}
}

func (h *Handler) ListByClass(c fiber.Ctx) error {
	lopHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class id"})
	}

	ds, err := h.repo.ListByLop(c.Context(), lopHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	return c.JSON(ds)
}

func (h *Handler) Create(c fiber.Ctx) error {
	lopHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class id"})
	}

	var rq CreateRq
	if err := c.Bind().Body(&rq); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	rq.MSSV = strings.TrimSpace(rq.MSSV)
	rq.HoTen = strings.TrimSpace(rq.HoTen)

	if rq.MSSV == "" || rq.HoTen == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mssv va ho ten khong duoc de trong"})
	}

	exists, err := h.repo.CheckLopHocExists(c.Context(), lopHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if !exists {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "lop hoc khong ton tai"})
	}

	id, err := h.repo.Create(c.Context(), rq.MSSV, rq.HoTen, lopHocID)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "mssv da ton tai"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":      "create success",
		"sinh_vien_id": id,
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
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "sinh vien not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "delete success",
		"affected_rows": affected,
	})
}
