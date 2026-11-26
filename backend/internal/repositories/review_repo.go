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
	ErrDuplicateReview = errors.New("duplicate review")
	ErrForbiddenReview = errors.New("forbidden review access")
)

const (
	defaultReviewPageSize = 5
	maxReviewPageSize     = 50
)

// ReviewQuery describes one page of product reviews.
type ReviewQuery struct {
	ProductIDHex   string
	CurrentUserHex string
	Sort           string
	Rating         int
	Page           int
	Limit          int
}

type ReviewRepository struct {
	store *StoreDB
}

func NewReviewRepository(store *StoreDB) *ReviewRepository {
	return &ReviewRepository{store: store}
}

// summaryFromCounts builds the public rating summary from grouped star counts.
func summaryFromCounts(counts map[int]int) models.RatingSummary {
	total := 0
	sum := 0
	for stars, count := range counts {
		total += count
		sum += stars * count
	}
	avg := 0.0
	if total > 0 {
		avg = math.Round((float64(sum)/float64(total))*10) / 10
	}
	breakdown := make([]models.RatingBreakdown, 0, 5)
	for _, stars := range []int{5, 4, 3, 2, 1} {
		count := counts[stars]
		pct := 0
		if total > 0 {
			pct = int(math.Round((float64(count) / float64(total)) * 100))
		}
		breakdown = append(breakdown, models.RatingBreakdown{Stars: stars, Count: count, Percentage: pct})
	}
	return models.RatingSummary{Average: avg, Total: total, Breakdown: breakdown}
}

func (r *ReviewRepository) RecountProductRatings(ctx context.Context, productID bson.ObjectID) (models.RatingSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"productId": productID}}},
		{{Key: "$group", Value: bson.M{"_id": "$rating", "count": bson.M{"$sum": 1}}}},
	}
	cur, err := r.store.DB.Collection("reviews").Aggregate(ctx, pipeline)
	if err != nil {
		return models.RatingSummary{}, err
	}
	defer cur.Close(ctx)

	var buckets []struct {
		Stars int `bson:"_id"`
		Count int `bson:"count"`
	}
	if err := cur.All(ctx, &buckets); err != nil {
		return models.RatingSummary{}, err
	}

	counts := map[int]int{5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
	for _, bucket := range buckets {
		if bucket.Stars >= 1 && bucket.Stars <= 5 {
			counts[bucket.Stars] = bucket.Count
		}
	}
	return summaryFromCounts(counts), nil
}

// RecalculateProductRating keeps the denormalised rating fields on the product
// document (used by catalogue sorting and cards) in sync with the review rows.
func (r *ReviewRepository) RecalculateProductRating(ctx context.Context, productID bson.ObjectID) error {
	summary, err := r.RecountProductRatings(ctx, productID)
	if err != nil {
		return err
	}
	weighted := services.ComputeWeightedRatingScore(summary.Average, summary.Total)
	_, err = r.store.DB.Collection("products").UpdateByID(ctx, productID, bson.M{
		"$set": bson.M{
			"ratingAvg":     summary.Average,
			"reviewCount":   summary.Total,
			"weightedScore": weighted,
		},
	})
	return err
}

func reviewSortOrder(sort string) bson.D {
	switch sort {
	case "oldest":
		return bson.D{{Key: "createdAt", Value: 1}}
	case "highest":
		return bson.D{{Key: "rating", Value: -1}, {Key: "createdAt", Value: -1}}
	case "lowest":
		return bson.D{{Key: "rating", Value: 1}, {Key: "createdAt", Value: -1}}
	case "helpful":
		return bson.D{{Key: "helpfulCount", Value: -1}, {Key: "createdAt", Value: -1}}
	default:
		return bson.D{{Key: "createdAt", Value: -1}}
	}
}

func normalizeReviewPaging(page, limit int) (int, int, int64) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultReviewPageSize
	}
	if limit > maxReviewPageSize {
		limit = maxReviewPageSize
	}
	return page, limit, int64((page - 1) * limit)
}

