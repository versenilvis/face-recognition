"""
MiniFASNet wrapper: anti-spoofing liveness detection
Hỗ trợ cả LivenessChecker (ensemble các mô hình .pth trong resources/anti_spoof_models)
và hàm check_liveness (nhận trực tiếp BBox từ Buffalo, không gọi RetinaFace).
"""

import os
import sys
from collections import OrderedDict
import cv2
import numpy as np
import torch
import torch.nn.functional as F

from config import (
    ANTI_SPOOF_DIR,
    ANTI_SPOOF_MODEL_DIR,
    ANTI_SPOOF_MODEL,
    LIVENESS_THRESH,
)

# allow older state_dict files in newer pytorch versions
_orig_torch_load = torch.load


def _safe_torch_load(*args, **kwargs):
    if "weights_only" not in kwargs:
        kwargs["weights_only"] = False
    return _orig_torch_load(*args, **kwargs)


torch.load = _safe_torch_load

# add repo to path once at import
if ANTI_SPOOF_DIR not in sys.path:
    sys.path.insert(0, ANTI_SPOOF_DIR)

from src.model_lib.MiniFASNet import (
    MiniFASNetV1,
    MiniFASNetV2,
    MiniFASNetV1SE,
    MiniFASNetV2SE,
)
from src.utility import get_kernel, parse_model_name


def crop_liveness_scale(
    img: np.ndarray, bbox: list[int], scale: float, out_size: tuple[int, int]
) -> np.ndarray:
    """Crop theo CropImage của Silent-Face-Anti-Spoofing. bbox = [x1, y1, x2, y2]."""
    H, W = img.shape[:2]
    x1, y1, x2, y2 = bbox
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    s = min((H - 1) / bh, (W - 1) / bw, scale)
    nw, nh = bw * s, bh * s
    cx, cy = x1 + bw / 2.0, y1 + bh / 2.0
    l, t, r, b = cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2
    if l < 0:
        r -= l
        l = 0
    if t < 0:
        b -= t
        t = 0
    if r > W - 1:
        l -= r - W + 1
        r = W - 1
    if b > H - 1:
        t -= b - H + 1
        b = H - 1
    crop = img[max(0, int(t)) : min(H, int(b) + 1), max(0, int(l)) : min(W, int(r) + 1)]
    return cv2.resize(crop, out_size)


class LivenessChecker:
    """Nạp mọi .pth trong model_dir (1 lần duy nhất), trung bình softmax. Trả về [p0, p_REAL, p2]."""

    def __init__(
        self,
        repo_dir: str | None = None,
        model_dir: str | None = None,
        device: torch.device | None = None,
    ):
        self.repo_dir = repo_dir or ANTI_SPOOF_DIR
        self.model_dir = model_dir or ANTI_SPOOF_MODEL_DIR
        if self.repo_dir not in sys.path:
            sys.path.insert(0, self.repo_dir)

        arch = {
            "MiniFASNetV1": MiniFASNetV1,
            "MiniFASNetV2": MiniFASNetV2,
            "MiniFASNetV1SE": MiniFASNetV1SE,
            "MiniFASNetV2SE": MiniFASNetV2SE,
        }
        self.device = device or torch.device(
            "cuda:0" if torch.cuda.is_available() else "cpu"
        )
        self.models = []

        if os.path.exists(self.model_dir):
            pth_files = sorted(
                f for f in os.listdir(self.model_dir) if f.endswith(".pth")
            )
        else:
            pth_files = []

        if not pth_files and os.path.exists(ANTI_SPOOF_MODEL):
            pth_files = [os.path.basename(ANTI_SPOOF_MODEL)]
            self.model_dir = os.path.dirname(ANTI_SPOOF_MODEL)

        for name in pth_files:
            try:
                h, w, mtype, scale = parse_model_name(name)
                net = arch[mtype](conv6_kernel=get_kernel(h, w)).to(self.device)
                state = torch.load(
                    os.path.join(self.model_dir, name), map_location=self.device
                )
                state = OrderedDict(
                    (k.replace("module.", "", 1), v) for k, v in state.items()
                )
                net.load_state_dict(state, strict=True)
                self.models.append((net.eval(), (w, h), scale))
            except Exception:
                continue

        assert self.models, f"Không có .pth hợp lệ trong {self.model_dir}"

    def predict(self, img_bgr: np.ndarray, bbox: list[int]) -> np.ndarray:
        """Trả về numpy array 3 phần tử [p0, p_REAL, p2] trung bình các models."""
        total = np.zeros(3, dtype=np.float32)
        for net, size, scale in self.models:
            crop = crop_liveness_scale(img_bgr, bbox, scale, size)
            x = (
                torch.from_numpy(crop.transpose(2, 0, 1))
                .float()[None]
                .to(self.device)
            )
            with torch.no_grad():
                out = net(x)
                probs = F.softmax(out, dim=1).cpu().numpy()[0]
                total += probs
        return total / len(self.models)


_checker: LivenessChecker | None = None


def get_liveness_checker() -> LivenessChecker:
    global _checker
    if _checker is None:
        _checker = LivenessChecker()
    return _checker


_get_models = get_liveness_checker  # backward compat alias


def check_liveness(img_bgr: np.ndarray, bbox: list[int]) -> tuple[str, float]:
    """
    Chạy Liveness ensemble trên BBox [x1, y1, x2, y2].
    Dùng trực tiếp BBox từ Buffalo (InsightFace), KHÔNG gọi RetinaFace để tiết kiệm FLOP.
    Trả về: ("Real" | "Fake", real_probability 0.0 - 1.0)
    """
    try:
        checker = get_liveness_checker()
        x1, y1, x2, y2 = bbox
        if x2 - x1 <= 0 or y2 - y1 <= 0:
            return "Fake", 0.0

        probs = checker.predict(img_bgr, [x1, y1, x2, y2])
        real_score = float(probs[1])
        label = "Real" if real_score >= LIVENESS_THRESH else "Fake"
        return label, real_score
    except Exception:
        return "Fake", 0.0
