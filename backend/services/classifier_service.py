import logging
import os
import io
from PIL import Image
import google.generativeai as genai

from config import GEMINI_API_KEYS
from services.gemini_key_pool import call_with_round_robin_fallback

logger = logging.getLogger(__name__)

def detect_gender(image_bytes: bytes) -> str:
    """
    Phân tích hình ảnh và trả về giới tính "nam" hoặc "nu".
    Mặc định trả về "nam" nếu có lỗi để fallback an toàn.
    """
    model_name = os.getenv("MODEL_CLASSIFIER", "gemini-2.5-flash")
    if not GEMINI_API_KEYS:
        logger.error("No GEMINI API key found for classification.")
        return "nam"

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    prompt = "Người trong ảnh là nam hay nữ? Nếu là nam hãy trả về số 1, nếu là nữ hãy trả về số 0. Trả về duy nhất 1 con số."

    def attempt_classify(api_key: str) -> str:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        # We use low temperature because we want a deterministic, factual answer
        response = model.generate_content(
            [prompt, img],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        return response.text.strip()

    try:
        logger.info("Starting auto gender detection using Gemini...")
        result = call_with_round_robin_fallback(attempt_classify, log_prefix="GenderClassifier")
        logger.info(f"Gender classification result raw: {result}")

        if result == "1":
            return "nam"
        elif result == "0":
            return "nu"
        else:
            logger.warning(f"Unexpected classification result: {result}")
            return "nam"

    except Exception as e:
        logger.error(f"Error during gender classification (all keys failed): {e}")
        return "nam"
