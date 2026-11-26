package services

import (
	"strings"
	"testing"

	"github.com/teestore/backend/internal/models"
)

func TestPricingAndDiscount(t *testing.T) {
	disc := 15.0
	if got := GetEffectivePrice(22.0, &disc); got != 15.0 {
		t.Fatalf("expected effective price 15.0, got %v", got)
	}
	invalid := 30.0
	if got := GetEffectivePrice(22.0, &invalid); got != 22.0 {
		t.Fatalf("expected price 22.0 when discount >= price, got %v", got)
	}
	if pct := CalculateDiscountPercent(22.0, &disc); pct != 32 {
		t.Fatalf("expected 32%% discount, got %d", pct)
	}
}

func TestShippingAndTotal(t *testing.T) {
	ship, total := CalculateShippingAndTotal(33.0)
	if ship != StandardShippingFee || total != 39.0 {
		t.Fatalf("expected shipping 6 total 39, got %v / %v", ship, total)
	}
	ship2, total2 := CalculateShippingAndTotal(50.0)
	if ship2 != 0 || total2 != 50.0 {
		t.Fatalf("expected free shipping at $50, got %v / %v", ship2, total2)
	}
}

func TestWeightedScoreAndSummary(t *testing.T) {
	highVol := ComputeWeightedRatingScore(4.8, 120)
	singleFive := ComputeWeightedRatingScore(5.0, 1)
	if highVol <= singleFive {
		t.Fatalf("expected 4.8x120 (%v) > 5.0x1 (%v)", highVol, singleFive)
	}

	summary := CalculateRatingSummary([]int{5, 5, 4, 3})
	if summary.Total != 4 || summary.Average != 4.3 {
		t.Fatalf("unexpected rating summary: %+v", summary)
	}
}

func TestOrderStatusTransitions(t *testing.T) {
	if !CanTransitionOrderStatus(models.OrderPending, models.OrderConfirmed) {
		t.Fatal("expected Pending -> Confirmed to be allowed")
	}
	if !CanTransitionOrderStatus(models.OrderProcessing, models.OrderCancelled) {
		t.Fatal("expected Processing -> Cancelled to be allowed")
	}
	if CanTransitionOrderStatus(models.OrderDelivered, models.OrderCancelled) {
		t.Fatal("expected Delivered -> Cancelled to be forbidden")
	}
}

func TestClampText(t *testing.T) {
	if got := ClampText("Soft cotton tee", 40); got != "Soft cotton tee" {
		t.Fatalf("short text should pass through, got %q", got)
	}
	long := "Heavyweight 300gsm organic cotton tee with an enzyme wash finish and a relaxed studio drape for everyday wear."
	got := ClampText(long, 80)
	if len([]rune(got)) > 80 {
		t.Fatalf("clamped text exceeded the rune limit: %q", got)
	}
	if got[len(got)-len("…"):] != "…" {
		t.Fatalf("clamped text should end with an ellipsis, got %q", got)
	}
	// Multi-byte characters must never be split in half.
	multi := "T-shirt élégant — coton biologique très doux pour tous les jours"
	if clipped := ClampText(multi, 25); len([]rune(clipped)) > 25 || strings.ContainsRune(clipped, '\uFFFD') {
		t.Fatalf("unexpected multi-byte clamp: %q", clipped)
	}
}

func TestOrderStatusTransitionEdgeCases(t *testing.T) {
	if !CanTransitionOrderStatus(models.OrderDelivered, models.OrderDelivered) {
		t.Fatal("same-status updates should be allowed as no-ops")
	}
	if CanTransitionOrderStatus(models.OrderStatus("Refunded"), models.OrderCancelled) {
		t.Fatal("unknown statuses must not transition")
	}
	if CanTransitionOrderStatus(models.OrderCancelled, models.OrderPending) {
		t.Fatal("cancelled orders must stay cancelled")
	}
}

func TestSlugifyProductName(t *testing.T) {
	got := SlugifyProductName("  Classic Crest Tee — 240gsm! ")
	if got != "classic-crest-tee-240gsm" {
		t.Fatalf("unexpected slug: %s", got)
	}
}
