package handlers

import (
	"net/http"
	"strings"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// SuperAdminHandler powers the /admin/super portal: platform-wide control over
// every account (buyers, sellers/admins, peers) and every product.
type SuperAdminHandler struct {
	userRepo      *repositories.UserRepository
	catalogRepo   *repositories.CatalogRepository
	analyticsRepo *repositories.AnalyticsRepository
	cloudinary    *services.CloudinaryService
}

func NewSuperAdminHandler(
	userRepo *repositories.UserRepository,
	catalogRepo *repositories.CatalogRepository,
	analyticsRepo *repositories.AnalyticsRepository,
	cloudinary *services.CloudinaryService,
) *SuperAdminHandler {
	return &SuperAdminHandler{
		userRepo:      userRepo,
		catalogRepo:   catalogRepo,
		analyticsRepo: analyticsRepo,
		cloudinary:    cloudinary,
	}
}

// Overview returns platform counts for the super administrator dashboard.
func (h *SuperAdminHandler) Overview(w http.ResponseWriter, r *http.Request) {
	customers, _ := h.userRepo.CountByRole(r.Context(), models.RoleCustomer)
	admins, _ := h.userRepo.CountByRole(r.Context(), models.RoleAdmin)
	superAdmins, _ := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
	pendingSellers, _ := h.userRepo.CountPendingSellers(r.Context())
	analytics, err := h.analyticsRepo.GetAnalytics(r.Context())
	if err != nil {
		analytics = &models.AnalyticsData{}
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"totalCustomers":   customers,
		"totalAdmins":      admins,
		"totalSuperAdmins": superAdmins,
		"totalUsers":       customers + admins + superAdmins,
		"pendingSellers":   pendingSellers,
		"superAdminLimit":  models.MaxSuperAdmins,
		"analytics":        analytics,
	})
}

func (h *SuperAdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	users, err := h.userRepo.ListAllUsers(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load users.")
		return
	}
	if search == "" {
		WriteJSON(w, http.StatusOK, map[string]interface{}{"users": users})
		return
	}
	filtered := make([]models.User, 0, len(users))
	for _, u := range users {
		hay := strings.ToLower(u.Name + " " + u.Email + " " + u.Phone + " " + string(u.Role))
		if strings.Contains(hay, search) {
			filtered = append(filtered, u)
		}
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"users": filtered})
}

