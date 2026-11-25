package services

import (
	"testing"

	"github.com/teestore/backend/internal/config"
)

func TestGenerateUploadSignature(t *testing.T) {
	svcEmpty := NewCloudinaryService(&config.Config{})
	if sig := svcEmpty.GenerateUploadSignature(1700000000); sig.Configured {
		t.Fatal("expected unconfigured signature when env vars are empty")
	}

	svc := NewCloudinaryService(&config.Config{
		CloudinaryCloudName: "demo-cloud",
		CloudinaryAPIKey:    "123456789",
		CloudinaryAPISecret: "shhh-secret",
		CloudinaryFolder:    "teestore/products",
	})
	sig := svc.GenerateUploadSignature(1700000000)
	if !sig.Configured || sig.CloudName != "demo-cloud" || len(sig.Signature) != 40 {
		t.Fatalf("unexpected upload signature: %+v", sig)
	}
}

func TestExtractCloudinaryPublicID(t *testing.T) {
	u1 := "https://res.cloudinary.com/demo-cloud/image/upload/v1700000000/teestore/products/classic_tee.jpg"
	if got := ExtractCloudinaryPublicID(u1); got != "teestore/products/classic_tee" {
		t.Fatalf("expected teestore/products/classic_tee, got %q", got)
	}

	u2 := "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto/v1700000123/tee.webp"
	if got := ExtractCloudinaryPublicID(u2); got != "tee" {
		t.Fatalf("expected tee, got %q", got)
	}

	if got := ExtractCloudinaryPublicID("/images/local.jpg"); got != "" {
		t.Fatalf("expected empty public ID for local asset, got %q", got)
	}
}
