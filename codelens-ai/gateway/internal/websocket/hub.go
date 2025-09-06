package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

// Message represents a WebSocket message
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Client represents a connected WebSocket client
type Client struct {
	ID     string
	Conn   *websocket.Conn
	RepoID string
	Send   chan Message
}

// Hub manages WebSocket connections
type Hub struct {
	clients     map[*Client]bool
	repoClients map[string]map[*Client]bool // repoID -> clients watching
	register    chan *Client
	unregister  chan *Client
	broadcast   chan BroadcastMessage
	mu          sync.RWMutex
}

// BroadcastMessage is a message to broadcast
type BroadcastMessage struct {
	RepoID  string
	Message Message
}

// NewHub creates a new Hub
func NewHub() *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		repoClients: make(map[string]map[*Client]bool),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		broadcast:   make(chan BroadcastMessage, 256),
	}
}

// Run starts the hub's event loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if client.RepoID != "" {
				if h.repoClients[client.RepoID] == nil {
					h.repoClients[client.RepoID] = make(map[*Client]bool)
				}
				h.repoClients[client.RepoID][client] = true
			}
			h.mu.Unlock()
			log.Printf("Client connected: %s (repo: %s)", client.ID, client.RepoID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if client.RepoID != "" {
					delete(h.repoClients[client.RepoID], client)
				}
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected: %s", client.ID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			if msg.RepoID == "" {
				// Broadcast to all clients
				for client := range h.clients {
					select {
					case client.Send <- msg.Message:
					default:
						// Buffer full, skip
					}
				}
			} else {
				// Broadcast to repo subscribers only
				if clients, ok := h.repoClients[msg.RepoID]; ok {
					for client := range clients {
						select {
						case client.Send <- msg.Message:
						default:
							// Buffer full, skip
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToRepo sends a message to all clients watching a repo
func (h *Hub) BroadcastToRepo(repoID string, msgType string, payload interface{}) {
	h.broadcast <- BroadcastMessage{
		RepoID: repoID,
		Message: Message{
			Type:    msgType,
			Payload: payload,
		},
	}
}

// BroadcastToAll sends a message to all connected clients
func (h *Hub) BroadcastToAll(msgType string, payload interface{}) {
	h.broadcast <- BroadcastMessage{
		RepoID: "",
		Message: Message{
			Type:    msgType,
			Payload: payload,
		},
	}
}

// HandleConnection handles a new WebSocket connection (method version)
func (h *Hub) HandleConnection(conn *websocket.Conn) {
	HandleConnectionFunc(h, conn)
}

// HandleConnectionFunc handles a new WebSocket connection (standalone function)
func HandleConnectionFunc(hub *Hub, conn *websocket.Conn) {
	client := &Client{
		ID:   uuid.New().String(),
		Conn: conn,
		Send: make(chan Message, 256),
	}

	hub.register <- client

	// Start write pump
	go writePump(client)

	// Read pump (blocks until connection closes)
	readPump(hub, client)

	// Cleanup
	hub.unregister <- client
}

func readPump(hub *Hub, client *Client) {
	defer client.Conn.Close()

	for {
		_, message, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Parse incoming message
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Invalid message format: %v", err)
			continue
		}

		// Handle message types
		switch msg.Type {
		case "SUBSCRIBE_REPO":
			if payload, ok := msg.Payload.(map[string]interface{}); ok {
				if repoID, ok := payload["repoId"].(string); ok {
					hub.mu.Lock()
					// Remove from old repo subscription
					if client.RepoID != "" {
						delete(hub.repoClients[client.RepoID], client)
					}
					// Add to new repo subscription
					client.RepoID = repoID
					if hub.repoClients[repoID] == nil {
						hub.repoClients[repoID] = make(map[*Client]bool)
					}
					hub.repoClients[repoID][client] = true
					hub.mu.Unlock()

					// Confirm subscription
					client.Send <- Message{
						Type: "SUBSCRIBED",
						Payload: map[string]string{
							"repoId": repoID,
						},
					}
				}
			}

		case "PING":
			client.Send <- Message{Type: "PONG", Payload: nil}

		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

func writePump(client *Client) {
	defer client.Conn.Close()

	for msg := range client.Send {
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("Failed to marshal message: %v", err)
			continue
		}

		if err := client.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("Failed to write message: %v", err)
			break
		}
	}
}
