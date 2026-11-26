package repositories

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var (
	ErrInsufficientStock  = errors.New("insufficient stock")
	ErrProductUnavailable = errors.New("product unavailable")
	ErrInvalidTransition  = errors.New("invalid status transition")
)

type OrderRepository struct {
	store *StoreDB
}

func NewOrderRepository(store *StoreDB) *OrderRepository {
	return &OrderRepository{store: store}
}

func (r *OrderRepository) GetCartItems(ctx context.Context, userIDHex string) ([]models.CartItemDTO, error) {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return []models.CartItemDTO{}, nil
	}
	cur, err := r.store.DB.Collection("carts").Find(ctx, bson.M{"userId": uid}, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var docs []models.CartItemDoc
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}

	items := make([]models.CartItemDTO, 0, len(docs))
	if len(docs) == 0 {
		return items, nil
	}

	// Fetch every cart product in one query instead of one lookup per line.
	productIDs := make([]bson.ObjectID, 0, len(docs))
	for _, d := range docs {
		productIDs = append(productIDs, d.ProductID)
	}
	prodCur, err := r.store.DB.Collection("products").Find(ctx, bson.M{
		"_id":       bson.M{"$in": productIDs},
		"published": true,
	})
	if err != nil {
		return nil, err
	}
	defer prodCur.Close(ctx)
	products := make(map[bson.ObjectID]models.Product, len(productIDs))
	for prodCur.Next(ctx) {
		var p models.Product
		if err := prodCur.Decode(&p); err != nil {
			continue
		}
		products[p.ID] = p
	}
	if err := prodCur.Err(); err != nil {
		return nil, err
	}

	for _, d := range docs {
		prod, ok := products[d.ProductID]
		if !ok {
			continue
		}
		img := "/images/tee_black_classic_1795513062767.jpg"
		if len(prod.Images) > 0 {
			img = prod.Images[0]
		}
		items = append(items, models.CartItemDTO{
			ID:            d.ID.Hex(),
			ProductID:     prod.ID.Hex(),
			ProductName:   prod.Name,
			ProductSlug:   prod.Slug,
			ProductImage:  img,
			Size:          d.Size,
			Color:         d.Color,
			Quantity:      d.Quantity,
			UnitPrice:     services.GetEffectivePrice(prod.Price, prod.DiscountPrice),
			OriginalPrice: prod.Price,
			MaxStock:      prod.Stock,
		})
	}
	return items, nil
}

func (r *OrderRepository) UpsertCartItem(ctx context.Context, userIDHex, productIDHex, size, color string, qty int, syncMode bool) error {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return err
	}
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return ErrProductUnavailable
	}
	var prod models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": pid, "published": true}).Decode(&prod); err != nil {
		return ErrProductUnavailable
	}
	if prod.Stock <= 0 {
		return ErrInsufficientStock
	}

	filter := bson.M{"userId": uid, "productId": pid, "size": size, "color": color}
	var existing models.CartItemDoc
	err = r.store.DB.Collection("carts").FindOne(ctx, filter).Decode(&existing)
	now := time.Now().UTC()

	if errors.Is(err, mongo.ErrNoDocuments) {
		clamped := qty
		if clamped > prod.Stock {
			clamped = prod.Stock
		}
		if clamped < 1 {
			clamped = 1
		}
		_, err = r.store.DB.Collection("carts").InsertOne(ctx, models.CartItemDoc{
			ID:        bson.NewObjectID(),
			UserID:    uid,
			ProductID: pid,
			Size:      size,
			Color:     color,
			Quantity:  clamped,
			UpdatedAt: now,
		})
		return err
	} else if err != nil {
		return err
	}

	nextQty := existing.Quantity + qty
	if syncMode {
		if qty > existing.Quantity {
			nextQty = qty
		} else {
			nextQty = existing.Quantity
		}
	}
	if nextQty > prod.Stock {
		nextQty = prod.Stock
	}
	_, err = r.store.DB.Collection("carts").UpdateByID(ctx, existing.ID, bson.M{
		"$set": bson.M{"quantity": nextQty, "updatedAt": now},
	})
	return err
}

