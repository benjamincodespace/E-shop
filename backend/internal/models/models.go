package models

import (
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type UserRole string

const (
	RoleCustomer UserRole = "customer"
	RoleAdmin    UserRole = "admin"
	// RoleSuperAdmin owns the whole platform: every user, every product and
	// every seller/admin account. The regular admin keeps the seller console.
	RoleSuperAdmin UserRole = "super_admin"
)

// IsAdminRole reports whether the role may operate a store admin console.
func (r UserRole) IsAdminRole() bool {
	return r == RoleAdmin || r == RoleSuperAdmin
}

// IsValidRole reports whether a value can be persisted as a user role.
func IsValidRole(r UserRole) bool {
	return r == RoleCustomer || r == RoleAdmin || r == RoleSuperAdmin
}

// DefaultCurrency is the canonical pricing currency for legacy records.
const DefaultCurrency = "USD"

// MaxSuperAdmins is the hard cap on platform-owner accounts. Once four exist no
// further account can be created or promoted to super administrator.
const MaxSuperAdmins = 4

// Seller approval states. A newly registered seller stays pending until a
// super administrator verifies the account.
const (
	ApprovalPending  = "pending"
	ApprovalApproved = "approved"
	ApprovalRejected = "rejected"
)

type OrderStatus string

const (
	OrderPending    OrderStatus = "Pending"
	OrderConfirmed  OrderStatus = "Confirmed"
	OrderProcessing OrderStatus = "Processing"
	OrderShipped    OrderStatus = "Shipped"
	OrderDelivered  OrderStatus = "Delivered"
	OrderCancelled  OrderStatus = "Cancelled"
)

var ValidOrderStatuses = []OrderStatus{
	OrderPending,
	OrderConfirmed,
	OrderProcessing,
	OrderShipped,
	OrderDelivered,
	OrderCancelled,
}

type TeeColorOption struct {
	Name string `bson:"name" json:"name"`
	Hex  string `bson:"hex" json:"hex"`
}

// DeliveryAddress is an optional structured address used for a saved profile
// address and the immutable snapshot stored with each order.
type DeliveryAddress struct {
	Country      string   `bson:"country" json:"country"`
	City         string   `bson:"city" json:"city"`
	District     string   `bson:"district,omitempty" json:"district,omitempty"`
	Street       string   `bson:"street" json:"street"`
	Building     string   `bson:"building,omitempty" json:"building,omitempty"`
	Instructions string   `bson:"instructions,omitempty" json:"instructions,omitempty"`
	Latitude     *float64 `bson:"latitude,omitempty" json:"latitude,omitempty"`
	Longitude    *float64 `bson:"longitude,omitempty" json:"longitude,omitempty"`
}

// OneLine renders the address for compact display and legacy `address` fields.
func (d *DeliveryAddress) OneLine() string {
	if d == nil {
		return ""
	}
	parts := make([]string, 0, 5)
	for _, part := range []string{d.Street, d.Building, d.District, d.City, d.Country} {
		if part = strings.TrimSpace(part); part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, ", ")
}

type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex        string        `bson:"-" json:"id"`
	Name         string        `bson:"name" json:"name"`
	AvatarURL    string        `bson:"avatarUrl,omitempty" json:"avatarUrl,omitempty"`
	Email        string        `bson:"email,omitempty" json:"email"`
	PasswordHash string        `bson:"passwordHash" json:"-"`
	Phone        string        `bson:"phone" json:"phone"`
	Address      string        `bson:"address" json:"address"`
	// DeliveryAddress is only set when the customer chooses to save it.
	DeliveryAddress *DeliveryAddress `bson:"deliveryAddress,omitempty" json:"deliveryAddress,omitempty"`
	// Gender is optional and omitted for accounts created before it existed.
	Gender string   `bson:"gender,omitempty" json:"gender,omitempty"`
	Role   UserRole `bson:"role" json:"role"`
	// ApprovalStatus gates seller (admin) accounts: pending, approved or
	// rejected. Empty means a legacy account and is treated as approved.
	ApprovalStatus string     `bson:"approvalStatus,omitempty" json:"approvalStatus,omitempty"`
	Verified       bool       `bson:"verified,omitempty" json:"verified"`
	VerifiedAt     *time.Time `bson:"verifiedAt,omitempty" json:"verifiedAt,omitempty"`
	Disabled       bool       `bson:"disabled" json:"disabled"`
	ResetCode      string     `bson:"resetCode,omitempty" json:"-"`
	ResetExpiresAt *time.Time `bson:"resetExpiresAt,omitempty" json:"-"`
	CreatedAt      time.Time  `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time  `bson:"updatedAt" json:"updatedAt"`
}

// IsApprovedSeller reports whether an account may operate a seller console.
// Super administrators always pass, and admins (sellers) created before the
// approval flow have an empty status and stay grandfathered in.
func (u *User) IsApprovedSeller() bool {
	if u.Role == RoleSuperAdmin {
		return true
	}
	if u.Role != RoleAdmin {
		return false
	}
	return u.ApprovalStatus != ApprovalPending && u.ApprovalStatus != ApprovalRejected
}

type CustomerSummary struct {
	User
	OrderCount int     `json:"orderCount"`
	TotalSpent float64 `json:"totalSpent"`
}

type Category struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex        string        `bson:"-" json:"id"`
	Name         string        `bson:"name" json:"name"`
	Slug         string        `bson:"slug" json:"slug"`
	Description  string        `bson:"description" json:"description"`
	ProductCount int64         `bson:"-" json:"productCount,omitempty"`
	CreatedAt    time.Time     `bson:"createdAt" json:"createdAt"`
}

type Product struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex         string        `bson:"-" json:"id"`
	Name          string        `bson:"name" json:"name"`
	Slug          string        `bson:"slug" json:"slug"`
	Description   string        `bson:"description" json:"description"`
	Price         float64       `bson:"price" json:"price"`
	Currency      string        `bson:"currency,omitempty" json:"currency"`
	DiscountPrice *float64      `bson:"discountPrice,omitempty" json:"discountPrice"`
	CategoryID    bson.ObjectID `bson:"categoryId" json:"-"`
	CategoryIDHex string        `bson:"-" json:"categoryId"`
	CategoryName  string        `bson:"categoryName" json:"categoryName"`
	CategorySlug  string        `bson:"categorySlug" json:"categorySlug"`
	// SellerID/SellerName record who uploaded the product, which scopes the
	// seller console to its own catalogue. Legacy products have no seller.
	SellerID       string           `bson:"sellerId,omitempty" json:"sellerId,omitempty"`
	SellerName     string           `bson:"sellerName,omitempty" json:"sellerName,omitempty"`
	Images         []string         `bson:"images" json:"images"`
	Sizes          []string         `bson:"sizes" json:"sizes"`
	Colors         []TeeColorOption `bson:"colors" json:"colors"`
	Stock          int              `bson:"stock" json:"stock"`
	Featured       bool             `bson:"featured" json:"featured"`
	Popular        bool             `bson:"popular" json:"popular"`
	Published      bool             `bson:"published" json:"published"`
	RatingAvg      float64          `bson:"ratingAvg" json:"ratingAvg"`
	ReviewCount    int              `bson:"reviewCount" json:"reviewCount"`
	WeightedScore  float64          `bson:"weightedScore" json:"weightedScore"`
	SEOTitle       string           `bson:"seoTitle" json:"seoTitle"`
	SEODescription string           `bson:"seoDescription" json:"seoDescription"`
	CreatedAt      time.Time        `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time        `bson:"updatedAt" json:"updatedAt"`
}

