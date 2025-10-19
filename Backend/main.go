package main

import (
	"embed"
	"fmt"
	"log"
	"net/http"
	"time"

	"recorder/handlers"
	"recorder/services"

	"github.com/sqweek/dialog"
	webview "github.com/webview/webview_go"
)

//go:embed ui/*
var uiFiles embed.FS

const (
	serverPort  = "8080"
	downloadDir = "./recordings"
)

var (
	serverStarted = make(chan bool, 1)
	fileWriter    *services.FileWriterService
)

func main() {
	fileWriter = services.NewFileWriterService(downloadDir)
	recorder := services.NewRecorderService(fileWriter)

	recordingsHandler := handlers.NewRecordingsHandler(recorder)
	configHandler := handlers.NewConfigHandler(fileWriter)

	http.Handle("/ui/", http.FileServer(http.FS(uiFiles)))
	http.HandleFunc("/api/health", handlers.CORSMiddleware(handlers.HealthHandler))
	http.HandleFunc("/api/recordings", handlers.CORSMiddleware(recordingsHandler.Handle))
	http.HandleFunc("/api/config", handlers.CORSMiddleware(configHandler.Handle))

	go startServer()

	launchUI()
}

func startServer() {
	log.Printf("Server starting on http://localhost:%s", serverPort)
	serverStarted <- true

	if err := http.ListenAndServe(":"+serverPort, nil); err != nil {
		log.Fatal(err)
	}
}

func launchUI() {
	<-serverStarted
	time.Sleep(100 * time.Millisecond)

	w := webview.New(false)
	if w == nil {
		log.Fatal("Failed to create webview instance")
	}
	defer w.Destroy()

	w.SetTitle("Recording Server")
	w.SetSize(1200, 800, webview.HintNone)

	setWindowIcon(w)

	w.Bind("selectDirectory", func() string {
		dir, err := dialog.Directory().Title("Select Download Directory").Browse()
		if err != nil {
			log.Printf("Directory selection error: %v", err)
			return ""
		}
		if dir != "" {
			fileWriter.SetDownloadDir(dir)
			log.Printf("Download directory changed to: %s", dir)
		}
		return dir
	})

	w.Bind("getServerStatus", func() map[string]interface{} {
		return map[string]interface{}{
			"port":        serverPort,
			"downloadDir": downloadDir,
			"running":     true,
		}
	})

	w.Navigate(fmt.Sprintf("http://localhost:%s/ui/index.html", serverPort))
	w.Run()
}