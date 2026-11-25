package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/repositories"
	"github.com/teestore/backend/internal/security"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type CatalogHandler struct {
	catalogRepo *repositories.CatalogRepository
	reviewRepo  *repositories.ReviewRepository
	cloudinary  *services.CloudinaryService
}

func NewCatalogHandler(catalogRepo *repositories.CatalogRepository, reviewRepo *repositories.ReviewRepository, cloudinary *services.CloudinaryService) *CatalogHandler {
	return &CatalogHandler{catalogRepo: catalogRepo, reviewRepo: reviewRepo, cloudinary: cloudinary}
}

func (h *CatalogHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.catalogRepo.ListCategoriesWithCount(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load categories.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"categories": cats})
}

func (h *CatalogHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid category payload.")
		return
	}
	name := strings.TrimSpace(body.Name)
	slug := services.SlugifyProductName(name)
	if len(name) < 2 || slug == "" {
		WriteError(w, http.StatusBadRequest, "Category name is required.")
		return
	}
	cat, err := h.catalogRepo.CreateCategory(r.Context(), name, slug, strings.TrimSpace(body.Description))
	if err != nil {
		WriteError(w, http.StatusConflict, "Category already exists.")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]interface{}{"category": cat})
}

func (h *CatalogHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	claims := middleware.GetUserClaims(r.Context())
	includeUnpublished := q.Get("includeUnpublished") == "true" && claims != nil && claims.Role == models.RoleAdmin

	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	products, pagination, err := h.catalogRepo.ListProducts(r.Context(), repositories.ProductQuery{
		Search:             q.Get("search"),
		CategorySlug:       q.Get("category"),
		PriceRange:         q.Get("priceRange"),
		Sort:               q.Get("sort"),
		Featured:           q.Get("featured") == "true",
		Popular:            q.Get("popular") == "true",
		IncludeUnpublished: includeUnpublished,
		Page:               page,
		Limit:              limit,
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load products.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"products":   products,
		"pagination": pagination,
	})
}

func (h *CatalogHandler) GetProductBySlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.PathValue("slug"))
	prod, err := h.catalogRepo.FindProductBySlug(r.Context(), slug)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load product.")
		return
	}
	claims := middleware.GetUserClaims(r.Context())
	if prod == nil || (!prod.Published && (claims == nil || claims.Role != models.RoleAdmin)) {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}

	userHex := ""
	if claims != nil {
		userHex = claims.Sub
	}
	reviews, ratingSummary, err := h.reviewRepo.ListByProduct(r.Context(), prod.IDHex, userHex)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"product":       prod,
		"reviews":       reviews,
		"ratingSummary": ratingSummary,
	})
}

type productPayload struct {
	Name           string                  `json:"name"`
	Slug           string                  `json:"slug"`
	Description    string                  `json:"description"`
	Price          float64                 `json:"price"`
	DiscountPrice  *float64                `json:"discountPrice"`
	CategoryID     string                  `json:"categoryId"`
	Images         []string                `json:"images"`
	Sizes          []string                `json:"sizes"`
	Colors         []models.TeeColorOption `json:"colors"`
	Stock          *int                    `json:"stock"`
	Featured       *bool                   `json:"featured"`
	Popular        *bool                   `json:"popular"`
	Published      *bool                   `json:"published"`
	SEOTitle       string                  `json:"seoTitle"`
	SEODescription string                  `json:"seoDescription"`
}

func (h *CatalogHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	var body productPayload
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid product payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	rawSlug := strings.TrimSpace(body.Slug)
	if rawSlug == "" {
		rawSlug = name
	}
	slug := services.SlugifyProductName(rawSlug)
	desc := strings.TrimSpace(body.Description)

	if name == "" || slug == "" || desc == "" {
		WriteError(w, http.StatusBadRequest, "Product name, slug, and description are required.")
		return
	}
	if body.Price <= 0 {
		WriteError(w, http.StatusBadRequest, "Price must be greater than zero.")
		return
	}
	if body.DiscountPrice != nil && (*body.DiscountPrice <= 0 || *body.DiscountPrice >= body.Price) {
		WriteError(w, http.StatusBadRequest, "Discount price must be lower than regular price.")
		return
	}

	cat, err := h.catalogRepo.FindCategoryByID(r.Context(), body.CategoryID)
	if err != nil || cat == nil {
		WriteError(w, http.StatusBadRequest, "Valid category is required.")
		return
	}
	if existing, _ := h.catalogRepo.FindProductBySlug(r.Context(), slug); existing != nil {
		WriteError(w, http.StatusConflict, "A product with this slug already exists.")
		return
	}

	var imgs []string
	for _, u := range body.Images {
		if clean := security.SanitizeImageURL(u); clean != "" {
			imgs = append(imgs, clean)
		}
	}
	if len(imgs) == 0 {
		imgs = []string{"/images/tee_black_classic_1795513062767.jpg"}
	}
	sizes := body.Sizes
	if len(sizes) == 0 {
		sizes = []string{"S", "M", "L", "XL"}
	}
	colors := body.Colors
	if len(colors) == 0 {
		colors = []models.TeeColorOption{{Name: "Black", Hex: "#111111"}}
	}
	published := true
	if body.Published != nil {
		published = *body.Published
	}
	stock := 0
	if body.Stock != nil {
		stock = *body.Stock
	}
	if stock < 0 {
		stock = 0
	}
	featured := body.Featured != nil && *body.Featured
	popular := body.Popular != nil && *body.Popular
	seoTitle := strings.TrimSpace(body.SEOTitle)
	if seoTitle == "" {
		seoTitle = name + " | TeeStore"
	}
	seoDesc := strings.TrimSpace(body.SEODescription)
	if seoDesc == "" {
		if len(desc) > 155 {
			seoDesc = desc[:155]
		} else {
			seoDesc = desc
		}
	}

	prod := &models.Product{
		Name:           name,
		Slug:           slug,
		Description:    desc,
		Price:          services.Round2(body.Price),
		DiscountPrice:  body.DiscountPrice,
		CategoryID:     cat.ID,
		CategoryName:   cat.Name,
		CategorySlug:   cat.Slug,
		Images:         imgs,
		Sizes:          sizes,
		Colors:         colors,
		Stock:          stock,
		Featured:       featured,
		Popular:        popular,
		Published:      published,
		SEOTitle:       seoTitle,
		SEODescription: seoDesc,
	}

	if err := h.catalogRepo.CreateProduct(r.Context(), prod, claims.Name); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create product.")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]interface{}{"product": prod})
}

