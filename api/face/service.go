package face

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/versenilvis/face-recognition/infer"
	"github.com/versenilvis/face-recognition/utils"
)

var (
	ErrNotFound       = errors.New("not found")
	ErrInvalidRequest = errors.New("invalid request")
	ErrLessonClosed   = errors.New("lesson closed")
	ErrNoFace         = errors.New("no face detected")
	ErrMultipleFaces  = errors.New("multiple faces detected")
	ErrFakeFace       = errors.New("fake face detected")
)

type Service struct {
	repo        *Repo
	inferClient *infer.Client
	threshold   float64
}

func NewService(r *Repo, ic *infer.Client) *Service {
	return &Service{
		repo:        r,
		inferClient: ic,
		threshold:   utils.GetEnvAsFloat("SIMILARITY_THRESHOLD", 0.45),
	}
}

func (s *Service) RegisterFace(ctx context.Context, svID int, imgBytes []byte) (*infer.FaceResult, error) {
	exists, err := s.repo.CheckSinhVienExists(ctx, svID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}

	inferResp, err := s.inferClient.Infer(ctx, imgBytes)
	if err != nil {
		return nil, fmt.Errorf("infer service error: %w", err)
	}

	if len(inferResp.Faces) == 0 {
		return nil, ErrNoFace
	}
	if len(inferResp.Faces) > 1 {
		return nil, ErrMultipleFaces
	}

	face := inferResp.Faces[0]
	if face.Liveness.Label != "Real" {
		return nil, ErrFakeFace
	}

	embedJSON, err := json.Marshal(face.Embedding)
	if err != nil {
		return nil, err
	}

	if err := s.repo.SaveFaceEmbedding(ctx, svID, string(embedJSON)); err != nil {
		return nil, err
	}

	return &face, nil
}

func (s *Service) ProcessCheckin(ctx context.Context, buoiHocID int, imgBytes []byte) (*CheckinResult, error) {
	lopHocID, trangThai, err := s.repo.GetBuoiHoc(ctx, buoiHocID)
	if err != nil {
		return nil, ErrNotFound
	}
	if trangThai != "open" {
		return nil, ErrLessonClosed
	}

	inferResp, err := s.inferClient.Infer(ctx, imgBytes)
	if err != nil {
		return nil, fmt.Errorf("infer service error: %w", err)
	}

	roster, err := s.repo.GetRosterWithEmbeddings(ctx, lopHocID)
	if err != nil {
		return nil, err
	}

	var matches []CheckinMatch
	for _, face := range inferResp.Faces {
		if face.Liveness.Label != "Real" {
			matches = append(matches, CheckinMatch{
				SinhVienID: 0,
				MSSV:       "",
				HoTen:      "Giả mạo",
				Similarity: 0,
				Status:     "fake",
				BBox:       face.BBox,
			})
			continue
		}

		var bestMatch *RosterStudent
		var maxSim float64

		for i := range roster {
			sim := infer.CosineSimilarity(face.Embedding, roster[i].Embedding)
			if sim > maxSim {
				maxSim = sim
				bestMatch = &roster[i]
			}
		}

		if bestMatch != nil && maxSim >= s.threshold {
			affected, err := s.repo.RecordAttendance(ctx, buoiHocID, bestMatch.ID, &maxSim, "face")
			status := "already"
			if err == nil && affected > 0 {
				status = "new"
			}

			matches = append(matches, CheckinMatch{
				SinhVienID: bestMatch.ID,
				MSSV:       bestMatch.MSSV,
				HoTen:      bestMatch.HoTen,
				Similarity: maxSim,
				Status:     status,
				BBox:       face.BBox,
			})
		} else {
			matches = append(matches, CheckinMatch{
				SinhVienID: 0,
				MSSV:       "",
				HoTen:      "Chưa đăng ký",
				Similarity: maxSim,
				Status:     "unknown",
				BBox:       face.BBox,
			})
		}
	}

	return &CheckinResult{
		Matches: matches,
		Faces:   len(inferResp.Faces),
	}, nil
}
