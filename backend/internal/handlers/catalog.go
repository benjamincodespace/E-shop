package handlers

import (
	"errors"
	"io"
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
	includeUnpublished := q.Get("includeUnpublished") == "true" && claims != nil && claims.Role.IsAdminRole()

	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	// Sellers only ever see and manage their own catalogue; the platform owner
	// and the public storefront are unscoped.
	sellerID := ""
	if claims != nil && claims.Role == models.RoleAdmin {
		sellerID = claims.Sub
		includeUnpublished = true
	}

	products, pagination, err := h.catalogRepo.ListProducts(r.Context(), repositories.ProductQuery{
		Search:             q.Get("search"),
		CategorySlug:       q.Get("category"),
		PriceRange:         q.Get("priceRange"),
		Sort:               q.Get("sort"),
		Featured:           q.Get("featured") == "true",
		Popular:            q.Get("popular") == "true",
		IncludeUnpublished: includeUnpublished,
		SellerID:           sellerID,
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
	canSeeUnpublished := claims != nil && claims.Role == models.RoleSuperAdmin
	if prod != nil && claims != nil && claims.Role == models.RoleAdmin && prod.SellerID == claims.Sub {
		canSeeUnpublished = true
	}
	if prod == nil || (!prod.Published && !canSeeUnpublished) {
		WriteError(w, http.StatusNotFound, "Product not found.")
		return
	}

	userHex := ""
	if claims != nil {
		userHex = claims.Sub
	}
	reviews, ratingSummary, pagination, err := h.reviewRepo.ListByProduct(r.Context(), repositories.ReviewQuery{
		ProductIDHex:   prod.IDHex,
		CurrentUserHex: userHex,
		Sort:           r.URL.Query().Get("reviewSort"),
		Page:           1,
		Limit:          5,
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to load reviews.")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"product":          prod,
		"reviews":          reviews,
		"ratingSummary":    ratingSummary,
		"reviewPagination": pagination,
	})
}

type productPayload struct {
	Name           string                  `json:"name"`
	Slug           string                  `json:"slug"`
	Description    string                  `json:"description"`
	Price          float64                 `json:"price"`
	Currency       string                  `json:"currency"`
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

// sellerQuotaExceeded enforces the free allowance for unverified sellers. It
// writes the upgrade response itself and reports whether the request must stop.
func (h *CatalogHandler) sellerQuotaExceeded(
	w http.ResponseWriter,
	r *http.Request,
	claims *security.AuthClaims,
	extraImages []string,
	excludeProductID string,
) bool {
	if claims == nil || claims.Role != models.RoleAdmin {
		return false
	}
	existing, err := h.catalogRepo.SellerImageCount(r.Context(), claims.Sub, excludeProductID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to check your seller allowance.")
		return true
	}
	fresh := make(map[string]bool)
	for _, img := range extraImages {
		if img != "" {
			fresh[img] = true
		}
	}
	if existing+len(fresh) > models.FreeSellerImageLimit {
		WriteError(w, http.StatusForbidden, "Your free seller plan allows 10 product images. Wait for super administrator verification to unlock unlimited uploads.")
		return true
	}
	return false
}

// sellerImageLimitReached blocks new uploads once an unverified seller has used
// its ten free product images.
func (h *CatalogHandler) sellerImageLimitReached(w http.ResponseWriter, r *http.Request, claims *security.AuthClaims) bool {
	if claims == nil || claims.Role != models.RoleAdmin {
		return false
	}
	count, err := h.catalogRepo.SellerImageCount(r.Context(), claims.Sub, "")
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to check your seller allowance.")
		return true
	}
	if count >= models.FreeSellerImageLimit {
		WriteError(w, http.StatusForbidden, "Your free seller plan allows 10 product images. Wait for super administrator verification to unlock unlimited uploads.")
		return true
	}
	return false
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
	if len(imgs) > 8 {
		imgs = imgs[:8]
	}
	if claims != nil && claims.Role == models.RoleAdmin {
		count, err := h.catalogRepo.CountSellerProducts(r.Context(), claims.Sub)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Failed to check your seller allowance.")
			return
		}
		if count >= models.FreeSellerProductLimit {
			WriteError(w, http.StatusForbidden, "Your free seller plan allows 10 products. Wait for super administrator verification to unlock unlimited uploads.")
			return
		}
	}
	if h.sellerQuotaExceeded(w, r, claims, imgs, "") {
		return
	}
	sizes := body.Sizes
	if len(sizes) == 0 {
		sizes = []string{"S", "M", "L", "XL"}
	}
	if len(sizes) > 10 {
		sizes = sizes[:10]
	}
	colors := body.Colors
	if len(colors) == 0 {
		colors = []models.TeeColorOption{{Name: "Black", Hex: "#111111"}}
	}
	if len(colors) > 20 {
		colors = colors[:20]
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
		seoTitle = name + " | E-shop All"
	}
	seoDesc := strings.TrimSpace(body.SEODescription)
	if seoDesc == "" {
		seoDesc = services.ClampText(desc, 155)
	}

	currency := services.NormalizeCurrency(body.Currency)

	prod := &models.Product{
		Name:           name,
		SellerID:       claims.Sub,
		SellerName:     claims.Name,
		Slug:           slug,
		Description:    desc,
		Price:          services.RoundCurrency(body.Price, currency),
		Currency:       currency,
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
	if claims.Role == models.RoleAdmin && existing.SellerID != claims.Sub {
		WriteError(w, http.StatusForbidden, "You can only edit your own products.")
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
	currency := existing.Currency
	if strings.TrimSpace(body.Currency) != "" {
		currency = services.NormalizeCurrency(body.Currency)
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
			if len(clean) > 8 {
				clean = clean[:8]
			}
			imgs = clean
		}
	}
	sizes := existing.Sizes
	if len(body.Sizes) > 0 {
		sizes = body.Sizes
	}
	if len(sizes) > 10 {
		sizes = sizes[:10]
	}
	colors := existing.Colors
	if len(body.Colors) > 0 {
		colors = body.Colors
	}
	if len(colors) > 20 {
		colors = colors[:20]
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

	if h.sellerQuotaExceeded(w, r, claims, imgs, existing.IDHex) {
		return
	}

	fields := bson.M{
		"name":           name,
		"slug":           slug,
		"description":    desc,
		"price":          services.RoundCurrency(price, currency),
		"currency":       currency,
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
	if h.sellerImageLimitReached(w, r, middleware.GetUserClaims(r.Context())) {
		return
	}
	sig := h.cloudinary.GenerateUploadSignature(time.Now().Unix())
	WriteJSON(w, http.StatusOK, sig)
}

// UploadImage accepts one product image from the admin dashboard, uploads it to
// Cloudinary server-side, and returns the secure delivery URL to store on the
// product. Saving the image only after Cloudinary confirms keeps catalogue
// records from pointing at images that were never persisted.
func (h *CatalogHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	if h.sellerImageLimitReached(w, r, middleware.GetUserClaims(r.Context())) {
		return
	}
	if !h.cloudinary.Configured() {
		WriteError(w, http.StatusServiceUnavailable, "Cloudinary is not configured on the API server. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.")
		return
	}

	const maxUploadBytes = 10 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		WriteError(w, http.StatusBadRequest, "Please upload a single image up to 10MB.")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "No image file was included in the upload.")
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	contentType := http.DetectContentType(head[:n])
	if !strings.HasPrefix(contentType, "image/") {
		WriteError(w, http.StatusBadRequest, "Only image files (JPEG, PNG, WebP, or GIF) can be uploaded.")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		WriteError(w, http.StatusBadRequest, "Could not read the uploaded image.")
		return
	}

	secureURL, err := h.cloudinary.UploadImage(r.Context(), header.Filename, file)
	if err != nil {
		if errors.Is(err, services.ErrCloudinaryNotConfigured) {
			WriteError(w, http.StatusServiceUnavailable, "Cloudinary is not configured on the API server.")
			return
		}
		WriteError(w, http.StatusBadGateway, "Cloudinary upload failed: "+err.Error())
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]string{"url": secureURL})
}