type OrderItem struct {
	ID           string  `bson:"id" json:"id"`
	ProductID    string  `bson:"productId" json:"productId"`
	ProductName  string  `bson:"productName" json:"productName"`
	ProductSlug  string  `bson:"productSlug" json:"productSlug"`
	ProductImage string  `bson:"productImage" json:"productImage"`
	Size         string  `bson:"size" json:"size"`
	Color        string  `bson:"color" json:"color"`
	Quantity     int     `bson:"quantity" json:"quantity"`
	UnitPrice    float64 `bson:"unitPrice" json:"unitPrice"`
}

type Order struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex       string        `bson:"-" json:"id"`
	OrderNumber string        `bson:"orderNumber" json:"orderNumber"`
	// Nil for guest checkout orders, which carry no account.
	UserID        *bson.ObjectID `bson:"userId,omitempty" json:"-"`
	UserIDHex     string         `bson:"-" json:"userId"`
	CustomerName  string         `bson:"customerName" json:"customerName"`
	CustomerEmail string         `bson:"customerEmail,omitempty" json:"customerEmail,omitempty"`
	Phone         string         `bson:"phone" json:"phone"`
	Address       string         `bson:"address" json:"address"`
	// DeliveryAddress preserves the structured delivery snapshot, including the
	// confirmed pin, as it was at checkout time.
	DeliveryAddress *DeliveryAddress `bson:"deliveryAddress,omitempty" json:"deliveryAddress,omitempty"`
	Notes           string           `bson:"notes" json:"notes"`
	Currency        string           `bson:"currency,omitempty" json:"currency"`
	Subtotal        float64          `bson:"subtotal" json:"subtotal"`
	ShippingFee     float64          `bson:"shippingFee" json:"shippingFee"`
	Total           float64          `bson:"total" json:"total"`
	Status          OrderStatus      `bson:"status" json:"status"`
	PaymentMethod   string           `bson:"paymentMethod" json:"paymentMethod"`
	// IdempotencyKey deduplicates a checkout that is retried after a network
	// failure or double submit. It is deliberately never exposed in responses.
	IdempotencyKey string      `bson:"idempotencyKey,omitempty" json:"-"`
	Items          []OrderItem `bson:"items" json:"items"`
	CreatedAt      time.Time   `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time   `bson:"updatedAt" json:"updatedAt"`
}

type Review struct {
	ID                bson.ObjectID   `bson:"_id,omitempty" json:"-"`
	IDHex             string          `bson:"-" json:"id"`
	ProductID         bson.ObjectID   `bson:"productId" json:"-"`
	ProductIDHex      string          `bson:"-" json:"productId"`
	ProductName       string          `bson:"productName,omitempty" json:"productName,omitempty"`
	ProductSlug       string          `bson:"productSlug,omitempty" json:"productSlug,omitempty"`
	UserID            bson.ObjectID   `bson:"userId" json:"-"`
	UserIDHex         string          `bson:"-" json:"userId"`
	UserName          string          `bson:"userName" json:"userName"`
	Rating            int             `bson:"rating" json:"rating"`
	Comment           string          `bson:"comment" json:"comment"`
	HelpfulCount      int             `bson:"helpfulCount" json:"helpfulCount"`
	LikedByUserIDs    []bson.ObjectID `bson:"likedByUserIds" json:"-"`
	UserHasLiked      bool            `bson:"-" json:"userHasLiked"`
	VerifiedPurchase  bool            `bson:"verifiedPurchase" json:"verifiedPurchase"`
	Reported          bool            `bson:"reported" json:"reported"`
	ReportCount       int             `bson:"reportCount" json:"reportCount"`
	ReportReasons     []string        `bson:"reportReasons,omitempty" json:"-"`
	ReportedByUserIDs []bson.ObjectID `bson:"reportedByUserIds,omitempty" json:"-"`
	UserHasReported   bool            `bson:"-" json:"userHasReported"`
	CreatedAt         time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt         time.Time       `bson:"updatedAt" json:"updatedAt"`
}

// AdminReviewStats is the moderation overview returned with the admin list.
type AdminReviewStats struct {
	Total     int               `json:"total"`
	Average   float64           `json:"average"`
	Reported  int               `json:"reported"`
	Verified  int               `json:"verified"`
	Breakdown []RatingBreakdown `json:"breakdown"`
}

type CartItemDoc struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"-"`
	UserID    bson.ObjectID `bson:"userId" json:"-"`
	ProductID bson.ObjectID `bson:"productId" json:"-"`
	Size      string        `bson:"size" json:"size"`
	Color     string        `bson:"color" json:"color"`
	Quantity  int           `bson:"quantity" json:"quantity"`
	UpdatedAt time.Time     `bson:"updatedAt" json:"updatedAt"`
}

