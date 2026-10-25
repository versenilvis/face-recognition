# model paths and detection/liveness thresholds

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ANTI_SPOOF_DIR = os.path.join(BASE_DIR, "Silent-Face-Anti-Spoofing")
ANTI_SPOOF_MODEL_DIR = os.path.join(ANTI_SPOOF_DIR, "resources/anti_spoof_models")
ANTI_SPOOF_MODEL = os.path.join(
    ANTI_SPOOF_DIR, "resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth"
)
ANTI_SPOOF_CAFFE_MODEL = os.path.join(
    ANTI_SPOOF_DIR, "resources/detection_model/Widerface-RetinaFace.caffemodel"
)
ANTI_SPOOF_CAFFE_DEPLOY = os.path.join(
    ANTI_SPOOF_DIR, "resources/detection_model/deploy.prototxt"
)

INSIGHT_FACE_MODEL = "buffalo_s"
DET_SIZE = (640, 640)
DET_THRESH = 0.5
MAX_FACES = 5
ALIGNED_FACE_SIZE = 112

LIVENESS_THRESH = float(os.getenv("LIVENESS_THRESH", 0.50))
RECOG_THRESH = 0.4
LIVENESS_MARGIN = 0.95
FAISS_DIM = 512
FAISS_SEARCH_TOP_K = int(os.getenv("FAISS_SEARCH_TOP_K", 1))

PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")
