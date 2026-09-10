package monitoring

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"time"

	"qris-latency-anomaly-monitoring/internal/transaction"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var validID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type handler struct {
	db *gorm.DB
}

func Register(router fiber.Router, db *gorm.DB) {
	h := &handler{db: db}

	router.Post("/observations", h.createObservation)
	router.Get("/observations", h.listObservations)
	router.Get("/analyses", h.listAnalyses)
	router.Get("/windows", h.listWindows)
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func (h *handler) createObservation(c fiber.Ctx) error {
	var input Observation
	if err := c.Bind().Body(&input); err != nil {
		return fiber.NewError(400, "Body pengukuran tidak valid")
	}

	if _, err := uuid.Parse(input.RequestID); err != nil {
		return fiber.NewError(400, "request_id tidak valid")
	}

	if !validID.MatchString(input.RunID) ||
		!validID.MatchString(input.ScenarioID) {
		return fiber.NewError(400, "run_id atau scenario_id tidak valid")
	}

	if input.ObservedAt.IsZero() ||
		!finite(input.ElapsedMS) ||
		input.ElapsedMS < 0 ||
		input.ElapsedMS > 120_000 {
		return fiber.NewError(400, "Waktu atau durasi pengukuran tidak valid")
	}

	if input.HTTPStatus != 0 &&
		(input.HTTPStatus < 100 || input.HTTPStatus > 599) {
		return fiber.NewError(400, "http_status tidak valid")
	}

	switch input.FailureKind {
	case "none", "http_error", "timeout", "network_error":
	default:
		return fiber.NewError(400, "failure_kind tidak valid")
	}

	if input.IsTimeout != (input.FailureKind == "timeout") {
		return fiber.NewError(400, "is_timeout tidak konsisten")
	}

	if input.HTTPStatus == 0 {
		if input.FailureKind != "timeout" && input.FailureKind != "network_error" {
			return fiber.NewError(400, "Tanpa respons HTTP harus ada kegagalan client")
		}
	} else {
		if input.FailureKind == "timeout" || input.FailureKind == "network_error" {
			return fiber.NewError(400, "Kegagalan client tidak boleh memiliki HTTP status")
		}
		if input.HTTPStatus >= 400 && input.FailureKind != "http_error" {
			return fiber.NewError(400, "HTTP error tidak konsisten")
		}
		if input.HTTPStatus < 400 && input.FailureKind != "none" {
			return fiber.NewError(400, "Respons HTTP tidak konsisten")
		}
	}

	switch input.TransactionStatus {
	case "pending", "paid", "unknown":
	default:
		return fiber.NewError(400, "transaction_status tidak valid")
	}

	if input.DemoDelayMS < 0 || input.DemoDelayMS > 2000 {
		return fiber.NewError(400, "demo_delay_ms tidak valid")
	}

	switch input.Source {
	case "browser_manual":
		input.RunID = "manual"
		input.ScenarioID = "manual"
		input.WindowIndex = nil
		input.WindowStart = nil
		input.WindowSeconds = 0
		input.DemoDelayMS = 0

	case "python_demo":
		if input.WindowIndex == nil || *input.WindowIndex < 0 ||
			input.WindowStart == nil || input.WindowStart.IsZero() ||
			!finite(input.WindowSeconds) || input.WindowSeconds <= 0 {
			return fiber.NewError(400, "Metadata jendela demo tidak lengkap")
		}

	default:
		return fiber.NewError(400, "source tidak valid")
	}

	var tx transaction.Transaction
	err := h.db.First(&tx, "id = ?", input.TransactionID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fiber.NewError(404, "Transaksi tidak ditemukan")
	}
	if err != nil {
		return err
	}

	// Konteks transaksi berasal dari database.
	input.MerchantID = tx.MerchantID
	input.Amount = tx.Amount
	input.Endpoint = transaction.PaymentEndpoint
	input.CreatedAt = time.Now().UTC()

	// Jangan mengganti status client dengan status terbaru dari DB.
	// Misalnya, client timeout tetapi transaksi ternyata sudah paid.
	result := h.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&input)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fiber.NewError(409, "request_id pengukuran sudah tersimpan")
	}

	return c.Status(201).JSON(fiber.Map{
		"request_id": input.RequestID,
		"stored":     true,
	})
}

func (h *handler) listObservations(c fiber.Ctx) error {
	runID := c.Query("run_id")
	if !validID.MatchString(runID) {
		return fiber.NewError(400, "run_id wajib diisi")
	}

	query := h.db.Where("run_id = ?", runID)

	if value := c.Query("window_index"); value != "" {
		index, err := strconv.Atoi(value)
		if err != nil || index < 0 {
			return fiber.NewError(400, "window_index tidak valid")
		}
		query = query.Where("window_index = ?", index)
	}

	rows := []Observation{}
	if err := query.Order("observed_at").Limit(500).Find(&rows).Error; err != nil {
		return err
	}

	return c.JSON(rows)
}

func (h *handler) listAnalyses(c fiber.Ctx) error {
	type analysisSummary struct {
		AnalysisID string    `json:"analysis_id"`
		TrainRunID string    `json:"train_run_id"`
		RunID      string    `json:"run_id"`
		CreatedAt  time.Time `json:"created_at"`
	}

	rows := []analysisSummary{}
	err := h.db.Model(&WindowResult{}).
		Select("analysis_id, train_run_id, run_id, MAX(created_at) AS created_at").
		Group("analysis_id, train_run_id, run_id").
		Order("created_at DESC").
		Limit(50).
		Scan(&rows).Error
	if err != nil {
		return err
	}

	return c.JSON(rows)
}

func (h *handler) listWindows(c fiber.Ctx) error {
	analysisID := c.Query("analysis_id")
	if !validID.MatchString(analysisID) {
		return fiber.NewError(400, "analysis_id wajib diisi")
	}

	rows := []WindowResult{}
	err := h.db.Where("analysis_id = ?", analysisID).
		Order("window_index").
		Limit(1000).
		Find(&rows).Error
	if err != nil {
		return err
	}

	return c.JSON(rows)
}