func (h *CatalogHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetUserClaims(r.Context())
	idHex := strings.TrimSpace(r.PathValue("id"))
	existing, err := h.catalogRepo.FindProductByID(r.Context(), idHex)
	if err != nil || existing == nil {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}

	var body productPayload
	if err := DecodeJSON(r, &body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid product update payload.")
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = existing.Name
	}
	slug := existing.Slug
	if strings.TrimSpace(body.Slug) != "" {
		slug = services.SlugifyProductName(body.Slug)
	}
	if conflict, _ := h.catalogRepo.FindProductBySlug(r.Context(), slug); conflict != nil && conflict.IDHex != existing.IDHex {
		WriteError(w, http.StatusConflict, "Another product already uses this slug.")
		return
	}

	desc := strings.TrimSpace(body.Description)
	if desc == "" {
		desc = existing.Description
	}
	price := body.Price
	if price <= 0 {
		price = existing.Price
	}
	if body.DiscountPrice != nil && (*body.DiscountPrice <= 0 || *body.DiscountPrice >= price) {
		WriteError(w, http.StatusBadRequest, "Discount price must be less than regular price.")
		return
	}

	catID := existing.CategoryID
	catName := existing.CategoryName
	catSlug := existing.CategorySlug
	if body.CategoryID != "" && body.CategoryID != existing.CategoryIDHex {
		if cat, _ := h.catalogRepo.FindCategoryByID(r.Context(), body.CategoryID); cat != nil {
			catID = cat.ID
			catName = cat.Name
			catSlug = cat.Slug
		}
	}

	imgs := existing.Images
	if len(body.Images) > 0 {
		var clean []string
		for _, u := range body.Images {
			if c := security.SanitizeImageURL(u); c != "" {
				clean = append(clean, c)
			}
		}
		if len(clean) > 0 {
			imgs = clean
		}
	}
	sizes := existing.Sizes
	if len(body.Sizes) > 0 {
		sizes = body.Sizes
	}
	colors := existing.Colors
	if len(body.Colors) > 0 {
		colors = body.Colors
	}
	published := existing.Published
	if body.Published != nil {
		published = *body.Published
	}
	stock := existing.Stock
	if body.Stock != nil {
		stock = *body.Stock
		if stock < 0 {
			stock = 0
		}
	}
	featured := existing.Featured
	if body.Featured != nil {
		featured = *body.Featured
	}
	popular := existing.Popular
	if body.Popular != nil {
		popular = *body.Popular
	}

	seoTitle := strings.TrimSpace(body.SEOTitle)
	if seoTitle == "" {
		seoTitle = existing.SEOTitle
	}
	seoDesc := strings.TrimSpace(body.SEODescription)
	if seoDesc == "" {
		seoDesc = existing.SEODescription
	}

	fields := bson.M{
		"name":           name,
		"slug":           slug,
		"description":    desc,
		"price":          services.Round2(price),
		"discountPrice":  body.DiscountPrice,
		"categoryId":     catID,
		"categoryName":   catName,
		"categorySlug":   catSlug,
		"images":         imgs,
		"sizes":          sizes,
		"colors":         colors,
		"stock":          stock,
		"featured":       featured,
		"popular":        popular,
		"published":      published,
		"seoTitle":       seoTitle,
		"seoDescription": seoDesc,
	}

	updated, err := h.catalogRepo.UpdateProduct(r.Context(), existing.ID, existing.Stock, fields, claims.Name)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update product.")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"product": updated})
}

func (h *CatalogHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	idHex := strings.TrimSpace(r.PathValue("id"))
	archived, deletedImages, err := h.catalogRepo.DeleteOrArchiveProduct(r.Context(), idHex)
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

	// Best-effort Cloudinary cleanup for deleted product images
	for _, imgURL := range deletedImages {
		_ = h.cloudinary.DeleteByURL(imgURL)
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"ok":       true,
		"archived": false,
	})
}

func (h *CatalogHandler) CloudinarySignature(w http.ResponseWriter, r *http.Request) {
	sig := h.cloudinary.GenerateUploadSignature(time.Now().Unix())
	WriteJSON(w, http.StatusOK, sig)
}
