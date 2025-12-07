package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/codelens-ai/gateway/internal/circuit"
)

// ServiceProxy proxies requests to backend services with circuit breaker
type ServiceProxy struct {
	client   *http.Client
	breakers map[string]*circuit.CircuitBreaker
}

// New creates a new ServiceProxy
func New() *ServiceProxy {
	return &ServiceProxy{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		breakers: make(map[string]*circuit.CircuitBreaker),
	}
}

// getBreaker returns or creates a circuit breaker for a service
func (p *ServiceProxy) getBreaker(service string) *circuit.CircuitBreaker {
	if breaker, ok := p.breakers[service]; ok {
		return breaker
	}

	breaker := circuit.New(circuit.DefaultConfig(service))
	p.breakers[service] = breaker
	return breaker
}

// ProxyRequest forwards a request to a backend service
func (p *ServiceProxy) ProxyRequest(
	service string,
	baseURL string,
	method string,
	path string,
	body interface{},
) ([]byte, int, error) {
	breaker := p.getBreaker(service)

	var responseBody []byte
	var statusCode int

	err := breaker.Execute(func() error {
		// Build request
		url := fmt.Sprintf("%s%s", baseURL, path)

		var reqBody io.Reader
		if body != nil {
			jsonBody, err := json.Marshal(body)
			if err != nil {
				return fmt.Errorf("failed to marshal body: %w", err)
			}
			reqBody = bytes.NewBuffer(jsonBody)
		}

		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")

		// Execute request
		resp, err := p.client.Do(req)
		if err != nil {
			return fmt.Errorf("request failed: %w", err)
		}
		defer resp.Body.Close()

		responseBody, err = io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read response: %w", err)
		}

		statusCode = resp.StatusCode

		// Consider 5xx as failures for circuit breaker
		if resp.StatusCode >= 500 {
			return fmt.Errorf("server error: %d", resp.StatusCode)
		}

		return nil
	})

	if err == circuit.ErrCircuitOpen {
		return nil, http.StatusServiceUnavailable, fmt.Errorf("service %s is temporarily unavailable", service)
	}

	return responseBody, statusCode, err
}

// GetBreakerStats returns statistics for all circuit breakers
func (p *ServiceProxy) GetBreakerStats() map[string]interface{} {
	stats := make(map[string]interface{})
	for name, breaker := range p.breakers {
		stats[name] = breaker.Stats()
	}
	return stats
}

// Update: minor optimization