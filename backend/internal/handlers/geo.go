package handlers

import (
	"net/http"
	"strings"
)

// GeoHandler exposes the approximate country of the caller so the signup form
// can preselect a dial code. It only reads country headers that a CDN/proxy in
// front of the API already provides; it never calls an external geolocation
// service and never stores or trusts the result for anything but a UI default.
type GeoHandler struct{}

func NewGeoHandler() *GeoHandler {
	return &GeoHandler{}
}

var countryHeaderNames = []string{
	"CF-IPCountry",              // Cloudflare
	"X-Vercel-IP-Country",       // Vercel
	"CloudFront-Viewer-Country", // CloudFront
	"X-Country-Code",            // generic reverse proxies
}

var cityHeaderNames = []string{"CF-IPCity", "X-Vercel-IP-City", "CloudFront-Viewer-City"}
var regionHeaderNames = []string{"CF-Region", "X-Vercel-IP-Country-Region", "CloudFront-Viewer-Country-Region"}

func firstHeader(r *http.Request, names []string) string {
	for _, name := range names {
		if value := strings.TrimSpace(r.Header.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

func (h *GeoHandler) DetectCountry(w http.ResponseWriter, r *http.Request) {
	code := ""
	source := ""
	for _, header := range countryHeaderNames {
		value := strings.ToUpper(strings.TrimSpace(r.Header.Get(header)))
		// "XX" means unknown and "T1" means Tor in the Cloudflare header.
		if len(value) == 2 && value != "XX" && value != "T1" {
			code = value
			source = header
			break
		}
	}

	city := ""
	if code != "" {
		city = firstHeader(r, cityHeaderNames)
	}
	region := ""
	if code != "" {
		region = firstHeader(r, regionHeaderNames)
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"countryCode": code,
		"city":        city,
		"region":      region,
		"source":      source,
	})
}
