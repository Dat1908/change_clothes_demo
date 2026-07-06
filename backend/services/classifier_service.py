import logging
import os
import io
from PIL import Image
import google.generativeai as genai

from config import GEMINI_API_KEYS

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

    try:
        logger.info("Starting auto gender detection using Gemini...")
        # Use the first available key for classification
        _, api_key = GEMINI_API_KEYS[0]
        genai.configure(api_key=api_key)
        
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        model = genai.GenerativeModel(model_name)
        
        prompt = "Người trong ảnh là nam hay nữ? Nếu là nam hãy trả về số 1, nếu là nữ hãy trả về số 0. Trả về duy nhất 1 con số."
        
        # We use low temperature because we want a deterministic, factual answer
        response = model.generate_content(
            [prompt, img],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        
        result = response.text.strip()
        logger.info(f"Gender classification result raw: {result}")
        
        if result == "1":
            return "nam"
        elif result == "0":
            return "nu"
        else:
            logger.warning(f"Unexpected classification result: {result}")
            return "nam"
            
    except Exception as e:
        logger.error(f"Error during gender classification: {e}")
        return "nam"
