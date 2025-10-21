package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type PostProcessor struct {
	ffmpegPath string
}

func NewPostProcessor(ffmpegPath string) (*PostProcessor, error) {
	pp := &PostProcessor{ffmpegPath: ffmpegPath}
	if err := pp.checkFFmpegAvailable(); err != nil {
		return nil, err
	}
	LogInfo("[POSTPROCESSOR] FFmpeg available at: %s", ffmpegPath)
	return pp, nil
}

func (pp *PostProcessor) checkFFmpegAvailable() error {
	cmd := exec.Command(pp.ffmpegPath, "-version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("FFmpeg not available at '%s': %w", pp.ffmpegPath, err)
	}
	
	versionStr := string(output)
	if !strings.Contains(versionStr, "ffmpeg version") {
		return fmt.Errorf("invalid FFmpeg binary at '%s'", pp.ffmpegPath)
	}
	
	return nil
}

func (pp *PostProcessor) FixWebMMetadata(inputPath string) error {
	startTime := time.Now()
	
	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		return fmt.Errorf("input file does not exist: %s", inputPath)
	}
	
	fileInfo, err := os.Stat(inputPath)
	if err != nil {
		return fmt.Errorf("failed to stat input file: %w", err)
	}
	
	if fileInfo.Size() == 0 {
		return fmt.Errorf("input file is empty: %s", inputPath)
	}
	
	dir := filepath.Dir(inputPath)
	base := filepath.Base(inputPath)
	tempPath := filepath.Join(dir, ".temp_"+base)
	
	LogInfo("[POSTPROCESSOR] Starting post-processing: %s (size: %d bytes)", inputPath, fileInfo.Size())
	
	cmd := exec.Command(
		pp.ffmpegPath,
		"-i", inputPath,
		"-c", "copy",
		"-movflags", "+faststart",
		"-y",
		tempPath,
	)
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		LogError("[POSTPROCESSOR] FFmpeg failed: %v\nOutput: %s", err, string(output))
		os.Remove(tempPath)
		return fmt.Errorf("FFmpeg processing failed: %w", err)
	}
	
	tempInfo, err := os.Stat(tempPath)
	if err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to stat output file: %w", err)
	}
	
	if tempInfo.Size() == 0 {
		os.Remove(tempPath)
		return fmt.Errorf("output file is empty after processing")
	}
	
	if err := os.Remove(inputPath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to remove original file: %w", err)
	}
	
	if err := os.Rename(tempPath, inputPath); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}
	
	duration := time.Since(startTime)
	LogInfo("[POSTPROCESSOR] Post-processing completed: %s (%.2fs, output size: %d bytes)", 
		inputPath, duration.Seconds(), tempInfo.Size())
	
	return nil
}