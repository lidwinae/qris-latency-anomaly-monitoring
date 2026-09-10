package main

import (
	"errors"
	"log"

	"qris-latency-anomaly-monitoring/internal/config"
	"qris-latency-anomaly-monitoring/internal/database"
	"qris-latency-anomaly-monitoring/internal/monitoring"
	"qris-latency-anomaly-monitoring/internal/transaction"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"gorm.io/gorm/clause"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	db, err := database.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("Koneksi PostgreSQL gagal: ", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	defer sqlDB.Close()

	if err := db.AutoMigrate(
		&transaction.Merchant{},
		&transaction.Transaction{},
		&monitoring.Observation{},
		&monitoring.WindowResult{},
	); err != nil {
		log.Fatal("AutoMigrate gagal: ", err)
	}

	merchants := []transaction.Merchant{
		{ID: "M001", Name: "Merchant Demo A"},
		{ID: "M002", Name: "Merchant Demo B"},
		{ID: "M003", Name: "Merchant Demo C"},
	}

	if err := db.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&merchants).Error; err != nil {
		log.Fatal("Seed merchant gagal: ", err)
	}

	app := fiber.New(fiber.Config{
		Immutable: true,
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := 500
			message := "Kesalahan internal server"

			var fiberError *fiber.Error
			if errors.As(err, &fiberError) {
				code = fiberError.Code
				message = fiberError.Message
			}

			if code >= 500 {
				log.Printf("request error: %v", err)
			}

			return c.Status(code).JSON(fiber.Map{"error": message})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New())

	api := app.Group("/api")

	api.Get("/health", func(c fiber.Ctx) error {
		if err := sqlDB.Ping(); err != nil {
			return fiber.NewError(503, "Database belum siap")
		}

		return c.JSON(fiber.Map{
			"status":    "ok",
			"database":  "ok",
			"demo_mode": cfg.DemoMode,
		})
	})

	transaction.Register(api, db, cfg.PublicBaseURL, cfg.DemoMode)
	monitoring.Register(api, db)

	log.Printf("Backend: http://%s", cfg.AppAddr)
	log.Fatal(app.Listen(cfg.AppAddr))
}