func (r *OrderRepository) UpdateCartQty(ctx context.Context, userIDHex, productIDHex, size, color string, qty int) error {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return err
	}
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return ErrProductUnavailable
	}
	filter := bson.M{"userId": uid, "productId": pid, "size": size, "color": color}
	if qty <= 0 {
		_, err := r.store.DB.Collection("carts").DeleteOne(ctx, filter)
		return err
	}
	var prod models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": pid}).Decode(&prod); err != nil {
		return ErrProductUnavailable
	}
	clamped := qty
	if prod.Stock > 0 && clamped > prod.Stock {
		clamped = prod.Stock
	}
	_, err = r.store.DB.Collection("carts").UpdateOne(ctx, filter, bson.M{
		"$set": bson.M{"quantity": clamped, "updatedAt": time.Now().UTC()},
	})
	return err
}

func (r *OrderRepository) RemoveCartItem(ctx context.Context, userIDHex, productIDHex, size, color string) error {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return err
	}
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return err
	}
	filter := bson.M{"userId": uid, "productId": pid}
	if size != "" && color != "" {
		filter["size"] = size
		filter["color"] = color
	}
	_, err = r.store.DB.Collection("carts").DeleteMany(ctx, filter)
	return err
}

func (r *OrderRepository) GetWishlistProducts(ctx context.Context, userIDHex string) ([]models.Product, error) {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return []models.Product{}, nil
	}
	cur, err := r.store.DB.Collection("wishlists").Find(ctx, bson.M{"userId": uid}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []models.Product
	for cur.Next(ctx) {
		var w models.WishlistDoc
		if err := cur.Decode(&w); err != nil {
			continue
		}
		var prod models.Product
		if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": w.ProductID, "published": true}).Decode(&prod); err == nil {
			prod.HydrateIDs()
			out = append(out, prod)
		}
	}
	if out == nil {
		out = []models.Product{}
	}
	return out, nil
}

func (r *OrderRepository) AddWishlist(ctx context.Context, userIDHex, productIDHex string) error {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return err
	}
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return ErrProductUnavailable
	}
	count, err := r.store.DB.Collection("products").CountDocuments(ctx, bson.M{"_id": pid, "published": true})
	if err != nil || count == 0 {
		return ErrProductUnavailable
	}
	_, err = r.store.DB.Collection("wishlists").UpdateOne(
		ctx,
		bson.M{"userId": uid, "productId": pid},
		bson.M{"$setOnInsert": models.WishlistDoc{
			ID:        bson.NewObjectID(),
			UserID:    uid,
			ProductID: pid,
			CreatedAt: time.Now().UTC(),
		}},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func (r *OrderRepository) RemoveWishlist(ctx context.Context, userIDHex, productIDHex string) error {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return err
	}
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return nil
	}
	_, err = r.store.DB.Collection("wishlists").DeleteOne(ctx, bson.M{"userId": uid, "productId": pid})
	return err
}

type CheckoutLineInput struct {
	ProductID string `json:"productId"`
	Size      string `json:"size"`
	Color     string `json:"color"`
	Quantity  int    `json:"quantity"`
}

type CheckoutInput struct {
	UserID        string
	CustomerEmail string
	CustomerName  string
	Phone         string
	Address       string
	// DeliveryAddress is the validated, structured snapshot from checkout.
	DeliveryAddress *models.DeliveryAddress
	Notes           string
	PaymentMethod   string
	Currency        string
	// IdempotencyKey deduplicates a retried checkout. Empty disables dedupe,
	// which keeps older clients working unchanged.
	IdempotencyKey string
	Items          []CheckoutLineInput
}