type CartItemDTO struct {
	ID            string  `json:"id,omitempty"`
	ProductID     string  `json:"productId"`
	ProductName   string  `json:"productName"`
	ProductSlug   string  `json:"productSlug"`
	ProductImage  string  `json:"productImage"`
	Size          string  `json:"size"`
	Color         string  `json:"color"`
	Quantity      int     `json:"quantity"`
	UnitPrice     float64 `json:"unitPrice"`
	OriginalPrice float64 `json:"originalPrice"`
	MaxStock      int     `json:"maxStock"`
}

type WishlistDoc struct {
	ID        bson.ObjectID `bson:"_id,omitempty"`
	UserID    bson.ObjectID `bson:"userId"`
	ProductID bson.ObjectID `bson:"productId"`
	CreatedAt time.Time     `bson:"createdAt"`
}

type InventoryLog struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex         string        `bson:"-" json:"id"`
	ProductID     bson.ObjectID `bson:"productId" json:"-"`
	ProductIDHex  string        `bson:"-" json:"productId"`
	ProductName   string        `bson:"productName" json:"productName"`
	ChangeAmount  int           `bson:"changeAmount" json:"changeAmount"`
	PreviousStock int           `bson:"previousStock" json:"previousStock"`
	NewStock      int           `bson:"newStock" json:"newStock"`
	Reason        string        `bson:"reason" json:"reason"`
	ActorName     string        `bson:"actorName" json:"actorName"`
	CreatedAt     time.Time     `bson:"createdAt" json:"createdAt"`
}

