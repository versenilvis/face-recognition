"""
compatibility layer and utilities from ce201.ipynb experiment notebook
provides in-memory database with Faiss search and multi-face evaluation helper functions
"""

import os
import pickle
import cv2
import numpy as np
import faiss
from collections import OrderedDict
from numpy.linalg import norm
from insightface.utils import face_align
from config import (
    DET_SIZE,
    DET_THRESH,
    LIVENESS_THRESH,
    RECOG_THRESH,
    MAX_FACES,
    ALIGNED_FACE_SIZE,
    FAISS_DIM,
    ANTI_SPOOF_DIR,
    ANTI_SPOOF_MODEL_DIR,
)
from detector import (
    load_model,
    get_recognition_model,
    get_embedding,
    tta_vectors,
    extract_tta_vectors,
    compute_face_embedding,
    letterbox_image,
    detect_faces,
)
from liveness import (
    crop_liveness_scale,
    LivenessChecker,
    get_liveness_checker,
    check_liveness as detect_liveness,
)
from src.utility import parse_model_name


class FaissFaceDB:
    """
    Cơ sở dữ liệu khuôn mặt in-memory tăng tốc bằng Faiss IndexFlatIP (Cosine Similarity).
    """

    def __init__(self, dim: int = FAISS_DIM):
        self.dim: int = dim
        self.vecs: dict[str, list[np.ndarray]] = {}
        self.raw_vectors = self.vecs  # backward alias
        self.ids: list[str] = []
        self.index = None

    def add_vector(self, pid: str | int, v: np.ndarray | list[float]) -> None:
        """Thêm vector đặc trưng cho một person_id."""
        vec = np.array(v, dtype=np.float32).flatten()
        v_norm = norm(vec)
        if v_norm > 0:
            vec = vec / v_norm
        self.vecs.setdefault(str(pid), []).append(vec.astype(np.float32))
        self.index = None

    def build_index(self) -> None:
        """Tính vector đại diện cho mỗi ID và nạp vào Faiss Index."""
        if not self.vecs:
            self.ids = []
            self.index = faiss.IndexFlatIP(self.dim)
            return

        self.ids = sorted(self.vecs.keys())
        cents = [np.mean(self.vecs[p], axis=0) for p in self.ids]
        cents = np.vstack(
            [c / (norm(c) if norm(c) > 0 else 1.0) for c in cents]
        ).astype(np.float32)

        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(cents)

    def search(
        self, qvecs: np.ndarray, top_k: int = 1, return_dict: bool = False
    ):
        """
        Tìm kiếm danh tính phù hợp nhất cho qvecs.
        Nếu top_k == 1 và không yêu cầu return_dict: trả về (best_id, best_sim).
        Nếu top_k > 1 hoặc return_dict=True: trả về (best_id, best_sim, id_sims_dict).
        """
        if self.index is None:
            self.build_index()

        if self.index is None or self.index.ntotal == 0 or len(self.ids) == 0:
            return (
                ("Unknown", 0.0, {})
                if (return_dict or top_k > 1)
                else ("Unknown", 0.0)
            )

        q = np.array(qvecs, dtype=np.float32)
        if q.ndim == 1:
            q = q.reshape(1, -1)
        q_mean = np.mean(q, axis=0, keepdims=True).astype(np.float32)
        q_norm = norm(q_mean, axis=1, keepdims=True)
        if q_norm > 0:
            q_mean = (q_mean / q_norm).astype(np.float32)

        k_search = min(len(self.ids), max(1, top_k))
        scores, indices = self.index.search(q_mean, k_search)

        best_idx = indices[0][0]
        best_sim = float(scores[0][0])
        best_id = self.ids[best_idx]

        if return_dict or top_k > 1:
            id_sims = {
                self.ids[idx]: float(s)
                for s, idx in zip(scores[0], indices[0])
                if idx != -1
            }
            return best_id, best_sim, id_sims

        return best_id, best_sim

    def __len__(self) -> int:
        return len(self.vecs)

    def __contains__(self, pid: str | int) -> bool:
        return str(pid) in self.vecs

    def keys(self):
        return self.vecs.keys()


def cos_sim(e1: list[float] | np.ndarray, e2: list[float] | np.ndarray) -> float:
    """Cosine similarity giữa 2 vector."""
    v1 = np.array(e1, dtype=np.float32).flatten()
    v2 = np.array(e2, dtype=np.float32).flatten()
    n1 = norm(v1)
    n2 = norm(v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (n1 * n2))


