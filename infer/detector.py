"""
insightface wrapper: face detection + alignment + embedding extraction
uses buffalo_s: RetinaFace (detect) + ArcFace (embed)
"""

import cv2
import numpy as np
import torch
from dataclasses import dataclass
from insightface.app import FaceAnalysis
from config import INSIGHT_FACE_MODEL, DET_SIZE, DET_THRESH


@dataclass
class DetectedFace:
    bbox: list[int]       # [x1, y1, x2, y2] in original image coords
    det_score: float
    embedding: list[float]  # 512-dim normalized ArcFace embedding


_app: FaceAnalysis | None = None


def load_model() -> FaceAnalysis:
    global _app
    if _app is None:
        _app = FaceAnalysis(name=INSIGHT_FACE_MODEL)
        ctx = 0 if torch.cuda.is_available() else -1
        _app.prepare(ctx_id=ctx, det_size=DET_SIZE, det_thresh=DET_THRESH)
    return _app


def _pad_to_target(img_bgr: np.ndarray, target: tuple[int, int] = DET_SIZE) -> tuple[np.ndarray, float, int, int]:
    """
    scale down if larger than target, then pad with black border to reach target.
    returns (padded_img, scale, pad_left, pad_top)
    """
    h, w = img_bgr.shape[:2]
    scale = 1.0

    if h > target[0] or w > target[1]:
        scale = min(target[0] / h, target[1] / w)
        new_w, new_h = int(w * scale), int(h * scale)
        img_bgr = cv2.resize(img_bgr, (new_w, new_h))
        h, w = img_bgr.shape[:2]

    pad_h = target[0] - h
    pad_w = target[1] - w
    top = pad_h // 2
    left = pad_w // 2
    bottom = pad_h - top
    right = pad_w - left

    padded = cv2.copyMakeBorder(img_bgr, top, bottom, left, right, cv2.BORDER_CONSTANT, value=0)
    return padded, scale, left, top


def get_faces(img_bgr: np.ndarray) -> list[DetectedFace]:
    """
    detect all faces in img_bgr and return embedding for each.
    bbox coordinates are mapped back to original image space.
    """
    app = load_model()
    h_org, w_org = img_bgr.shape[:2]
    padded, scale, pad_left, pad_top = _pad_to_target(img_bgr)

    raw_faces = app.get(padded)

    results = []
    for face in raw_faces:
        if face.det_score < DET_THRESH:
            continue

        px1, py1, px2, py2 = face.bbox
        x1 = max(0, int((px1 - pad_left) / scale))
        y1 = max(0, int((py1 - pad_top) / scale))
        x2 = min(w_org, int((px2 - pad_left) / scale))
        y2 = min(h_org, int((py2 - pad_top) / scale))

        results.append(DetectedFace(
            bbox=[x1, y1, x2, y2],
            det_score=float(face.det_score),
            embedding=face.normed_embedding.tolist(),
        ))

    return results
