package cache

import (
	"sync"
	"time"
)

// Entry represents a cached item
type Entry struct {
	Value      interface{}
	Expiration time.Time
}

// IsExpired checks if the entry has expired
func (e Entry) IsExpired() bool {
	return time.Now().After(e.Expiration)
}

// Cache is a simple in-memory cache with TTL
type Cache struct {
	mu      sync.RWMutex
	items   map[string]Entry
	ttl     time.Duration
	maxSize int
	hits    int64
	misses  int64
}

// New creates a new Cache with default settings
func New() *Cache {
	return NewWithOptions(5*time.Minute, 1000)
}

// NewWithOptions creates a new Cache with custom TTL and max size
func NewWithOptions(ttl time.Duration, maxSize int) *Cache {
	c := &Cache{
		items:   make(map[string]Entry),
		ttl:     ttl,
		maxSize: maxSize,
	}

	// Start cleanup goroutine
	go c.cleanup()

	return c
}

// Set adds an item to the cache
func (c *Cache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Evict oldest if at max size
	if len(c.items) >= c.maxSize {
		c.evictOldest()
	}

	c.items[key] = Entry{
		Value:      value,
		Expiration: time.Now().Add(c.ttl),
	}
}

// SetWithTTL adds an item with custom TTL
func (c *Cache) SetWithTTL(key string, value interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.items) >= c.maxSize {
		c.evictOldest()
	}

	c.items[key] = Entry{
		Value:      value,
		Expiration: time.Now().Add(ttl),
	}
}

// Get retrieves an item from the cache
func (c *Cache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.items[key]
	if !exists {
		return nil, false
	}

	if entry.IsExpired() {
		return nil, false
	}

	return entry.Value, true
}

// Delete removes an item from the cache
func (c *Cache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}

// Clear removes all items from the cache
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]Entry)
}

// Size returns the number of items in the cache
func (c *Cache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Stats returns cache statistics
func (c *Cache) Stats() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return map[string]interface{}{
		"size":    len(c.items),
		"maxSize": c.maxSize,
		"ttl":     c.ttl.String(),
		"hits":    c.hits,
		"misses":  c.misses,
	}
}

func (c *Cache) evictOldest() {
	var oldestKey string
	var oldestTime time.Time

	for key, entry := range c.items {
		if oldestKey == "" || entry.Expiration.Before(oldestTime) {
			oldestKey = key
			oldestTime = entry.Expiration
		}
	}

	if oldestKey != "" {
		delete(c.items, oldestKey)
	}
}

func (c *Cache) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		c.mu.Lock()
		for key, entry := range c.items {
			if entry.IsExpired() {
				delete(c.items, key)
			}
		}
		c.mu.Unlock()
	}
}
