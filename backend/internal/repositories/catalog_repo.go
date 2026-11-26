package repositories

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type CatalogRepository struct {
	store *StoreDB
}

func NewCatalogRepository(store *StoreDB) *CatalogRepository {
	return &CatalogRepository{store: store}
}

func (r *CatalogRepository) ListCategoriesWithCount(ctx context.Context) ([]models.Category, error) {
	cursor, err := r.store.DB.Collection("categories").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var cats []models.Category
	if err := cursor.All(ctx, &cats); err != nil {
		return nil, err
	}

	// Count published products per category via aggregation
	aggCur, err := r.store.DB.Collection("products").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"published": true}}},
		{{Key: "$group", Value: bson.M{"_id": "$categoryId", "count": bson.M{"$sum": 1}}}},
	})
	counts := make(map[bson.ObjectID]int64)
	if err == nil {
		defer aggCur.Close(ctx)
		for aggCur.Next(ctx) {
			var row struct {
				ID    bson.ObjectID `bson:"_id"`
				Count int64         `bson:"count"`
			}
			if err := aggCur.Decode(&row); err == nil {
				counts[row.ID] = row.Count
			}
		}
	}

	for i := range cats {
		cats[i].HydrateIDs()
		cats[i].ProductCount = counts[cats[i].ID]
	}
	if cats == nil {
		cats = []models.Category{}
	}
	return cats, nil
}

func (r *CatalogRepository) FindCategoryByID(ctx context.Context, idHex string) (*models.Category, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, nil
	}
	var cat models.Category
	err = r.store.DB.Collection("categories").FindOne(ctx, bson.M{"_id": oid}).Decode(&cat)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cat.HydrateIDs()
	return &cat, nil
}

func (r *CatalogRepository) CreateCategory(ctx context.Context, name, slug, desc string) (*models.Category, error) {
	cat := models.Category{
		ID:          bson.NewObjectID(),
		Name:        name,
		Slug:        slug,
		Description: desc,
		CreatedAt:   time.Now().UTC(),
	}
	if _, err := r.store.DB.Collection("categories").InsertOne(ctx, cat); err != nil {
		return nil, err
	}
	cat.HydrateIDs()
	return &cat, nil
}

type ProductQuery struct {
	Search             string
	CategorySlug       string
	PriceRange         string
	Sort               string
	Featured           bool
	Popular            bool
	IncludeUnpublished bool
	Page               int
	Limit              int
}

func (r *CatalogRepository) ListProducts(ctx context.Context, q ProductQuery) ([]models.Product, models.Pagination, error) {
	filter := bson.M{}
	if !q.IncludeUnpublished {
		filter["published"] = true
	}
	if q.CategorySlug != "" && q.CategorySlug != "all" {
		filter["categorySlug"] = q.CategorySlug
	}
	if q.Featured {
		filter["featured"] = true
	}
	if q.Popular {
		filter["popular"] = true
	}

	cursor, err := r.store.DB.Collection("products").Find(ctx, filter)
	if err != nil {
		return nil, models.Pagination{}, err
	}
	defer cursor.Close(ctx)

	var all []models.Product
	if err := cursor.All(ctx, &all); err != nil {
		return nil, models.Pagination{}, err
	}

	// Apply search & effective price range filtering cleanly
	searchLower := strings.ToLower(strings.TrimSpace(q.Search))
	filtered := make([]models.Product, 0, len(all))
	for i := range all {
		all[i].HydrateIDs()
		p := all[i]
		if searchLower != "" {
			hay := strings.ToLower(p.Name + " " + p.Description + " " + p.CategoryName)
			if !strings.Contains(hay, searchLower) {
				continue
			}
		}
		// Price filters and sorting are expressed in USD, so products priced in
		// different currencies compare on the same scale.
		eff := services.ConvertCurrencyRounded(services.GetEffectivePrice(p.Price, p.DiscountPrice), p.Currency, models.DefaultCurrency)
		if !matchesPriceRange(eff, q.PriceRange) {
			continue
		}
		filtered = append(filtered, p)
	}

	// Sort
	sortProducts(filtered, q.Sort)

	total := int64(len(filtered))
	page := q.Page
	if page < 1 {
		page = 1
	}
	limit := q.Limit
	if limit < 1 {
		limit = 24
	}
	if limit > 100 {
		limit = 100
	}
	totalPages := int(math.Max(1, math.Ceil(float64(total)/float64(limit))))
	offset := (page - 1) * limit
	end := offset + limit
	if offset > len(filtered) {
		offset = len(filtered)
	}
	if end > len(filtered) {
		end = len(filtered)
	}

	return filtered[offset:end], models.Pagination{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
	}, nil
}

func effectivePriceUSD(p models.Product) float64 {
	return services.ConvertCurrency(services.GetEffectivePrice(p.Price, p.DiscountPrice), p.Currency, models.DefaultCurrency)
}

func matchesPriceRange(price float64, r string) bool {
	switch r {
	case "0-15":
		return price >= 0 && price <= 15
	case "15-25":
		return price > 15 && price <= 25
	case "25-40":
		return price > 25 && price <= 40
	case "40+":
		return price > 40
	default:
		return true
	}
}

func sortProducts(items []models.Product, sortBy string) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			swap := false
			switch sortBy {
			case "price-asc":
				swap = effectivePriceUSD(items[j]) < effectivePriceUSD(items[i])
			case "price-desc":
				swap = effectivePriceUSD(items[j]) > effectivePriceUSD(items[i])
			case "rating":
				swap = items[j].WeightedScore > items[i].WeightedScore
			default:
				swap = items[j].CreatedAt.After(items[i].CreatedAt)
			}
			if swap {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}

