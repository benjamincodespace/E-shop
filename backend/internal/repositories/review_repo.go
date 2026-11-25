package repositories

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var (
	ErrPurchaseRequired = errors.New("verified purchase required")
	ErrDuplicateReview  = errors.New("duplicate review")
	ErrForbiddenReview  = errors.New("forbidden review access")
)

type ReviewRepository struct {
	store *StoreDB
}

func NewReviewRepository(store *StoreDB) *ReviewRepository {
	return &ReviewRepository{store: store}
}

func (r *ReviewRepository) RecalculateProductRating(ctx context.Context, productID bson.ObjectID) error {
	cur, err := r.store.DB.Collection("reviews").Find(ctx, bson.M{"productId": productID})
	if err != nil {
		return err
	}
	defer cur.Close(ctx)

	var sum int
	var count int
	for cur.Next(ctx) {
		var rev struct {
			Rating int `bson:"rating"`
		}
		if err := cur.Decode(&rev); err == nil {
			sum += rev.Rating
			count++
		}
	}

	avg := 0.0
	if count > 0 {
		avg = math.Round((float64(sum)/float64(count))*10) / 10
	}
	weighted := services.ComputeWeightedRatingScore(avg, count)

	_, err = r.store.DB.Collection("products").UpdateByID(ctx, productID, bson.M{
		"$set": bson.M{
			"ratingAvg":     avg,
			"reviewCount":   count,
			"weightedScore": weighted,
		},
	})
	return err
}

func (r *ReviewRepository) ListByProduct(ctx context.Context, productIDHex string, currentUserIDHex string) ([]models.Review, models.RatingSummary, error) {
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return []models.Review{}, services.CalculateRatingSummary(nil), nil
	}
	var currentOID *bson.ObjectID
	if oid, err := bson.ObjectIDFromHex(currentUserIDHex); err == nil {
		currentOID = &oid
	}

	cur, err := r.store.DB.Collection("reviews").Find(ctx, bson.M{"productId": pid}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, models.RatingSummary{}, err
	}
	defer cur.Close(ctx)

	var reviews []models.Review
	if err := cur.All(ctx, &reviews); err != nil {
		return nil, models.RatingSummary{}, err
	}
	ratings := make([]int, 0, len(reviews))
	for i := range reviews {
		reviews[i].HydrateIDs(currentOID)
		ratings = append(ratings, reviews[i].Rating)
	}
	if reviews == nil {
		reviews = []models.Review{}
	}
	return reviews, services.CalculateRatingSummary(ratings), nil
}

func (r *ReviewRepository) ListByUser(ctx context.Context, userIDHex string) ([]models.Review, error) {
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return []models.Review{}, nil
	}
	cur, err := r.store.DB.Collection("reviews").Find(ctx, bson.M{"userId": uid}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var reviews []models.Review
	if err := cur.All(ctx, &reviews); err != nil {
		return nil, err
	}
	for i := range reviews {
		reviews[i].HydrateIDs(&uid)
	}
	if reviews == nil {
		reviews = []models.Review{}
	}
	return reviews, nil
}

func (r *ReviewRepository) ListAllAdmin(ctx context.Context) ([]models.Review, error) {
	cur, err := r.store.DB.Collection("reviews").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var reviews []models.Review
	if err := cur.All(ctx, &reviews); err != nil {
		return nil, err
	}
	for i := range reviews {
		reviews[i].HydrateIDs(nil)
	}
	if reviews == nil {
		reviews = []models.Review{}
	}
	return reviews, nil
}

