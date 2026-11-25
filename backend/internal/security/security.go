package security

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/teestore/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

const (
	SessionCookieName = "teestore_session"
	RefreshCookieName = "teestore_refresh"
)

type AuthClaims struct {
	Sub   string          `json:"sub"`
	Email string          `json:"email"`
	Name  string          `json:"name"`
	Role  models.UserRole `json:"role"`
	Type  string          `json:"type"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func VerifyPassword(password, hash string) bool {
	if hash == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func SignToken(user *models.User, secret string, tokenType string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := AuthClaims{
		Sub:   user.IDHex,
		Email: user.Email,
		Name:  user.Name,
		Role:  user.Role,
		Type:  tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.IDHex,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Issuer:    "teestore-api",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func VerifyToken(tokenStr, secret, expectedType string) (*AuthClaims, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &AuthClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*AuthClaims)
	if !ok || !parsed.Valid || claims.Type != expectedType || claims.Sub == "" {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}

func SetSessionCookies(w http.ResponseWriter, r *http.Request, accessToken, refreshToken string, isProd bool) {
	isHTTPS := isProd || r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	sameSite := http.SameSiteLaxMode
	if isHTTPS {
		sameSite = http.SameSiteNoneMode
	}

	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    accessToken,
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 7,
		HttpOnly: true,
		Secure:   isHTTPS,
		SameSite: sameSite,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Path:     "/api/auth",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: true,
		Secure:   isHTTPS,
		SameSite: sameSite,
	})
}

func ClearSessionCookies(w http.ResponseWriter, r *http.Request, isProd bool) {
	isHTTPS := isProd || r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	sameSite := http.SameSiteLaxMode
	if isHTTPS {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isHTTPS,
		SameSite: sameSite,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isHTTPS,
		SameSite: sameSite,
	})
}

func ExtractToken(r *http.Request) (token string, viaCookie bool) {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(auth, "Bearer ") {
		t := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if t != "" {
			return t, false
		}
	}
	if cookie, err := r.Cookie(SessionCookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return strings.TrimSpace(cookie.Value), true
	}
	return "", false
}

func VerifyCSRF(r *http.Request, allowedOrigins []string) bool {
	m := strings.ToUpper(r.Method)
	if m != http.MethodPost && m != http.MethodPut && m != http.MethodPatch && m != http.MethodDelete {
		return true
	}
	if r.Header.Get("X-Requested-With") == "TeeStore" {
		return true
	}
	origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
	if origin != "" {
		for _, allowed := range allowedOrigins {
			if strings.EqualFold(origin, allowed) {
				return true
			}
		}
	}
	return false
}

func SanitizeImageURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "/images/") || strings.HasPrefix(trimmed, "/uploads/") {
		return trimmed
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	if parsed.Scheme == "https" || parsed.Scheme == "http" {
		return parsed.String()
	}
	return ""
}

type bucket struct {
	count   int
	resetAt time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{buckets: make(map[string]*bucket)}
}

func (rl *RateLimiter) Allow(key string, limit int, window time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok || !now.Before(b.resetAt) {
		rl.buckets[key] = &bucket{count: 1, resetAt: now.Add(window)}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}
