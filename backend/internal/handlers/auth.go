package handlers

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
	"github.com/teestore/backend/internal/security"
	"github.com/teestore/backend/internal/services"
)

type AuthHandler struct {
	cfg        *config.Config
	userRepo   *repositories.UserRepository
	cloudinary *services.CloudinaryService
}

func NewAuthHandler(cfg *config.Config, userRepo *repositories.UserRepository, cloudinary *services.CloudinaryService) *AuthHandler {
	return &AuthHandler{cfg: cfg, userRepo: userRepo, cloudinary: cloudinary}
}

var (
	timingHashOnce sync.Once
	timingHash     string
)

// timingDummyHash returns a real bcrypt hash so a sign-in for an unknown
// account costs the same as a wrong password and cannot be detected by timing.
func timingDummyHash() string {
	timingHashOnce.Do(func() {
		if hash, err := security.HashPassword("timing-equalizer-not-a-password"); err == nil {
			timingHash = hash
		}
	})
	return timingHash
}

// noStore keeps authenticated responses out of shared and browser caches.
func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
}

// normalizePhone keeps a leading "+" and digits so numbers are stored and
// compared in one E.164-like format regardless of spaces or dashes.
func normalizePhone(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	var b strings.Builder
	if strings.HasPrefix(trimmed, "+") {
		b.WriteByte('+')
	}
	for _, r := range trimmed {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	normalized := b.String()
	if len(normalized) <= 1 {
		return ""
	}
	return normalized
}

// normalizeGender returns the canonical stored value and whether the input is
// acceptable. An empty selection is valid: gender is never required.
func normalizeGender(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "":
		return "", true
	case "male", "m":
		return "male", true
	case "female", "f":
		return "female", true
	case "prefer_not_to_say", "prefer-not-to-say", "prefer not to say", "unspecified":
		return "prefer_not_to_say", true
	default:
		return "", false
	}
}

func validPhone(phone string) bool {
	if !strings.HasPrefix(phone, "+") {
		return false
	}
	digits := len(phone) - 1
	return digits >= 7 && digits <= 15
}

// findByIdentifier resolves a sign-in/reset identifier that may be an email or a phone.
func (h *AuthHandler) findByIdentifier(ctx context.Context, identifier string) (*models.User, error) {
	if strings.Contains(identifier, "@") {
		return h.userRepo.FindByEmail(ctx, strings.ToLower(strings.TrimSpace(identifier)))
	}
	phone := normalizePhone(identifier)
	if phone == "" {
		return nil, nil
	}
	return h.userRepo.FindByPhone(ctx, phone)
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
	noStore(w)
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
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		Passcode  string `json:"passcode"`
		AvatarURL string `json:"avatarUrl"`
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
		AvatarURL:    security.SanitizeImageURL(body.AvatarURL),
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

// SuperAdminStatus tells the /admin/super portal whether the platform owner
// account has already been created, so it can show setup instead of sign-in.
func (h *AuthHandler) SuperAdminStatus(w http.ResponseWriter, r *http.Request) {
	cnt, err := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Unable to inspect super administrator status.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"claimed":            cnt > 0,
		"passcodeConfigured": h.cfg.AdminPasscode != "",
	})
}

