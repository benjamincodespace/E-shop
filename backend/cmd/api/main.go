package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/teestore/backend/internal/config"
	"github.com/teestore/backend/internal/handlers"
	"github.com/teestore/backend/internal/repositories"
	"github.com/teestore/backend/internal/routes"
	"github.com/teestore/backend/internal/services"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	if issue := cfg.CloudinaryConfigIssue(); issue != "" {
		log.Printf("cloudinary: %s", issue)
	}

	startupCtx, cancelStartup := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelStartup()

	storeDB, err := repositories.ConnectMongo(startupCtx, cfg.MongoURI, cfg.MongoDBName)
	if err != nil {
		log.Fatalf("mongodb connection failed: %v", err)
	}

	if err := storeDB.SeedIfEmpty(startupCtx); err != nil {
		log.Fatalf("seed error: %v", err)
	}

	userRepo := repositories.NewUserRepository(storeDB)
	catalogRepo := repositories.NewCatalogRepository(storeDB)
	orderRepo := repositories.NewOrderRepository(storeDB)
	reviewRepo := repositories.NewReviewRepository(storeDB)
	analyticsRepo := repositories.NewAnalyticsRepository(storeDB)

	cloudinarySvc := services.NewCloudinaryService(cfg)

	authH := handlers.NewAuthHandler(cfg, userRepo)
	catH := handlers.NewCatalogHandler(catalogRepo, reviewRepo, cloudinarySvc)
	ordH := handlers.NewOrderHandler(orderRepo)
	revH := handlers.NewReviewHandler(reviewRepo)
	admH := handlers.NewAdminHandler(analyticsRepo, catalogRepo, userRepo, orderRepo)
	geoH := handlers.NewGeoHandler()

	router := routes.NewRouter(cfg, authH, catH, ordH, revH, admH, geoH)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      25 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("E-shop All Go API listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
	}
	if err := storeDB.Client.Disconnect(shutdownCtx); err != nil {
		log.Printf("mongo disconnect error: %v", err)
	}
	log.Println("E-shop All Go API stopped cleanly")
}
