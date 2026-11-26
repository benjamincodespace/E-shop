package services

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/teestore/backend/internal/config"
)

// ErrCloudinaryNotConfigured is returned when the server lacks Cloudinary
// credentials, so callers can surface a configuration message instead of a
// generic upload failure.
var ErrCloudinaryNotConfigured = errors.New("cloudinary is not configured")

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

func (s *CloudinaryService) Configured() bool {
	return s.cfg.CloudinaryConfigured()
}

// UploadImage streams an image to Cloudinary with a server-signed request. Doing
// the upload here keeps the API secret out of the browser and guarantees the
// stored product image lives in Cloudinary.
func (s *CloudinaryService) UploadImage(ctx context.Context, filename string, file io.Reader) (string, error) {
	if !s.cfg.CloudinaryConfigured() {
		return "", ErrCloudinaryNotConfigured
	}
	if strings.TrimSpace(filename) == "" {
		filename = "product-image"
	}

	timestamp := time.Now().Unix()
	toSign := fmt.Sprintf("folder=%s&timestamp=%d%s", s.cfg.CloudinaryFolder, timestamp, s.cfg.CloudinaryAPISecret)
	sum := sha1.Sum([]byte(toSign))
	signature := hex.EncodeToString(sum[:])

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	if err := writer.WriteField("api_key", s.cfg.CloudinaryAPIKey); err != nil {
		return "", err
	}
	if err := writer.WriteField("timestamp", fmt.Sprintf("%d", timestamp)); err != nil {
		return "", err
	}
	if err := writer.WriteField("folder", s.cfg.CloudinaryFolder); err != nil {
		return "", err
	}
	if err := writer.WriteField("signature", signature); err != nil {
		return "", err
	}
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	endpoint := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/upload", url.PathEscape(s.cfg.CloudinaryCloudName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &payload)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("cloudinary upload: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		SecureURL string `json:"secure_url"`
		Error     *struct {
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("cloudinary upload: invalid response")
	}
	if resp.StatusCode >= 400 || result.SecureURL == "" {
		message := "cloudinary upload failed"
		if result.Error != nil && strings.TrimSpace(result.Error.Message) != "" {
			message = result.Error.Message
		}
		return "", errors.New(message)
	}
	return result.SecureURL, nil
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
