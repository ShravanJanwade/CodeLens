package circuit

import (
	"errors"
	"sync"
	"time"
)

// ErrCircuitOpen is returned when the circuit is open
var ErrCircuitOpen = errors.New("circuit breaker is open")

// State represents the circuit breaker state
type State int

const (
	StateClosed   State = iota // Normal operation
	StateOpen                  // Failing, reject requests
	StateHalfOpen              // Testing if service recovered
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	name        string
	maxFailures int
	timeout     time.Duration
	halfOpenMax int

	mu              sync.RWMutex
	state           State
	failures        int
	successes       int
	lastFailure     time.Time
	lastStateChange time.Time
}

// Config holds circuit breaker configuration
type Config struct {
	Name        string
	MaxFailures int           // Failures before opening circuit
	Timeout     time.Duration // Time before trying half-open
	HalfOpenMax int           // Successful calls needed to close
}

// DefaultConfig returns sensible defaults
func DefaultConfig(name string) Config {
	return Config{
		Name:        name,
		MaxFailures: 5,
		Timeout:     30 * time.Second,
		HalfOpenMax: 3,
	}
}

// New creates a new CircuitBreaker
func New(cfg Config) *CircuitBreaker {
	return &CircuitBreaker{
		name:            cfg.Name,
		maxFailures:     cfg.MaxFailures,
		timeout:         cfg.Timeout,
		halfOpenMax:     cfg.HalfOpenMax,
		state:           StateClosed,
		lastStateChange: time.Now(),
	}
}

// Execute runs the given function if the circuit allows it
func (cb *CircuitBreaker) Execute(fn func() error) error {
	if !cb.AllowRequest() {
		return ErrCircuitOpen
	}

	err := fn()

	if err != nil {
		cb.RecordFailure()
		return err
	}

	cb.RecordSuccess()
	return nil
}

// AllowRequest checks if a request should be allowed
func (cb *CircuitBreaker) AllowRequest() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()

	switch cb.state {
	case StateClosed:
		return true

	case StateOpen:
		// Check if timeout has passed
		if now.Sub(cb.lastFailure) > cb.timeout {
			cb.toHalfOpen()
			return true
		}
		return false

	case StateHalfOpen:
		// Allow limited requests in half-open state
		return true

	default:
		return false
	}
}

// RecordSuccess records a successful call
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateHalfOpen:
		cb.successes++
		if cb.successes >= cb.halfOpenMax {
			cb.toClosed()
		}
	case StateClosed:
		// Reset failure count on success
		cb.failures = 0
	}
}

// RecordFailure records a failed call
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures++
	cb.lastFailure = time.Now()

	switch cb.state {
	case StateClosed:
		if cb.failures >= cb.maxFailures {
			cb.toOpen()
		}
	case StateHalfOpen:
		cb.toOpen()
	}
}

func (cb *CircuitBreaker) toOpen() {
	cb.state = StateOpen
	cb.lastStateChange = time.Now()
	cb.successes = 0
}

func (cb *CircuitBreaker) toHalfOpen() {
	cb.state = StateHalfOpen
	cb.lastStateChange = time.Now()
	cb.successes = 0
	cb.failures = 0
}

func (cb *CircuitBreaker) toClosed() {
	cb.state = StateClosed
	cb.lastStateChange = time.Now()
	cb.failures = 0
	cb.successes = 0
}

// State returns the current state
func (cb *CircuitBreaker) State() State {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

// Stats returns circuit breaker statistics
func (cb *CircuitBreaker) Stats() map[string]interface{} {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	return map[string]interface{}{
		"name":            cb.name,
		"state":           cb.state.String(),
		"failures":        cb.failures,
		"successes":       cb.successes,
		"lastFailure":     cb.lastFailure,
		"lastStateChange": cb.lastStateChange,
	}
}

// Update: minor optimization