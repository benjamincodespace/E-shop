package handlers

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
	"github.com/teestore/backend/internal/security"
)

type AuthHandler struct {
	cfg      *config.Config
	userRepo *repositories.UserRepository
}

func NewAuthHandler(cfg *config.Config, userRepo *repositories.UserRepository) *AuthHandler {
	return &AuthHandler{cfg: cfg, userRepo: userRepo}
}

func (h *AuthHandler) signSessionCookies(w http.ResponseWriter, r *http.Request, user *models.User) (string, bool) {
	access, err := security.SignToken(user, h.cfg.JWTSecret, "access", 7*24*time.Hour)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to issue session token.")
		return "", false
	}
	refresh, err := security.SignToken(user, h.cfg.JWTRefreshSecret, "refresh", 30*24*time.Hour)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to issue refresh token.")
		return "", false
	}
	security.SetSessionCookies(w, r, access, refresh, h.cfg.IsProduction())
	return access, true
}

func (h *AuthHandler) issueAuthResponse(w http.ResponseWriter, r *http.Request, status int, user *models.User, purchased []string) {
	access, ok := h.signSessionCookies(w, r, user)
	if !ok {
		return
	}
	WriteJSON(w, status, map[string]interface{}{
		"user":                user,
		"token":               access,
		"purchasedProductIds": purchased,
	})
}

// userFromRefreshCookie resolves the long-lived refresh cookie when the short-lived
// access cookie is missing or expired, so a valid session is not dropped silently.
func (h *AuthHandler) userFromRefreshCookie(r *http.Request) *models.User {
	cookie, err := r.Cookie(security.RefreshCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return nil
	}
	claims, err := security.VerifyToken(strings.TrimSpace(cookie.Value), h.cfg.JWTRefreshSecret, "refresh")
	if err != nil {
		return nil
	}
	user, err := h.userRepo.FindByID(r.Context(), claims.Sub)
	if err != nil || user == nil || user.Disabled {
		return nil
	}
	return user
}

func (h *AuthHandler) AdminStatus(w http.ResponseWriter, r *http.Request) {
	cnt, err := h.userRepo.CountAdmins(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Unable to inspect admin status.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"claimed":            cnt > 0,
		"passcodeConfigured": h.cfg.AdminPasscode != "",
	})
}

