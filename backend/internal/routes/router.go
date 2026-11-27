package routes

import (
	"net/http"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/handlers"
	"github.com/teestore/backend/internal/middleware"
	"github.com/teestore/backend/internal/security"
)

func NewRouter(
	cfg *config.Config,
	authH *handlers.AuthHandler,
	catH *handlers.CatalogHandler,
	ordH *handlers.OrderHandler,
	revH *handlers.ReviewHandler,
	admH *handlers.AdminHandler,
	superH *handlers.SuperAdminHandler,
	geoH *handlers.GeoHandler,
) http.Handler {
	mux := http.NewServeMux()
	rl := security.NewRateLimiter()

	// Health
	mux.HandleFunc("GET /api/health", admH.Health)

	// Approximate country for the signup phone default (never required).
	mux.HandleFunc("GET /api/geo", middleware.RateLimit(rl, 60, time.Minute, geoH.DetectCountry))

	// Auth
	mux.HandleFunc("GET /api/auth/admin/status", authH.AdminStatus)
	mux.HandleFunc("POST /api/auth/admin/claim", middleware.RateLimit(rl, 10, time.Minute, authH.ClaimAdmin))
	mux.HandleFunc("GET /api/auth/superadmin/status", authH.SuperAdminStatus)
	mux.HandleFunc("POST /api/auth/superadmin/claim", middleware.RateLimit(rl, 10, time.Minute, authH.ClaimSuperAdmin))
	mux.HandleFunc("POST /api/auth/avatar", middleware.RateLimit(rl, 20, time.Minute, middleware.RequireAuth(cfg, authH.UploadAvatar)))
	mux.HandleFunc("POST /api/auth/register", middleware.RateLimit(rl, 10, time.Minute, authH.Register))
	mux.HandleFunc("POST /api/auth/seller/register", middleware.RateLimit(rl, 10, time.Minute, authH.RegisterSeller))
	mux.HandleFunc("POST /api/auth/login", middleware.RateLimit(rl, 20, time.Minute, authH.Login))
	mux.HandleFunc("POST /api/auth/refresh", authH.Refresh)
	mux.HandleFunc("POST /api/auth/logout", authH.Logout)
	mux.HandleFunc("GET /api/auth/session", middleware.AttachOptionalAuth(cfg, authH.Session))
	mux.HandleFunc("GET /api/auth/me", middleware.RequireAuth(cfg, authH.Me))
	mux.HandleFunc("PUT /api/auth/profile", middleware.RequireAuth(cfg, authH.UpdateProfile))
	mux.HandleFunc("PUT /api/auth/delivery-address", middleware.RequireAuth(cfg, authH.SaveDeliveryAddress))
	mux.HandleFunc("DELETE /api/auth/delivery-address", middleware.RequireAuth(cfg, authH.ClearDeliveryAddress))
	mux.HandleFunc("POST /api/auth/forgot-password", middleware.RateLimit(rl, 10, time.Minute, authH.ForgotPassword))
	mux.HandleFunc("POST /api/auth/reset-password", middleware.RateLimit(rl, 10, time.Minute, authH.ResetPassword))

	// Categories & Products
	mux.HandleFunc("GET /api/categories", catH.ListCategories)
	// Any seller/admin can add a department (Electronics, Clothes, Food, …) and
// immediately publish products inside it.
mux.HandleFunc("POST /api/admin/categories", middleware.RequireAdmin(cfg, catH.CreateCategory))
	mux.HandleFunc("GET /api/products", middleware.AttachOptionalAuth(cfg, catH.ListProducts))
	mux.HandleFunc("GET /api/products/{slug}", middleware.AttachOptionalAuth(cfg, catH.GetProductBySlug))
	mux.HandleFunc("POST /api/admin/products", middleware.RequireAdmin(cfg, catH.CreateProduct))
	mux.HandleFunc("PUT /api/admin/products/{id}", middleware.RequireAdmin(cfg, catH.UpdateProduct))
	mux.HandleFunc("DELETE /api/admin/products/{id}", middleware.RequireSuperAdmin(cfg, catH.DeleteProduct))
	mux.HandleFunc("POST /api/admin/cloudinary-signature", middleware.RequireAdmin(cfg, catH.CloudinarySignature))
	mux.HandleFunc("POST /api/admin/uploads", middleware.RequireAdmin(cfg, catH.UploadImage))

	// Cart & Wishlist
	mux.HandleFunc("GET /api/cart", middleware.RequireAuth(cfg, ordH.GetCart))
	mux.HandleFunc("POST /api/cart", middleware.RequireAuth(cfg, ordH.AddToCart))
	mux.HandleFunc("POST /api/cart/sync", middleware.RequireAuth(cfg, ordH.SyncCart))
	mux.HandleFunc("PUT /api/cart/{productId}", middleware.RequireAuth(cfg, ordH.UpdateCartItem))
	mux.HandleFunc("DELETE /api/cart/{productId}", middleware.RequireAuth(cfg, ordH.RemoveCartItem))

	mux.HandleFunc("GET /api/wishlist", middleware.RequireAuth(cfg, ordH.GetWishlist))
	mux.HandleFunc("POST /api/wishlist/{productId}", middleware.RequireAuth(cfg, ordH.AddWishlist))
	mux.HandleFunc("DELETE /api/wishlist/{productId}", middleware.RequireAuth(cfg, ordH.RemoveWishlist))

	// Orders
	// Guest checkout: no account needed, so the session is optional.
	mux.HandleFunc("POST /api/orders", middleware.RateLimit(rl, 20, time.Minute, middleware.AttachOptionalAuth(cfg, ordH.CreateOrder)))
	mux.HandleFunc("GET /api/orders/my-orders", middleware.RequireAuth(cfg, ordH.MyOrders))
	mux.HandleFunc("GET /api/admin/orders", middleware.RequireAdmin(cfg, ordH.AdminListOrders))
	mux.HandleFunc("PUT /api/admin/orders/{id}/status", middleware.RequireSuperAdmin(cfg, ordH.AdminUpdateOrderStatus))

	// Reviews
	mux.HandleFunc("GET /api/products/{id}/reviews", middleware.AttachOptionalAuth(cfg, revH.ListProductReviews))
	mux.HandleFunc("GET /api/reviews/my-reviews", middleware.RequireAuth(cfg, revH.MyReviews))
	mux.HandleFunc("POST /api/products/{id}/reviews", middleware.RequireAuth(cfg, revH.CreateReview))
	mux.HandleFunc("PUT /api/reviews/{id}", middleware.RequireAuth(cfg, revH.UpdateReview))
	mux.HandleFunc("DELETE /api/reviews/{id}", middleware.RequireAuth(cfg, revH.DeleteReview))
	mux.HandleFunc("POST /api/reviews/{id}/like", middleware.RequireAuth(cfg, revH.ToggleLike))
	mux.HandleFunc("POST /api/reviews/{id}/report", middleware.RateLimit(rl, 20, time.Minute, middleware.RequireAuth(cfg, revH.ReportReview)))
	mux.HandleFunc("GET /api/admin/reviews", middleware.RequireAdmin(cfg, revH.AdminListReviews))
	mux.HandleFunc("DELETE /api/admin/reviews/{id}", middleware.RequireSuperAdmin(cfg, revH.AdminDeleteReview))
	mux.HandleFunc("POST /api/admin/reviews/{id}/resolve-reports", middleware.RequireSuperAdmin(cfg, revH.AdminResolveReports))

	// Admin Analytics, Inventory, Customers, Settings & Newsletter
	mux.HandleFunc("GET /api/admin/analytics", middleware.RequireAdmin(cfg, admH.GetAnalytics))
	mux.HandleFunc("GET /api/admin/inventory", middleware.RequireAdmin(cfg, admH.GetInventory))
	mux.HandleFunc("PUT /api/admin/inventory/{productId}", middleware.RequireAdmin(cfg, admH.AdjustInventory))
	mux.HandleFunc("GET /api/admin/customers", middleware.RequireVerifiedAdmin(cfg, admH.ListCustomers))
	mux.HandleFunc("GET /api/admin/customers/{id}/orders", middleware.RequireSuperAdmin(cfg, admH.CustomerOrders))
	mux.HandleFunc("PUT /api/admin/customers/{id}/toggle-disabled", middleware.RequireSuperAdmin(cfg, admH.ToggleCustomerDisabled))
	mux.HandleFunc("GET /api/admin/settings", middleware.RequireSuperAdmin(cfg, admH.GetSettings))
	mux.HandleFunc("PUT /api/admin/settings", middleware.RequireSuperAdmin(cfg, admH.UpdateSettings))
	mux.HandleFunc("POST /api/newsletter", middleware.RateLimit(rl, 5, time.Minute, admH.SubscribeNewsletter))

	// Super Administrator: platform-wide control of users and products.
	mux.HandleFunc("GET /api/superadmin/overview", middleware.RequireSuperAdmin(cfg, superH.Overview))
	mux.HandleFunc("GET /api/superadmin/users", middleware.RequireSuperAdmin(cfg, superH.ListUsers))
	mux.HandleFunc("PUT /api/superadmin/users/{id}/role", middleware.RequireSuperAdmin(cfg, superH.UpdateUserRole))
	mux.HandleFunc("PUT /api/superadmin/users/{id}/approve", middleware.RequireSuperAdmin(cfg, superH.ApproveSeller))
	mux.HandleFunc("PUT /api/superadmin/users/{id}/reject", middleware.RequireSuperAdmin(cfg, superH.RejectSeller))
	mux.HandleFunc("PUT /api/superadmin/users/{id}/toggle-disabled", middleware.RequireSuperAdmin(cfg, superH.ToggleUserDisabled))
	mux.HandleFunc("DELETE /api/superadmin/users/{id}", middleware.RequireSuperAdmin(cfg, superH.DeleteUser))
	mux.HandleFunc("GET /api/superadmin/products", middleware.RequireSuperAdmin(cfg, superH.ListProducts))
	mux.HandleFunc("PUT /api/superadmin/products/{id}/published", middleware.RequireSuperAdmin(cfg, superH.SetProductPublished))
	mux.HandleFunc("DELETE /api/superadmin/products/{id}", middleware.RequireSuperAdmin(cfg, superH.DeleteProduct))

	return middleware.WithSecurityHeaders(middleware.WithCORS(cfg, mux))
}
