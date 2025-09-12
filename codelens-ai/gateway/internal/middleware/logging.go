package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// RequestLogger logs HTTP requests with structured logging
func RequestLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		// Process request
		err := c.Next()

		// Log after request
		duration := time.Since(start)
		statusCode := c.Response().StatusCode()

		// Determine log level based on status
		var event *zerolog.Event
		switch {
		case statusCode >= 500:
			event = log.Error()
		case statusCode >= 400:
			event = log.Warn()
		default:
			event = log.Info()
		}

		event.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", statusCode).
			Dur("duration", duration).
			Str("ip", c.IP()).
			Str("user_agent", c.Get("User-Agent")).
			Msg("HTTP Request")

		return err
	}
}

// Update: minor optimization
// Update: minor optimization