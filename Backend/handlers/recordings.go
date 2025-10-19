package handlers

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"recorder/models"
	"recorder/services"
)

type RecordingsHandler struct {
	recorder *services.RecorderService
}

func NewRecordingsHandler(recorder *services.RecorderService) *RecordingsHandler {
	return &RecordingsHandler{recorder: recorder}
}

func (h *RecordingsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var data models.RecordingData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		log.Printf("ERROR: Failed to decode request: %v", err)
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	var decodedData []byte
	var err error

	if data.Status == "stream" {
		decodedData, err = base64.StdEncoding.DecodeString(data.Data)
		if err != nil {
			log.Printf("ERROR: Base64 decode failed for tab %d: %v", data.TabID, err)
			http.Error(w, "Invalid data encoding", http.StatusBadRequest)
			return
		}
	}

	if err := h.recorder.HandleRecording(data.TabID, data.Name, data.Timestamp, decodedData, data.Status); err != nil {
		log.Printf("ERROR: Recording failed for tab %d: %v", data.TabID, err)
		http.Error(w, "Recording failed", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}