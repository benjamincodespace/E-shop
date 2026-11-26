package repositories

import (
	"context"
	"errors"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type UserRepository struct {
	store *StoreDB
}

func NewUserRepository(store *StoreDB) *UserRepository {
	return &UserRepository{store: store}
}

func (r *UserRepository) CountAdmins(ctx context.Context) (int64, error) {
	return r.store.DB.Collection("users").CountDocuments(ctx, bson.M{"role": models.RoleAdmin})
}

func (r *UserRepository) CreateUser(ctx context.Context, user *models.User) error {
	user.ID = bson.NewObjectID()
	now := time.Now().UTC()
	user.CreatedAt = now
	user.UpdatedAt = now
	_, err := r.store.DB.Collection("users").InsertOne(ctx, user)
	if err != nil {
		return err
	}
	user.HydrateIDs()
	return nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.store.DB.Collection("users").FindOne(ctx, bson.M{"email": email}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

func (r *UserRepository) FindByPhone(ctx context.Context, phone string) (*models.User, error) {
	var u models.User
	err := r.store.DB.Collection("users").FindOne(ctx, bson.M{"phone": phone}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

func (r *UserRepository) FindByID(ctx context.Context, idHex string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, nil
	}
	var u models.User
	err = r.store.DB.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

func (r *UserRepository) UpdateProfile(ctx context.Context, idHex, name, phone, address string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{
			"name":      name,
			"phone":     phone,
			"address":   address,
			"updatedAt": time.Now().UTC(),
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var u models.User
	if err := res.Decode(&u); err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

// SetDeliveryAddress saves or clears the optional profile delivery address.
func (r *UserRepository) SetDeliveryAddress(ctx context.Context, idHex string, address *models.DeliveryAddress) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	set := bson.M{"updatedAt": time.Now().UTC()}
	update := bson.M{"$set": set}
	if address != nil {
		set["deliveryAddress"] = address
	} else {
		update["$unset"] = bson.M{"deliveryAddress": ""}
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		update,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var u models.User
	if err := res.Decode(&u); err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

func (r *UserRepository) SetResetCode(ctx context.Context, userID bson.ObjectID, code string, expiresAt time.Time) error {
	_, err := r.store.DB.Collection("users").UpdateByID(ctx, userID, bson.M{
		"$set": bson.M{"resetCode": code, "resetExpiresAt": expiresAt},
	})
	return err
}

func (r *UserRepository) UpdatePasswordClearReset(ctx context.Context, userID bson.ObjectID, pwHash string) error {
	_, err := r.store.DB.Collection("users").UpdateByID(ctx, userID, bson.M{
		"$set":   bson.M{"passwordHash": pwHash, "updatedAt": time.Now().UTC()},
		"$unset": bson.M{"resetCode": "", "resetExpiresAt": ""},
	})
	return err
}

func (r *UserRepository) GetPurchasedProductIDs(ctx context.Context, userIDHex string) ([]string, error) {
	oid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return []string{}, nil
	}
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"userId": oid, "status": bson.M{"$ne": models.OrderCancelled}}}},
		{{Key: "$unwind", Value: "$items"}},
		{{Key: "$group", Value: bson.M{"_id": "$items.productId"}}},
	}
	cursor, err := r.store.DB.Collection("orders").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	ids := make([]string, 0)
	for cursor.Next(ctx) {
		// $group returns the product id as an ObjectID, not a string; decoding
		// it as a string failed silently and left this list always empty.
		var row struct {
			ID bson.ObjectID `bson:"_id"`
		}
		if err := cursor.Decode(&row); err == nil && !row.ID.IsZero() {
			ids = append(ids, row.ID.Hex())
		}
	}
	return ids, nil
}

func (r *UserRepository) ListCustomersWithStats(ctx context.Context) ([]models.CustomerSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"role": models.RoleCustomer}}},
		{{Key: "$sort", Value: bson.M{"createdAt": -1}}},
		{{Key: "$lookup", Value: bson.M{
			"from":         "orders",
			"localField":   "_id",
			"foreignField": "userId",
			"as":           "userOrders",
		}}},
	}
	cursor, err := r.store.DB.Collection("users").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var out []models.CustomerSummary
	for cursor.Next(ctx) {
		var doc struct {
			models.User `bson:",inline"`
			UserOrders  []models.Order `bson:"userOrders"`
		}
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		doc.User.HydrateIDs()
		spent := 0.0
		for _, o := range doc.UserOrders {
			if o.Status != models.OrderCancelled {
				// Customer spend is reported in the canonical USD base.
				spent += services.ConvertCurrency(o.Total, o.Currency, models.DefaultCurrency)
			}
		}
		spent = services.Round2(spent)
		out = append(out, models.CustomerSummary{
			User:       doc.User,
			OrderCount: len(doc.UserOrders),
			TotalSpent: spent,
		})
	}
	if out == nil {
		out = []models.CustomerSummary{}
	}
	return out, nil
}

func (r *UserRepository) CountByRole(ctx context.Context, role models.UserRole) (int64, error) {
	return r.store.DB.Collection("users").CountDocuments(ctx, bson.M{"role": role})
}

