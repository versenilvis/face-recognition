package attendance

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler {
	return &Handler{repo: r}
}

func (h *Handler) ListByLesson(c fiber.Ctx) error {
	buoiHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lesson id"})
	}

	ds, err := h.repo.ListByBuoi(c.Context(), buoiHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	return c.JSON(ds)
}

func (h *Handler) ManualCheckin(c fiber.Ctx) error {
	buoiHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lesson id"})
	}
	svID, err := strconv.Atoi(c.Params("sv_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	affected, err := h.repo.Record(c.Context(), buoiHocID, svID, nil, "manual")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "checkin success",
		"affected_rows": affected,
	})
}

func (h *Handler) ManualCancel(c fiber.Ctx) error {
	buoiHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lesson id"})
	}
	svID, err := strconv.Atoi(c.Params("sv_id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	affected, err := h.repo.Cancel(c.Context(), buoiHocID, svID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "record not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":       "cancel checkin success",
		"affected_rows": affected,
	})
}

func (h *Handler) ExportCSV(c fiber.Ctx) error {
	buoiHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lesson id"})
	}

	ds, err := h.repo.ListByBuoi(c.Context(), buoiHocID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	_ = writer.Write([]string{"MSSV", "Ho Ten", "Trang Thai", "Thoi Gian", "Phuong Thuc"})

	for _, r := range ds {
		thoiGian := ""
		if r.ThoiGian != nil {
			thoiGian = *r.ThoiGian
		}
		phuongThuc := ""
		if r.PhuongThuc != nil {
			phuongThuc = *r.PhuongThuc
		}
		statusVN := "Vang"
		if r.TrangThai == "present" {
			statusVN = "Co mat"
		}
		_ = writer.Write([]string{r.MSSV, r.HoTen, statusVN, thoiGian, phuongThuc})
	}
	writer.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=diem_danh_buoi_%d.csv", buoiHocID))
	return c.Send(buf.Bytes())
}
