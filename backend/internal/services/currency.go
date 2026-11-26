package services

import (
	"math"
	"strings"

	"github.com/teestore/backend/internal/models"
)

// Supported storefront currencies. Rates are indicative units per 1 USD and are
// shared with the frontend formatting layer so displayed prices stay stable
// across the storefront, cart, checkout, and admin reports.
var currencyPerUSD = map[string]float64{
	"USD": 1,
	"EUR": 0.92,
	"ZAR": 18.5,
	"KES": 129,
	"TZS": 2600,
	"UGX": 3700,
	"RWF": 1400,
	"XOF": 600,
}

var zeroDecimalCurrencies = map[string]bool{
	"TZS": true,
	"UGX": true,
	"RWF": true,
	"XOF": true,
}

func IsSupportedCurrency(code string) bool {
	_, ok := currencyPerUSD[strings.ToUpper(strings.TrimSpace(code))]
	return ok
}

func NormalizeCurrency(code string) string {
	upper := strings.ToUpper(strings.TrimSpace(code))
	if _, ok := currencyPerUSD[upper]; ok {
		return upper
	}
	return models.DefaultCurrency
}

func CurrencyDecimals(code string) int {
	if zeroDecimalCurrencies[NormalizeCurrency(code)] {
		return 0
	}
	return 2
}

func RoundCurrency(amount float64, code string) float64 {
	if CurrencyDecimals(code) == 0 {
		return math.Round(amount)
	}
	return Round2(amount)
}

// ConvertCurrency converts between storefront currencies without assuming a
// single pricing currency per product.
func ConvertCurrency(amount float64, from, to string) float64 {
	fromCode := NormalizeCurrency(from)
	toCode := NormalizeCurrency(to)
	if fromCode == toCode {
		return amount
	}
	usdValue := amount / currencyPerUSD[fromCode]
	return usdValue * currencyPerUSD[toCode]
}

func ConvertCurrencyRounded(amount float64, from, to string) float64 {
	return RoundCurrency(ConvertCurrency(amount, from, to), to)
}

// FreeShippingThresholdFor returns the $50 free-shipping threshold expressed in
// the requested currency, rounded for that currency's smallest unit.
func FreeShippingThresholdFor(code string) float64 {
	return ConvertCurrencyRounded(FreeShippingThreshold, "USD", code)
}

// StandardShippingFeeFor returns the $6 flat shipping fee in the requested
// currency.
func StandardShippingFeeFor(code string) float64 {
	return ConvertCurrencyRounded(StandardShippingFee, "USD", code)
}

// CalculateShippingAndTotalForCurrency mirrors CalculateShippingAndTotal but
// evaluates the threshold and fee in the order currency.
func CalculateShippingAndTotalForCurrency(subtotal float64, code string) (shippingFee float64, total float64) {
	currency := NormalizeCurrency(code)
	sub := RoundCurrency(subtotal, currency)
	if sub <= 0 || sub >= FreeShippingThresholdFor(currency) {
		return 0, sub
	}
	return StandardShippingFeeFor(currency), RoundCurrency(sub+StandardShippingFeeFor(currency), currency)
}
