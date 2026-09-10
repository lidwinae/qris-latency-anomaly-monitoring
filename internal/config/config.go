package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL   string
	AppAddr       string
	PublicBaseURL string
	DemoMode      bool
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func Load() (Config, error) {
	if err := godotenv.Load(".env"); err != nil && !os.IsNotExist(err) {
		return Config{}, err
	}

	cfg := Config{
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		AppAddr:       envOr("APP_ADDR", "127.0.0.1:8080"),
		PublicBaseURL: strings.TrimRight(envOr("PUBLIC_BASE_URL", "http://localhost:5173"), "/"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL belum diatur")
	}

	demoMode, err := strconv.ParseBool(envOr("DEMO_MODE", "false"))
	if err != nil {
		return Config{}, fmt.Errorf("DEMO_MODE harus true atau false")
	}
	cfg.DemoMode = demoMode

	publicURL, err := url.Parse(cfg.PublicBaseURL)
	if err != nil || publicURL.Host == "" ||
		(publicURL.Scheme != "http" && publicURL.Scheme != "https") {
		return Config{}, fmt.Errorf("PUBLIC_BASE_URL tidak valid")
	}

	return cfg, nil
}
