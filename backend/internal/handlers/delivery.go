package handlers

import (
	"strings"

	"github.com/teestore/backend/internal/models"
)

const (
	maxCountryLen      = 60
	maxCityLen         = 80
	maxDistrictLen     = 80
	maxStreetLen       = 160
	maxBuildingLen     = 80
	maxInstructionsLen = 240
)

func clampRunes(value string, max int) string {
	value = strings.TrimSpace(value)
	if runes := []rune(value); len(runes) > max {
		return string(runes[:max])
	}
	return value
}

// normalizeDeliveryAddress trims and validates a structured delivery address.
// The returned message is empty when the input is acceptable; a nil address is
// only valid when the caller allows legacy free-text addresses.
func normalizeDeliveryAddress(raw *models.DeliveryAddress) (*models.DeliveryAddress, string) {
	if raw == nil {
		return nil, ""
	}

	address := &models.DeliveryAddress{
		Country:      clampRunes(raw.Country, maxCountryLen),
		City:         clampRunes(raw.City, maxCityLen),
		District:     clampRunes(raw.District, maxDistrictLen),
		Street:       clampRunes(raw.Street, maxStreetLen),
		Building:     clampRunes(raw.Building, maxBuildingLen),
		Instructions: clampRunes(raw.Instructions, maxInstructionsLen),
	}

	if len([]rune(address.Country)) < 2 {
		return nil, "Delivery country is required."
	}
	if len([]rune(address.City)) < 2 {
		return nil, "Delivery city is required."
	}
	if len([]rune(address.Street)) < 3 {
		return nil, "Delivery street or area is required."
	}
	if (raw.Latitude == nil) != (raw.Longitude == nil) {
		return nil, "A delivery pin needs both latitude and longitude."
	}
	if raw.Latitude != nil && raw.Longitude != nil {
		lat, lng := *raw.Latitude, *raw.Longitude
		if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
			return nil, "Delivery pin coordinates are out of range."
		}
		address.Latitude = &lat
		address.Longitude = &lng
	}

	return address, ""
}
