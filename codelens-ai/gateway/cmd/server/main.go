package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/codelens-ai/gateway/internal/cache"
	"github.com/codelens-ai/gateway/internal/middleware"
	"github.com/codelens-ai/gateway/internal/proxy"
	"github.com/codelens-ai/gateway/internal/websocket"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	fiberws "github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Config holds application configuration
type Config struct {
	Port       string
	IndexerURL string
	QueryURL   string
	JWTSecret  string
}

func loadConfig() *Config {
	return &Config{
		Port:       getEnv("PORT", "8080"),
		IndexerURL: getEnv("INDEXER_URL", "http://localhost:8001"),
		QueryURL:   getEnv("QUERY_URL", "http://localhost:8002"),
		JWTSecret:  getEnv("JWT_SECRET", "codelens-dev-secret"),
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func main() {
	// Configure logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	config := loadConfig()

	// Initialize services
	serviceProxy := proxy.New()
	wsHub := websocket.NewHub()
	cacheService := cache.New()

	// Start WebSocket hub
	go wsHub.Run()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "CodeLens API Gateway",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// Middleware
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "*",
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: false,
	}))
	app.Use(middleware.RequestLogger())

	// API v1 routes
	api := app.Group("/api/v1")

	// Health check endpoint
	api.Get("/health", func(c *fiber.Ctx) error {
		// Check backend services health
		services := make(map[string]bool)

		// Check indexer
		_, statusCode, err := serviceProxy.ProxyRequest("indexer", config.IndexerURL, "GET", "/health", nil)
		services["indexer"] = err == nil && statusCode == 200

		// Check query service
		_, statusCode, err = serviceProxy.ProxyRequest("query", config.QueryURL, "GET", "/health", nil)
		services["query"] = err == nil && statusCode == 200

		status := "ok"
		if !services["indexer"] || !services["query"] {
			status = "degraded"
		}

		return c.JSON(fiber.Map{
			"status":   status,
			"services": services,
			"time":     time.Now().UTC().Format(time.RFC3339),
		})
	})

	// ============================================================
	// Index Routes - Proxy to Indexer Service
	// ============================================================

	// Start indexing a repository
	api.Post("/index", func(c *fiber.Ctx) error {
		body, statusCode, err := serviceProxy.ProxyRequest(
			"indexer",
			config.IndexerURL,
			"POST",
			"/index",
			parseBody(c),
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// Get index status
	api.Get("/index/:repoId", func(c *fiber.Ctx) error {
		repoId := c.Params("repoId")
		// Check cache first
		if cached, found := cacheService.Get("index_status:" + repoId); found {
			return c.JSON(cached)
		}

		body, statusCode, err := serviceProxy.ProxyRequest(
			"indexer",
			config.IndexerURL,
			"GET",
			"/status/"+repoId,
			nil,
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		// Cache completed status for longer
		var response map[string]interface{}
		if json.Unmarshal(body, &response) == nil {
			if status, ok := response["status"].(string); ok && status == "completed" {
				cacheService.SetWithTTL("index_status:"+repoId, response, 5*time.Minute)
			}
		}

		return c.Status(statusCode).Send(body)
	})

	// Delete index
	api.Delete("/index/:repoId", func(c *fiber.Ctx) error {
		repoId := c.Params("repoId")
		body, statusCode, err := serviceProxy.ProxyRequest(
			"indexer",
			config.IndexerURL,
			"DELETE",
			"/index/"+repoId,
			nil,
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		// Invalidate cache
		cacheService.Delete("index_status:" + repoId)
		return c.Status(statusCode).Send(body)
	})

	// ============================================================
	// Symbol Routes - Proxy to Indexer Service
	// ============================================================

	// Get symbols for a repository
	api.Get("/symbols/:repoId", func(c *fiber.Ctx) error {
		repoId := c.Params("repoId")
		limit := c.Query("limit", "100")

		body, statusCode, err := serviceProxy.ProxyRequest(
			"indexer",
			config.IndexerURL,
			"GET",
			fmt.Sprintf("/symbols/%s?limit=%s", repoId, limit),
			nil,
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// Search symbols
	api.Get("/symbols/:repoId/search", func(c *fiber.Ctx) error {
		repoId := c.Params("repoId")
		query := c.Query("q", "")

		body, statusCode, err := serviceProxy.ProxyRequest(
			"indexer",
			config.IndexerURL,
			"GET",
			fmt.Sprintf("/symbols/%s/search?q=%s", repoId, query),
			nil,
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// ============================================================
	// Query Routes - Proxy to Query Service
	// ============================================================

	// Query the codebase
	api.Post("/query", func(c *fiber.Ctx) error {
		body, statusCode, err := serviceProxy.ProxyRequest(
			"query",
			config.QueryURL,
			"POST",
			"/query",
			parseBody(c),
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// Analyze/explain a symbol
	api.Post("/analyze", func(c *fiber.Ctx) error {
		body, statusCode, err := serviceProxy.ProxyRequest(
			"query",
			config.QueryURL,
			"POST",
			"/explain",
			parseBody(c),
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// Summarize a file
	api.Post("/summarize", func(c *fiber.Ctx) error {
		body, statusCode, err := serviceProxy.ProxyRequest(
			"query",
			config.QueryURL,
			"POST",
			"/summarize",
			parseBody(c),
		)
		if err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(statusCode).Send(body)
	})

	// ============================================================
	// WebSocket for real-time updates
	// ============================================================

	app.Use("/ws", func(c *fiber.Ctx) error {
		if fiberws.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws", fiberws.New(func(c *fiberws.Conn) {
		wsHub.HandleConnection(c)
	}))

	// ============================================================
	// Stats endpoint for debugging
	// ============================================================

	api.Get("/stats", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"circuitBreakers": serviceProxy.GetBreakerStats(),
			"cache":           cacheService.Stats(),
			"uptime":          time.Since(startTime).String(),
		})
	})

	// Start server
	log.Info().Str("port", config.Port).Msg("🚀 CodeLens API Gateway starting")
	if err := app.Listen(":" + config.Port); err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}

var startTime = time.Now()

// parseBody extracts JSON body from request
func parseBody(c *fiber.Ctx) map[string]interface{} {
	var body map[string]interface{}
	if err := c.BodyParser(&body); err != nil {
		return nil
	}
	return body
}

// Unused but keep for future auth implementation
var _ = strings.TrimSpace
var _ = http.StatusOK