// ListAllUsers returns every account regardless of role, newest first. Super
// administrators use it to govern customers, sellers (admins) and peers.
func (r *UserRepository) ListAllUsers(ctx context.Context) ([]models.User, error) {
	cursor, err := r.store.DB.Collection("users").Find(
		ctx,
		bson.M{},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var users []models.User
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	for i := range users {
		users[i].HydrateIDs()
	}
	if users == nil {
		users = []models.User{}
	}
	return users, nil
}

// ListAllUsersWithStats returns every account together with the buyer order
// totals and seller catalogue size, so the super administrator can oversee
// buyers and sellers from one screen.
func (r *UserRepository) ListAllUsersWithStats(ctx context.Context) ([]models.UserAdminSummary, error) {
	users, err := r.ListAllUsers(ctx)
	if err != nil {
		return nil, err
	}

	type orderRow struct {
		UserID   *bson.ObjectID     `bson:"userId"`
		Total    float64            `bson:"total"`
		Currency string             `bson:"currency"`
		Status   models.OrderStatus `bson:"status"`
	}
	oCur, err := r.store.DB.Collection("orders").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var orders []orderRow
	if err := oCur.All(ctx, &orders); err != nil {
		oCur.Close(ctx)
		return nil, err
	}
	oCur.Close(ctx)

	orderCount := make(map[string]int)
	spent := make(map[string]float64)
	for _, o := range orders {
		if o.UserID == nil || o.Status == models.OrderCancelled {
			continue
		}
		id := o.UserID.Hex()
		orderCount[id]++
		spent[id] += services.ConvertCurrency(o.Total, o.Currency, models.DefaultCurrency)
	}

	type productRow struct {
		SellerID string `bson:"sellerId"`
	}
	pCur, err := r.store.DB.Collection("products").Find(ctx, bson.M{"sellerId": bson.M{"$exists": true, "$ne": ""}})
	if err != nil {
		return nil, err
	}
	var products []productRow
	if err := pCur.All(ctx, &products); err != nil {
		pCur.Close(ctx)
		return nil, err
	}
	pCur.Close(ctx)

	productCount := make(map[string]int)
	for _, p := range products {
		productCount[p.SellerID]++
	}

	out := make([]models.UserAdminSummary, 0, len(users))
	for _, u := range users {
		out = append(out, models.UserAdminSummary{
			User:         u,
			OrderCount:   orderCount[u.IDHex],
			TotalSpent:   services.Round2(spent[u.IDHex]),
			ProductCount: productCount[u.IDHex],
		})
	}
	return out, nil
}

func (r *UserRepository) SetAvatar(ctx context.Context, idHex, avatarURL string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"avatarUrl": avatarURL, "updatedAt": time.Now().UTC()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var u models.User
	if err := res.Decode(&u); err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

// SetApproval records a seller approval decision and, on approval, awards the
// verified badge automatically.
func (r *UserRepository) SetApproval(ctx context.Context, idHex, status string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	set := bson.M{"approvalStatus": status, "updatedAt": now, "verified": false}
	if status == models.ApprovalApproved {
		set["verified"] = true
		set["verifiedAt"] = now
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid, "role": models.RoleAdmin},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var u models.User
	if err := res.Decode(&u); err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

// CountPendingSellers powers the super administrator approval queue badge.
func (r *UserRepository) CountPendingSellers(ctx context.Context) (int64, error) {
	return r.store.DB.Collection("users").CountDocuments(ctx, bson.M{
		"role":           models.RoleAdmin,
		"approvalStatus": models.ApprovalPending,
	})
}

func (r *UserRepository) SetRole(ctx context.Context, idHex string, role models.UserRole) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"role": role, "updatedAt": time.Now().UTC()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var u models.User
	if err := res.Decode(&u); err != nil {
		return nil, err
	}
	u.HydrateIDs()
	return &u, nil
}

func (r *UserRepository) DeleteUser(ctx context.Context, idHex string) error {
	oid, err := bson.ObjectIDFromHex(idHex)
	if err != nil {
		return err
	}
	_, err = r.store.DB.Collection("users").DeleteOne(ctx, bson.M{"_id": oid})
	return err
}

// ToggleAnyDisabled flips the disabled flag for any role, including sellers
// and other administrators. Self-protection is enforced by the handler.
func (r *UserRepository) ToggleAnyDisabled(ctx context.Context, userIDHex string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, nil
	}
	var existing models.User
	err = r.store.DB.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&existing)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"disabled": !existing.Disabled, "updatedAt": time.Now().UTC()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var updated models.User
	if err := res.Decode(&updated); err != nil {
		return nil, err
	}
	updated.HydrateIDs()
	return &updated, nil
}

func (r *UserRepository) ToggleDisabled(ctx context.Context, userIDHex string) (*models.User, error) {
	oid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, nil
	}
	var existing models.User
	err = r.store.DB.Collection("users").FindOne(ctx, bson.M{"_id": oid, "role": models.RoleCustomer}).Decode(&existing)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	res := r.store.DB.Collection("users").FindOneAndUpdate(
		ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"disabled": !existing.Disabled, "updatedAt": time.Now().UTC()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var updated models.User
	if err := res.Decode(&updated); err != nil {
		return nil, err
	}
	updated.HydrateIDs()
	return &updated, nil
}
