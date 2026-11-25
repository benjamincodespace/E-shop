package handlers

import (
	"encoding/json"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

func DecodeJSON(r *http.Request, dst interface{}) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 2<<20))
	return dec.Decode(dst)
}
