package repositories

import (
	"context"
	"fmt"
	"time"

	"github.com/teestore/backend/internal/models"
	"github.com/teestore/backend/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type StoreDB struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func ConnectMongo(ctx context.Context, uri, dbName string) (*StoreDB, error) {
	opts := options.Client().ApplyURI(uri).SetConnectTimeout(15 * time.Second)
	client, err := mongo.Connect(opts)
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}
	db := client.Database(dbName)
	s := &StoreDB{Client: client, DB: db}
	if err := s.EnsureIndexes(ctx); err != nil {
		return nil, fmt.Errorf("ensure indexes: %w", err)
	}
	return s, nil
}

// dropLegacyEmailIndex removes the old non-sparse unique email index. Accounts
// created with a phone number only have no email, and a non-sparse unique index
// would let just one of them exist.
func (s *StoreDB) dropLegacyEmailIndex(ctx context.Context) {
	coll := s.DB.Collection("users")
	cur, err := coll.Indexes().List(ctx)
	if err != nil {
		return
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var spec struct {
			Name   string `bson:"name"`
			Key    bson.M `bson:"key"`
			Unique bool   `bson:"unique"`
			Sparse bool   `bson:"sparse"`
		}
		if cur.Decode(&spec) != nil || spec.Name == "_id_" {
			continue
		}
		if _, isEmail := spec.Key["email"]; isEmail && len(spec.Key) == 1 && spec.Unique && !spec.Sparse {
			_ = coll.Indexes().DropOne(ctx, spec.Name)
		}
	}
}

func (s *StoreDB) EnsureIndexes(ctx context.Context) error {
	// users
	s.dropLegacyEmailIndex(ctx)
	if _, err := s.DB.Collection("users").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
		{Keys: bson.D{{Key: "phone", Value: 1}}},
		{Keys: bson.D{{Key: "role", Value: 1}}},
	}); err != nil {
		return err
	}

	// categories
	if _, err := s.DB.Collection("categories").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "slug", Value: 1}}, Options: options.Index().SetUnique(true),
	}); err != nil {
		return err
	}

	// products
	if _, err := s.DB.Collection("products").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "slug", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "categoryId", Value: 1}, {Key: "published", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "published", Value: 1}, {Key: "weightedScore", Value: -1}}},
		{Keys: bson.D{{Key: "name", Value: "text"}, {Key: "description", Value: "text"}}},
	}); err != nil {
		return err
	}

	// orders
	if _, err := s.DB.Collection("orders").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "orderNumber", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "idempotencyKey", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "items.productId", Value: 1}, {Key: "status", Value: 1}}},
	}); err != nil {
		return err
	}

	// reviews
	if _, err := s.DB.Collection("reviews").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "productId", Value: 1}, {Key: "userId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "productId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "productId", Value: 1}, {Key: "rating", Value: -1}}},
		{Keys: bson.D{{Key: "productId", Value: 1}, {Key: "helpfulCount", Value: -1}}},
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "reported", Value: 1}, {Key: "createdAt", Value: -1}}},
	}); err != nil {
		return err
	}

	// carts
	if _, err := s.DB.Collection("carts").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "productId", Value: 1}, {Key: "size", Value: 1}, {Key: "color", Value: 1}},
		Options: options.Index().SetUnique(true),
	}); err != nil {
		return err
	}

	// wishlists
	if _, err := s.DB.Collection("wishlists").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "productId", Value: 1}},
		Options: options.Index().SetUnique(true),
	}); err != nil {
		return err
	}

	// inventory_logs
	if _, err := s.DB.Collection("inventory_logs").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "productId", Value: 1}, {Key: "createdAt", Value: -1}},
	}); err != nil {
		return err
	}

	// newsletter_subscribers
	if _, err := s.DB.Collection("newsletter_subscribers").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true),
	}); err != nil {
		return err
	}

	return nil
}

