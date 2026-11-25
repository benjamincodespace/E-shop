package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
)

type OrderHandler struct {
	orderRepo *repositories.OrderRepository
}

func NewOrderHandler(orderRepo *repositories.OrderRepository) *OrderHandler {
	return &OrderHandler{orderRepo: orderRepo}
}

func (h *OrderHandler) GetCart(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	items, err := h.orderRepo.GetCartItems(r.Context(), claims.Sub)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load cart.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *OrderHandler) AddToCart(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var body struct {
		ProductID string `json:"productId"`
		Size      string `json:"size"`
		Color     string `json:"color"`
		Quantity  int    `json:"quantity"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid cart item.")
		return
	}
	if body.Size == "" {
		body.Size = "M"
	}
	if body.Color == "" {
		body.Color = "Black"
	}
	if body.Quantity < 1 {
		body.Quantity = 1
	}

	err := h.orderRepo.UpsertCartItem(r.Context(), claims.Sub, body.ProductID, body.Size, body.Color, body.Quantity, false)
	if errors.Is(err, repositories.ErrProductUnavailable) {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	if errors.Is(err, repositories.ErrInsufficientStock) {
		WriteError(w, http.StatusBadRequest, "This T-shirt is currently out of stock.")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update cart.")
		return
	}
	items, _ := h.orderRepo.GetCartItems(r.Context(), claims.Sub)
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *OrderHandler) SyncCart(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var body struct {
		Items []struct {
			ProductID string `json:"productId"`
			Size      string `json:"size"`
			Color     string `json:"color"`
			Quantity  int    `json:"quantity"`
		} `json:"items"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid sync payload.")
		return
	}
	for _, it := range body.Items {
		sz := it.Size
		if sz == "" {
			sz = "M"
		}
		col := it.Color
		if col == "" {
			col = "Black"
		}
		qty := it.Quantity
		if qty < 1 {
			qty = 1
		}
		_ = h.orderRepo.UpsertCartItem(r.Context(), claims.Sub, it.ProductID, sz, col, qty, true)
	}
	items, _ := h.orderRepo.GetCartItems(r.Context(), claims.Sub)
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *OrderHandler) UpdateCartItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("productId"))
	var body struct {
		Size     string `json:"size"`
		Color    string `json:"color"`
		Quantity int    `json:"quantity"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid cart update.")
		return
	}
	if body.Size == "" {
		body.Size = "M"
	}
	if body.Color == "" {
		body.Color = "Black"
	}
	err := h.orderRepo.UpdateCartQty(r.Context(), claims.Sub, productID, body.Size, body.Color, body.Quantity)
	if errors.Is(err, repositories.ErrProductUnavailable) {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update cart quantity.")
		return
	}
	items, _ := h.orderRepo.GetCartItems(r.Context(), claims.Sub)
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *OrderHandler) RemoveCartItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("productId"))
	size := r.URL.Query().Get("size")
	color := r.URL.Query().Get("color")
	if err := h.orderRepo.RemoveCartItem(r.Context(), claims.Sub, productID, size, color); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to remove item.")
		return
	}
	items, _ := h.orderRepo.GetCartItems(r.Context(), claims.Sub)
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *OrderHandler) GetWishlist(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	prods, err := h.orderRepo.GetWishlistProducts(r.Context(), claims.Sub)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load wishlist.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"products": prods})
}

func (h *OrderHandler) AddWishlist(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("productId"))
	if err := h.orderRepo.AddWishlist(r.Context(), claims.Sub, productID); err != nil {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

func (h *OrderHandler) RemoveWishlist(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("productId"))
	_ = h.orderRepo.RemoveWishlist(r.Context(), claims.Sub, productID)
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var body struct {
		CustomerName  string                           `json:"customerName"`
		Phone         string                           `json:"phone"`
		Address       string                           `json:"address"`
		Notes         string                           `json:"notes"`
		PaymentMethod string                           `json:"paymentMethod"`
		Items         []repositories.CheckoutLineInput `json:"items"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid checkout request.")
		return
	}

	name := strings.TrimSpace(body.CustomerName)
	phone := strings.TrimSpace(body.Phone)
	addr := strings.TrimSpace(body.Address)
	pm := strings.TrimSpace(body.PaymentMethod)
	if pm == "" {
		pm = "Cash on Delivery"
	}

	if len(name) < 2 {
		WriteError(w, http.StatusBadRequest, "Customer full name is required.")
		return
	}
	if len(phone) < 6 {
		WriteError(w, http.StatusBadRequest, "Valid phone number is required.")
		return
	}
	if len(addr) < 5 {
		WriteError(w, http.StatusBadRequest, "Delivery address is required.")
		return
	}
	if len(body.Items) == 0 {
		WriteError(w, http.StatusBadRequest, "Your cart is empty.")
		return
	}

	order, err := h.orderRepo.PlaceOrderAtomic(r.Context(), repositories.CheckoutInput{
		UserID:        claims.Sub,
		CustomerEmail: claims.Email,
		CustomerName:  name,
		Phone:         phone,
		Address:       addr,
		Notes:         strings.TrimSpace(body.Notes),
		PaymentMethod: pm,
		Items:         body.Items,
	})
	if err != nil {
		if errors.Is(err, repositories.ErrInsufficientStock) {
			WriteError(w, http.StatusConflict, err.Error())
			return
		}
		if errors.Is(err, repositories.ErrProductUnavailable) {
			WriteError(w, http.StatusBadRequest, "One or more cart items are no longer available.")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Failed to place order.")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]interface{}{"order": order})
}

func (h *OrderHandler) MyOrders(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	orders, err := h.orderRepo.ListOrdersByUser(r.Context(), claims.Sub)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load orders.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"orders": orders})
}

func (h *OrderHandler) AdminListOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	search := r.URL.Query().Get("search")
	orders, err := h.orderRepo.ListAdminOrders(r.Context(), status, search)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load orders.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"orders": orders})
}

func (h *OrderHandler) AdminUpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	orderID := strings.TrimSpace(r.PathValue("id"))
	var body struct {
		Status models.OrderStatus `json:"status"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid order status update.")
		return
	}

	valid := false
	for _, s := range models.ValidOrderStatuses {
		if s == body.Status {
			valid = true
			break
		}
	}
	if !valid {
		WriteError(w, http.StatusBadRequest, "Invalid order status.")
		return
	}

	order, err := h.orderRepo.UpdateOrderStatusAtomic(r.Context(), orderID, body.Status, claims.Name)
	if err != nil {
		if errors.Is(err, repositories.ErrInvalidTransition) {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Order not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"order": order})
}
