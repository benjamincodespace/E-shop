package repositories

import (
	"context"
	"sort"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type AnalyticsRepository struct {
	store *StoreDB
}

func NewAnalyticsRepository(store *StoreDB) *AnalyticsRepository {
	return &AnalyticsRepository{store: store}
}

var monthNames = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

func (r *AnalyticsRepository) GetAnalytics(ctx context.Context) (*models.AnalyticsData, error) {
	pCur, err := r.store.DB.Collection("products").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer pCur.Close(ctx)
	var products []models.Product
	if err := pCur.All(ctx, &products); err != nil {
		return nil, err
	}

	var inStockCount, outOfStockCount int64
	var lowStock []models.Product
	var highestRated *models.Product

	for i := range products {
		products[i].HydrateIDs()
		p := products[i]
		if p.Stock > 0 {
			inStockCount++
			if p.Stock <= 5 {
				lowStock = append(lowStock, p)
			}
		} else {
			outOfStockCount++
		}
		if p.ReviewCount > 0 {
			if highestRated == nil || p.WeightedScore > highestRated.WeightedScore {
				cp := p
				highestRated = &cp
			}
		}
	}
	if highestRated == nil && len(products) > 0 {
		cp := products[0]
		highestRated = &cp
	}

	// Non-cancelled orders aggregation
	oCur, err := r.store.DB.Collection("orders").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer oCur.Close(ctx)
	var allOrders []models.Order
	if err := oCur.All(ctx, &allOrders); err != nil {
		return nil, err
	}

	totalSales := 0.0
	var totalOrders int64
	monthlyMap := make(map[string]*models.SalesPoint)
	prodUnits := make(map[string]int64)
	prodRev := make(map[string]float64)

	for i := range allOrders {
		allOrders[i].HydrateIDs()
		o := allOrders[i]
		if o.Status == models.OrderCancelled {
			continue
		}
		totalOrders++
		// Reports are normalised to USD so orders placed in different
		// currencies can be compared and totalled together.
		orderTotalUSD := services.ConvertCurrency(o.Total, o.Currency, models.DefaultCurrency)
		totalSales += orderTotalUSD

		ym := o.CreatedAt.UTC().Format("2006-01")
		sp, ok := monthlyMap[ym]
		if !ok {
			mIdx := int(o.CreatedAt.UTC().Month()) - 1
			lbl := ym
			if mIdx >= 0 && mIdx < len(monthNames) {
				lbl = monthNames[mIdx]
			}
			sp = &models.SalesPoint{Label: lbl}
			monthlyMap[ym] = sp
		}
		sp.Sales = services.Round2(sp.Sales + orderTotalUSD)
		sp.Orders++

		for _, item := range o.Items {
			prodUnits[item.ProductID] += int64(item.Quantity)
			itemRevenueUSD := services.ConvertCurrency(item.UnitPrice*float64(item.Quantity), o.Currency, models.DefaultCurrency)
			prodRev[item.ProductID] = services.Round2(prodRev[item.ProductID] + itemRevenueUSD)
		}
	}

	keys := make([]string, 0, len(monthlyMap))
	for k := range monthlyMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) > 12 {
		keys = keys[len(keys)-12:]
	}
	salesOverview := make([]models.SalesPoint, 0, len(keys))
	for _, k := range keys {
		salesOverview = append(salesOverview, *monthlyMap[k])
	}

	topProducts := make([]models.TopProductStat, 0, len(products))
	for _, p := range products {
		img := "/images/tee_black_classic_1795513062767.jpg"
		if len(p.Images) > 0 {
			img = p.Images[0]
		}
		topProducts = append(topProducts, models.TopProductStat{
			ID:          p.IDHex,
			Name:        p.Name,
			Slug:        p.Slug,
			Image:       img,
			UnitsSold:   prodUnits[p.IDHex],
			Revenue:     prodRev[p.IDHex],
			RatingAvg:   p.RatingAvg,
			ReviewCount: p.ReviewCount,
		})
	}
	sort.Slice(topProducts, func(i, j int) bool {
		if topProducts[i].Revenue != topProducts[j].Revenue {
			return topProducts[i].Revenue > topProducts[j].Revenue
		}
		return topProducts[i].UnitsSold > topProducts[j].UnitsSold
	})
	if len(topProducts) > 5 {
		topProducts = topProducts[:5]
	}

	totalCustomers, _ := r.store.DB.Collection("users").CountDocuments(ctx, bson.M{"role": models.RoleCustomer})

	recentOrders := allOrders
	if len(recentOrders) > 6 {
		recentOrders = recentOrders[:6]
	}
	recentProducts := products
	if len(recentProducts) > 6 {
		recentProducts = recentProducts[:6]
	}
	if lowStock == nil {
		lowStock = []models.Product{}
	}
	if recentOrders == nil {
		recentOrders = []models.Order{}
	}
	if recentProducts == nil {
		recentProducts = []models.Product{}
	}

	return &models.AnalyticsData{
		TotalProducts:       int64(len(products)),
		TotalSales:          services.Round2(totalSales),
		TotalOrders:         totalOrders,
		TotalCustomers:      totalCustomers,
		InStockCount:        inStockCount,
		OutOfStockCount:     outOfStockCount,
		LowStockCount:       int64(len(lowStock)),
		HighestRatedProduct: highestRated,
		SalesOverview:       salesOverview,
		TopProducts:         topProducts,
		RecentOrders:        recentOrders,
		RecentProducts:      recentProducts,
		LowStockProducts:    lowStock,
	}, nil
}

func (r *AnalyticsRepository) GetSettings(ctx context.Context) (map[string]string, error) {
	cur, err := r.store.DB.Collection("store_settings").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	out := map[string]string{}
	for cur.Next(ctx) {
		var s models.StoreSetting
		if err := cur.Decode(&s); err == nil {
			out[s.Key] = s.Value
		}
	}
	return out, nil
}

func (r *AnalyticsRepository) UpdateSettings(ctx context.Context, updates map[string]string) (map[string]string, error) {
	allowed := map[string]bool{
		"storeName":             true,
		"tagline":               true,
		"freeShippingThreshold": true,
		"supportEmail":          true,
	}
	for k, v := range updates {
		if !allowed[k] {
			continue
		}
		_, _ = r.store.DB.Collection("store_settings").UpdateOne(
			ctx,
			bson.M{"_id": k},
			bson.M{"$set": bson.M{"value": v}},
			options.UpdateOne().SetUpsert(true),
		)
	}
	return r.GetSettings(ctx)
}

func (r *AnalyticsRepository) SubscribeNewsletter(ctx context.Context, email string) error {
	_, err := r.store.DB.Collection("newsletter_subscribers").UpdateOne(
		ctx,
		bson.M{"email": email},
		bson.M{"$setOnInsert": models.NewsletterSubscriber{
			ID:        bson.NewObjectID(),
			Email:     email,
			CreatedAt: time.Now().UTC(),
		}},
		options.UpdateOne().SetUpsert(true),
	)
	if mongo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}