type StoreSetting struct {
	Key   string `bson:"_id" json:"key"`
	Value string `bson:"value" json:"value"`
}

type NewsletterSubscriber struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"-"`
	Email     string        `bson:"email" json:"email"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}

type Counter struct {
	ID  string `bson:"_id"`
	Seq int64  `bson:"seq"`
}

type RatingBreakdown struct {
	Stars      int `json:"stars"`
	Count      int `json:"count"`
	Percentage int `json:"percentage"`
}

type RatingSummary struct {
	Average   float64           `json:"average"`
	Total     int               `json:"total"`
	Breakdown []RatingBreakdown `json:"breakdown"`
}

type SalesPoint struct {
	Label  string  `json:"label"`
	Sales  float64 `json:"sales"`
	Orders int64   `json:"orders"`
}

type TopProductStat struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Image       string  `json:"image"`
	UnitsSold   int64   `json:"unitsSold"`
	Revenue     float64 `json:"revenue"`
	RatingAvg   float64 `json:"ratingAvg"`
	ReviewCount int     `json:"reviewCount"`
}

type AnalyticsData struct {
	TotalProducts       int64            `json:"totalProducts"`
	TotalSales          float64          `json:"totalSales"`
	TotalOrders         int64            `json:"totalOrders"`
	TotalCustomers      int64            `json:"totalCustomers"`
	InStockCount        int64            `json:"inStockCount"`
	OutOfStockCount     int64            `json:"outOfStockCount"`
	LowStockCount       int64            `json:"lowStockCount"`
	HighestRatedProduct *Product         `json:"highestRatedProduct"`
	SalesOverview       []SalesPoint     `json:"salesOverview"`
	TopProducts         []TopProductStat `json:"topProducts"`
	RecentOrders        []Order          `json:"recentOrders"`
	RecentProducts      []Product        `json:"recentProducts"`
	LowStockProducts    []Product        `json:"lowStockProducts"`
}

type Pagination struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

func (u *User) HydrateIDs() {
	u.IDHex = u.ID.Hex()
}

func (c *Category) HydrateIDs() {
	c.IDHex = c.ID.Hex()
}

func (p *Product) HydrateIDs() {
	p.IDHex = p.ID.Hex()
	p.CategoryIDHex = p.CategoryID.Hex()
	if p.Currency == "" {
		p.Currency = DefaultCurrency
	}
}

func (o *Order) HydrateIDs() {
	o.IDHex = o.ID.Hex()
	if o.Currency == "" {
		o.Currency = DefaultCurrency
	}
	if o.UserID != nil {
		o.UserIDHex = o.UserID.Hex()
	}
}

func (r *Review) HydrateIDs(currentUserID *bson.ObjectID) {
	r.IDHex = r.ID.Hex()
	r.ProductIDHex = r.ProductID.Hex()
	r.UserIDHex = r.UserID.Hex()
	r.UserHasLiked = false
	r.UserHasReported = false
	if currentUserID != nil {
		for _, id := range r.LikedByUserIDs {
			if id == *currentUserID {
				r.UserHasLiked = true
				break
			}
		}
		for _, id := range r.ReportedByUserIDs {
			if id == *currentUserID {
				r.UserHasReported = true
				break
			}
		}
	}
}

func (l *InventoryLog) HydrateIDs() {
	l.IDHex = l.ID.Hex()
	l.ProductIDHex = l.ProductID.Hex()
}
