"""
Flask inference server — POST /infer
listens on 127.0.0.1:8001 only, not public
"""

import cv2
import numpy as np
from flask import Flask, request, jsonify
from pipeline import process_frame, FaceResult
from detector import load_model
from liveness import _get_models

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/infer", methods=["POST"])
def infer():
    if "image" not in request.files:
        return jsonify({"error": "missing image field"}), 400

    file_bytes = np.frombuffer(request.files["image"].read(), dtype=np.uint8)
    img_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img_bgr is None:
        return jsonify({"error": "invalid image"}), 400

    results: list[FaceResult] = process_frame(img_bgr)

    return jsonify({
        "faces": [
            {
                "bbox": r.bbox,
                "det_score": round(r.det_score, 4),
                "embedding": r.embedding,
                "liveness": {
                    "label": r.liveness_label,
                    "score": round(r.liveness_score, 4),
                },
            }
            for r in results
        ]
    })


if __name__ == "__main__":
    # warm up models before accepting requests
    print("loading models...")
    load_model()
    _get_models()
    print("ready — listening on 127.0.0.1:8001")

    app.run(host="127.0.0.1", port=8001, debug=False)
