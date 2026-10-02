package main

import (
	"encoding/json"
	"testing"
)

func TestPortalBackStrictFields(t *testing.T) {
	valid := `{"id":"tw-portal:a","back":{"destinationWorldId":"tw-world:b","exit":{"position":[0,0,0],"yaw":3.14},"enabled":true,"openView":false}}`
	var p portal
	if err := json.Unmarshal([]byte(valid), &p); err != nil || p.Back == nil || p.Back.Destination != "tw-world:b" {
		t.Fatalf("valid rear: %v", err)
	}
	for _, invalid := range []string{
		`{"back":null}`, `{"back":[]}`, `{"back":{"destinationWorldId":"tw-world:b","exit":{},"enabled":true,"openView":true,"entry":{}}}`,
		`{"back":{"destinationWorldId":"tw-world:b","exit":{},"enabled":true}}`,
		`{"back":{"destinationWorldId":"tw-world:b","exit":{},"enabled":null,"openView":false}}`,
	} {
		if err := json.Unmarshal([]byte(invalid), &p); err == nil {
			t.Fatalf("accepted invalid rear %s", invalid)
		}
	}
	if err := json.Unmarshal([]byte(`{"id":"tw-portal:legacy"}`), &p); err != nil || p.Back != nil {
		t.Fatalf("legacy: %v", err)
	}
}
