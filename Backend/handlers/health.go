package handlers

import (
	"encoding/json"
	"net/http"
	"recorder/models"
	"time"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := models.HealthResponse{
		Status: "ok",
		Time:   time.Now().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}