"""
main inference pipeline: combines detector + liveness into one call.
this is what app.py calls per request.
"""

from dataclasses import dataclass
import numpy as np

from detector import get_faces, DetectedFace, detect_faces, get_embedding
from liveness import check_liveness, LivenessChecker, crop_liveness_scale

# backward compatibility for functions originating from ce201.ipynb
from notebook_compat import (
    FaissFaceDB,
    cos_sim,
    load_database,
    add_to_database,
    process_frame as process_notebook_frame,
    process_multi_face_frame,
)


@dataclass
class FaceResult:
    bbox: list[int]
    det_score: float
    embedding: list[float]       # 512-dim, normalized
    liveness_label: str          # "Real" | "Fake"
    liveness_score: float        # 0.0 - 1.0


def process_frame(
    img_bgr: np.ndarray,
    max_faces: int | None = None,
    *args,
    **kwargs,
) -> list[FaceResult]:
    """
    run full pipeline on a single frame.
    returns one FaceResult per detected face, regardless of liveness outcome.
    go-side decides what to do with fake faces.
    """
    faces: list[DetectedFace] = get_faces(
        img_bgr, max_faces=max_faces
    )
    results: list[FaceResult] = []

    for face in faces:
        label, score = check_liveness(img_bgr, face.bbox)
        results.append(
            FaceResult(
                bbox=face.bbox,
                det_score=face.det_score,
                embedding=face.embedding,
                liveness_label=label,
                liveness_score=score,
            )
        )

    return results
