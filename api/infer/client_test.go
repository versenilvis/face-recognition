package infer_test

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/versenilvis/face-recognition/infer"
)

func TestCosineSimilarity(t *testing.T) {
	v1 := []float64{1.0, 0.0, 0.0}
	v2 := []float64{1.0, 0.0, 0.0}
	sim := infer.CosineSimilarity(v1, v2)
	if math.Abs(sim-1.0) > 1e-5 {
		t.Errorf("expected 1.0, got: %f", sim)
	}

	v3 := []float64{0.0, 1.0, 0.0}
	simOrthogonal := infer.CosineSimilarity(v1, v3)
	if math.Abs(simOrthogonal-0.0) > 1e-5 {
		t.Errorf("expected 0.0, got: %f", simOrthogonal)
	}
}

func TestClientInfer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/infer" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"faces": [
				{
					"bbox": [10, 20, 100, 120],
					"det_score": 0.99,
					"embedding": [0.1, 0.2, 0.3],
					"liveness": {"label": "Real", "score": 0.95}
				}
			]
		}`))
	}))
	defer server.Close()

	client := infer.NewClient(server.URL)
	resp, err := client.Infer(context.Background(), []byte("fake_image_bytes"))
	if err != nil {
		t.Fatalf("infer failed: %v", err)
	}
	if len(resp.Faces) != 1 {
		t.Fatalf("expected 1 face, got: %d", len(resp.Faces))
	}
	if resp.Faces[0].Liveness.Label != "Real" {
		t.Errorf("expected Real, got: %s", resp.Faces[0].Liveness.Label)
	}
}
