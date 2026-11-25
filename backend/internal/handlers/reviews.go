package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
)

type ReviewHandler struct {
	reviewRepo *repositories.ReviewRepository
}

func NewReviewHandler(reviewRepo *repositories.ReviewRepository) *ReviewHandler {
	return &ReviewHandler{reviewRepo: reviewRepo}
}

func (h *ReviewHandler) ListProductReviews(w http.ResponseWriter, r *http.Request) {
	productID := strings.TrimSpace(r.PathValue("id"))
	userHex := ""
	if claims := middleware.GetUserClaims(r.Context()); claims != nil {
		userHex = claims.Sub
	}
	reviews, summary, err := h.reviewRepo.ListByProduct(r.Context(), productID, userHex)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"reviews":       reviews,
		"ratingSummary": summary,
	})
}

func (h *ReviewHandler) MyReviews(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviews, err := h.reviewRepo.ListByUser(r.Context(), claims.Sub)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"reviews": reviews})
}

func (h *ReviewHandler) CreateReview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	productID := strings.TrimSpace(r.PathValue("id"))
	var body struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid review payload.")
		return
	}
	comment := strings.TrimSpace(body.Comment)
	if body.Rating < 1 || body.Rating > 5 {
		WriteError(w, http.StatusBadRequest, "Rating must be between 1 and 5 stars.")
		return
	}
	if len(comment) < 3 {
		WriteError(w, http.StatusBadRequest, "Please write a short comment (at least 3 characters).")
		return
	}

	rev, err := h.reviewRepo.CreateVerifiedReview(r.Context(), productID, claims.Sub, claims.Name, body.Rating, comment)
	if err != nil {
		if errors.Is(err, repositories.ErrPurchaseRequired) {
			WriteError(w, http.StatusForbidden, "Only customers who have purchased this T-shirt can submit a verified review.")
			return
		}
		if errors.Is(err, repositories.ErrDuplicateReview) {
			WriteError(w, http.StatusConflict, "You have already reviewed this product. You can edit your existing review instead.")
			return
		}
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]interface{}{"review": rev})
}

func (h *ReviewHandler) UpdateReview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviewID := strings.TrimSpace(r.PathValue("id"))
	var body struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid review update.")
		return
	}
	comment := strings.TrimSpace(body.Comment)
	if body.Rating < 1 || body.Rating > 5 {
		WriteError(w, http.StatusBadRequest, "Rating must be between 1 and 5 stars.")
		return
	}
	if len(comment) < 3 {
		WriteError(w, http.StatusBadRequest, "Review comment must be at least 3 characters.")
		return
	}

	rev, err := h.reviewRepo.UpdateReview(r.Context(), reviewID, claims.Sub, body.Rating, comment)
	if err != nil {
		if errors.Is(err, repositories.ErrForbiddenReview) {
			WriteError(w, http.StatusForbidden, "You can only edit your own reviews.")
			return
		}
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"review": rev})
}

func (h *ReviewHandler) DeleteReview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviewID := strings.TrimSpace(r.PathValue("id"))
	err := h.reviewRepo.DeleteReview(r.Context(), reviewID, claims.Sub, claims.Role == models.RoleAdmin)
	if err != nil {
		if errors.Is(err, repositories.ErrForbiddenReview) {
			WriteError(w, http.StatusForbidden, "Unauthorized to delete this review.")
			return
		}
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ReviewHandler) ToggleLike(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviewID := strings.TrimSpace(r.PathValue("id"))
	liked, count, err := h.reviewRepo.ToggleHelpfulLike(r.Context(), reviewID, claims.Sub)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"liked":        liked,
		"helpfulCount": count,
	})
}

func (h *ReviewHandler) AdminListReviews(w http.ResponseWriter, r *http.Request) {
	reviews, err := h.reviewRepo.ListAllAdmin(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"reviews": reviews})
}

func (h *ReviewHandler) AdminDeleteReview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviewID := strings.TrimSpace(r.PathValue("id"))
	if err := h.reviewRepo.DeleteReview(r.Context(), reviewID, claims.Sub, true); err != nil {
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
