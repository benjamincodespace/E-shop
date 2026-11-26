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
