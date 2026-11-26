package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                string
	AppEnv              string
	AppURL              string
	FrontendOrigins     []string
	MongoURI            string
	MongoDBName         string
	JWTSecret           string
	JWTRefreshSecret    string
	AdminPasscode       string
	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
	CloudinaryFolder    string
}

func randomHexSecret(nBytes int) string {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "ephemeral-fallback-dev-only"
	}
	return hex.EncodeToString(b)
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	appEnv := strings.TrimSpace(os.Getenv("APP_ENV"))
	if appEnv == "" {
		appEnv = "development"
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	appURL := strings.TrimSpace(os.Getenv("APP_URL"))
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	rawOrigins := strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	if rawOrigins == "" {
		rawOrigins = "http://localhost:3000"
	}
	var origins []string
	for _, o := range strings.Split(rawOrigins, ",") {
		trimmed := strings.TrimRight(strings.TrimSpace(o), "/")
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	mongoURI := strings.TrimSpace(os.Getenv("MONGODB_URI"))
	if mongoURI == "" {
		return nil, errors.New("MONGODB_URI environment variable is required")
	}

	dbName := strings.TrimSpace(os.Getenv("MONGODB_DB_NAME"))
	if dbName == "" {
		dbName = "teestore"
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		if appEnv == "production" {
			return nil, errors.New("JWT_SECRET is required in production")
		}
		jwtSecret = randomHexSecret(32)
	}

	jwtRefresh := strings.TrimSpace(os.Getenv("JWT_REFRESH_SECRET"))
	if jwtRefresh == "" {
		if appEnv == "production" {
			return nil, errors.New("JWT_REFRESH_SECRET is required in production")
		}
		jwtRefresh = randomHexSecret(32)
	}

	folder := strings.TrimSpace(os.Getenv("CLOUDINARY_FOLDER"))
	if folder == "" {
		folder = "teestore/products"
	}

	return &Config{
		Port:                port,
		AppEnv:              appEnv,
		AppURL:              strings.TrimRight(appURL, "/"),
		FrontendOrigins:     origins,
		MongoURI:            mongoURI,
		MongoDBName:         dbName,
		JWTSecret:           jwtSecret,
		JWTRefreshSecret:    jwtRefresh,
		AdminPasscode:       strings.TrimSpace(os.Getenv("ADMIN_PASSCODE")),
		CloudinaryCloudName: strings.TrimSpace(os.Getenv("CLOUDINARY_CLOUD_NAME")),
		CloudinaryAPIKey:    strings.TrimSpace(os.Getenv("CLOUDINARY_API_KEY")),
		CloudinaryAPISecret: strings.TrimSpace(os.Getenv("CLOUDINARY_API_SECRET")),
		CloudinaryFolder:    folder,
	}, nil
}

func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.AppEnv, "production")
}

func (c *Config) CloudinaryConfigured() bool {
	return c.CloudinaryCloudName != "" && c.CloudinaryAPIKey != "" && c.CloudinaryAPISecret != ""
}

// Cloudinary cloud names are 2-128 letters, digits or hyphens starting with a
// letter. A brand or product name in this variable ("T-shirt") passes Go's
// config load but is rejected by Cloudinary with "Invalid cloud_name".
var cloudNamePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]{1,127}$`)

// CloudinaryConfigIssue returns a human-readable explanation when image uploads
// cannot work, or an empty string when configuration looks usable. It never
// includes the API key or secret.
func (c *Config) CloudinaryConfigIssue() string {
	set := 0
	if c.CloudinaryCloudName != "" {
		set++
	}
	if c.CloudinaryAPIKey != "" {
		set++
	}
	if c.CloudinaryAPISecret != "" {
		set++
	}
	switch {
	case set == 0:
		return "not configured: product image uploads are disabled"
	case set < 3:
		return "partially configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together"
	case !cloudNamePattern.MatchString(c.CloudinaryCloudName):
		return fmt.Sprintf(
			"CLOUDINARY_CLOUD_NAME %q is not a valid cloud name (letters, digits or hyphens, starting with a letter); copy the Cloud name from the Cloudinary console",
			c.CloudinaryCloudName,
		)
	default:
		return ""
	}
}