// ListByProduct returns one page of reviews plus the summary for the whole
// product, so the breakdown stays accurate while the list is paginated.
func (r *ReviewRepository) ListByProduct(ctx context.Context, q ReviewQuery) ([]models.Review, models.RatingSummary, models.Pagination, error) {
	empty := models.Pagination{Page: 1, Limit: defaultReviewPageSize}
	pid, err := bson.ObjectIDFromHex(q.ProductIDHex)
	if err != nil {
		return []models.Review{}, models.RatingSummary{}, empty, nil
	}
	var currentOID *bson.ObjectID
	if oid, err := bson.ObjectIDFromHex(q.CurrentUserHex); err == nil {
		currentOID = &oid
	}

	page, limit, skip := normalizeReviewPaging(q.Page, q.Limit)
	filter := bson.M{"productId": pid}
	if q.Rating >= 1 && q.Rating <= 5 {
		filter["rating"] = q.Rating
	}

	total, err := r.store.DB.Collection("reviews").CountDocuments(ctx, filter)
	if err != nil {
		return nil, models.RatingSummary{}, empty, err
	}

	findOpts := options.Find().
		SetSort(reviewSortOrder(q.Sort)).
		SetSkip(skip).
		SetLimit(int64(limit))
	cur, err := r.store.DB.Collection("reviews").Find(ctx, filter, findOpts)
	if err != nil {
		return nil, models.RatingSummary{}, empty, err
	}
	defer cur.Close(ctx)

	var reviews []models.Review
	if err := cur.All(ctx, &reviews); err != nil {
		return nil, models.RatingSummary{}, empty, err
	}
	for i := range reviews {
		reviews[i].HydrateIDs(currentOID)
	}
	if reviews == nil {
		reviews = []models.Review{}
	}

	summary, err := r.RecountProductRatings(ctx, pid)
	if err != nil {
		return nil, models.RatingSummary{}, empty, err
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages < 1 {
		totalPages = 1
	}
	pagination := models.Pagination{Page: page, Limit: limit, Total: total, TotalPages: totalPages}
	return reviews, summary, pagination, nil
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

// ListAllAdmin powers the moderation desk with optional product/rating filters.
func (r *ReviewRepository) ListAllAdmin(ctx context.Context, productIDHex string, rating int) ([]models.Review, models.AdminReviewStats, error) {
	filter := bson.M{}
	if pid, err := bson.ObjectIDFromHex(productIDHex); err == nil {
		filter["productId"] = pid
	}
	if rating >= 1 && rating <= 5 {
		filter["rating"] = rating
	}

	cur, err := r.store.DB.Collection("reviews").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, models.AdminReviewStats{}, err
	}
	defer cur.Close(ctx)

	var reviews []models.Review
	if err := cur.All(ctx, &reviews); err != nil {
		return nil, models.AdminReviewStats{}, err
	}

	counts := map[int]int{5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
	stats := models.AdminReviewStats{}
	for i := range reviews {
		reviews[i].HydrateIDs(nil)
		counts[reviews[i].Rating]++
		if reviews[i].Reported {
			stats.Reported++
		}
		if reviews[i].VerifiedPurchase {
			stats.Verified++
		}
	}
	if reviews == nil {
		reviews = []models.Review{}
	}
	summary := summaryFromCounts(counts)
	stats.Total = summary.Total
	stats.Average = summary.Average
	stats.Breakdown = summary.Breakdown
	return reviews, stats, nil
}

// UpsertReview enforces one rating per customer per product: a second
// submission updates the existing rating instead of creating a duplicate.
func (r *ReviewRepository) UpsertReview(ctx context.Context, productIDHex, userIDHex, userName string, rating int, comment string) (*models.Review, bool, error) {
	pid, err := bson.ObjectIDFromHex(productIDHex)
	if err != nil {
		return nil, false, mongo.ErrNoDocuments
	}
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, false, err
	}

	var prod models.Product
	if err := r.store.DB.Collection("products").FindOne(ctx, bson.M{"_id": pid}).Decode(&prod); err != nil {
		return nil, false, err
	}

	// Verified-purchase is a trust badge, not a gate: checkout is guest-first
	// and many signed-in shoppers never get linked to their order document.
	purchaseCount, err := r.store.DB.Collection("orders").CountDocuments(ctx, bson.M{
		"userId":          uid,
		"status":          bson.M{"$ne": models.OrderCancelled},
		"items.productId": productIDHex,
	})
	if err != nil {
		return nil, false, err
	}
	verified := purchaseCount > 0

	now := time.Now().UTC()
	var existing models.Review
	err = r.store.DB.Collection("reviews").FindOne(ctx, bson.M{"productId": pid, "userId": uid}).Decode(&existing)
	if err == nil {
		var updated models.Review
		update := bson.M{
			"$set": bson.M{
				"rating":           rating,
				"comment":          comment,
				"userName":         userName,
				"verifiedPurchase": verified,
				"updatedAt":        now,
			},
		}
		if err := r.store.DB.Collection("reviews").FindOneAndUpdate(
			ctx,
			bson.M{"_id": existing.ID},
			update,
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated); err != nil {
			return nil, false, err
		}
		_ = r.RecalculateProductRating(ctx, pid)
		updated.HydrateIDs(&uid)
		return &updated, false, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, err
	}

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
		VerifiedPurchase: verified,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if _, err := r.store.DB.Collection("reviews").InsertOne(ctx, rev); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, false, ErrDuplicateReview
		}
		return nil, false, err
	}
	_ = r.RecalculateProductRating(ctx, pid)
	rev.HydrateIDs(&uid)
	return &rev, true, nil
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

// ReportReview flags a review for moderation. One report per customer is
// idempotent, so repeated taps cannot inflate the count.
func (r *ReviewRepository) ReportReview(ctx context.Context, reviewIDHex, userIDHex, reason string) (*models.Review, error) {
	rid, err := bson.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return nil, mongo.ErrNoDocuments
	}
	uid, err := bson.ObjectIDFromHex(userIDHex)
	if err != nil {
		return nil, err
	}

	var rev models.Review
	if err := r.store.DB.Collection("reviews").FindOne(ctx, bson.M{"_id": rid}).Decode(&rev); err != nil {
		return nil, err
	}
	for _, id := range rev.ReportedByUserIDs {
		if id == uid {
			rev.HydrateIDs(&uid)
			return &rev, nil
		}
	}

	var updated models.Review
	err = r.store.DB.Collection("reviews").FindOneAndUpdate(
		ctx,
		bson.M{"_id": rid},
		bson.M{
			"$addToSet": bson.M{"reportedByUserIds": uid},
			"$inc":      bson.M{"reportCount": 1},
			"$set":      bson.M{"reported": true},
			"$push": bson.M{"reportReasons": bson.M{
				"$each":  []string{reason},
				"$slice": -10,
			}},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}
	updated.HydrateIDs(&uid)
	return &updated, nil
}

// ResolveReports clears the report flags once an admin has reviewed the item.
func (r *ReviewRepository) ResolveReports(ctx context.Context, reviewIDHex string) error {
	rid, err := bson.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return mongo.ErrNoDocuments
	}
	_, err = r.store.DB.Collection("reviews").UpdateByID(ctx, rid, bson.M{
		"$set": bson.M{
			"reported":          false,
			"reportCount":       0,
			"reportReasons":     []string{},
			"reportedByUserIds": []bson.ObjectID{},
		},
	})
	return err
}
