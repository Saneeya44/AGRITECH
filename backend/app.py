import os
import io
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify
from flask_cors import CORS
# pyrefly: ignore [missing-import]
from PIL import Image

try:
    # pyrefly: ignore [missing-import]
    import tensorflow as tf
    # pyrefly: ignore [missing-import]
    from tensorflow.keras.models import load_model
    HAS_TF = True
except ImportError:
    HAS_TF = False
    print("[AgriTech] TensorFlow not found. Running in Mock Mode.")

app = Flask(__name__)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow ALL origins (including file:// which sends Origin: null) and all methods
CORS(app, origins="*", supports_credentials=False,
     allow_headers=["Content-Type", "Accept"],
     methods=["GET", "POST", "OPTIONS"])

@app.after_request
def add_cors_headers(response):
    """Guarantee CORS headers on every response, including error responses."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
    return response

# ── Configuration ─────────────────────────────────────────────────────────────
UPLOAD_FOLDER = "uploads"
MODEL_PATH    = "model.h5"
IMAGE_SIZE    = (224, 224)          # Standard for MobileNet-based models
ALLOWED_EXTS  = {".jpg", ".jpeg", ".png"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Model Loading ─────────────────────────────────────────────────────────────
model = None

def get_model():
    global model
    if not HAS_TF:
        return None
    if model is None:
        if os.path.exists(MODEL_PATH):
            print(f"[AgriTech] Loading model from {MODEL_PATH} ...")
            try:
                model = load_model(MODEL_PATH)
                print("[AgriTech] Model loaded successfully.")
            except Exception as e:
                print(f"[AgriTech] Error loading model: {e}")
                model = None
        else:
            print(f"[AgriTech] WARNING: {MODEL_PATH} not found. Using mock predictions.")
    return model

# ── Disease Info DB ───────────────────────────────────────────────────────────
DISEASE_INFO = {
    "Late Blight": {
        "plant_type": "Tomato / Potato",
        "remedy": "Apply copper-based fungicides. Remove and destroy infected foliage. Avoid overhead watering.",
        "prevention": "Use resistant varieties and ensure good air circulation."
    },
    "Powdery Mildew": {
        "plant_type": "General (Cucurbits, Grapes, etc.)",
        "remedy": "Spray neem oil or a mix of baking soda and water. Prune crowded areas.",
        "prevention": "Maintain proper spacing and avoid high humidity."
    },
    "Leaf Spot": {
        "plant_type": "Tomato / General",
        "remedy": "Use organic sulfur sprays. Remove fallen leaves around the plant base.",
        "prevention": "Rotate crops and avoid watering the leaves directly."
    },
    "Healthy": {
        "plant_type": "Healthy Plant",
        "remedy": "No treatment needed. Continue regular monitoring and balanced fertilization.",
        "prevention": "Maintain good soil health and hygiene."
    }
}

CLASS_NAMES = ["Healthy", "Late Blight", "Leaf Spot", "Powdery Mildew"]

# ── Image Preprocessing ───────────────────────────────────────────────────────
def preprocess_from_bytes(image_bytes: bytes) -> np.ndarray:
    """Load an image from raw bytes, resize and normalise for the model."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMAGE_SIZE, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)   # shape: (1, 224, 224, 3)

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    # Preflight request
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    # ── 1. Validate file presence ─────────────────────────────────────────────
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a multipart/form-data POST with key 'file'."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "File field is empty — no file was selected."}), 400

    # ── 2. Validate file extension ────────────────────────────────────────────
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in ALLOWED_EXTS:
        return jsonify({
            "error": f"Unsupported file type '{ext}'. Please upload JPG, JPEG, or PNG."
        }), 415

    # ── 3. Read image bytes ───────────────────────────────────────────────────
    try:
        image_bytes = file.read()
        if len(image_bytes) == 0:
            return jsonify({"error": "Uploaded file is empty."}), 400
    except Exception as e:
        return jsonify({"error": f"Could not read uploaded file: {e}"}), 400

    # ── 4. Verify it's a valid image ──────────────────────────────────────────
    try:
        Image.open(io.BytesIO(image_bytes)).verify()
    except Exception:
        return jsonify({"error": "File does not appear to be a valid image."}), 422

    # ── 5. Run prediction ─────────────────────────────────────────────────────
    try:
        trained_model = get_model()

        if HAS_TF and trained_model:
            img_array   = preprocess_from_bytes(image_bytes)
            predictions = trained_model.predict(img_array)
            class_idx   = int(np.argmax(predictions[0]))
            confidence  = float(np.max(predictions[0]) * 100)
            disease_name = CLASS_NAMES[class_idx]
        else:
            # Mock prediction for demo (no model file or no TF available)
            import random
            disease_name = random.choice(CLASS_NAMES)
            confidence   = round(random.uniform(85.0, 99.0), 2)
            if not HAS_TF:
                print(f"[AgriTech] TF missing. Mocked: {disease_name}")

        info = DISEASE_INFO.get(disease_name, {
            "plant_type": "Unknown",
            "remedy": "Consult a local agricultural expert.",
            "prevention": "N/A"
        })

        return jsonify({
            "status":      "success",
            "disease":     disease_name,
            "plant_type":  info["plant_type"],
            "confidence":  round(confidence, 2),
            "remedy":      info["remedy"],
            "prevention":  info["prevention"]
        })

    except Exception as e:
        print(f"[AgriTech] Prediction error: {e}")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":       "healthy",
        "model_loaded": model is not None,
        "model_path":   MODEL_PATH,
        "model_exists": os.path.exists(MODEL_PATH)
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  AgriTech Plant Disease Detection — Backend Server")
    print("  Running at http://localhost:5000")
    print("  Health check: http://localhost:5000/health")
    print("=" * 60)
    # Pre-load model on startup
    get_model()
    app.run(host="0.0.0.0", port=5000, debug=False)
