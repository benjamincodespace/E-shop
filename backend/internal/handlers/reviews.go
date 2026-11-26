package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
)

const maxReviewCommentLength = 1000

type ReviewHandler struct {
	reviewRepo *repositories.ReviewRepository
}

func NewReviewHandler(reviewRepo *repositories.ReviewRepository) *ReviewHandler {
	return &ReviewHandler{reviewRepo: reviewRepo}
}

// validateReviewInput enforces the shared rating/comment rules. A comment is
// optional (a bare star rating is allowed) but must be meaningful when sent.
func validateReviewInput(rating int, rawComment string) (string, string) {
	comment := strings.TrimSpace(rawComment)
	if rating < 1 || rating > 5 {
		return "", "Rating must be between 1 and 5 stars."
	}
	if comment != "" && len([]rune(comment)) < 3 {
		return "", "Please write at least 3 characters, or leave the comment empty."
	}
	if len([]rune(comment)) > maxReviewCommentLength {
		return "", "Review comments are limited to 1000 characters."
	}
	return comment, ""
}

func (h *ReviewHandler) ListProductReviews(w http.ResponseWriter, r *http.Request) {
	productID := strings.TrimSpace(r.PathValue("id"))
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	rating, _ := strconv.Atoi(q.Get("rating"))

	userHex := ""
	if claims := middleware.GetUserClaims(r.Context()); claims != nil {
		userHex = claims.Sub
	}

	reviews, summary, pagination, err := h.reviewRepo.ListByProduct(r.Context(), repositories.ReviewQuery{
		ProductIDHex:   productID,
		CurrentUserHex: userHex,
		Sort:           q.Get("sort"),
		Rating:         rating,
		Page:           page,
		Limit:          limit,
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"reviews":       reviews,
		"ratingSummary": summary,
		"pagination":    pagination,
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
	comment, msg := validateReviewInput(body.Rating, body.Comment)
	if msg != "" {
		WriteError(w, http.StatusBadRequest, msg)
		return
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = "Verified Shopper"
	}

	rev, created, err := h.reviewRepo.UpsertReview(r.Context(), productID, claims.Sub, name, body.Rating, comment)
	if err != nil {
		if errors.Is(err, repositories.ErrDuplicateReview) {
			WriteError(w, http.StatusConflict, "You have already rated this product. Your existing rating can be updated.")
			return
		}
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	WriteJSON(w, status, map[string]interface{}{"review": rev, "created": created})
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
	comment, msg := validateReviewInput(body.Rating, body.Comment)
	if msg != "" {
		WriteError(w, http.StatusBadRequest, msg)
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

// ReportReview lets signed-in customers flag inappropriate content. The
// reporter identity comes from the verified token, never the request body.
func (h *ReviewHandler) ReportReview(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	reviewID := strings.TrimSpace(r.PathValue("id"))
	var body struct {
		Reason string `json:"reason"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid report payload.")
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if len([]rune(reason)) > 200 {
		reason = string([]rune(reason)[:200])
	}
	if reason == "" {
		reason = "Inappropriate content"
	}

	rev, err := h.reviewRepo.ReportReview(r.Context(), reviewID, claims.Sub, reason)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"review":   rev,
		"reported": true,
	})
}

func (h *ReviewHandler) AdminListReviews(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rating, _ := strconv.Atoi(q.Get("rating"))
	reviews, stats, err := h.reviewRepo.ListAllAdmin(r.Context(), q.Get("productId"), rating)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"reviews": reviews,
		"stats":   stats,
	})
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

func (h *ReviewHandler) AdminResolveReports(w http.ResponseWriter, r *http.Request) {
	reviewID := strings.TrimSpace(r.PathValue("id"))
	if err := h.reviewRepo.ResolveReports(r.Context(), reviewID); err != nil {
		WriteError(w, http.StatusNotFound, "Review not found.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
