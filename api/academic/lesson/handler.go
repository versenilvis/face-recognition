package lesson

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

type CreateRq struct {
	Ngay    string  `json:"ngay"`
	BatDau  *string `json:"bat_dau,omitempty"`
	KetThuc *string `json:"ket_thuc,omitempty"`
}

type UpdateStatusRq struct {
	TrangThai string `json:"trang_thai"`
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
	rq.Ngay = strings.TrimSpace(rq.Ngay)
	if rq.Ngay == "" {
		rq.Ngay = time.Now().Format("2006-01-02")
	}

	exists, err := h.repo.CheckLopHocExists(c.Context(), lopHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if !exists {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "lop hoc khong ton tai"})
	}

	id, err := h.repo.Create(c.Context(), lopHocID, rq.Ngay, rq.BatDau, rq.KetThuc)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":     "create success",
		"id":          id,
		"buoi_hoc_id": id,
	})
}

func (h *Handler) UpdateStatus(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}

	var rq UpdateStatusRq
	if err := c.Bind().Body(&rq); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	rq.TrangThai = strings.ToLower(strings.TrimSpace(rq.TrangThai))
	if rq.TrangThai != "open" && rq.TrangThai != "closed" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "trang thai chi duoc la open hoac closed"})
	}

	affected, err := h.repo.UpdateStatus(c.Context(), id, rq.TrangThai)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "buoi hoc not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":    "update status success",
		"trang_thai": rq.TrangThai,
	})
}

func (h *Handler) Delete(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid id"})
	}

	affected, err := h.repo.Delete(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "buoi hoc not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "delete success",
		"affected_rows": affected,
	})
}

func (h *Handler) ListOpen(c fiber.Ctx) error {
	ds, err := h.repo.ListOpen(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	return c.JSON(ds)
}
