package middleware

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/security"
)

type contextKey string

const UserContextKey contextKey = "auth_user"

func GetUserClaims(ctx context.Context) *security.AuthClaims {
	val, _ := ctx.Value(UserContextKey).(*security.AuthClaims)
	return val
}

// writeJSONError keeps middleware responses machine-readable so API clients can
// surface the real reason instead of a generic status-code message.
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func WithCORS(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
		allowed := false
		for _, o := range cfg.FrontendOrigins {
			if origin != "" && strings.EqualFold(origin, o) {
				allowed = true
				break
			}
		}
		// Vary is required even for rejected origins so shared caches never serve
		// one origin's CORS response to another.
		w.Header().Add("Vary", "Origin")
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Idempotency-Key")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func WithSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		// Ignored on plain HTTP; enforced once the API is behind TLS.
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

func AttachOptionalAuth(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, _ := security.ExtractToken(r)
		if token != "" {
			if claims, err := security.VerifyToken(token, cfg.JWTSecret, "access"); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), UserContextKey, claims))
			}
		}
		next(w, r)
	}
}

func RequireAuth(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, viaCookie := security.ExtractToken(r)
		if token == "" {
			writeJSONError(w, http.StatusUnauthorized, "Authentication required")
			return
		}
		if viaCookie && !security.VerifyCSRF(r, cfg.FrontendOrigins) {
			writeJSONError(w, http.StatusForbidden, "Invalid request origin")
			return
		}
		claims, err := security.VerifyToken(token, cfg.JWTSecret, "access")
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "Session expired or invalid")
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), UserContextKey, claims))
		next(w, r)
	}
}

func RequireAdmin(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return RequireAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserClaims(r.Context())
		if claims == nil || !claims.Role.IsAdminRole() {
			writeJSONError(w, http.StatusForbidden, "Seller permissions required")
			return
		}
		// Unverified sellers may still work inside their console, but with the
		// free upload allowance enforced by the handlers.
		next(w, r)
	})
}

// RequireVerifiedAdmin is for seller capabilities that stay locked until a
// super administrator verifies the account (for example the user directory).
func RequireVerifiedAdmin(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return RequireAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserClaims(r.Context())
		if claims == nil || !claims.Role.IsAdminRole() {
			writeJSONError(w, http.StatusForbidden, "Seller permissions required")
			return
		}
		if claims.Role == models.RoleAdmin && !claims.Approved {
			writeJSONError(w, http.StatusForbidden, "Verify your seller account to unlock this feature")
			return
		}
		next(w, r)
	})
}

// RequireSuperAdmin limits platform-wide user and product control to the super
// administrator account created through the /admin/super portal.
func RequireSuperAdmin(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return RequireAuth(cfg, func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserClaims(r.Context())
		if claims == nil || claims.Role != models.RoleSuperAdmin {
			writeJSONError(w, http.StatusForbidden, "Super administrator permissions required")
			return
		}
		next(w, r)
	})
}

func RateLimit(rl *security.RateLimiter, maxReq int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.Header.Get("CF-Connecting-IP")
		if ip == "" {
			ip = strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]
		}
		if ip == "" {
			host, _, err := net.SplitHostPort(r.RemoteAddr)
			if err == nil {
				ip = host
			} else {
				ip = r.RemoteAddr
			}
		}
		key := strings.TrimSpace(ip) + ":" + r.URL.Path
		if !rl.Allow(key, maxReq, window) {
			writeJSONError(w, http.StatusTooManyRequests, "Too many requests. Please wait a moment and try again.")
			return
		}
		next(w, r)
	}
}
