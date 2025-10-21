package services

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

type FFmpegInstaller struct {
	os string
}

func NewFFmpegInstaller() *FFmpegInstaller {
	return &FFmpegInstaller{
		os: runtime.GOOS,
	}
}

func (fi *FFmpegInstaller) IsFFmpegInstalled(ffmpegPath string) bool {
	cmd := exec.Command(ffmpegPath, "-version")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func (fi *FFmpegInstaller) AttemptInstall() error {
	LogInfo("[INSTALLER] FFmpeg not found, attempting automatic installation...")
	LogInfo("[INSTALLER] Detected OS: %s", fi.os)
	
	switch fi.os {
	case "windows":
		return fi.installWindows()
	case "darwin":
		return fi.installMacOS()
	case "linux":
		return fi.installLinux()
	default:
		return fmt.Errorf("unsupported OS: %s", fi.os)
	}
}

func (fi *FFmpegInstaller) installWindows() error {
	LogInfo("[INSTALLER] Attempting to install FFmpeg using winget...")
	
	cmd := exec.Command("winget", "--version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("winget not available - please install FFmpeg manually from https://ffmpeg.org/download.html")
	}
	
	LogInfo("[INSTALLER] Winget found, installing FFmpeg...")
	installCmd := exec.Command("winget", "install", "--id=Gyan.FFmpeg", "--silent", "--accept-package-agreements", "--accept-source-agreements")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		LogError("[INSTALLER] Winget installation failed: %v\nOutput: %s", err, string(output))
		return fmt.Errorf("winget installation failed: %w", err)
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via winget")
	LogInfo("[INSTALLER] You may need to restart the application for PATH changes to take effect")
	return nil
}

func (fi *FFmpegInstaller) installMacOS() error {
	LogInfo("[INSTALLER] Attempting to install FFmpeg using Homebrew...")
	
	cmd := exec.Command("brew", "--version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Homebrew not available - please install from https://brew.sh or install FFmpeg manually")
	}
	
	LogInfo("[INSTALLER] Homebrew found, installing FFmpeg...")
	installCmd := exec.Command("brew", "install", "ffmpeg")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		LogError("[INSTALLER] Homebrew installation failed: %v\nOutput: %s", err, string(output))
		return fmt.Errorf("brew installation failed: %w", err)
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via Homebrew")
	return nil
}

func (fi *FFmpegInstaller) installLinux() error {
	LogInfo("[INSTALLER] Attempting to install FFmpeg on Linux...")
	
	if fi.hasCommand("apt-get") {
		return fi.installLinuxAPT()
	} else if fi.hasCommand("yum") {
		return fi.installLinuxYUM()
	} else if fi.hasCommand("dnf") {
		return fi.installLinuxDNF()
	} else if fi.hasCommand("pacman") {
		return fi.installLinuxPacman()
	}
	
	return fmt.Errorf("no supported package manager found - please install FFmpeg manually")
}

func (fi *FFmpegInstaller) installLinuxAPT() error {
	LogInfo("[INSTALLER] Using apt-get to install FFmpeg...")
	
	updateCmd := exec.Command("sudo", "apt-get", "update")
	if err := updateCmd.Run(); err != nil {
		LogInfo("[INSTALLER] apt-get update failed, continuing anyway...")
	}
	
	installCmd := exec.Command("sudo", "apt-get", "install", "-y", "ffmpeg")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		LogError("[INSTALLER] apt-get installation failed: %v\nOutput: %s", err, string(output))
		return fmt.Errorf("apt-get installation failed: %w", err)
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via apt-get")
	return nil
}

func (fi *FFmpegInstaller) installLinuxYUM() error {
	LogInfo("[INSTALLER] Using yum to install FFmpeg...")
	
	installCmd := exec.Command("sudo", "yum", "install", "-y", "ffmpeg")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		if strings.Contains(string(output), "No package ffmpeg available") {
			LogInfo("[INSTALLER] Attempting to enable EPEL repository...")
			epelCmd := exec.Command("sudo", "yum", "install", "-y", "epel-release")
			epelCmd.Run()
			
			installCmd = exec.Command("sudo", "yum", "install", "-y", "ffmpeg")
			output, err = installCmd.CombinedOutput()
		}
		
		if err != nil {
			LogError("[INSTALLER] yum installation failed: %v\nOutput: %s", err, string(output))
			return fmt.Errorf("yum installation failed: %w", err)
		}
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via yum")
	return nil
}

func (fi *FFmpegInstaller) installLinuxDNF() error {
	LogInfo("[INSTALLER] Using dnf to install FFmpeg...")
	
	installCmd := exec.Command("sudo", "dnf", "install", "-y", "ffmpeg")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		LogError("[INSTALLER] dnf installation failed: %v\nOutput: %s", err, string(output))
		return fmt.Errorf("dnf installation failed: %w", err)
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via dnf")
	return nil
}

func (fi *FFmpegInstaller) installLinuxPacman() error {
	LogInfo("[INSTALLER] Using pacman to install FFmpeg...")
	
	installCmd := exec.Command("sudo", "pacman", "-S", "--noconfirm", "ffmpeg")
	output, err := installCmd.CombinedOutput()
	
	if err != nil {
		LogError("[INSTALLER] pacman installation failed: %v\nOutput: %s", err, string(output))
		return fmt.Errorf("pacman installation failed: %w", err)
	}
	
	LogInfo("[INSTALLER] FFmpeg installed successfully via pacman")
	return nil
}

func (fi *FFmpegInstaller) hasCommand(command string) bool {
	cmd := exec.Command("which", command)
	if runtime.GOOS == "windows" {
		cmd = exec.Command("where", command)
	}
	return cmd.Run() == nil
}