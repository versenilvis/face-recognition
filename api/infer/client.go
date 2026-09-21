// cầu nối giữa infer python và api golang
package infer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"time"
)

type FaceLiveness struct {
	Label string  `json:"label"`
	Score float64 `json:"score"`
}

type FaceResult struct {
	BBox      []int        `json:"bbox"` // tọa độ khung mặt [x1, y1, x2, y2]
	DetScore  float64      `json:"det_score"`
	Embedding []float64    `json:"embedding"` //  vector đặc trưng 512
	Liveness  FaceLiveness `json:"liveness"`  // fake or riel
}

type InferResponse struct {
	Faces []FaceResult `json:"faces"`
	Error string       `json:"error,omitempty"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	sem        chan struct{}
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		/*
			Model AI ngốn rất nhiều CPU và RAM khi xử lý ảnh
			Nếu 10 máy cùng lúc gửi ảnh checkin, Python sẽ bị quá tải hoặc crash
			Channel sem giới hạn chỉ duy nhất 1 request inference được gửi đi tại một thời điểm, các request khác sẽ xếp hàng đợi theo lượt
		*/
		sem: make(chan struct{}, 1), // semaphore = 1
	}
}

func (c *Client) Infer(ctx context.Context, imgBytes []byte) (*InferResponse, error) {
	select {
	// struct {}{} là 1 giá trị khởi tạo đặc biệt trong go chỉ tốn 0 byte, dùng nó để truyền tín hiệu mà không tốn một chút RAM nào
	// Khi gửi dữ liệu vào Channel (cần truyền một Giá trị cụ thể)
	// https://www.reddit.com/r/golang/comments/1u89o5k/how_does_struct_take_zero_bytes_in_go/
	case c.sem <- struct{}{}:
		defer func() { <-c.sem }() // khi request hoàn thành thì trả lại semaphore cho goroutine khác vào
	case <-ctx.Done(): // giả sử người dùng tắt tab hoặc tắt cam, request timeout = mark done, thoát
		return nil, ctx.Err()
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", "frame.jpg")
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(imgBytes); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/infer", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("infer error (%d): %s", resp.StatusCode, string(respBytes))
	}

	var inferResp InferResponse
	if err := json.NewDecoder(resp.Body).Decode(&inferResp); err != nil {
		return nil, err
	}

	return &inferResp, nil
}

/*
CosineSimilarity đo góc giữa 2 vector 512 chiều theo công thức Cosine
Kết quả trả về từ 0.0 đến 1.0
Càng gần 1 thì càng chắc chắn là cùng một người
*/
func CosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}
