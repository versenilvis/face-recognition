package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v3"
	"github.com/versenilvis/face-recognition/academic/attendance"
	"github.com/versenilvis/face-recognition/academic/class"
	"github.com/versenilvis/face-recognition/academic/lesson"
	"github.com/versenilvis/face-recognition/academic/student"
	"github.com/versenilvis/face-recognition/academic/subject"
	"github.com/versenilvis/face-recognition/auth"
	"github.com/versenilvis/face-recognition/db"
	"github.com/versenilvis/face-recognition/face"
	"github.com/versenilvis/face-recognition/infer"
	"github.com/versenilvis/face-recognition/utils"
)

func main() {
	ctx := context.Background()

	dbPath := utils.GetEnv("DB_PATH", "../data/face_reg.db")
	database, err := db.New(ctx, dbPath)
	if err != nil {
		panic("db.New: " + err.Error())
	}
	defer database.Close()

	if err := database.Migrate(ctx); err != nil {
		panic("migrate: " + err.Error())
	}

	app := fiber.New()
	_, cancel := context.WithCancel(context.Background())
	app.Hooks().OnPreStartupMessage(func(sm *fiber.PreStartupMessageData) error {
		sm.BannerHeader = "API: localhost:" + utils.GetEnv("PORT", "8080")
		sm.ResetEntries()
		return nil
	})

	inferURL := utils.GetEnv("INFER_URL", "http://127.0.0.1:8001")
	inferClient := infer.NewClient(inferURL)

	// repos
	authRepo := auth.NewRepo(database)
	subjectRepo := subject.NewRepo(database)
	classRepo := class.NewRepo(database)
	studentRepo := student.NewRepo(database)
	lessonRepo := lesson.NewRepo(database)
	attendanceRepo := attendance.NewRepo(database)
	faceRepo := face.NewRepo(database)

	// services
	faceService := face.NewService(faceRepo, inferClient)

	// handlers
	authHandler := auth.NewHandler(authRepo)
	subjectHandler := subject.NewHandler(subjectRepo)
	classHandler := class.NewHandler(classRepo)
	studentHandler := student.NewHandler(studentRepo)
	lessonHandler := lesson.NewHandler(lessonRepo)
	attendanceHandler := attendance.NewHandler(attendanceRepo)
	faceHandler := face.NewHandler(faceRepo, faceService)

	app.Get("/", func(c fiber.Ctx) error {
		return c.SendString("Hello")
	})

	// public routes
	app.Post("/login", authHandler.Login)
	app.Post("/logout", authHandler.Logout)
	app.Get("/buoi-hoc/open", lessonHandler.ListOpen)
	app.Post("/buoi-hoc/:id/checkin", faceHandler.Checkin)

	// protected routes
	protected := app.Group("/protected", auth.RequireAuth)

	// mon hoc
	protected.Get("/mon-hoc", subjectHandler.List)
	protected.Post("/mon-hoc", subjectHandler.Create)
	protected.Delete("/mon-hoc/:id", subjectHandler.Delete)

	// lop hoc
	protected.Get("/lop-hoc", classHandler.List)
	protected.Get("/lop-hoc/:id", classHandler.GetByID)
	protected.Post("/lop-hoc", classHandler.Create)
	protected.Delete("/lop-hoc/:id", classHandler.Delete)

	// sinh vien
	protected.Get("/lop-hoc/:id/sinh-vien", studentHandler.ListByClass)
	protected.Post("/lop-hoc/:id/sinh-vien", studentHandler.Create)
	protected.Delete("/sinh-vien/:id", studentHandler.Delete)

	// buoi hoc
	protected.Get("/lop-hoc/:id/buoi-hoc", lessonHandler.ListByClass)
	protected.Post("/lop-hoc/:id/buoi-hoc", lessonHandler.Create)
	protected.Patch("/buoi-hoc/:id/status", lessonHandler.UpdateStatus)
	protected.Delete("/buoi-hoc/:id", lessonHandler.Delete)

	// diem danh
	protected.Get("/buoi-hoc/:id/diem-danh", attendanceHandler.ListByLesson)
	protected.Post("/buoi-hoc/:id/diem-danh/:sv_id", attendanceHandler.ManualCheckin)
	protected.Delete("/buoi-hoc/:id/diem-danh/:sv_id", attendanceHandler.ManualCancel)
	protected.Get("/buoi-hoc/:id/export", attendanceHandler.ExportCSV)

	// face
	protected.Post("/sinh-vien/:id/face", faceHandler.RegisterFace)
	protected.Delete("/sinh-vien/:id/face", faceHandler.DeleteFace)

	go func() {
		port := utils.GetEnv("PORT", "8080")
		if err := app.Listen(":" + port); err != nil {
			log.Panic("Server failed to start", err)
		}
	}()

	// ctrl+c
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	log.Print("SHUTTING DOWN SERVER...")
	cancel()
}