// ClaimSuperAdmin creates the single platform-owner account. It mirrors the
// first-run admin claim so a fresh deployment can be secured from the portal at
// /admin/super without a manual database step.
func (h *AuthHandler) ClaimSuperAdmin(w http.ResponseWriter, r *http.Request) {
	cnt, err := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to verify super administrator setup state.")
		return
	}
	if cnt >= models.MaxSuperAdmins {
		WriteError(w, http.StatusConflict, "The maximum number of super administrator accounts has been reached.")
		return
	}
	if cnt > 0 {
		WriteError(w, http.StatusConflict, "The super administrator account already exists. Please sign in.")
		return
	}

	var body struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		Passcode  string `json:"passcode"`
		AvatarURL string `json:"avatarUrl"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if h.cfg.AdminPasscode != "" && strings.TrimSpace(body.Passcode) != h.cfg.AdminPasscode {
		WriteError(w, http.StatusForbidden, "Invalid platform setup passcode.")
		return
	}
	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Please enter the platform owner's full name.")
		return
	}
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid email address.")
		return
	}
	if len(body.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "Password must be at least 8 characters.")
		return
	}
	if existing, _ := h.userRepo.FindByEmail(r.Context(), email); existing != nil {
		WriteError(w, http.StatusConflict, "An account with this email already exists.")
		return
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure credentials.")
		return
	}

	user := &models.User{
		Name:         name,
		AvatarURL:    security.SanitizeImageURL(body.AvatarURL),
		Email:        email,
		PasswordHash: hash,
		Role:         models.RoleSuperAdmin,
	}
	if err := h.userRepo.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create the super administrator account.")
		return
	}

	h.issueAuthResponse(w, r, http.StatusCreated, user, []string{})
}

// UploadAvatar stores a profile photo for the signed-in account. Any role can
// use it: shoppers and sellers set a picture at sign-up, the platform owner at
// /admin/super.
func (h *AuthHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	claims := middleware.GetUserClaims(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Authentication required.")
		return
	}
	if !h.cloudinary.Configured() {
		WriteError(w, http.StatusServiceUnavailable, "Image storage is not configured on the API server.")
		return
	}

	const maxUploadBytes = 5 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		WriteError(w, http.StatusBadRequest, "Please upload a profile image up to 5MB.")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "No profile image was included in the upload.")
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	if !strings.HasPrefix(http.DetectContentType(head[:n]), "image/") {
		WriteError(w, http.StatusBadRequest, "Only image files (JPEG, PNG, WebP, or GIF) can be uploaded.")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		WriteError(w, http.StatusBadRequest, "Could not read the uploaded image.")
		return
	}

	url, err := h.cloudinary.UploadImage(r.Context(), header.Filename, file)
	if err != nil {
		if errors.Is(err, services.ErrCloudinaryNotConfigured) {
			WriteError(w, http.StatusServiceUnavailable, "Image storage is not configured on the API server.")
			return
		}
		WriteError(w, http.StatusBadGateway, "Profile image upload failed: "+err.Error())
		return
	}

	user, err := h.userRepo.SetAvatar(r.Context(), claims.Sub, url)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to save the profile image.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": user, "url": url})
}

// Register creates a shopper account. Only a phone number and password are
// required; name, email and address stay optional.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		Phone     string `json:"phone"`
		Address   string `json:"address"`
		Gender    string `json:"gender"`
		AvatarURL string `json:"avatarUrl"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid registration payload.")
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	phone := normalizePhone(body.Phone)
	if phone == "" {
		WriteError(w, http.StatusBadRequest, "Phone number is required.")
		return
	}
	if !validPhone(phone) {
		WriteError(w, http.StatusBadRequest, "Please enter a valid phone number including the country code.")
		return
	}
	if len(body.Password) < 6 {
		WriteError(w, http.StatusBadRequest, "Password must be at least 6 characters.")
		return
	}
	if email != "" && !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid email address.")
		return
	}
	gender, ok := normalizeGender(body.Gender)
	if !ok {
		WriteError(w, http.StatusBadRequest, "Gender must be male, female, or prefer not to say.")
		return
	}

	// Shoppers may sign up with only a phone number and password, so a friendly
	// default name is derived from the number for order receipts and the admin
	// customer list. It can be changed later from the profile.
	name := strings.TrimSpace(body.Name)
	if len(name) < 2 {
		digits := strings.TrimPrefix(phone, "+")
		if len(digits) > 4 {
			digits = digits[len(digits)-4:]
		}
		name = "Shopper " + digits
	}

	if email != "" {
		if existing, _ := h.userRepo.FindByEmail(r.Context(), email); existing != nil {
			WriteError(w, http.StatusConflict, "An account with this email already exists.")
			return
		}
	}
	if existing, _ := h.userRepo.FindByPhone(r.Context(), phone); existing != nil {
		WriteError(w, http.StatusConflict, "An account with this phone number already exists.")
		return
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure password.")
		return
	}

	user := &models.User{
		Name:         name,
		AvatarURL:    security.SanitizeImageURL(body.AvatarURL),
		Email:        email,
		PasswordHash: hash,
		Phone:        phone,
		Address:      strings.TrimSpace(body.Address),
		Gender:       gender,
		Role:         models.RoleCustomer,
	}
	if err := h.userRepo.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Registration failed.")
		return
	}

	h.issueAuthResponse(w, r, http.StatusCreated, user, []string{})
}