func (r *ReviewRepository) CreateVerifiedReview(ctx context.Context, productIDHex, userIDHex, userName string, rating int, comment string) (*models.Review, error) {
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return nil, mongo.ErrNoDocuments
	}
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, err
	}

	var prod models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": pid}).Decode(&prod); err != nil {
		return nil, err
	}

	// Verify customer purchased product in non-cancelled order
	purchaseCount, err := r.store.DB.Collection("orders").CountDocuments(ctx, bson.M{
		"userId":          uid,
		"status":          bson.M{"$ne": models.OrderCancelled},
		"items.productId": productIDHex,
	})
	if err != nil {
		return nil, err
	}
	if purchaseCount == 0 {
		return nil, ErrPurchaseRequired
	}

	dupCount, err := r.store.DB.Collection("reviews").CountDocuments(ctx, bson.M{
		"productId": pid,
		"userId":    uid,
	})
	if err != nil {
		return nil, err
	}
	if dupCount > 0 {
		return nil, ErrDuplicateReview
	}

	now := time.Now().UTC()
	rev := models.Review{
		ID:               bson.NewObjectID(),
		ProductID:        pid,
		ProductName:      prod.Name,
		ProductSlug:      prod.Slug,
		UserID:           uid,
		UserName:         userName,
		Rating:           rating,
		Comment:          comment,
		HelpfulCount:     0,
		LikedByUserIDs:   []bson.ObjectID{},
		VerifiedPurchase: true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if _, err := r.store.DB.Collection("reviews").InsertOne(ctx, rev); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrDuplicateReview
		}
		return nil, err
	}
	_ = r.RecalculateProductRating(ctx, pid)
	rev.HydrateIDs(&uid)
	return &rev, nil
}

func (r *ReviewRepository) UpdateReview(ctx context.Context, reviewIDHex, userIDHex string, rating int, comment string) (*models.Review, error) {
	rid, err := bson.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return nil, mongo.ErrNoDocuments
	}
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, err
	}

	var existing models.Review
	if err := r.store.DB.Collection("reviews").FindOne(ctx, bson.M{"_id": rid}).Decode(&existing); err != nil {
		return nil, err
	}
	if existing.UserID != uid {
		return nil, ErrForbiddenReview
	}

	res := r.store.DB.Collection("reviews").FindOneAndUpdate(
		ctx,
		bson.M{"_id": rid},
		bson.M{"$set": bson.M{"rating": rating, "comment": comment, "updatedAt": time.Now().UTC()}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	var updated models.Review
	if err := res.Decode(&updated); err != nil {
		return nil, err
	}
	_ = r.RecalculateProductRating(ctx, existing.ProductID)
	updated.HydrateIDs(&uid)
	return &updated, nil
}

func (r *ReviewRepository) DeleteReview(ctx context.Context, reviewIDHex, actorIDHex string, isAdmin bool) error {
	rid, err := bson.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return mongo.ErrNoDocuments
	}
	var existing models.Review
	if err := r.store.DB.Collection("reviews").FindOne(ctx, bson.M{"_id": rid}).Decode(&existing); err != nil {
		return err
	}
	if !isAdmin && existing.UserID.Hex() != actorIDHex {
		return ErrForbiddenReview
	}
	if _, err := r.store.DB.Collection("reviews").DeleteOne(ctx, bson.M{"_id": rid}); err != nil {
		return err
	}
	return r.RecalculateProductRating(ctx, existing.ProductID)
}

func (r *ReviewRepository) ToggleHelpfulLike(ctx context.Context, reviewIDHex, userIDHex string) (liked bool, count int, err error) {
	rid, err := bson.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return false, 0, mongo.ErrNoDocuments
	}
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return false, 0, err
	}

	var rev models.Review
	if err := r.store.DB.Collection("reviews").FindOne(ctx, bson.M{"_id": rid}).Decode(&rev); err != nil {
		return false, 0, err
	}

	already := false
	for _, id := range rev.LikedByUserIDs {
		if id == uid {
			already = true
			break
		}
	}

	var update bson.M
	if already {
		liked = false
		update = bson.M{
			"$pull": bson.M{"likedByUserIds": uid},
			"$inc":  bson.M{"helpfulCount": -1},
		}
	} else {
		liked = true
		update = bson.M{
			"$addToSet": bson.M{"likedByUserIds": uid},
			"$inc":      bson.M{"helpfulCount": 1},
		}
	}

	var updated models.Review
	err = r.store.DB.Collection("reviews").FindOneAndUpdate(
		ctx,
		bson.M{"_id": rid},
		update,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err != nil {
		return false, 0, err
	}
	if updated.HelpfulCount < 0 {
		updated.HelpfulCount = 0
		_, _ = r.store.DB.Collection("reviews").UpdateByID(ctx, rid, bson.M{"$set": bson.M{"helpfulCount": 0}})
	}
	return liked, updated.HelpfulCount, nil
}