func (r *CatalogRepository) FindProductBySlug(ctx context.Context, slug string) (*models.Product, error) {
	var p models.Product
	err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"slug": slug}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.HydrateIDs()
	return &p, nil
}

func (r *CatalogRepository) FindProductByID(ctx context.Context, idHex string) (*models.Product, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, nil
	}
	var p models.Product
	err = r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": oid}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.HydrateIDs()
	return &p, nil
}

func (r *CatalogRepository) CreateProduct(ctx context.Context, p *models.Product, actorName string) error {
	p.ID = bson.NewObjectID()
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	if _, err := r.store.DB.Collection("products").InsertOne(ctx, p); err != nil {
		return err
	}
	p.HydrateIDs()

	_, _ = r.store.DB.Collection("inventory_logs").InsertOne(ctx, models.InventoryLog{
		ID:            bson.NewObjectID(),
		ProductID:     p.ID,
		ProductName:   p.Name,
		ChangeAmount:  p.Stock,
		PreviousStock: 0,
		NewStock:      p.Stock,
		Reason:        "Initial stock on product creation",
		ActorName:     actorName,
		CreatedAt:     now,
	})
	return nil
}

func (r *CatalogRepository) UpdateProduct(ctx context.Context, id bson.ObjectID, prevStock int, updateFields bson.M, actorName string) (*models.Product, error) {
	now := time.Now().UTC()
	updateFields["updatedAt"] = now

	res := r.store.DB.Collection("products").FindOneAndUpdate(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": updateFields},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var updated models.Product
	if err := res.Decode(&updated); err != nil {
		return nil, err
	}
	updated.HydrateIDs()

	if updated.Stock != prevStock {
		_, _ = r.store.DB.Collection("inventory_logs").InsertOne(ctx, models.InventoryLog{
			ID:            bson.NewObjectID(),
			ProductID:     updated.ID,
			ProductName:   updated.Name,
			ChangeAmount:  updated.Stock - prevStock,
			PreviousStock: prevStock,
			NewStock:      updated.Stock,
			Reason:        "Product edit stock update",
			ActorName:     actorName,
			CreatedAt:     now,
		})
	}
	return &updated, nil
}

func (r *CatalogRepository) DeleteOrArchiveProduct(ctx context.Context, idHex string) (archived bool, deletedImages []string, err error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return false, nil, mongo.ErrNoDocuments
	}
	var existing models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": oid}).Decode(&existing); err != nil {
		return false, nil, err
	}

	orderCount, err := r.store.DB.Collection("orders").CountDocuments(ctx, bson.M{"items.productId": idHex})
	if err != nil {
		return false, nil, err
	}
	if orderCount > 0 {
		_, err = r.store.DB.Collection("products").UpdateByID(ctx, oid, bson.M{
			"$set": bson.M{"published": false, "stock": 0, "updatedAt": time.Now().UTC()},
		})
		return true, nil, err
	}

	if _, err := r.store.DB.Collection("products").DeleteOne(ctx, bson.M{"_id": oid}); err != nil {
		return false, nil, err
	}
	_, _ = r.store.DB.Collection("reviews").DeleteMany(ctx, bson.M{"productId": oid})
	_, _ = r.store.DB.Collection("carts").DeleteMany(ctx, bson.M{"productId": oid})
	_, _ = r.store.DB.Collection("wishlists").DeleteMany(ctx, bson.M{"productId": oid})
	_, _ = r.store.DB.Collection("inventory_logs").DeleteMany(ctx, bson.M{"productId": oid})

	return false, existing.Images, nil
}

func (r *CatalogRepository) ListInventory(ctx context.Context) ([]models.Product, []models.InventoryLog, error) {
	pCur, err := r.store.DB.Collection("products").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "stock", Value: 1}, {Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, nil, err
	}
	defer pCur.Close(ctx)
	var products []models.Product
	if err := pCur.All(ctx, &products); err != nil {
		return nil, nil, err
	}
	for i := range products {
		products[i].HydrateIDs()
	}

	lCur, err := r.store.DB.Collection("inventory_logs").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(40))
	if err != nil {
		return nil, nil, err
	}
	defer lCur.Close(ctx)
	var logs []models.InventoryLog
	if err := lCur.All(ctx, &logs); err != nil {
		return nil, nil, err
	}
	for i := range logs {
		logs[i].HydrateIDs()
	}
	if products == nil {
		products = []models.Product{}
	}
	if logs == nil {
		logs = []models.InventoryLog{}
	}
	return products, logs, nil
}

func (r *CatalogRepository) AdjustInventory(ctx context.Context, productIDHex, mode string, value int, reason, actorName string) (*models.Product, error) {
	oid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return nil, mongo.ErrNoDocuments
	}
	var prod models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": oid}).Decode(&prod); err != nil {
		return nil, err
	}

	nextStock := value
	if mode == "delta" {
		nextStock = prod.Stock + value
	}
	if nextStock < 0 {
		nextStock = 0
	}
	change := nextStock - prod.Stock
	now := time.Now().UTC()

	res := r.store.DB.Collection("products").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"stock": nextStock, "updatedAt": now}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var updated models.Product
	if err := res.Decode(&updated); err != nil {
		return nil, err
	}
	updated.HydrateIDs()

	_, _ = r.store.DB.Collection("inventory_logs").InsertOne(ctx, models.InventoryLog{
		ID:            bson.NewObjectID(),
		ProductID:     updated.ID,
		ProductName:   updated.Name,
		ChangeAmount:  change,
		PreviousStock: prod.Stock,
		NewStock:      nextStock,
		Reason:        reason,
		ActorName:     actorName,
		CreatedAt:     now,
	})
	return &updated, nil
}
