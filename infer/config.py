# model paths and detection/liveness thresholds

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ANTI_SPOOF_DIR = os.path.join(BASE_DIR, "Silent-Face-Anti-Spoofing")
ANTI_SPOOF_MODEL = os.path.join(
    ANTI_SPOOF_DIR, "resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth"
)

INSIGHT_FACE_MODEL = "buffalo_s"
DET_SIZE = (640, 640)
DET_THRESH = 0.5

LIVENESS_THRESH = 0.60   # score >= 60% → real
RECOG_THRESH = 0.45      # cosine sim >= 45% → matched (production tighter than notebook's 0.25)
LIVENESS_MARGIN = 0.8    # expand bbox by 80% each side before liveness check
