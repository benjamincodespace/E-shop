package main

import (
	"context"
	"log"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/repositories"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	storeDB, err := repositories.ConnectMongo(ctx, cfg.MongoURI, cfg.MongoDBName)
	if err != nil {
		log.Fatalf("mongodb connection failed: %v", err)
	}
	defer func() {
		_ = storeDB.Client.Disconnect(context.Background())
	}()

	if err := storeDB.SeedIfEmpty(ctx); err != nil {
		log.Fatalf("seed failed: %v", err)
	}

	log.Println("MongoDB indexes ensured and seed check completed successfully.")
}