// UpdateUserRole promotes or demotes any account. The last super administrator
// cannot be demoted, so the platform always keeps an owner.
func (h *SuperAdminHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	userID := strings.TrimSpace(r.PathValue("id"))

	var body struct {
		Role string `json:"role"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid role payload.")
		return
	}
	role := models.UserRole(strings.TrimSpace(body.Role))
	if !models.IsValidRole(role) {
		WriteError(w, http.StatusBadRequest, "Role must be customer, seller (admin), or super_admin.")
		return
	}
	if role == models.RoleSuperAdmin {
		count, _ := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
		if count >= models.MaxSuperAdmins {
			WriteError(w, http.StatusConflict, "The maximum of four super administrator accounts has been reached.")
			return
		}
	}

	target, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || target == nil {
		WriteError(w, http.StatusNotFound, "User not found.")
		return
	}
	if target.Role == models.RoleSuperAdmin && role != models.RoleSuperAdmin {
		count, _ := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
		if count <= 1 {
			WriteError(w, http.StatusConflict, "The last super administrator cannot be demoted.")
			return
		}
	}
	if claims != nil && claims.Sub == userID && role != models.RoleSuperAdmin {
		WriteError(w, http.StatusBadRequest, "You cannot remove your own super administrator role.")
		return
	}

	updated, err := h.userRepo.SetRole(r.Context(), userID, role)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update the user role.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": updated})
}

// ApproveSeller verifies a seller registration. Approval automatically awards
// the verified badge and unlocks the seller console.
func (h *SuperAdminHandler) ApproveSeller(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.PathValue("id"))
	target, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || target == nil {
		WriteError(w, http.StatusNotFound, "Seller not found.")
		return
	}
	if target.Role != models.RoleAdmin {
		WriteError(w, http.StatusBadRequest, "Only seller accounts need approval.")
		return
	}
	updated, err := h.userRepo.SetApproval(r.Context(), userID, models.ApprovalApproved)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to approve the seller.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": updated})
}

// RejectSeller blocks a seller registration and revokes console access.
func (h *SuperAdminHandler) RejectSeller(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.PathValue("id"))
	target, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || target == nil {
		WriteError(w, http.StatusNotFound, "Seller not found.")
		return
	}
	if target.Role != models.RoleAdmin {
		WriteError(w, http.StatusBadRequest, "Only seller accounts need approval.")
		return
	}
	updated, err := h.userRepo.SetApproval(r.Context(), userID, models.ApprovalRejected)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update the seller.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": updated})
}

func (h *SuperAdminHandler) ToggleUserDisabled(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	userID := strings.TrimSpace(r.PathValue("id"))
	if claims != nil && claims.Sub == userID {
		WriteError(w, http.StatusBadRequest, "You cannot disable your own account.")
		return
	}
	updated, err := h.userRepo.ToggleAnyDisabled(r.Context(), userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update the account.")
		return
	}
	if updated == nil {
		WriteError(w, http.StatusNotFound, "User not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"user": updated})
}

func (h *SuperAdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	userID := strings.TrimSpace(r.PathValue("id"))
	if claims != nil && claims.Sub == userID {
		WriteError(w, http.StatusBadRequest, "You cannot delete your own account.")
		return
	}
	target, err := h.userRepo.FindByID(r.Context(), userID)
	if err != nil || target == nil {
		WriteError(w, http.StatusNotFound, "User not found.")
		return
	}
	if target.Role == models.RoleSuperAdmin {
		count, _ := h.userRepo.CountByRole(r.Context(), models.RoleSuperAdmin)
		if count <= 1 {
			WriteError(w, http.StatusConflict, "The last super administrator cannot be deleted.")
			return
		}
	}
	if err := h.userRepo.DeleteUser(r.Context(), userID); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to delete the account.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *SuperAdminHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	products, _, err := h.catalogRepo.ListProducts(r.Context(), repositories.ProductQuery{
		Search:             r.URL.Query().Get("search"),
		IncludeUnpublished: true,
		Page:               1,
		Limit:              200,
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load products.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"products": products})
}

// SetProductPublished lets the platform owner hide or restore any seller's
// product without editing its catalogue details.
func (h *SuperAdminHandler) SetProductPublished(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("id"))
	target, err := h.catalogRepo.FindProductByID(r.Context(), productID)
	if err != nil || target == nil {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	var body struct {
		Published *bool `json:"published"`
	}
	if err := DecodeJSON(r, &body); err != nil || body.Published == nil {
		WriteError(w, http.StatusBadRequest, "Published state is required.")
		return
	}
	actor := "Super Administrator"
	if claims != nil && strings.TrimSpace(claims.Name) != "" {
		actor = claims.Name
	}
	updated, err := h.catalogRepo.UpdateProduct(r.Context(), target.ID, target.Stock, bson.M{"published": *body.Published}, actor)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update the product.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"product": updated})
}

func (h *SuperAdminHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	productID := strings.TrimSpace(r.PathValue("id"))
	archived, deletedImages, err := h.catalogRepo.DeleteOrArchiveProduct(r.Context(), productID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	if archived {
		WriteJSON(w, http.StatusOK, map[string]interface{}{
			"ok":       true,
			"archived": true,
			"message":  "Product archived to preserve historical order receipts.",
		})
		return
	}
	for _, imgURL := range deletedImages {
		_ = h.cloudinary.DeleteByURL(imgURL)
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "archived": false})
}
