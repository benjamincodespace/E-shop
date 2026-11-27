package handlers

import (
	"net/http"
	"strings"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
)

type AdminHandler struct {
	analyticsRepo *repositories.AnalyticsRepository
	catalogRepo   *repositories.CatalogRepository
	userRepo      *repositories.UserRepository
	orderRepo     *repositories.OrderRepository
}

func NewAdminHandler(
	analyticsRepo *repositories.AnalyticsRepository,
	catalogRepo *repositories.CatalogRepository,
	userRepo *repositories.UserRepository,
	orderRepo *repositories.OrderRepository,
) *AdminHandler {
	return &AdminHandler{
		analyticsRepo: analyticsRepo,
		catalogRepo:   catalogRepo,
		userRepo:      userRepo,
		orderRepo:     orderRepo,
	}
}

func (h *AdminHandler) Health(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var data *models.AnalyticsData
	var err error
	if claims != nil && claims.Role == models.RoleAdmin {
		// Sellers see statistics for their own catalogue only; the platform
		// owner keeps the full picture.
		data, err = h.analyticsRepo.GetSellerAnalytics(r.Context(), claims.Sub)
	} else {
		data, err = h.analyticsRepo.GetAnalytics(r.Context())
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to aggregate analytics.")
		return
	}
	WriteJSON(w, http.StatusOK, data)
}

func (h *AdminHandler) GetInventory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	products, logs, err := h.catalogRepo.ListInventory(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load inventory.")
		return
	}
	if claims != nil && claims.Role == models.RoleAdmin {
		// A seller only sees stock for its own products and their audit trail.
		own := make([]models.Product, 0, len(products))
		ownedIDs := make(map[string]bool)
		for _, p := range products {
			if p.SellerID == claims.Sub {
				own = append(own, p)
				ownedIDs[p.IDHex] = true
			}
		}
		filteredLogs := make([]models.InventoryLog, 0, len(logs))
		for _, l := range logs {
			if ownedIDs[l.ProductIDHex] {
				filteredLogs = append(filteredLogs, l)
			}
		}
		products, logs = own, filteredLogs
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"products": products,
		"logs":     logs,
	})
}

func (h *AdminHandler) AdjustInventory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("productId"))
	var body struct {
		Mode   string `json:"mode"`
		Value  int    `json:"value"`
		Reason string `json:"reason"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid inventory adjustment.")
		return
	}
	if claims.Role == models.RoleAdmin {
		product, err := h.catalogRepo.FindProductByID(r.Context(), productID)
		if err != nil || product == nil {
			WriteError(w, http.StatusNotFound, "Product not found.")
			return
		}
		if product.SellerID != claims.Sub {
			WriteError(w, http.StatusForbidden, "You can only adjust stock for your own products.")
			return
		}
	}
	mode := "set"
	if body.Mode == "delta" {
		mode = "delta"
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		reason = "Manual inventory adjustment"
	}
	updated, err := h.catalogRepo.AdjustInventory(r.Context(), productID, mode, body.Value, reason, claims.Name)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"product": updated})
}

func (h *AdminHandler) ListCustomers(w http.ResponseWriter, r *http.Request) {
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	all, err := h.userRepo.ListCustomersWithStats(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load customers.")
		return
	}
	if search == "" {
		WriteJSON(w, http.StatusOK, map[string]interface{}{"customers": all})
		return
	}
	var filtered []models.CustomerSummary
	for _, c := range all {
		hay := strings.ToLower(c.Name + " " + c.Email + " " + c.Phone)
		if strings.Contains(hay, search) {
			filtered = append(filtered, c)
		}
	}
	if filtered == nil {
		filtered = []models.CustomerSummary{}
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"customers": filtered})
}

func (h *AdminHandler) CustomerOrders(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.PathValue("id"))
	orders, err := h.orderRepo.ListOrdersByUser(r.Context(), userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load customer orders.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"orders": orders})
}

func (h *AdminHandler) ToggleCustomerDisabled(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.PathValue("id"))
	updated, err := h.userRepo.ToggleDisabled(r.Context(), userID)
	if err != nil || updated == nil {
		WriteError(w, http.StatusNotFound, "Customer not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"customer": updated})
}

func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.analyticsRepo.GetSettings(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load settings.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"settings": settings})
}

func (h *AdminHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid settings payload.")
		return
	}
	settings, err := h.analyticsRepo.UpdateSettings(r.Context(), body)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to save settings.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"settings": settings})
}

func (h *AdminHandler) SubscribeNewsletter(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid newsletter payload.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "Please enter a valid email address.")
		return
	}
	if err := h.analyticsRepo.SubscribeNewsletter(r.Context(), email); err != nil {
		WriteError(w, http.StatusInternalServerError, "Subscription failed.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"message": "Subscribed to E-shop drops and updates.",
	})
}