def load_database(db_path: str) -> FaissFaceDB:
    """
    Nạp database từ file .pkl và đóng gói vào FaissFaceDB.
    """
    db = FaissFaceDB()
    if not os.path.exists(db_path):
        return db

    with open(db_path, "rb") as f:
        data = pickle.load(f)

    if isinstance(data, dict):
        if "embeddings" in data and "labels" in data:
            for emb, label in zip(data["embeddings"], data["labels"]):
                db.add_vector(label, emb)
        else:
            for person_id, embs in data.items():
                embs_arr = np.atleast_2d(embs)
                for emb in embs_arr:
                    db.add_vector(person_id, emb)

    db.build_index()
    return db


def add_to_database(
    db: FaissFaceDB | dict,
    paths: list[str | np.ndarray],
    ids: list[str | int],
    app=None,
    target_size: tuple[int, int] = DET_SIZE,
    *args,
    **kwargs,
) -> None:
    """
    Chuẩn hóa và cắt khuôn mặt trực tiếp, lưu embedding 112x112 vào FaissFaceDB hoặc dict (không dùng augmentation).
    """
    if app is None:
        app = load_model()
    rec_model = get_recognition_model(app)

    for path, person_id in zip(paths, ids):
        img_bgr = path if isinstance(path, np.ndarray) else cv2.imread(str(path))
        if img_bgr is None:
            continue

        faces, work, ox, oy = detect_faces(
            app, img_bgr, det_thresh=DET_THRESH, max_faces=1
        )
        if not faces:
            continue

        target_face = faces[0]
        if (
            hasattr(target_face, "kps")
            and target_face.kps is not None
            and rec_model is not None
        ):
            try:
                aligned_face = face_align.norm_crop(
                    work, landmark=target_face.kps, image_size=ALIGNED_FACE_SIZE
                )
                if aligned_face is not None and aligned_face.size > 0:
                    emb = get_embedding(rec_model, aligned_face)
                    if hasattr(db, "add_vector"):
                        db.add_vector(person_id, emb)
                    elif isinstance(db, dict):
                        db[str(person_id)] = emb
                    continue
            except Exception:
                pass

        if (
            hasattr(target_face, "normed_embedding")
            and target_face.normed_embedding is not None
        ):
            emb = target_face.normed_embedding
            emb_norm = (emb / norm(emb)).astype(np.float32)
            if hasattr(db, "add_vector"):
                db.add_vector(person_id, emb_norm)
            elif isinstance(db, dict):
                db[str(person_id)] = emb_norm

    if hasattr(db, "build_index"):
        db.build_index()


def process_frame(
    img: np.ndarray,
    db: FaissFaceDB | dict,
    app=None,
    liveness: LivenessChecker | None = None,
    det_thresh: float = DET_THRESH,
    liveness_thresh: float = LIVENESS_THRESH * 100.0,
    recog_thresh: float = RECOG_THRESH,
    max_faces: int = 1,
    do_recognition: bool = True,
    *args,
    **kwargs,
) -> list[dict]:
    """
    Hàm process_frame chuẩn theo notebook ce201.ipynb mới nhất (không dùng augmentation).
    Trả về list dict (mỗi mặt một dict), rỗng nếu không có mặt.
    """
    if img is None or (do_recognition and len(db) == 0):
        return []

    if app is None:
        app = load_model()
    rec_model = app.models.get("recognition") if do_recognition else None

    faces, work, ox, oy = detect_faces(app, img, det_thresh, max_faces)
    h, w = img.shape[:2]
    out = []

    for f in faces:
        x1, y1, x2, y2 = f.bbox
        bbox = [
            max(0, int(round(x1 - ox))),
            max(0, int(round(y1 - oy))),
            min(w, int(round(x2 - ox))),
            min(h, int(round(y2 - oy))),
        ]
        r = {
            "bbox": bbox,
            "det_score": float(f.det_score),
            "liveness": None,
            "matched_id": None,
            "similarity": None,
            "status": "",
        }
        is_real = True

        if liveness is not None:
            probs = liveness.predict(img, bbox)
            score = float(probs[1] * 100)
            is_real = score >= liveness_thresh
            r["liveness"] = {"score": score, "probs": probs.tolist(), "real": is_real}

        if do_recognition and rec_model is not None:
            al = face_align.norm_crop(
                work, landmark=f.kps, image_size=ALIGNED_FACE_SIZE
            )
            emb = get_embedding(rec_model, al)
            if hasattr(db, "search"):
                pid, sim = db.search(emb[None])
            else:
                db_ids = list(db.keys())
                db_mat = np.array(list(db.values()), dtype=np.float32)
                sims = np.dot(emb, db_mat.T)
                best_idx = int(np.argmax(sims))
                pid = db_ids[best_idx]
                sim = float(sims[best_idx])

            r["matched_id"] = pid if sim >= recog_thresh else "Unknown"
            r["similarity"] = sim * 100
            r["status"] = (
                "Từ chối: Giả mạo"
                if not is_real
                else "Từ chối: Người lạ"
                if r["matched_id"] == "Unknown"
                else f"Điểm danh thành công: {r['matched_id']}"
            )
        else:
            r["status"] = "Live" if is_real else "Từ chối: Giả mạo"

        out.append(r)

    return out


