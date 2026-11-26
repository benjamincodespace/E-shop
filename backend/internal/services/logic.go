package services

import (
	"math"
	"regexp"
	"strings"

	"github.com/teestore/backend/internal/models"
)

const (
	FreeShippingThreshold = 50.0
	StandardShippingFee   = 6.0
)

var nonSlugChars = regexp.MustCompile(`[^a-z0-9\s-]+`)
var multiSpace = regexp.MustCompile(`\s+`)
var multiHyphen = regexp.MustCompile(`-+`)

func Round2(val float64) float64 {
	return math.Round(val*100) / 100
}

func GetEffectivePrice(price float64, discountPrice *float64) float64 {
	if discountPrice != nil && *discountPrice > 0 && *discountPrice < price {
		return Round2(*discountPrice)
	}
	return Round2(price)
}

func CalculateDiscountPercent(price float64, discountPrice *float64) int {
	if discountPrice == nil || *discountPrice <= 0 || *discountPrice >= price || price <= 0 {
		return 0
	}
	return int(math.Round(((price - *discountPrice) / price) * 100))
}

func CalculateShippingAndTotal(subtotal float64) (shippingFee float64, total float64) {
	sub := Round2(subtotal)
	if sub <= 0 || sub >= FreeShippingThreshold {
		return 0, sub
	}
	return StandardShippingFee, Round2(sub + StandardShippingFee)
}

func ComputeWeightedRatingScore(ratingAvg float64, reviewCount int) float64 {
	if reviewCount <= 0 {
		return 0
	}
	const priorMean = 4.2
	const minReviewsWeight = 10.0
	rc := float64(reviewCount)
	score := (rc/(rc+minReviewsWeight))*ratingAvg + (minReviewsWeight/(rc+minReviewsWeight))*priorMean
	return math.Round(score*1000) / 1000
}

func CalculateRatingSummary(ratings []int) models.RatingSummary {
	counts := map[int]int{5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
	sum := 0
	for _, r := range ratings {
		if r < 1 {
			r = 1
		}
		if r > 5 {
			r = 5
		}
		counts[r]++
		sum += r
	}
	total := len(ratings)
	avg := 0.0
	if total > 0 {
		avg = math.Round((float64(sum)/float64(total))*10) / 10
	}
	breakdown := make([]models.RatingBreakdown, 0, 5)
	for _, stars := range []int{5, 4, 3, 2, 1} {
		pct := 0
		if total > 0 {
			pct = int(math.Round((float64(counts[stars]) / float64(total)) * 100))
		}
		breakdown = append(breakdown, models.RatingBreakdown{
			Stars:      stars,
			Count:      counts[stars],
			Percentage: pct,
		})
	}
	return models.RatingSummary{
		Average:   avg,
		Total:     total,
		Breakdown: breakdown,
	}
}

var allowedTransitions = map[models.OrderStatus][]models.OrderStatus{
	models.OrderPending:    {models.OrderConfirmed, models.OrderProcessing, models.OrderCancelled},
	models.OrderConfirmed:  {models.OrderProcessing, models.OrderShipped, models.OrderCancelled},
	models.OrderProcessing: {models.OrderShipped, models.OrderCancelled},
	models.OrderShipped:    {models.OrderDelivered},
	models.OrderDelivered:  {},
	models.OrderCancelled:  {},
}

func CanTransitionOrderStatus(from, to models.OrderStatus) bool {
	if from == to {
		return true
	}
	allowed, ok := allowedTransitions[from]
	if !ok {
		return false
	}
	for _, candidate := range allowed {
		if candidate == to {
			return true
		}
	}
	return false
}

// ClampText shortens text to at most max runes on a word boundary and appends
// an ellipsis. It is rune-based so a multi-byte character is never split, which
// the previous byte-slice truncation could do.
func ClampText(text string, max int) string {
	trimmed := strings.TrimSpace(text)
	if max <= 0 {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= max {
		return trimmed
	}
	cut := runes[:max-1]
	for i := len(cut) - 1; i > 0; i-- {
		if cut[i] == ' ' {
			cut = cut[:i]
			break
		}
	}
	return strings.TrimRight(string(cut), " ,.;:!-") + "…"
}

func SlugifyProductName(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = nonSlugChars.ReplaceAllString(s, "")
	s = multiSpace.ReplaceAllString(s, "-")
	s = multiHyphen.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
