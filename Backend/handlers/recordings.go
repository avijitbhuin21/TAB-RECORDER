package handlers

import (
	"encoding/base64"
	"encoding/json"
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
	services.LogInfo("[RECORDINGS] Received %s request from %s", r.Method, r.RemoteAddr)
	
	var data models.RecordingData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		services.LogError("[RECORDINGS] Failed to decode request: %v", err)
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	services.LogInfo("[RECORDINGS] Request data - TabID: %d, Name: %s, Status: %s, Timestamp: %d",
		data.TabID, data.Name, data.Status, data.Timestamp)

	var decodedData []byte
	var err error

	if data.Status == "stream" {
		services.LogInfo("[RECORDINGS] Processing stream chunk for tab %d", data.TabID)
		services.LogInfo("[RECORDINGS] Base64 data length: %d characters", len(data.Data))
		
		decodedData, err = base64.StdEncoding.DecodeString(data.Data)
		if err != nil {
			services.LogError("[RECORDINGS] Base64 decode failed for tab %d: %v", data.TabID, err)
			http.Error(w, "Invalid data encoding", http.StatusBadRequest)
			return
		}
		services.LogInfo("[RECORDINGS] Decoded chunk size: %d bytes", len(decodedData))
	} else if data.Status == "stopped" {
		services.LogInfo("[RECORDINGS] Received stop signal for tab %d", data.TabID)
	}

	services.LogInfo("[RECORDINGS] Calling recorder.HandleRecording...")
	if err := h.recorder.HandleRecording(data.TabID, data.Name, data.Timestamp, decodedData, data.Status); err != nil {
		services.LogError("[RECORDINGS] Recording failed for tab %d: %v", data.TabID, err)
		http.Error(w, "Recording failed", http.StatusInternalServerError)
		return
	}

	services.LogInfo("[RECORDINGS] ✅ Successfully handled recording for tab %d", data.TabID)
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}