def process_multi_face_frame(
    frame_org: np.ndarray,
    db: FaissFaceDB | dict,
    app=None,
    target_size: tuple[int, int] = DET_SIZE,
    det_thresh: float = DET_THRESH,
    liveness_thresh: float = LIVENESS_THRESH * 100.0,
    recog_thresh: float = RECOG_THRESH,
    max_faces: int = MAX_FACES,
    check_liveness: bool = True,
    do_recognition: bool = True,
    *args,
    **kwargs,
) -> list[dict]:
    """
    Xử lý khung hình điểm danh đa mặt đối chiếu với FaissFaceDB:
    - BBox hiển thị và cắt liveness được quy đổi về tọa độ frame_org.
    - Cắt mặt 112x112 thực hiện trực tiếp trên work_img bằng face.kps chuẩn xác.
    - Dùng trực tiếp BBox Buffalo cho Liveness, không gọi lại RetinaFace.
    - Trích xuất 1 embedding duy nhất và tìm kiếm qua Faiss IndexFlatIP cực nhanh.
    """
    final_results = []
    if frame_org is None or (do_recognition and len(db) == 0):
        return final_results

    if app is None:
        app = load_model()
    rec_model = get_recognition_model(app) if do_recognition else None

    h_org, w_org = frame_org.shape[:2]
    faces, work, ox, oy = detect_faces(
        app, frame_org, det_thresh=det_thresh, max_faces=max_faces
    )

    for face in faces:
        px1, py1, px2, py2 = face.bbox
        x1 = max(0, int(round(px1 - ox)))
        y1 = max(0, int(round(py1 - oy)))
        x2 = min(w_org, int(round(px2 - ox)))
        y2 = min(h_org, int(round(py2 - oy)))

        face_result = {
            "bbox": [x1, y1, x2, y2],
            "det_score": float(face.det_score),
            "liveness": {"score": 0.0, "label": "Fake"},
            "recognition": {"similarity": 0.0, "matched_id": "Unknown"},
            "status": "Không xác định",
        }

        is_real = True

        # ---- 2.1 LIVENESS ----
        if check_liveness:
            label, score = detect_liveness(frame_org, [x1, y1, x2, y2])
            liveness_percent = round(score * 100.0, 2)
            face_result["liveness"]["score"] = liveness_percent
            is_real = liveness_percent >= liveness_thresh
            face_result["liveness"]["label"] = "Real" if is_real else "Fake"

        # ---- 2.2 NHẬN DIỆN VỚI FAISS ----
        if do_recognition and rec_model is not None:
            aligned_face = face_align.norm_crop(
                work, landmark=face.kps, image_size=ALIGNED_FACE_SIZE
            )
            emb = get_embedding(rec_model, aligned_face)

            id_sims: dict[str, float] = {}
            if hasattr(db, "search"):
                search_res = db.search(emb[None], top_k=len(db), return_dict=True)
                if len(search_res) == 3:
                    best_id, best_avg_sim, id_sims = search_res
                else:
                    best_id, best_avg_sim = search_res
            else:
                db_ids = list(db.keys())
                db_matrix = np.array(list(db.values()), dtype=np.float32)
                sims = np.dot(emb, db_matrix.T)
                best_idx = int(np.argmax(sims))
                best_id = db_ids[best_idx]
                best_avg_sim = float(sims[best_idx])
                for idx, pid in enumerate(db_ids):
                    id_sims[pid] = float(sims[idx])

            if best_avg_sim < recog_thresh:
                best_id = "Unknown"

            face_result["recognition"]["similarity"] = round(best_avg_sim * 100, 2)
            face_result["recognition"]["matched_id"] = best_id
            if "100" in id_sims:
                face_result["recognition"]["sim_with_100"] = round(
                    id_sims["100"] * 100, 2
                )

            if check_liveness and not is_real:
                face_result["status"] = (
                    f"Từ chối: Giả mạo (ID nghi vấn: {best_id})"
                )
            elif best_id == "Unknown":
                face_result["status"] = "Từ chối: Người lạ"
            else:
                face_result["status"] = f"Điểm danh thành công: {best_id}"
        else:
            face_result["status"] = "Live" if is_real else "Từ chối: Giả mạo"

        final_results.append(face_result)

    return final_results
