"""
insightface wrapper: face detection + alignment + embedding extraction
uses buffalo_s: RetinaFace (detect) + ArcFace (embed)
"""

import cv2
import numpy as np
import torch
from numpy.linalg import norm
from dataclasses import dataclass
from insightface.app import FaceAnalysis
from insightface.utils import face_align
from config import (
    INSIGHT_FACE_MODEL,
    DET_SIZE,
    DET_THRESH,
    MAX_FACES,
    ALIGNED_FACE_SIZE,
)


@dataclass
class DetectedFace:
    bbox: list[int]  # [x1, y1, x2, y2] in original image coords
    det_score: float
    embedding: list[float]  # 512-dim normalized ArcFace embedding


_app: FaceAnalysis | None = None


def load_model() -> FaceAnalysis:
    global _app
    if _app is None:
        providers = (
            ["CUDAExecutionProvider", "CPUExecutionProvider"]
            if torch.cuda.is_available()
            else ["CPUExecutionProvider"]
        )
        _app = FaceAnalysis(name=INSIGHT_FACE_MODEL, providers=providers)
        ctx = 0 if torch.cuda.is_available() else -1
        _app.prepare(ctx_id=ctx, det_size=DET_SIZE, det_thresh=DET_THRESH)
    return _app


def get_recognition_model(app: FaceAnalysis):
    """
    Lấy mô hình ArcFace (ONNX) để trích xuất feature vector trực tiếp.
    """
    rec_model = app.models.get("recognition")
    if rec_model is None:
        for v in app.models.values():
            if hasattr(v, "get_feat"):
                rec_model = v
                break
    return rec_model


def get_embedding(rec_model, aligned: np.ndarray) -> np.ndarray:
    """
    Trích xuất vector đặc trưng khuôn mặt từ ảnh đã căn chỉnh 112x112 và chuẩn hóa L2 đơn vị.
    Không dùng augmentation để tối ưu tối đa FLOP và tốc độ.
    """
    f = rec_model.get_feat(aligned).flatten()
    return (f / norm(f)).astype(np.float32)


# Shims tương thích ngược
def compute_face_embedding(rec_model, aligned_face: np.ndarray, *args, **kwargs) -> list[float]:
    return get_embedding(rec_model, aligned_face).tolist()


def tta_vectors(rec_model, aligned: np.ndarray, *args, **kwargs) -> np.ndarray:
    return get_embedding(rec_model, aligned)[None]


def extract_tta_vectors(rec_model, aligned_face: np.ndarray, *args, **kwargs) -> np.ndarray:
    return get_embedding(rec_model, aligned_face)[None]


def detect_faces(
    app: FaceAnalysis,
    img: np.ndarray,
    det_thresh: float = DET_THRESH,
    max_faces: int = MAX_FACES,
) -> tuple[list, np.ndarray, int, int]:
    """
    InsightFace tự letterbox về det_size và trả bbox/kps theo tọa độ ảnh đưa vào.
    Không có mặt -> thử lại với ảnh pad reflect 50% (mặt cận cảnh).
    Trả về (list face, work_img, ox, oy); face.kps nằm trong work_img, bbox cần trừ (ox, oy).
    """
    h, w = img.shape[:2]
    for pad in (0.0, 0.5):
        oy, ox = int(h * pad), int(w * pad)
        work = (
            cv2.copyMakeBorder(img, oy, oy, ox, ox, cv2.BORDER_REFLECT_101)
            if pad
            else img
        )
        faces = [f for f in app.get(work) if f.det_score >= det_thresh]
        if faces:
            faces.sort(key=lambda f: f.det_score, reverse=True)
            return faces[:max_faces], work, ox, oy
    return [], img, 0, 0


def get_faces(
    img_bgr: np.ndarray,
    max_faces: int | None = MAX_FACES,
    *args,
    **kwargs,
) -> list[DetectedFace]:
    """
    Phát hiện và trích xuất vector đặc trưng khuôn mặt (không dùng augmentation):
    - Sử dụng detect_faces với fallback BORDER_REFLECT_101 cho ảnh cận cảnh.
    - Cắt mặt 112x112 trực tiếp trên work_img bằng face.kps chuẩn xác.
    - BBox được quy đổi về hệ tọa độ ảnh gốc img_bgr.
    - Trích xuất 1 vector đặc trưng chuẩn hóa L2 đơn vị (512 chiều) duy nhất.
    """
    app = load_model()
    rec_model = get_recognition_model(app)
    h_org, w_org = img_bgr.shape[:2]
    limit = max_faces if max_faces is not None and max_faces > 0 else MAX_FACES

    faces, work, ox, oy = detect_faces(
        app, img_bgr, det_thresh=DET_THRESH, max_faces=limit
    )

    results = []
    for face in faces:
        px1, py1, px2, py2 = face.bbox
        x1 = max(0, int(round(px1 - ox)))
        y1 = max(0, int(round(py1 - oy)))
        x2 = min(w_org, int(round(px2 - ox)))
        y2 = min(h_org, int(round(py2 - oy)))

        embedding = None
        if hasattr(face, "kps") and face.kps is not None and rec_model is not None:
            try:
                aligned_face = face_align.norm_crop(
                    work, landmark=face.kps, image_size=ALIGNED_FACE_SIZE
                )
                if aligned_face is not None and aligned_face.size > 0:
                    embedding = get_embedding(rec_model, aligned_face).tolist()
            except Exception:
                embedding = None

        if embedding is None:
            if hasattr(face, "normed_embedding") and face.normed_embedding is not None:
                embedding = face.normed_embedding.tolist()
            else:
                embedding = [0.0] * 512

        results.append(
            DetectedFace(
                bbox=[x1, y1, x2, y2],
                det_score=float(face.det_score),
                embedding=embedding,
            )
        )

    return results


def letterbox_image(
    img_bgr: np.ndarray, target_size: tuple[int, int] = DET_SIZE
) -> tuple[np.ndarray, int, int, float, float]:
    """Hàm scale ảnh giữ nguyên tỉ lệ H:W (giữ lại tương thích ngược)."""
    h_org, w_org = img_bgr.shape[:2]
    target_h, target_w = target_size

    scale = min(target_h / float(h_org), target_w / float(w_org))
    new_w = max(1, int(round(w_org * scale)))
    new_h = max(1, int(round(h_org * scale)))

    if new_w != w_org or new_h != h_org:
        interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
        img_resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=interp)
    else:
        img_resized = img_bgr.copy()

    scale_x = new_w / float(w_org)
    scale_y = new_h / float(h_org)

    pad_h = target_h - new_h
    pad_w = target_w - new_w

    pad_top = pad_h // 2
    pad_bottom = pad_h - pad_top
    pad_left = pad_w // 2
    pad_right = pad_w - pad_left

    img_padded = cv2.copyMakeBorder(
        img_resized,
        pad_top,
        pad_bottom,
        pad_left,
        pad_right,
        cv2.BORDER_CONSTANT,
        value=[0, 0, 0],
    )

    return img_padded, pad_left, pad_top, scale_x, scale_y