func (s *StoreDB) NextOrderNumber(ctx context.Context) (string, error) {
	res := s.DB.Collection("counters").FindOneAndUpdate(
		ctx,
		bson.M{"_id": "orders"},
		bson.M{"$inc": bson.M{"seq": 1}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	)
	var counter models.Counter
	if err := res.Decode(&counter); err != nil {
		return "", err
	}
	if counter.Seq < 1001 {
		// Initialize sequence cleanly above seeded TS-1007 if counter started at 1
		updated := s.DB.Collection("counters").FindOneAndUpdate(
			ctx,
			bson.M{"_id": "orders"},
			bson.M{"$set": bson.M{"seq": int64(1008)}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		)
		if err := updated.Decode(&counter); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("TS-%d", counter.Seq), nil
}

func ptrFloat(v float64) *float64 { return &v }

func (s *StoreDB) SeedIfEmpty(ctx context.Context) error {
	count, err := s.DB.Collection("categories").CountDocuments(ctx, bson.M{})
	if err != nil || count > 0 {
		return err
	}

	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)

	seedCats := []models.Category{
		{ID: bson.NewObjectID(), Name: "Classics", Slug: "classics", Description: "Timeless everyday crewnecks built from 240gsm combed cotton.", CreatedAt: now},
		{ID: bson.NewObjectID(), Name: "Essentials", Slug: "essentials", Description: "Minimalist foundational tees designed for clean monochrome layering.", CreatedAt: now},
		{ID: bson.NewObjectID(), Name: "Streetwear", Slug: "streetwear", Description: "Boxy dropped-shoulder silhouettes in heavyweight washed cotton.", CreatedAt: now},
		{ID: bson.NewObjectID(), Name: "Graphic", Slug: "graphic", Description: "Subtle monochrome geometric and typographic chest prints.", CreatedAt: now},
		{ID: bson.NewObjectID(), Name: "Athletic", Slug: "athletic", Description: "Breathable technical cotton-blend tees engineered for movement.", CreatedAt: now},
	}

	catDocs := make([]interface{}, len(seedCats))
	catBySlug := make(map[string]models.Category)
	for i := range seedCats {
		catDocs[i] = seedCats[i]
		catBySlug[seedCats[i].Slug] = seedCats[i]
	}
	if _, err := s.DB.Collection("categories").InsertMany(ctx, catDocs); err != nil {
		return err
	}

	imgBlack := "/images/tee_black_classic_1795513062767.jpg"
	imgWhite := "/images/tee_white_essential_1795513064080.jpg"
	imgCharcoal := "/images/tee_charcoal_oversized_1795513063222.jpg"
	imgBone := "/images/tee_bone_minimal_1795513063679.jpg"
	imgGraphite := "/images/tee_graphite_sport_1795513064472.jpg"

	makeProd := func(name, slug, desc, catSlug string, price float64, disc *float64, imgs []string, sizes []string, colors []models.TeeColorOption, stock int, feat, pop bool, createdAt time.Time, seoT, seoD string) models.Product {
		c := catBySlug[catSlug]
		return models.Product{
			ID:             bson.NewObjectID(),
			Name:           name,
			Slug:           slug,
			Description:    desc,
			Price:          price,
			Currency:       models.DefaultCurrency,
			DiscountPrice:  disc,
			CategoryID:     c.ID,
			CategoryName:   c.Name,
			CategorySlug:   c.Slug,
			Images:         imgs,
			Sizes:          sizes,
			Colors:         colors,
			Stock:          stock,
			Featured:       feat,
			Popular:        pop,
			Published:      true,
			SEOTitle:       seoT,
			SEODescription: seoD,
			CreatedAt:      createdAt,
			UpdatedAt:      now,
		}
	}

	seedProducts := []models.Product{
		makeProd(
			"Classic Crest Tee", "classic-crest-tee",
			"Soft, breathable 240gsm combed cotton T-shirt with a crisp ribbed collar and tonal micro-crest embroidery. Perfect for everyday monochrome style.",
			"classics", 22, ptrFloat(15),
			[]string{imgBlack, imgCharcoal, imgBone},
			[]string{"S", "M", "L", "XL", "XXL"},
			[]models.TeeColorOption{{Name: "Black", Hex: "#111111"}, {Name: "White", Hex: "#F4F4F5"}, {Name: "Graphite", Hex: "#4B5563"}},
			28, true, true, time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC),
			"Classic Crest Tee — Heavyweight Black Cotton | E-shop All",
			"Shop the Classic Crest Tee in 240gsm combed cotton. Breathable fit, reinforced neckline, and minimalist crest detail.",
		),
		makeProd(
			"Minimalist White Tee", "minimalist-white-tee",
			"Pure optic white organic ring-spun cotton crewneck featuring a centered minimalist typographic mark and zero-twist softness.",
			"essentials", 25, ptrFloat(18),
			[]string{imgWhite, imgBone, imgBlack},
			[]string{"S", "M", "L", "XL", "XXL"},
			[]models.TeeColorOption{{Name: "White", Hex: "#FFFFFF"}, {Name: "Bone", Hex: "#EAE6DF"}, {Name: "Black", Hex: "#111111"}},
			22, true, true, time.Date(2026, 10, 12, 10, 0, 0, 0, time.UTC),
			"Minimalist White Tee — Organic Cotton Crewneck | E-shop All",
			"Crisp pure white organic cotton T-shirt with subtle chest typography and tailored everyday drape.",
		),
		makeProd(
			"STRCTR Boxy Tee", "strctr-boxy-tee",
			"Washed charcoal 280gsm heavyweight jersey with a structured boxy cut, dropped shoulders, and clean architectural chest print.",
			"streetwear", 28, ptrFloat(20),
			[]string{imgCharcoal, imgBlack, imgGraphite},
			[]string{"S", "M", "L", "XL"},
			[]models.TeeColorOption{{Name: "Washed Charcoal", Hex: "#27272A"}, {Name: "Jet Black", Hex: "#09090B"}},
			16, true, true, time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC),
			"STRCTR Boxy Heavyweight Tee — Washed Charcoal | E-shop All",
			"Oversized 280gsm washed charcoal streetwear tee with dropped shoulders and architectural chest typography.",
		),
		makeProd(
			"Atelier Emblem Tee", "atelier-emblem-tee",
			"Alabaster off-white heavyweight cotton tee printed with an ink-black geometric triangle crest. Pre-shrunk for consistent sizing.",
			"graphic", 28, ptrFloat(22),
			[]string{imgBone, imgWhite, imgCharcoal},
			[]string{"S", "M", "L", "XL", "XXL"},
			[]models.TeeColorOption{{Name: "Alabaster", Hex: "#ECE8E1"}, {Name: "White", Hex: "#FFFFFF"}},
			4, false, true, time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC),
			"Atelier Emblem Tee — Alabaster Graphic Cotton | E-shop All",
			"Minimalist geometric emblem printed on pre-shrunk alabaster heavyweight cotton.",
		),
		makeProd(
			"Kinetic Horizon Tee", "kinetic-horizon-tee",
			"Dark heather graphite performance cotton-modal blend with a sharp white tonal chest bar and moisture-wicking knit.",
			"athletic", 24, ptrFloat(17),
			[]string{imgGraphite, imgBlack, imgCharcoal},
			[]string{"S", "M", "L", "XL"},
			[]models.TeeColorOption{{Name: "Graphite", Hex: "#3F3F46"}, {Name: "Black", Hex: "#111111"}},
			19, false, true, time.Date(2026, 11, 8, 10, 0, 0, 0, time.UTC),
			"Kinetic Horizon Athletic Tee — Dark Graphite | E-shop All",
			"Lightweight breathable performance cotton tee built for training and daily movement.",
		),
		makeProd(
			"Noir Studio Crew", "noir-studio-crew",
			"Deep carbon-dyed heavyweight Supima cotton crewneck with reinforced twin-needle cuffs and a refined tailored shoulder.",
			"classics", 34, nil,
			[]string{imgBlack, imgGraphite},
			[]string{"M", "L", "XL", "XXL"},
			[]models.TeeColorOption{{Name: "Carbon Black", Hex: "#0A0A0B"}},
			0, false, false, time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC),
			"Noir Studio Crew — Supima Black T-Shirt | E-shop All",
			"Carbon-dyed Supima cotton tee with structured collar retention.",
		),
		makeProd(
			"Monolith Oversized Tee", "monolith-oversized-tee",
			"Relaxed studio drape crafted from 300gsm enzyme-washed organic cotton with minimal tonal collar binding.",
			"streetwear", 42, ptrFloat(36),
			[]string{imgCharcoal, imgBone},
			[]string{"S", "M", "L", "XL"},
			[]models.TeeColorOption{{Name: "Charcoal", Hex: "#27272A"}, {Name: "Bone", Hex: "#E5E0D8"}},
			11, true, false, time.Date(2026, 11, 16, 10, 0, 0, 0, time.UTC),
			"Monolith Oversized 300gsm Tee | E-shop All",
			"Ultra-heavyweight 300gsm organic cotton oversized tee with enzyme wash finish.",
		),
		makeProd(
			"Pure Canvas Tee", "pure-canvas-tee",
			"Clean bone-white everyday staple featuring an ultra-soft brushed interior and breathable side-seamed construction.",
			"essentials", 19, ptrFloat(14),
			[]string{imgWhite, imgBone},
			[]string{"S", "M", "L", "XL", "XXL"},
			[]models.TeeColorOption{{Name: "White", Hex: "#FFFFFF"}, {Name: "Bone", Hex: "#F3EFEA"}},
			3, false, true, time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC),
			"Pure Canvas Everyday Tee | E-shop All",
			"Essential everyday white tee in brushed cotton jersey.",
		),
	}

	prodDocs := make([]interface{}, len(seedProducts))
	for i := range seedProducts {
		prodDocs[i] = seedProducts[i]
	}
	if _, err := s.DB.Collection("products").InsertMany(ctx, prodDocs); err != nil {
		return err
	}

	// Sample verified customer records (unusable hash so nobody can log in with empty password)
	seedCustomers := []models.User{
		{ID: bson.NewObjectID(), Name: "Jean Bosco", Email: "jean.bosco@example.com", PasswordHash: "seeded_unusable_hash", Phone: "+1 415 555 0142", Address: "742 Valencia St, San Francisco, CA", Role: models.RoleCustomer, CreatedAt: now, UpdatedAt: now},
		{ID: bson.NewObjectID(), Name: "Alice Uwimana", Email: "alice.uwimana@example.com", PasswordHash: "seeded_unusable_hash", Phone: "+1 212 555 0198", Address: "118 Mercer St, New York, NY", Role: models.RoleCustomer, CreatedAt: now, UpdatedAt: now},
		{ID: bson.NewObjectID(), Name: "Marcus Vance", Email: "marcus.vance@example.com", PasswordHash: "seeded_unusable_hash", Phone: "+1 310 555 0164", Address: "890 Abbot Kinney Blvd, Venice, CA", Role: models.RoleCustomer, CreatedAt: now, UpdatedAt: now},
	}
	custDocs := make([]interface{}, len(seedCustomers))
	for i := range seedCustomers {
		custDocs[i] = seedCustomers[i]
	}
	if _, err := s.DB.Collection("users").InsertMany(ctx, custDocs); err != nil {
		return err
	}

	// Seed historical orders
	type orderSeed struct {
		num     string
		custIdx int
		prodIdx int
		qty     int
		size    string
		color   string
		status  models.OrderStatus
		date    time.Time
	}
	orderSeeds := []orderSeed{
		{"TS-1001", 0, 0, 2, "M", "Black", models.OrderDelivered, time.Date(2026, 6, 14, 14, 20, 0, 0, time.UTC)},
		{"TS-1002", 1, 1, 2, "L", "White", models.OrderDelivered, time.Date(2026, 7, 19, 11, 10, 0, 0, time.UTC)},
		{"TS-1003", 2, 2, 3, "L", "Washed Charcoal", models.OrderDelivered, time.Date(2026, 8, 23, 16, 45, 0, 0, time.UTC)},
		{"TS-1004", 0, 3, 2, "M", "Alabaster", models.OrderDelivered, time.Date(2026, 9, 11, 9, 30, 0, 0, time.UTC)},
		{"TS-1005", 1, 0, 4, "M", "Black", models.OrderDelivered, time.Date(2026, 10, 8, 13, 15, 0, 0, time.UTC)},
		{"TS-1006", 2, 4, 2, "XL", "Graphite", models.OrderShipped, time.Date(2026, 11, 12, 17, 40, 0, 0, time.UTC)},
		{"TS-1007", 0, 2, 1, "L", "Washed Charcoal", models.OrderPending, time.Date(2026, 11, 22, 8, 10, 0, 0, time.UTC)},
	}

	var orderDocs []interface{}
	for _, os := range orderSeeds {
		c := seedCustomers[os.custIdx]
		p := seedProducts[os.prodIdx]
		unit := services.GetEffectivePrice(p.Price, p.DiscountPrice)
		sub := services.Round2(unit * float64(os.qty))
		ship, total := services.CalculateShippingAndTotal(sub)
		customerID := c.ID
		orderDocs = append(orderDocs, models.Order{
			ID:            bson.NewObjectID(),
			OrderNumber:   os.num,
			UserID:        &customerID,
			CustomerName:  c.Name,
			CustomerEmail: c.Email,
			Phone:         c.Phone,
			Address:       c.Address,
			Notes:         "Leave package at front concierge.",
			Currency:      models.DefaultCurrency,
			Subtotal:      sub,
			ShippingFee:   ship,
			Total:         total,
			Status:        os.status,
			PaymentMethod: "Cash on Delivery / Modular Payment",
			Items: []models.OrderItem{{
				ID:           bson.NewObjectID().Hex(),
				ProductID:    p.ID.Hex(),
				ProductName:  p.Name,
				ProductSlug:  p.Slug,
				ProductImage: p.Images[0],
				Size:         os.size,
				Color:        os.color,
				Quantity:     os.qty,
				UnitPrice:    unit,
			}},
			CreatedAt: os.date,
			UpdatedAt: os.date,
		})
	}
	if _, err := s.DB.Collection("orders").InsertMany(ctx, orderDocs); err != nil {
		return err
	}
	_, _ = s.DB.Collection("counters").InsertOne(ctx, models.Counter{ID: "orders", Seq: 1007})

	// Seed inventory logs
	invDocs := []interface{}{
		models.InventoryLog{ID: bson.NewObjectID(), ProductID: seedProducts[0].ID, ProductName: seedProducts[0].Name, ChangeAmount: 30, PreviousStock: 0, NewStock: 30, Reason: "Initial studio batch received", ActorName: "System Seed", CreatedAt: time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC)},
		models.InventoryLog{ID: bson.NewObjectID(), ProductID: seedProducts[0].ID, ProductName: seedProducts[0].Name, ChangeAmount: -2, PreviousStock: 30, NewStock: 28, Reason: "Order TS-1001 fulfilled", ActorName: "System Seed", CreatedAt: time.Date(2026, 10, 8, 13, 15, 0, 0, time.UTC)},
		models.InventoryLog{ID: bson.NewObjectID(), ProductID: seedProducts[3].ID, ProductName: seedProducts[3].Name, ChangeAmount: -2, PreviousStock: 6, NewStock: 4, Reason: "Order TS-1004 fulfilled (Low stock alert)", ActorName: "System Seed", CreatedAt: time.Date(2026, 11, 10, 9, 30, 0, 0, time.UTC)},
		models.InventoryLog{ID: bson.NewObjectID(), ProductID: seedProducts[5].ID, ProductName: seedProducts[5].Name, ChangeAmount: -5, PreviousStock: 5, NewStock: 0, Reason: "Studio reserve sold out", ActorName: "System Seed", CreatedAt: time.Date(2026, 11, 18, 14, 0, 0, 0, time.UTC)},
	}
	if _, err := s.DB.Collection("inventory_logs").InsertMany(ctx, invDocs); err != nil {
		return err
	}

	// Seed verified reviews
	type revSeed struct {
		prodIdx int
		custIdx int
		rating  int
		comment string
		likes   int
		date    time.Time
	}
	revSeeds := []revSeed{
		{0, 0, 5, "Excellent product! Heavyweight cotton feels substantial and holds its collar shape after washing.", 12, time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)},
		{0, 1, 5, "Clean minimalist crest and fast delivery. Easily my go-to black tee.", 7, time.Date(2026, 11, 15, 9, 30, 0, 0, time.UTC)},
		{0, 2, 4, "Great fit and soft drape. Slightly boxy in the sleeves which I really like.", 4, time.Date(2026, 11, 10, 16, 15, 0, 0, time.UTC)},
		{1, 1, 5, "Crisp pure white fabric—completely opaque and comfortable all day.", 9, time.Date(2026, 11, 16, 10, 20, 0, 0, time.UTC)},
		{1, 0, 4, "Minimalist typography is subtle and sharp. Pairs well under overshirts.", 3, time.Date(2026, 11, 12, 15, 0, 0, 0, time.UTC)},
		{2, 2, 5, "The 280gsm washed charcoal texture looks like a studio archive piece.", 11, time.Date(2026, 11, 14, 18, 45, 0, 0, time.UTC)},
		{3, 0, 5, "Alabaster tone is warm without looking yellow. Print quality is crisp.", 5, time.Date(2026, 11, 11, 11, 10, 0, 0, time.UTC)},
		{4, 2, 5, "Breathable athletic knit that still wears cleanly outside the gym.", 6, time.Date(2026, 11, 17, 8, 50, 0, 0, time.UTC)},
	}
	var revDocs []interface{}
	for _, rs := range revSeeds {
		p := seedProducts[rs.prodIdx]
		c := seedCustomers[rs.custIdx]
		revDocs = append(revDocs, models.Review{
			ID:               bson.NewObjectID(),
			ProductID:        p.ID,
			ProductName:      p.Name,
			ProductSlug:      p.Slug,
			UserID:           c.ID,
			UserName:         c.Name,
			Rating:           rs.rating,
			Comment:          rs.comment,
			HelpfulCount:     rs.likes,
			LikedByUserIDs:   []bson.ObjectID{},
			VerifiedPurchase: true,
			CreatedAt:        rs.date,
			UpdatedAt:        rs.date,
		})
	}
	if _, err := s.DB.Collection("reviews").InsertMany(ctx, revDocs); err != nil {
		return err
	}

	// Recalculate rating stats across products
	reviewRepo := NewReviewRepository(s)
	for _, p := range seedProducts {
		_ = reviewRepo.RecalculateProductRating(ctx, p.ID)
	}

	// Seed default settings
	settingsDocs := []interface{}{
		models.StoreSetting{Key: "storeName", Value: "E-shop All"},
		models.StoreSetting{Key: "tagline", Value: "Wear Your Style"},
		models.StoreSetting{Key: "freeShippingThreshold", Value: "50"},
		models.StoreSetting{Key: "supportEmail", Value: "support@eshopall.studio"},
	}
	_, _ = s.DB.Collection("store_settings").InsertMany(ctx, settingsDocs)

	return nil
}
