package transaction

import (
	"errors"
	"net/url"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

type handler struct {
	db            *gorm.DB
	publicBaseURL string
	demoMode      bool
}

type transactionResponse struct {
	Transaction
	MerchantName string `json:"merchant_name"`
	PaymentURL   string `json:"payment_url"`
	QRURL        string `json:"qr_url"`
}

func Register(
	router fiber.Router,
	db *gorm.DB,
	publicBaseURL string,
	demoMode bool,
) {
	h := &handler{
		db:            db,
		publicBaseURL: publicBaseURL,
		demoMode:      demoMode,
	}

	router.Get("/merchants", h.listMerchants)
	router.Get("/transactions", h.listTransactions)
	router.Post("/transactions", h.createTransaction)
	router.Get("/transactions/:id", h.getTransaction)
	router.Get("/transactions/:id/qr", h.getQR)
	router.Post("/transactions/:id/pay", h.pay)
}

func (h *handler) response(tx Transaction) transactionResponse {
	return transactionResponse{
		Transaction:  tx,
		MerchantName: tx.Merchant.Name,
		PaymentURL:   h.publicBaseURL + "/?pay=" + url.QueryEscape(tx.ID),
		QRURL:        "/api/transactions/" + tx.ID + "/qr",
	}
}

func (h *handler) findTransaction(id string) (Transaction, error) {
	var tx Transaction

	if _, err := uuid.Parse(id); err != nil {
		return tx, fiber.NewError(400, "ID transaksi tidak valid")
	}

	err := h.db.Preload("Merchant").
		First(&tx, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return tx, fiber.NewError(404, "Transaksi tidak ditemukan")
	}

	return tx, err
}

func (h *handler) listMerchants(c fiber.Ctx) error {
	rows := []Merchant{}

	if err := h.db.Order("id").Find(&rows).Error; err != nil {
		return err
	}

	return c.JSON(rows)
}

func (h *handler) listTransactions(c fiber.Ctx) error {
	rows := []Transaction{}

	err := h.db.Preload("Merchant").
		Order("created_at DESC").
		Limit(100).
		Find(&rows).Error
	if err != nil {
		return err
	}

	result := make([]transactionResponse, 0, len(rows))
	for _, tx := range rows {
		result = append(result, h.response(tx))
	}

	return c.JSON(result)
}

func (h *handler) createTransaction(c fiber.Ctx) error {
	var input struct {
		MerchantID string `json:"merchant_id"`
		Amount     int64  `json:"amount"`
	}

	if err := c.Bind().Body(&input); err != nil {
		return fiber.NewError(400, "Body JSON tidak valid")
	}

	if input.Amount < 1 || input.Amount > 1_000_000_000 {
		return fiber.NewError(
			400,
			"Nominal harus 1 sampai 1.000.000.000 rupiah",
		)
	}

	var merchant Merchant
	err := h.db.First(&merchant, "id = ?", input.MerchantID).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fiber.NewError(400, "Merchant tidak ditemukan")
	}
	if err != nil {
		return err
	}

	tx := Transaction{
		ID:         uuid.NewString(),
		MerchantID: merchant.ID,
		Amount:     input.Amount,
		Status:     "pending",
	}

	if err := h.db.Create(&tx).Error; err != nil {
		return err
	}

	tx.Merchant = merchant

	return c.Status(201).JSON(h.response(tx))
}

func (h *handler) getTransaction(c fiber.Ctx) error {
	tx, err := h.findTransaction(c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(h.response(tx))
}

func (h *handler) getQR(c fiber.Ctx) error {
	tx, err := h.findTransaction(c.Params("id"))
	if err != nil {
		return err
	}

	png, err := qrcode.Encode(
		h.response(tx).PaymentURL,
		qrcode.Medium,
		256,
	)
	if err != nil {
		return err
	}

	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "no-store")

	if c.Query("download") == "1" {
		c.Set(
			"Content-Disposition",
			`attachment; filename="qris-demo-`+tx.ID+`.png"`,
		)
	}

	return c.Send(png)
}

func (h *handler) pay(c fiber.Ctx) error {
	tx, err := h.findTransaction(c.Params("id"))
	if err != nil {
		return err
	}

	requestID := c.Get("X-Request-ID")
	if requestID == "" {
		requestID = uuid.NewString()
	}

	if _, err := uuid.Parse(requestID); err != nil {
		return fiber.NewError(400, "X-Request-ID tidak valid")
	}

	c.Set("X-Request-ID", requestID)

	if delayHeader := c.Get("X-Demo-Delay-Ms"); delayHeader != "" {
		if !h.demoMode {
			return fiber.NewError(
				400,
				"Header delay memerlukan DEMO_MODE=true",
			)
		}

		delayMS, err := strconv.Atoi(delayHeader)
		if err != nil || delayMS < 0 || delayMS > 2000 {
			return fiber.NewError(
				400,
				"Delay demo harus 0 sampai 2000 ms",
			)
		}

		time.Sleep(time.Duration(delayMS) * time.Millisecond)
	}

	// Hanya transaksi pending yang diubah.
	// Pemanggilan ulang tidak mengganti waktu pembayaran.
	now := time.Now().UTC()

	result := h.db.Model(&Transaction{}).
		Where("id = ? AND status = ?", tx.ID, "pending").
		Updates(map[string]any{
			"status":  "paid",
			"paid_at": now,
		})
	if result.Error != nil {
		return result.Error
	}

	tx, err = h.findTransaction(tx.ID)
	if err != nil {
		return err
	}

	return c.JSON(h.response(tx))
}