// PlaceOrderAtomic uses a MongoDB multi-document ACID transaction + conditional stock decrement
// to guarantee no overselling and consistent order + inventory log + cart clearing.
func (r *OrderRepository) PlaceOrderAtomic(ctx context.Context, in CheckoutInput) (*models.Order, error) {
	// Guest checkout has no account, so the order simply carries no userId.
	var uid *bson.ObjectID
	if trimmed := strings.TrimSpace(in.UserID); trimmed != "" {
		parsed, err := bson.ObjectIDFromHex(trimmed)
		if err != nil {
			return nil, err
		}
		uid = &parsed
	}

	orderCurrency := services.NormalizeCurrency(in.Currency)
	idempotencyKey := strings.TrimSpace(in.IdempotencyKey)
	if idempotencyKey != "" {
		if existing, lookupErr := r.findOrderByIdempotencyKey(ctx, idempotencyKey, uid, in.Phone); lookupErr == nil && existing != nil {
			return existing, nil
		}
	}

	session, err := r.store.Client.StartSession()
	if err != nil {
		return nil, err
	}
	defer session.EndSession(ctx)

	res, err := session.WithTransaction(ctx, func(sessCtx context.Context) (interface{}, error) {
		now := time.Now().UTC()
		orderNumber, err := r.store.NextOrderNumber(sessCtx)
		if err != nil {
			return nil, err
		}

		subtotal := 0.0
		orderItems := make([]models.OrderItem, 0, len(in.Items))
		invLogs := make([]interface{}, 0, len(in.Items))

		for _, line := range in.Items {
			pid, err := bson.ObjectIDFromHex(line.ProductID)
			if err != nil || line.Quantity <= 0 {
				return nil, ErrProductUnavailable
			}

			// Atomic conditional stock decrement: only succeeds if published=true AND stock >= quantity
			var beforeProd models.Product
			err = r.store.DB.Collection("products").FindOneAndUpdate(
				sessCtx,
				bson.M{"_id": pid, "published": true, "stock": bson.M{"$gte": line.Quantity}},
				bson.M{"$inc": bson.M{"stock": -line.Quantity}, "$set": bson.M{"updatedAt": now}},
				options.FindOneAndUpdate().SetReturnDocument(options.Before),
			).Decode(&beforeProd)

			if errors.Is(err, mongo.ErrNoDocuments) {
				var check models.Product
				checkErr := r.store.DB.Collection("products").FindOne(sessCtx, bson.M{"_id": pid}).Decode(&check)
				if checkErr != nil || !check.Published {
					return nil, ErrProductUnavailable
				}
				return nil, fmt.Errorf("%w: only %d unit(s) left for %s", ErrInsufficientStock, check.Stock, check.Name)
			}
			if err != nil {
				return nil, err
			}

			// Convert each product's own pricing currency into the currency the
			// shopper checked out with, so mixed-currency carts total correctly.
			unitPrice := services.ConvertCurrencyRounded(
				services.GetEffectivePrice(beforeProd.Price, beforeProd.DiscountPrice),
				beforeProd.Currency,
				orderCurrency,
			)
			subtotal += unitPrice * float64(line.Quantity)

			img := "/images/tee_black_classic_1795513062767.jpg"
			if len(beforeProd.Images) > 0 {
				img = beforeProd.Images[0]
			}
			size := line.Size
			if size == "" {
				size = "M"
			}
			color := line.Color
			if color == "" {
				color = "Black"
			}

			orderItems = append(orderItems, models.OrderItem{
				ID:           bson.NewObjectID().Hex(),
				ProductID:    beforeProd.ID.Hex(),
				ProductName:  beforeProd.Name,
				ProductSlug:  beforeProd.Slug,
				ProductImage: img,
				Size:         size,
				Color:        color,
				Quantity:     line.Quantity,
				UnitPrice:    unitPrice,
			})

			invLogs = append(invLogs, models.InventoryLog{
				ID:            bson.NewObjectID(),
				ProductID:     beforeProd.ID,
				ProductName:   beforeProd.Name,
				ChangeAmount:  -line.Quantity,
				PreviousStock: beforeProd.Stock,
				NewStock:      beforeProd.Stock - line.Quantity,
				Reason:        fmt.Sprintf("Order %s placed", orderNumber),
				ActorName:     in.CustomerName,
				CreatedAt:     now,
			})
		}

		subtotal = services.RoundCurrency(subtotal, orderCurrency)
		shippingFee, total := services.CalculateShippingAndTotalForCurrency(subtotal, orderCurrency)

		order := models.Order{
			ID:              bson.NewObjectID(),
			OrderNumber:     orderNumber,
			UserID:          uid,
			CustomerName:    in.CustomerName,
			CustomerEmail:   in.CustomerEmail,
			Phone:           in.Phone,
			Address:         in.Address,
			DeliveryAddress: in.DeliveryAddress,
			Notes:           in.Notes,
			Currency:        orderCurrency,
			Subtotal:        subtotal,
			ShippingFee:     shippingFee,
			Total:           total,
			Status:          models.OrderPending,
			PaymentMethod:   in.PaymentMethod,
			IdempotencyKey:  idempotencyKey,
			Items:           orderItems,
			CreatedAt:       now,
			UpdatedAt:       now,
		}

		if _, err := r.store.DB.Collection("orders").InsertOne(sessCtx, order); err != nil {
			return nil, err
		}
		if len(invLogs) > 0 {
			if _, err := r.store.DB.Collection("inventory_logs").InsertMany(sessCtx, invLogs); err != nil {
				return nil, err
			}
		}
		if uid != nil {
			if _, err := r.store.DB.Collection("carts").DeleteMany(sessCtx, bson.M{"userId": *uid}); err != nil {
				return nil, err
			}
		}

		order.HydrateIDs()
		return &order, nil
	})

	if err != nil {
		// A concurrent request with the same key can win the unique-index race;
		// this transaction then rolls back, leaving exactly one order behind.
		if idempotencyKey != "" {
			if existing, lookupErr := r.findOrderByIdempotencyKey(ctx, idempotencyKey, uid, in.Phone); lookupErr == nil && existing != nil {
				return existing, nil
			}
		}
		return nil, err
	}
	return res.(*models.Order), nil
}

