# model paths and detection/liveness thresholds

import os

base_dir = os.path.dirname(os.path.abspath(__file__))

# load .env if present
for env_path in [os.path.join(base_dir, ".env"), os.path.join(base_dir, "../.env")]:
    if os.path.isfile(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v

BASE_DIR = base_dir
ANTI_SPOOF_DIR = os.getenv("ANTI_SPOOF_DIR", os.path.join(BASE_DIR, "Silent-Face-Anti-Spoofing"))
ANTI_SPOOF_MODEL_DIR = os.getenv("ANTI_SPOOF_MODEL_DIR", os.path.join(ANTI_SPOOF_DIR, "resources/anti_spoof_models"))
ANTI_SPOOF_MODEL = os.getenv(
    "ANTI_SPOOF_MODEL",
    os.path.join(ANTI_SPOOF_DIR, "resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth"),
)
ANTI_SPOOF_CAFFE_MODEL = os.getenv(
    "ANTI_SPOOF_CAFFE_MODEL",
    os.path.join(ANTI_SPOOF_DIR, "resources/detection_model/Widerface-RetinaFace.caffemodel"),
)
ANTI_SPOOF_CAFFE_DEPLOY = os.getenv(
    "ANTI_SPOOF_CAFFE_DEPLOY",
    os.path.join(ANTI_SPOOF_DIR, "resources/detection_model/deploy.prototxt"),
)

INSIGHT_FACE_MODEL = os.getenv("INSIGHT_FACE_MODEL", "buffalo_s")

def _parse_det_size(val: str) -> tuple[int, int]:
    try:
        parts = [int(p.strip()) for p in val.split(",") if p.strip()]
        if len(parts) == 2:
            return (parts[0], parts[1])
        if len(parts) == 1:
            return (parts[0], parts[0])
    except Exception:
        pass
    return (640, 640)

DET_SIZE = _parse_det_size(os.getenv("DET_SIZE", "640,640"))
DET_THRESH = float(os.getenv("DET_THRESH", "0.4"))
MAX_FACES = int(os.getenv("MAX_FACES", "5"))
ALIGNED_FACE_SIZE = int(os.getenv("ALIGNED_FACE_SIZE", "112"))

LIVENESS_THRESH = float(os.getenv("LIVENESS_THRESH", "0.50"))
RECOG_THRESH = float(os.getenv("RECOG_THRESH", os.getenv("SIMILARITY_THRESHOLD", "0.45")))
LIVENESS_MARGIN = float(os.getenv("LIVENESS_MARGIN", "0.9"))
FAISS_DIM = int(os.getenv("FAISS_DIM", "512"))
FAISS_SEARCH_TOP_K = int(os.getenv("FAISS_SEARCH_TOP_K", "1"))

PORT = int(os.getenv("PORT", "8001"))
HOST = os.getenv("HOST", "0.0.0.0")
