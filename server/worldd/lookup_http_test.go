package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWorldLookupAllowsCredentialFreeCrossOriginReads(t *testing.T) {
	d := &daemon{}
	preflight := httptest.NewRecorder()
	d.handleLookup(preflight, httptest.NewRequest(http.MethodOptions, "/api/lookup", nil))
	if preflight.Code != http.StatusNoContent || preflight.Header().Get("Access-Control-Allow-Origin") != "*" || preflight.Header().Get("Access-Control-Allow-Methods") != "GET, OPTIONS" {
		t.Fatalf("lookup CORS preflight = status %d, headers %v", preflight.Code, preflight.Header())
	}

	lookup := httptest.NewRecorder()
	d.handleLookup(lookup, httptest.NewRequest(http.MethodGet, "/api/lookup?worldId=invalid", nil))
	if lookup.Code != http.StatusBadRequest || lookup.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("cross-origin lookup response = status %d, headers %v", lookup.Code, lookup.Header())
	}
}
