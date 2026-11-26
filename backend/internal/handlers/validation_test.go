package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
)

func TestNormalizePhone(t *testing.T) {
	cases := map[string]string{
		"+1 (415) 555-0142": "+14155550142",
		"+250788123456":     "+250788123456",
		"0788123456":        "0788123456",
		"   ":               "",
		"abc":               "",
		"+":                 "",
	}
	for input, want := range cases {
		if got := normalizePhone(input); got != want {
			t.Errorf("normalizePhone(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestValidPhone(t *testing.T) {
	if !validPhone("+14155550142") {
		t.Fatal("expected a 10-digit E.164 number to be valid")
	}
	if validPhone("14155550142") {
		t.Fatal("numbers without a leading + must be rejected")
	}
	if validPhone("+123456") {
		t.Fatal("fewer than 7 digits must be rejected")
	}
	if validPhone("+1234567890123456") {
		t.Fatal("more than 15 digits must be rejected")
	}
}

func TestNormalizeGender(t *testing.T) {
	valid := map[string]string{
		"":                  "",
		" Male ":            "male",
		"F":                 "female",
		"prefer not to say": "prefer_not_to_say",
		"unspecified":       "prefer_not_to_say",
	}
	for input, want := range valid {
		got, ok := normalizeGender(input)
		if !ok || got != want {
			t.Errorf("normalizeGender(%q) = (%q, %v), want (%q, true)", input, got, ok, want)
		}
	}
	if _, ok := normalizeGender("other"); ok {
		t.Fatal("unsupported gender values must be rejected")
	}
}

func TestValidateReviewInput(t *testing.T) {
	if _, msg := validateReviewInput(0, "nice"); msg == "" {
		t.Fatal("rating below 1 must be rejected")
	}
	if _, msg := validateReviewInput(6, "nice"); msg == "" {
		t.Fatal("rating above 5 must be rejected")
	}
	if _, msg := validateReviewInput(4, "hi"); msg == "" {
		t.Fatal("comments shorter than 3 runes must be rejected")
	}
	if comment, msg := validateReviewInput(4, "   "); msg != "" || comment != "" {
		t.Fatalf("blank comments are allowed and trimmed, got (%q, %q)", comment, msg)
	}
	if _, msg := validateReviewInput(4, strings.Repeat("a", 1001)); msg == "" {
		t.Fatal("comments over 1000 runes must be rejected")
	}
	if comment, msg := validateReviewInput(5, "  Great cotton  "); msg != "" || comment != "Great cotton" {
		t.Fatalf("unexpected valid review result: (%q, %q)", comment, msg)
	}
}

func TestNormalizeCheckoutItems(t *testing.T) {
	if _, msg := normalizeCheckoutItems(nil); msg == "" {
		t.Fatal("an empty cart must be rejected")
	}

	// Defaults are applied and duplicate size/color lines are merged rather
	// than rejected, so older clients keep working.
	items, msg := normalizeCheckoutItems([]repositories.CheckoutLineInput{
		{ProductID: "p1", Quantity: 1},
		{ProductID: "p1", Size: "M", Color: "Black", Quantity: 2},
	})
	if msg != "" {
		t.Fatalf("unexpected validation message: %s", msg)
	}
	if len(items) != 1 || items[0].Quantity != 3 || items[0].Size != "M" || items[0].Color != "Black" {
		t.Fatalf("duplicate lines were not merged correctly: %+v", items)
	}

	if _, msg := normalizeCheckoutItems([]repositories.CheckoutLineInput{{ProductID: "p1", Quantity: 0}}); msg == "" {
		t.Fatal("zero quantity must be rejected")
	}
	if _, msg := normalizeCheckoutItems([]repositories.CheckoutLineInput{{ProductID: "p1", Quantity: maxLineQuantity + 1}}); msg == "" {
		t.Fatal("oversized quantity must be rejected")
	}
	if _, msg := normalizeCheckoutItems([]repositories.CheckoutLineInput{{Quantity: 1}}); msg == "" {
		t.Fatal("a missing product id must be rejected")
	}
	if _, msg := normalizeCheckoutItems([]repositories.CheckoutLineInput{{ProductID: "p1", Size: strings.Repeat("x", 25), Quantity: 1}}); msg == "" {
		t.Fatal("oversized size labels must be rejected")
	}
}

func TestNormalizeDeliveryAddress(t *testing.T) {
	if address, msg := normalizeDeliveryAddress(nil); address != nil || msg != "" {
		t.Fatalf("nil address should pass through, got (%+v, %q)", address, msg)
	}

	if _, msg := normalizeDeliveryAddress(&models.DeliveryAddress{City: "Kigali", Street: "KG 11 Ave"}); msg == "" {
		t.Fatal("a missing country must be rejected")
	}

	lat, lng := -1.9441, 30.0619
	address, msg := normalizeDeliveryAddress(&models.DeliveryAddress{
		Country:   " RW ",
		City:      " Kigali ",
		Street:    " KG 11 Ave ",
		Latitude:  &lat,
		Longitude: &lng,
	})
	if msg != "" {
		t.Fatalf("unexpected validation message: %s", msg)
	}
	if address.Country != "RW" || address.City != "Kigali" || address.Street != "KG 11 Ave" {
		t.Fatalf("address was not trimmed: %+v", address)
	}
	if address.Latitude == nil || *address.Latitude != lat {
		t.Fatal("coordinates were not preserved")
	}

	if _, msg := normalizeDeliveryAddress(&models.DeliveryAddress{
		Country: "RW", City: "Kigali", Street: "KG 11 Ave", Latitude: &lat,
	}); msg == "" {
		t.Fatal("a half-specified pin must be rejected")
	}

	badLat := 120.0
	if _, msg := normalizeDeliveryAddress(&models.DeliveryAddress{
		Country: "RW", City: "Kigali", Street: "KG 11 Ave", Latitude: &badLat, Longitude: &lng,
	}); msg == "" {
		t.Fatal("out-of-range coordinates must be rejected")
	}
}

func TestDecodeJSONRejectsOversizedBody(t *testing.T) {
	// DecodeJSON caps request bodies at 2MB; anything larger must error instead
	// of being buffered without limit.
	body := `{"name":"` + strings.Repeat("a", 3<<20) + `"}`
	req := httptest.NewRequest("POST", "/api/orders", strings.NewReader(body))
	var dst struct {
		Name string `json:"name"`
	}
	if err := DecodeJSON(req, &dst); err == nil {
		t.Fatal("expected an oversized body to be rejected")
	}
}