// findOrderByIdempotencyKey returns the order created by an earlier request
// with this key. The lookup is scoped to the same account (or the same guest
// phone) so a guessed key can never expose another shopper's order.
func (r *OrderRepository) findOrderByIdempotencyKey(ctx context.Context, key string, userID *bson.ObjectID, phone string) (*models.Order, error) {
	filter := bson.M{"idempotencyKey": key}
	if userID != nil {
		filter["userId"] = *userID
	} else if phone != "" {
		filter["phone"] = phone
	}
	var existing models.Order
	err := r.store.DB.Collection("orders").FindOne(ctx, filter).Decode(&existing)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	existing.HydrateIDs()
	return &existing, nil
}

func (r *OrderRepository) ListOrdersByUser(ctx context.Context, userIDHex string) ([]models.Order, error) {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return []models.Order{}, nil
	}
	cur, err := r.store.DB.Collection("orders").Find(ctx, bson.M{"userId": uid}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var orders []models.Order
	if err := cur.All(ctx, &orders); err != nil {
		return nil, err
	}
	for i := range orders {
		orders[i].HydrateIDs()
	}
	if orders == nil {
		orders = []models.Order{}
	}
	return orders, nil
}

func (r *OrderRepository) ListAdminOrders(ctx context.Context, status, search string) ([]models.Order, error) {
	filter := bson.M{}
	if status != "" && status != "All" {
		filter["status"] = status
	}
	// Search in the database so the API does not download every order and
	// filter it in memory. QuoteMeta keeps user input from becoming a regex.
	if q := strings.TrimSpace(search); q != "" {
		pattern := bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"}
		filter["$or"] = bson.A{
			bson.M{"orderNumber": pattern},
			bson.M{"customerName": pattern},
			bson.M{"customerEmail": pattern},
			bson.M{"phone": pattern},
		}
	}
	cur, err := r.store.DB.Collection("orders").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []models.Order
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	for i := range out {
		out[i].HydrateIDs()
	}
	if out == nil {
		out = []models.Order{}
	}
	return out, nil
}