// RegisterSeller creates a seller (admin) account in the pending state. A
// seller can sign in immediately to see its approval status, but every product
// and console action stays blocked until a super administrator verifies it.
func (h *AuthHandler) RegisterSeller(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		Phone     string `json:"phone"`
		AvatarURL string `json:"avatarUrl"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid seller registration payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	phone := normalizePhone(body.Phone)
	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Please enter the seller or store name.")
		return
	}
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid business email address.")
		return
	}
	if phone != "" && !validPhone(phone) {
		WriteError(w, http.StatusBadRequest, "Please enter a valid phone number including the country code.")
		return
	}
	if len(body.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "Seller password must be at least 8 characters.")
		return
	}
	if existing, _ := h.userRepo.FindByEmail(r.Context(), email); existing != nil {
		WriteError(w, http.StatusConflict, "An account with this email already exists.")
		return
	}
	if phone != "" {
		if existing, _ := h.userRepo.FindByPhone(r.Context(), phone); existing != nil {
			WriteError(w, http.StatusConflict, "An account with this phone number already exists.")
			return
		}
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure password.")
		return
	}

	user := &models.User{
		Name:           name,
		AvatarURL:      security.SanitizeImageURL(body.AvatarURL),
		Email:          email,
		PasswordHash:   hash,
		Phone:          phone,
		Role:           models.RoleAdmin,
		ApprovalStatus: models.ApprovalPending,
	}
	if err := h.userRepo.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Seller registration failed.")
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

	identifier := strings.TrimSpace(body.Email)
	email := strings.ToLower(identifier)
	portal := "customer"
	switch body.Portal {
	case "admin":
		portal = "admin"
	case "super":
		// The /admin/super portal signs in with the same credentials but only
		// accepts the platform owner account.
		portal = "super"
	}
	if identifier == "" || body.Password == "" {
		WriteError(w, http.StatusBadRequest, "Email or phone number and password are required.")
		return
	}

	user, err := h.findByIdentifier(r.Context(), identifier)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Sign-in lookup failed.")
		return
	}
	if user == nil {
		// Burn the same bcrypt cost as a real check so response timing does not
		// reveal whether an account exists.
		_ = security.VerifyPassword(body.Password, timingDummyHash())
	}

	if portal == "admin" && h.cfg.AdminPasscode != "" && security.ConstantTimeEqual(body.Password, h.cfg.AdminPasscode) {
		if user != nil && user.Role.IsAdminRole() {
			if user.Disabled {
				WriteError(w, http.StatusForbidden, "This account has been disabled.")
				return
			}
			purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
			h.issueAuthResponse(w, r, http.StatusOK, user, purchased)
			return
		}
		if user == nil {
			if !strings.Contains(email, "@") {
				WriteError(w, http.StatusBadRequest, "Enter the administrator email address for this account.")
				return
			}
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
		WriteError(w, http.StatusUnauthorized, "Invalid email/phone or password.")
		return
	}
	if user.Disabled {
		WriteError(w, http.StatusForbidden, "This account has been disabled by an administrator.")
		return
	}
	if portal == "admin" && !user.Role.IsAdminRole() {
		WriteError(w, http.StatusForbidden, "Administrator credentials are required for the Admin Panel.")
		return
	}
	if portal == "super" && user.Role != models.RoleSuperAdmin {
		WriteError(w, http.StatusForbidden, "Super administrator credentials are required for this portal.")
		return
	}

	purchased, _ := h.userRepo.GetPurchasedProductIDs(r.Context(), user.IDHex)
	h.issueAuthResponse(w, r, http.StatusOK, user, purchased)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	noStore(w)
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
	noStore(w)
	security.ClearSessionCookies(w, r, h.cfg.IsProduction())
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AuthHandler) Session(w http.ResponseWriter, r *http.Request) {
	noStore(w)
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

	// A super administrator approving a seller must not require that seller to
	// sign out: refresh the cookies as soon as the approval state changes.
	if claims := middleware.GetUserClaims(r.Context()); claims != nil {
		if claims.Role != user.Role || claims.Approved != user.IsApprovedSeller() {
			extraCookiesNeeded = true
		}
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
	noStore(w)
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
	noStore(w)
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
	phone := normalizePhone(body.Phone)
	if phone != "" {
		if other, _ := h.userRepo.FindByPhone(r.Context(), phone); other != nil && other.IDHex != claims.Sub {
			WriteError(w, http.StatusConflict, "This phone number is already linked to another account.")
			return
		}
	} else if strings.TrimSpace(body.Phone) != "" {
		WriteError(w, http.StatusBadRequest, "Please enter a valid phone number including the country code.")
		return
	}
	user, err := h.userRepo.UpdateProfile(r.Context(), claims.Sub, name, phone, strings.TrimSpace(body.Address))
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update profile.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": user})
}

// SaveDeliveryAddress stores the address a signed-in customer explicitly chose
// to keep. It never touches their name, phone or any other profile field.
func (h *AuthHandler) SaveDeliveryAddress(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	claims := middleware.GetUserClaims(r.Context())
	var body struct {
		DeliveryAddress *models.DeliveryAddress `json:"deliveryAddress"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid delivery address payload.")
		return
	}
	address, message := normalizeDeliveryAddress(body.DeliveryAddress)
	if message != "" {
		WriteError(w, http.StatusBadRequest, message)
		return
	}
	if address == nil {
		WriteError(w, http.StatusBadRequest, "Delivery address is required.")
		return
	}
	user, err := h.userRepo.SetDeliveryAddress(r.Context(), claims.Sub, address)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to save delivery address.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": user})
}

// ClearDeliveryAddress removes the saved address from the profile.
func (h *AuthHandler) ClearDeliveryAddress(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	claims := middleware.GetUserClaims(r.Context())
	user, err := h.userRepo.SetDeliveryAddress(r.Context(), claims.Sub, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to clear delivery address.")
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
	identifier := strings.TrimSpace(body.Email)
	if identifier == "" {
		WriteError(w, http.StatusBadRequest, "Please provide your email address or phone number.")
		return
	}

	user, _ := h.findByIdentifier(r.Context(), identifier)
	if user == nil || user.Role != models.RoleCustomer {
		WriteJSON(w, http.StatusOK, map[string]string{
			"message": "If an account matches those details, a password reset code has been generated.",
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
	identifier := strings.TrimSpace(body.Email)
	code := strings.TrimSpace(body.Code)
	if identifier == "" || code == "" || len(body.NewPassword) < 6 {
		WriteError(w, http.StatusBadRequest, "Email or phone number, 6-digit code, and a new password (6+ characters) are required.")
		return
	}

	user, _ := h.findByIdentifier(r.Context(), identifier)
	if user == nil || user.ResetCode == "" || !security.ConstantTimeEqual(user.ResetCode, code) {
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
