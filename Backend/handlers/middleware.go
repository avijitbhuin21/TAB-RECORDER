package handlers

import (
	"net/http"
	"os"
)

func getAllowedOrigin() string {
	if origin := os.Getenv("ALLOWED_ORIGIN"); origin != "" {
		return origin
	}
	return "*"
}

func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	allowedOrigin := getAllowedOrigin()
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next(w, r)
	}
}