package security

import (
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
