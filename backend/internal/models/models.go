package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type UserRole string

const (
	RoleCustomer UserRole = "customer"
	RoleAdmin    UserRole = "admin"
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

type User struct {
	ID             bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex          string        `bson:"-" json:"id"`
	Name           string        `bson:"name" json:"name"`
	Email          string        `bson:"email,omitempty" json:"email"`
	PasswordHash   string        `bson:"passwordHash" json:"-"`
	Phone          string        `bson:"phone" json:"phone"`
	Address        string        `bson:"address" json:"address"`
	Role           UserRole      `bson:"role" json:"role"`
	Disabled       bool          `bson:"disabled" json:"disabled"`
	ResetCode      string        `bson:"resetCode,omitempty" json:"-"`
	ResetExpiresAt *time.Time    `bson:"resetExpiresAt,omitempty" json:"-"`
	CreatedAt      time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time     `bson:"updatedAt" json:"updatedAt"`
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
	ID             bson.ObjectID    `bson:"_id,omitempty" json:"-"`
	IDHex          string           `bson:"-" json:"id"`
	Name           string           `bson:"name" json:"name"`
	Slug           string           `bson:"slug" json:"slug"`
	Description    string           `bson:"description" json:"description"`
	Price          float64          `bson:"price" json:"price"`
	DiscountPrice  *float64         `bson:"discountPrice,omitempty" json:"discountPrice"`
	CategoryID     bson.ObjectID    `bson:"categoryId" json:"-"`
	CategoryIDHex  string           `bson:"-" json:"categoryId"`
	CategoryName   string           `bson:"categoryName" json:"categoryName"`
	CategorySlug   string           `bson:"categorySlug" json:"categorySlug"`
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
	ID            bson.ObjectID `bson:"_id,omitempty" json:"-"`
	IDHex         string        `bson:"-" json:"id"`
	OrderNumber   string        `bson:"orderNumber" json:"orderNumber"`
	UserID        bson.ObjectID `bson:"userId" json:"-"`
	UserIDHex     string        `bson:"-" json:"userId"`
	CustomerName  string        `bson:"customerName" json:"customerName"`
	CustomerEmail string        `bson:"customerEmail,omitempty" json:"customerEmail,omitempty"`
	Phone         string        `bson:"phone" json:"phone"`
	Address       string        `bson:"address" json:"address"`
	Notes         string        `bson:"notes" json:"notes"`
	Subtotal      float64       `bson:"subtotal" json:"subtotal"`
	ShippingFee   float64       `bson:"shippingFee" json:"shippingFee"`
	Total         float64       `bson:"total" json:"total"`
	Status        OrderStatus   `bson:"status" json:"status"`
	PaymentMethod string        `bson:"paymentMethod" json:"paymentMethod"`
	Items         []OrderItem   `bson:"items" json:"items"`
	CreatedAt     time.Time     `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time     `bson:"updatedAt" json:"updatedAt"`
}

type Review struct {
	ID               bson.ObjectID   `bson:"_id,omitempty" json:"-"`
	IDHex            string          `bson:"-" json:"id"`
	ProductID        bson.ObjectID   `bson:"productId" json:"-"`
	ProductIDHex     string          `bson:"-" json:"productId"`
	ProductName      string          `bson:"productName,omitempty" json:"productName,omitempty"`
	ProductSlug      string          `bson:"productSlug,omitempty" json:"productSlug,omitempty"`
	UserID           bson.ObjectID   `bson:"userId" json:"-"`
	UserIDHex        string          `bson:"-" json:"userId"`
	UserName         string          `bson:"userName" json:"userName"`
	Rating           int             `bson:"rating" json:"rating"`
	Comment          string          `bson:"comment" json:"comment"`
	HelpfulCount     int             `bson:"helpfulCount" json:"helpfulCount"`
	LikedByUserIDs   []bson.ObjectID `bson:"likedByUserIds" json:"-"`
	UserHasLiked     bool            `bson:"-" json:"userHasLiked"`
	VerifiedPurchase bool            `bson:"verifiedPurchase" json:"verifiedPurchase"`
	CreatedAt        time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt        time.Time       `bson:"updatedAt" json:"updatedAt"`
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
}

func (o *Order) HydrateIDs() {
	o.IDHex = o.ID.Hex()
	o.UserIDHex = o.UserID.Hex()
}

func (r *Review) HydrateIDs(currentUserID *bson.ObjectID) {
	r.IDHex = r.ID.Hex()
	r.ProductIDHex = r.ProductID.Hex()
	r.UserIDHex = r.UserID.Hex()
	r.UserHasLiked = false
	if currentUserID != nil {
		for _, id := range r.LikedByUserIDs {
			if id == *currentUserID {
				r.UserHasLiked = true
				break
			}
		}
	}
}

func (l *InventoryLog) HydrateIDs() {
	l.IDHex = l.ID.Hex()
	l.ProductIDHex = l.ProductID.Hex()
}
