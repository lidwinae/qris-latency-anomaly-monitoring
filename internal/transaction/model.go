package transaction

import "time"

const PaymentEndpoint = "/api/transactions/:id/pay"

type Merchant struct {
	ID   string `json:"id" gorm:"type:varchar(32);primaryKey"`
	Name string `json:"name" gorm:"size:100;not null"`
}

type Transaction struct {
	ID         string     `json:"id" gorm:"type:varchar(36);primaryKey"`
	MerchantID string     `json:"merchant_id" gorm:"size:32;not null;index"`
	Amount     int64      `json:"amount" gorm:"not null"`
	Status     string     `json:"status" gorm:"size:16;not null"`
	CreatedAt  time.Time  `json:"created_at"`
	PaidAt     *time.Time `json:"paid_at"`

	Merchant Merchant `json:"-" gorm:"foreignKey:MerchantID;references:ID"`
}