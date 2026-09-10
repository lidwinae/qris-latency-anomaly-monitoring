package monitoring

import (
	"time"

	"qris-latency-anomaly-monitoring/internal/transaction"
)

type Observation struct {
	RequestID         string     `json:"request_id" gorm:"type:varchar(36);primaryKey"`
	TransactionID     string     `json:"transaction_id" gorm:"type:varchar(36);not null;index"`
	MerchantID        string     `json:"merchant_id" gorm:"size:32;not null;index"`
	Amount            int64      `json:"amount"`
	ObservedAt        time.Time  `json:"observed_at" gorm:"not null;index"`
	Endpoint          string     `json:"endpoint" gorm:"size:100;not null"`
	Source            string     `json:"source" gorm:"size:32;not null;index"`
	RunID             string     `json:"run_id" gorm:"size:64;not null;index"`
	ScenarioID        string     `json:"scenario_id" gorm:"size:64;not null"`
	WindowIndex       *int       `json:"window_index"`
	WindowStart       *time.Time `json:"window_start"`
	WindowSeconds     float64    `json:"window_seconds"`
	ElapsedMS         float64    `json:"elapsed_ms" gorm:"column:elapsed_ms"`
	HTTPStatus        int        `json:"http_status" gorm:"column:http_status"`
	FailureKind       string     `json:"failure_kind" gorm:"size:32"`
	TransactionStatus string     `json:"transaction_status" gorm:"size:16"`
	IsTimeout         bool       `json:"is_timeout"`
	DemoDelayMS       int        `json:"demo_delay_ms" gorm:"column:demo_delay_ms"`
	CreatedAt         time.Time  `json:"created_at"`

	Transaction transaction.Transaction `json:"-" gorm:"foreignKey:TransactionID;references:ID"`
}

type WindowResult struct {
	AnalysisID        string    `json:"analysis_id" gorm:"size:64;primaryKey"`
	RunID             string    `json:"run_id" gorm:"size:64;primaryKey"`
	Endpoint          string    `json:"endpoint" gorm:"size:100;primaryKey"`
	WindowIndex       int       `json:"window_index" gorm:"primaryKey;autoIncrement:false"`
	TrainRunID        string    `json:"train_run_id" gorm:"size:64"`
	ScenarioID        string    `json:"scenario_id" gorm:"size:64"`
	WindowStart       time.Time `json:"window_start"`
	WindowSeconds     float64   `json:"window_seconds"`
	RequestCount      int       `json:"request_count"`
	P50MS             float64   `json:"p50_ms" gorm:"column:p50_ms"`
	P95MS             float64   `json:"p95_ms" gorm:"column:p95_ms"`
	IQRMS             float64   `json:"iqr_ms" gorm:"column:iqr_ms"`
	RequestRate       float64   `json:"request_rate"`
	TechnicalErrorRate float64  `json:"technical_error_rate"`
	TimeoutRate       float64   `json:"timeout_rate"`
	IFScore           float64   `json:"if_score" gorm:"column:if_score"`
	IFAnomaly         bool      `json:"if_anomaly" gorm:"column:if_anomaly"`
	IQRUpperMS        float64   `json:"iqr_upper_ms" gorm:"column:iqr_upper_ms"`
	IQRAnomaly        bool      `json:"iqr_anomaly" gorm:"column:iqr_anomaly"`
	CreatedAt         time.Time `json:"created_at"`
}