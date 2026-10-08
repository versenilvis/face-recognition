package face

import (
	"errors"
	"fmt"
	"io"
	"strconv"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	repo    *Repo
	service *Service
}

func NewHandler(r *Repo, s *Service) *Handler {
	return &Handler{
		repo:    r,
		service: s,
	}
}

func (h *Handler) RegisterFace(c fiber.Ctx) error {
	svID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing image field"})
	}

	f, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot read file"})
	}
	defer f.Close()

	imgBytes, err := io.ReadAll(f)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot read bytes"})
	}

	override := c.FormValue("override") == "true" || c.Query("override") == "true"

	face, conflict, err := h.service.RegisterFace(c.Context(), svID, imgBytes, override)
	if err != nil {
		if errors.Is(err, ErrFaceConflict) && conflict != nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "face_conflict",
				"message": fmt.Sprintf("Khuôn mặt này đã được đăng ký cho sinh viên %s (%s)", conflict.HoTen, conflict.MSSV),
				"conflict_student": fiber.Map{
					"id":     conflict.ID,
					"mssv":   conflict.MSSV,
					"ho_ten": conflict.HoTen,
				},
			})
		}
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "sinh vien khong ton tai"})
		}
		if errors.Is(err, ErrNoFace) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "khong tim thay khuon mat trong anh"})
		}
		if errors.Is(err, ErrMultipleFaces) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "phat hien nhieu hon 1 khuon mat, vui long chi chup 1 nguoi"})
		}
		if errors.Is(err, ErrFakeFace) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "khuon mat khong hop le hoac bi nghi ngo gia mao"})
		}
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	res := fiber.Map{
		"message":   "dang ky khuon mat thanh cong",
		"det_score": face.DetScore,
	}
	if conflict != nil && override {
		res["reassigned_from"] = fiber.Map{
			"id":     conflict.ID,
			"mssv":   conflict.MSSV,
			"ho_ten": conflict.HoTen,
		}
	}
	return c.Status(fiber.StatusOK).JSON(res)
}

func (h *Handler) DeleteFace(c fiber.Ctx) error {
	svID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	affected, err := h.repo.DeleteFaceEmbedding(c.Context(), svID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "db error"})
	}
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "face embedding not found"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "xoa khuon mat thanh cong",
	})
}

func (h *Handler) Checkin(c fiber.Ctx) error {
	buoiHocID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid lesson id"})
	}

	file, err := c.FormFile("image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing image field"})
	}

	f, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot open image"})
	}
	defer f.Close()

	imgBytes, err := io.ReadAll(f)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cannot read image"})
	}

	result, err := h.service.ProcessCheckin(c.Context(), buoiHocID, imgBytes)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "buoi hoc khong ton tai"})
		}
		if errors.Is(err, ErrLessonClosed) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "buoi hoc dang dong, khong the diem danh"})
		}
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "infer error: " + err.Error()})
	}

	return c.JSON(result)
}