func (h *AuthHandler) ClaimAdmin(w http.ResponseWriter, r *http.Request) {
	cnt, err := h.userRepo.CountAdmins(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to verify admin setup state.")
		return
	}
	if cnt > 0 {
		WriteError(w, http.StatusConflict, "Admin account has already been configured. Please sign in.")
		return
	}

	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Passcode string `json:"passcode"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	passcode := strings.TrimSpace(body.Passcode)

	if h.cfg.AdminPasscode != "" && passcode != h.cfg.AdminPasscode {
		WriteError(w, http.StatusForbidden, "Invalid admin setup passcode.")
		return
	}
	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Please enter your full name.")
		return
	}
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid admin email address.")
		return
	}
	if len(body.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "Admin password must be at least 8 characters.")
		return
	}

	existing, _ := h.userRepo.FindByEmail(r.Context(), email)
	if existing != nil {
		WriteError(w, http.StatusConflict, "An account with this email already exists.")
		return
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure admin credentials.")
		return
	}

	user := &models.User{
		Name:         name,
		Email:        email,
		PasswordHash: hash,
		Role:         models.RoleAdmin,
	}
	if err := h.userRepo.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create admin account.")
		return
	}

	h.issueAuthResponse(w, r, http.StatusCreated, user, []string{})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Phone    string `json:"phone"`
		Address  string `json:"address"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid registration payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Name must be at least 2 characters.")
		return
	}
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid email address.")
		return
	}
	if len(body.Password) < 6 {
		WriteError(w, http.StatusBadRequest, "Password must be at least 6 characters.")
		return
	}

	existing, _ := h.userRepo.FindByEmail(r.Context(), email)
	if existing != nil {
		WriteError(w, http.StatusConflict, "An account with this email already exists.")
		return
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure password.")
		return
	}

	user := &models.User{
		Name:         name,
		Email:        email,
		PasswordHash: hash,
		Phone:        strings.TrimSpace(body.Phone),
		Address:      strings.TrimSpace(body.Address),
		Role:         models.RoleCustomer,
	}
	if err := h.userRepo.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Registration failed.")
		return
	}

	h.issueAuthResponse(w, r, http.StatusCreated, user, []string{})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Portal   string `json:"portal"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid sign-in payload.")
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	portal := "customer"
	if body.Portal == "admin" {
		portal = "admin"
	}
	if email == "" || body.Password == "" {
		WriteError(w, http.StatusBadRequest, "Email and password are required.")
		return
	}

	user, err := h.userRepo.FindByEmail(r.Context(), email)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Sign-in lookup failed.")
		return
	}

	if portal == "admin" && h.cfg.AdminPasscode != "" && body.Password == h.cfg.AdminPasscode {
		if user != nil && user.Role == models.RoleAdmin {
			if user.Disabled {
				WriteError(w, http.StatusForbidden, "This account has been disabled.")
				return
			}
			purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
			h.issueAuthResponse(w, r, http.StatusOK, user, purchased)
			return
		}
		if user == nil {
			hash, _ := security.HashPassword(body.Password)
			created := &models.User{
				Name:         "Store Admin",
				Email:        email,
				PasswordHash: hash,
				Role:         models.RoleAdmin,
			}
			if err := h.userRepo.CreateUser(r.Context(), created); err != nil {
				WriteError(w, http.StatusInternalServerError, "Failed to initialize admin session.")
				return
			}
			h.issueAuthResponse(w, r, http.StatusOK, created, []string{})
			return
		}
	}

	if user == nil || !security.VerifyPassword(body.Password, user.PasswordHash) {
		WriteError(w, http.StatusUnauthorized, "Invalid email or password.")
		return
	}
	if user.Disabled {
		WriteError(w, http.StatusForbidden, "This account has been disabled by an administrator.")
		return
	}
	if portal == "admin" && user.Role != models.RoleAdmin {
		WriteError(w, http.StatusForbidden, "Administrator credentials are required for the Admin Panel.")
		return
	}

	purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
	h.issueAuthResponse(w, r, http.StatusOK, user, purchased)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	if !security.VerifyCSRF(r, h.cfg.FrontendOrigins) {
		WriteError(w, http.StatusForbidden, "Invalid request origin.")
		return
	}
	cookie, err := r.Cookie(security.RefreshCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		WriteError(w, http.StatusUnauthorized, "Refresh token missing.")
		return
	}
	claims, err := security.VerifyToken(cookie.Value, h.cfg.JWTRefreshSecret, "refresh")
	if err != nil {
		security.ClearSessionCookies(w, r, h.cfg.IsProduction())
		WriteError(w, http.StatusUnauthorized, "Refresh token invalid.")
		return
	}
	user, err := h.userRepo.FindByID(r.Context(), claims.Sub)
	if err != nil || user == nil || user.Disabled {
		security.ClearSessionCookies(w, r, h.cfg.IsProduction())
		WriteError(w, http.StatusUnauthorized, "Account unavailable.")
		return
	}
	purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
	h.issueAuthResponse(w, r, http.StatusOK, user, purchased)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	security.ClearSessionCookies(w, r, h.cfg.IsProduction())
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AuthHandler) Session(w http.ResponseWriter, r *http.Request) {
	extraCookiesNeeded := false
	var user *models.User

	if claims := middleware.GetUserClaims(r.Context()); claims != nil {
		if found, err := h.userRepo.FindByID(r.Context(), claims.Sub); err == nil && found != nil && !found.Disabled {
			user = found
		}
	}

	if user == nil {
		if found := h.userFromRefreshCookie(r); found != nil {
			user = found
			extraCookiesNeeded = true
		}
	}

	if user == nil {
		if _, err := r.Cookie(security.SessionCookieName); err == nil {
			security.ClearSessionCookies(w, r, h.cfg.IsProduction())
		} else if _, err := r.Cookie(security.RefreshCookieName); err == nil {
			security.ClearSessionCookies(w, r, h.cfg.IsProduction())
		}
		WriteJSON(w, http.StatusOK, map[string]interface{}{
			"authenticated":       false,
			"user":                nil,
			"purchasedProductIds": []string{},
		})
		return
	}

	if extraCookiesNeeded {
		if _, ok := h.signSessionCookies(w, r, user); !ok {
			return
		}
	}

	purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"authenticated":       true,
		"user":                user,
		"purchasedProductIds": purchased,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	user, err := h.userRepo.FindByID(r.Context(), claims.Sub)
	if err != nil || user == nil || user.Disabled {
		security.ClearSessionCookies(w, r, h.cfg.IsProduction())
		WriteError(w, http.StatusUnauthorized, "Account unavailable.")
		return
	}
	purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user":                user,
		"purchasedProductIds": purchased,
	})
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var body struct {
		Name    string `json:"name"`
		Phone   string `json:"phone"`
		Address string `json:"address"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid profile update payload.")
		return
	}
	name := strings.TrimSpace(body.Name)
	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Name must be at least 2 characters.")
		return
	}
	user, err := h.userRepo.UpdateProfile(r.Context(), claims.Sub, name, strings.TrimSpace(body.Phone), strings.TrimSpace(body.Address))
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update profile.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": user})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please provide a valid email address.")
		return
	}

	user, _ := h.userRepo.FindByEmail(r.Context(), email)
	if user == nil || user.Role != models.RoleCustomer {
		WriteJSON(w, http.StatusOK, map[string]string{
			"message": "If an account matches that email, a password reset code has been generated.",
		})
		return
	}

	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	code := fmt.Sprintf("%06d", 100000+n.Int64())
	_ = h.userRepo.SetResetCode(r.Context(), user.ID, code, time.Now().UTC().Add(15*time.Minute))

	resp := map[string]interface{}{
		"message": "Verification reset code generated. Enter the 6-digit code below to set a new password.",
	}
	if !h.cfg.IsProduction() {
		resp["previewResetCode"] = code
	}
	WriteJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	code := strings.TrimSpace(body.Code)
	if email == "" || code == "" || len(body.NewPassword) < 6 {
		WriteError(w, http.StatusBadRequest, "Email, 6-digit code, and a new password (6+ characters) are required.")
		return
	}

	user, _ := h.userRepo.FindByEmail(r.Context(), email)
	if user == nil || user.ResetCode == "" || user.ResetCode != code {
		WriteError(w, http.StatusBadRequest, "Invalid reset code.")
		return
	}
	if user.ResetExpiresAt == nil || user.ResetExpiresAt.Before(time.Now().UTC()) {
		WriteError(w, http.StatusBadRequest, "Reset code has expired.")
		return
	}

	hash, err := security.HashPassword(body.NewPassword)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update password.")
		return
	}
	if err := h.userRepo.UpdatePasswordClearReset(r.Context(), user.ID, hash); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update password.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Password updated. You can now sign in with your new password.",
	})
}
