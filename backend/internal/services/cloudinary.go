package services

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/teestore/backend/internal/config"
)

type CloudinarySignature struct {
	Configured bool   `json:"configured"`
	CloudName  string `json:"cloudName,omitempty"`
	APIKey     string `json:"apiKey,omitempty"`
	Timestamp  int64  `json:"timestamp,omitempty"`
	Folder     string `json:"folder,omitempty"`
	Signature  string `json:"signature,omitempty"`
}

type CloudinaryService struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewCloudinaryService(cfg *config.Config) *CloudinaryService {
	return &CloudinaryService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *CloudinaryService) GenerateUploadSignature(timestamp int64) CloudinarySignature {
	if !s.cfg.CloudinaryConfigured() {
		return CloudinarySignature{Configured: false}
	}
	toSign := fmt.Sprintf("folder=%s&timestamp=%d%s", s.cfg.CloudinaryFolder, timestamp, s.cfg.CloudinaryAPISecret)
	sum := sha1.Sum([]byte(toSign))
	return CloudinarySignature{
		Configured: true,
		CloudName:  s.cfg.CloudinaryCloudName,
		APIKey:     s.cfg.CloudinaryAPIKey,
		Timestamp:  timestamp,
		Folder:     s.cfg.CloudinaryFolder,
		Signature:  hex.EncodeToString(sum[:]),
	}
}

func ExtractCloudinaryPublicID(assetURL string) string {
	parsed, err := url.Parse(assetURL)
	if err != nil || !strings.Contains(parsed.Host, "cloudinary.com") {
		return ""
	}
	idx := strings.Index(parsed.Path, "/image/upload/")
	if idx < 0 {
		return ""
	}
	rest := parsed.Path[idx+len("/image/upload/"):]
	parts := strings.Split(rest, "/")
	// Strip version segment v123456 if present and transformation segments before version
	startIdx := 0
	for i, part := range parts {
		if strings.HasPrefix(part, "v") && len(part) > 1 {
			allDigits := true
			for _, ch := range part[1:] {
				if ch < '0' || ch > '9' {
					allDigits = false
					break
				}
			}
			if allDigits {
				startIdx = i + 1
				break
			}
		}
	}
	if startIdx >= len(parts) {
		return ""
	}
	publicWithExt := strings.Join(parts[startIdx:], "/")
	dotIdx := strings.LastIndex(publicWithExt, ".")
	if dotIdx > 0 {
		return publicWithExt[:dotIdx]
	}
	return publicWithExt
}

func (s *CloudinaryService) DeleteByURL(assetURL string) error {
	if !s.cfg.CloudinaryConfigured() {
		return nil
	}
	publicID := ExtractCloudinaryPublicID(assetURL)
	if publicID == "" {
		return nil
	}
	timestamp := time.Now().Unix()
	toSign := fmt.Sprintf("public_id=%s&timestamp=%d%s", publicID, timestamp, s.cfg.CloudinaryAPISecret)
	sum := sha1.Sum([]byte(toSign))
	signature := hex.EncodeToString(sum[:])

	form := url.Values{}
	form.Set("public_id", publicID)
	form.Set("api_key", s.cfg.CloudinaryAPIKey)
	form.Set("timestamp", fmt.Sprintf("%d", timestamp))
	form.Set("signature", signature)

	endpoint := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/destroy", url.PathEscape(s.cfg.CloudinaryCloudName))
	resp, err := s.httpClient.PostForm(endpoint, form)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var body struct {
		Result string `json:"result"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("cloudinary destroy failed with status %d", resp.StatusCode)
	}
	return nil
}
