package services

import "testing"

func TestNormalizeCurrency(t *testing.T) {
	cases := map[string]string{
		"usd": "USD",
		"eur": "EUR",
		"TZS": "TZS",
		"rwf": "RWF",
		"xof": "XOF",
		"":    "USD",
		"gbp": "USD",
	}
	for input, want := range cases {
		if got := NormalizeCurrency(input); got != want {
			t.Fatalf("NormalizeCurrency(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestConvertCurrency(t *testing.T) {
	if got := ConvertCurrencyRounded(26000, "TZS", "USD"); got != 10 {
		t.Fatalf("26000 TZS should convert to 10 USD, got %v", got)
	}
	if got := ConvertCurrencyRounded(10, "USD", "TZS"); got != 26000 {
		t.Fatalf("10 USD should convert to 26000 TZS, got %v", got)
	}
	if got := ConvertCurrencyRounded(10, "USD", "EUR"); got != 9.2 {
		t.Fatalf("10 USD should convert to 9.20 EUR, got %v", got)
	}
	if got := ConvertCurrencyRounded(1000, "RWF", "RWF"); got != 1000 {
		t.Fatalf("same-currency conversion should be unchanged, got %v", got)
	}
}

func TestShippingForCurrency(t *testing.T) {
	if got := FreeShippingThresholdFor("TZS"); got != 130000 {
		t.Fatalf("free shipping threshold in TZS = %v, want 130000", got)
	}
	if got := StandardShippingFeeFor("TZS"); got != 15600 {
		t.Fatalf("shipping fee in TZS = %v, want 15600", got)
	}
	fee, total := CalculateShippingAndTotalForCurrency(25000, "TZS")
	if fee != 15600 || total != 40600 {
		t.Fatalf("shipping/total in TZS = %v/%v, want 15600/40600", fee, total)
	}
	fee, total = CalculateShippingAndTotalForCurrency(130000, "TZS")
	if fee != 0 || total != 130000 {
		t.Fatalf("free shipping above threshold = %v/%v, want 0/130000", fee, total)
	}
}
