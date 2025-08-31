package models

import "time"

// IndexStatus represents the status of a repository indexing job
type IndexStatus struct {
	RepoID         string    `json:"repoId"`
	Status         string    `json:"status"` // pending, processing, completed, failed
	Progress       float64   `json:"progress"`
	FilesProcessed int       `json:"filesProcessed"`
	TotalFiles     int       `json:"totalFiles"`
	SymbolsIndexed int       `json:"symbolsIndexed"`
	Error          string    `json:"error,omitempty"`
	StartedAt      time.Time `json:"startedAt,omitempty"`
	CompletedAt    time.Time `json:"completedAt,omitempty"`
}

// CodeSymbol represents an indexed code symbol
type CodeSymbol struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Kind         string   `json:"kind"` // function, class, method, variable
	FilePath     string   `json:"filePath"`
	StartLine    int      `json:"startLine"`
	EndLine      int      `json:"endLine"`
	Signature    string   `json:"signature"`
	Docstring    string   `json:"docstring,omitempty"`
	Language     string   `json:"language"`
	Dependencies []string `json:"dependencies"`
	Dependents   []string `json:"dependents"`
}

// QueryRequest represents a code question
type QueryRequest struct {
	RepoID   string       `json:"repoId"`
	Question string       `json:"question"`
	Context  QueryContext `json:"context,omitempty"`
}

// QueryContext provides additional context for queries
type QueryContext struct {
	CurrentFile  string `json:"currentFile,omitempty"`
	SelectedCode string `json:"selectedCode,omitempty"`
	SymbolName   string `json:"symbolName,omitempty"`
}

// QueryResponse is the answer to a code question
type QueryResponse struct {
	Answer            string   `json:"answer"`
	Sources           []Source `json:"sources"`
	FollowUpQuestions []string `json:"followUpQuestions"`
}

// Source represents a code source for an answer
type Source struct {
	File      string  `json:"file"`
	Symbol    string  `json:"symbol"`
	Lines     string  `json:"lines"`
	Relevance float64 `json:"relevance"`
	Snippet   string  `json:"snippet,omitempty"`
}
