package middleware

import (
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// JWTAuth middleware validates JWT tokens
func JWTAuth() fiber.Handler {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-secret-change-in-production"
	}

	return func(c *fiber.Ctx) error {
		// Get token from header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			// Allow requests without auth for now (development)
			return c.Next()
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization header format",
			})
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token",
			})
		}

		// Extract claims and add to context
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Locals("user_id", claims["sub"])
			c.Locals("claims", claims)
		}

		return c.Next()
	}
}

// GenerateToken creates a new JWT token (for testing)
func GenerateToken(userID string, secret string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"iat": jwt.NewNumericDate(time.Now()),
		"exp": jwt.NewNumericDate(time.Now().AddDate(0, 0, 7)), // 7 days
	})

	return token.SignedString([]byte(secret))
}

// Update: minor optimization