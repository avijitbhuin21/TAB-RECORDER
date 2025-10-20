package handlers

import (
	"encoding/json"
	"net/http"
	"recorder/models"
	"time"
)

// HealthHandler responds with the server health status and current timestamp.
// Always returns a 200 OK response with JSON containing status and time.
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := models.HealthResponse{
		Status: "ok",
		Time:   time.Now().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}