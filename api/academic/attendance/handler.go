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
	buf.Write([]byte{0xEF, 0xBB, 0xBF})
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

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=diem_danh_buoi_%d.csv", buoiHocID))
	return c.Send(buf.Bytes())
}

func (h *Handler) ExportClassCSV(c fiber.Ctx) error {
	classID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class id"})
	}

	data, err := h.repo.GetClassAttendanceExport(c.Context(), classID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}

	var buf bytes.Buffer
	buf.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(&buf)

	headers := []string{"MSSV", "Ho Ten"}
	for i, l := range data.Lessons {
		headers = append(headers, fmt.Sprintf("Buoi %d (%s)", i+1, l.Ngay))
	}
	headers = append(headers, "Tong co mat", "Tong vang", "Ti le (%)")
	_ = writer.Write(headers)

	totalLessons := len(data.Lessons)
	for _, sv := range data.Students {
		row := []string{sv.MSSV, sv.HoTen}
		presentCount := 0

		for _, l := range data.Lessons {
			if data.Attendance[sv.ID] != nil && data.Attendance[sv.ID][l.ID] {
				row = append(row, "Co mat")
				presentCount++
			} else {
				row = append(row, "Vang")
			}
		}

		absentCount := totalLessons - presentCount
		percent := "0.0%"
		if totalLessons > 0 {
			percent = fmt.Sprintf("%.1f%%", float64(presentCount)*100.0/float64(totalLessons))
		}

		row = append(row, strconv.Itoa(presentCount), strconv.Itoa(absentCount), percent)
		_ = writer.Write(row)
	}
	writer.Flush()

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=diem_danh_tong_lop_%d.csv", classID))
	return c.Send(buf.Bytes())
}