// ListAdminOrdersForSeller returns the orders that contain products owned by
// one seller, with the item list trimmed to those products. This keeps a
// seller's console from exposing other sellers' sales.
func (r *OrderRepository) ListAdminOrdersForSeller(ctx context.Context, sellerID, status, search string) ([]models.Order, error) {
	pCur, err := r.store.DB.Collection("products").Find(ctx, bson.M{"sellerId": sellerID})
	if err != nil {
		return nil, err
	}
	var owned []models.Product
	if err := pCur.All(ctx, &owned); err != nil {
		pCur.Close(ctx)
		return nil, err
	}
	pCur.Close(ctx)

	ownedIDs := make(map[string]bool, len(owned))
	for i := range owned {
		ownedIDs[owned[i].ID.Hex()] = true
	}

	orders, err := r.ListAdminOrders(ctx, status, search)
	if err != nil {
		return nil, err
	}

	out := make([]models.Order, 0, len(orders))
	for _, o := range orders {
		items := make([]models.OrderItem, 0, len(o.Items))
		subtotal := 0.0
		for _, it := range o.Items {
			if !ownedIDs[it.ProductID] {
				continue
			}
			items = append(items, it)
			subtotal += it.UnitPrice * float64(it.Quantity)
		}
		if len(items) == 0 {
			continue
		}
		o.Items = items
		o.Subtotal = services.Round2(subtotal)
		o.Total = services.Round2(subtotal + o.ShippingFee)
		out = append(out, o)
	}
	return out, nil
}

// UpdateOrderStatusAtomic validates order state transition and atomically restores product stock on cancellation.
func (r *OrderRepository) UpdateOrderStatusAtomic(ctx context.Context, orderIDHex string, nextStatus models.OrderStatus, actorName string) (*models.Order, error) {
	oid, err := bson.ObjectIDFromHex(orderIDHex)
	if err != nil {
		return nil, mongo.ErrNoDocuments
	}

	session, err := r.store.Client.StartSession()
	if err != nil {
		return nil, err
	}
	defer session.EndSession(ctx)

	res, err := session.WithTransaction(ctx, func(sessCtx context.Context) (interface{}, error) {
		var current models.Order
		if err := r.store.DB.Collection("orders").FindOne(sessCtx, bson.M{"_id": oid}).Decode(&current); err != nil {
			return nil, err
		}
		if !services.CanTransitionOrderStatus(current.Status, nextStatus) {
			return nil, fmt.Errorf("%w: cannot transition from %s to %s", ErrInvalidTransition, current.Status, nextStatus)
		}

		now := time.Now().UTC()
		// The current status is part of the filter so two concurrent updates
		// cannot both pass the transition check and restock the same order twice.
		var updated models.Order
		err := r.store.DB.Collection("orders").FindOneAndUpdate(
			sessCtx,
			bson.M{"_id": oid, "status": current.Status},
			bson.M{"$set": bson.M{"status": nextStatus, "updatedAt": now}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, fmt.Errorf("%w: order state changed while updating", ErrInvalidTransition)
		}
		if err != nil {
			return nil, err
		}

		if nextStatus == models.OrderCancelled && current.Status != models.OrderCancelled {
			for _, item := range current.Items {
				pid, err := bson.ObjectIDFromHex(item.ProductID)
				if err != nil {
					continue
				}
				var beforeProd models.Product
				err = r.store.DB.Collection("products").FindOneAndUpdate(
					sessCtx,
					bson.M{"_id": pid},
					bson.M{"$inc": bson.M{"stock": item.Quantity}, "$set": bson.M{"updatedAt": now}},
					options.FindOneAndUpdate().SetReturnDocument(options.Before),
				).Decode(&beforeProd)
				if err == nil {
					_, _ = r.store.DB.Collection("inventory_logs").InsertOne(sessCtx, models.InventoryLog{
						ID:            bson.NewObjectID(),
						ProductID:     pid,
						ProductName:   beforeProd.Name,
						ChangeAmount:  item.Quantity,
						PreviousStock: beforeProd.Stock,
						NewStock:      beforeProd.Stock + item.Quantity,
						Reason:        fmt.Sprintf("Order %s cancelled", current.OrderNumber),
						ActorName:     actorName,
						CreatedAt:     now,
					})
				}
			}
		}

		updated.HydrateIDs()
		return &updated, nil
	})
	if err != nil {
		return nil, err
	}
	return res.(*models.Order), nil
}
