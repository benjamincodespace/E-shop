package security

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/teestore/backend/internal/models"
)

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := HashPassword("strongpass123")
	if err != nil {
		t.Fatalf("HashPassword error: %v", err)
	}
	if !VerifyPassword("strongpass123", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("wrongpass", hash) {
		t.Fatal("expected wrong password to fail verification")
	}
}

func TestJWTIssueAndVerify(t *testing.T) {
	user := &models.User{
		IDHex: "656f1234567890abcdef1234",
		Email: "buyer@teestore.studio",
		Name:  "Jean Bosco",
		Role:  models.RoleCustomer,
	}
	secret := "test-jwt-secret-key"
	tok, err := SignToken(user, secret, "access", time.Hour)
	if err != nil {
		t.Fatalf("SignToken failed: %v", err)
	}
	claims, err := VerifyToken(tok, secret, "access")
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}
	if claims.Sub != user.IDHex || claims.Role != models.RoleCustomer {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if _, err := VerifyToken(tok, secret, "refresh"); err == nil {
		t.Fatal("expected access token to fail refresh type check")
	}
}

func TestSanitizeImageURL(t *testing.T) {
	if got := SanitizeImageURL("javascript:alert(1)"); got != "" {
		t.Fatalf("expected javascript scheme to be blocked, got %q", got)
	}
	if got := SanitizeImageURL("/images/tee.jpg"); got != "/images/tee.jpg" {
		t.Fatalf("expected local /images/ path to pass, got %q", got)
	}
	if got := SanitizeImageURL("https://res.cloudinary.com/demo/image/upload/v1/tee.jpg"); got == "" {
		t.Fatal("expected valid https Cloudinary URL to pass")
	}
}

func TestConstantTimeEqual(t *testing.T) {
	if !ConstantTimeEqual("correct-horse", "correct-horse") {
		t.Fatal("identical secrets must compare equal")
	}
	if ConstantTimeEqual("correct-horse", "correct-horsf") {
		t.Fatal("different secrets must not compare equal")
	}
	if ConstantTimeEqual("", "anything") {
		t.Fatal("empty and non-empty values must not compare equal")
	}
}

func TestVerifyCSRF(t *testing.T) {
	origins := []string{"https://eshopall.example.com"}

	safe := httptest.NewRequest(http.MethodGet, "/api/products", nil)
	if !VerifyCSRF(safe, origins) {
		t.Fatal("safe methods must not require a CSRF check")
	}

	noHeaders := httptest.NewRequest(http.MethodPost, "/api/orders", nil)
	if VerifyCSRF(noHeaders, origins) {
		t.Fatal("a POST without an origin or client header must be rejected")
	}

	requestedWith := httptest.NewRequest(http.MethodPost, "/api/orders", nil)
	requestedWith.Header.Set("X-Requested-With", "TeeStore")
	if !VerifyCSRF(requestedWith, origins) {
		t.Fatal("the same-origin client header must be accepted")
	}

	allowed := httptest.NewRequest(http.MethodPost, "/api/orders", nil)
	allowed.Header.Set("Origin", "https://eshopall.example.com/")
	if !VerifyCSRF(allowed, origins) {
		t.Fatal("an allow-listed origin must be accepted regardless of trailing slash")
	}

	evil := httptest.NewRequest(http.MethodPost, "/api/orders", nil)
	evil.Header.Set("Origin", "https://evil.example.net")
	if VerifyCSRF(evil, origins) {
		t.Fatal("a foreign origin must be rejected")
	}
}

func TestSanitizeImageURLRejectsMarkupAndLongValues(t *testing.T) {
	if got := SanitizeImageURL("https://res.cloudinary.com/demo/image/upload/v1/a b.jpg"); got != "" {
		t.Fatalf("expected spaces to be rejected, got %q", got)
	}
	if got := SanitizeImageURL("https://x.test/\"onerror=alert(1)"); got != "" {
		t.Fatalf("expected attribute-breaking characters to be rejected, got %q", got)
	}
	long := "https://x.test/" + string(make([]byte, 3000))
	if got := SanitizeImageURL(long); got != "" {
		t.Fatalf("expected over-long URLs to be rejected, got %q", got)
	}
}

func TestJWTExpiredTokenIsRejected(t *testing.T) {
	user := &models.User{IDHex: "656f1234567890abcdef1234", Role: models.RoleCustomer}
	tok, err := SignToken(user, "secret", "access", -time.Minute)
	if err != nil {
		t.Fatalf("SignToken failed: %v", err)
	}
	if _, err := VerifyToken(tok, "secret", "access"); err == nil {
		t.Fatal("expected an expired token to be rejected")
	}
	if _, err := VerifyToken(tok, "other-secret", "access"); err == nil {
		t.Fatal("expected a token signed with another secret to be rejected")
	}
}

func TestRateLimiter(t *testing.T) {
	rl := NewRateLimiter()
	for i := 0; i < 3; i++ {
		if !rl.Allow("127.0.0.1:/api/login", 3, time.Minute) {
			t.Fatalf("expected request %d to be allowed", i+1)
		}
	}
	if rl.Allow("127.0.0.1:/api/login", 3, time.Minute) {
		t.Fatal("expected 4th request within window to be rate-limited")
	}
}
