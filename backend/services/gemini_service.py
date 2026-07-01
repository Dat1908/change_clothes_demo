import base64
import io
import logging
import google.generativeai as genai
from PIL import Image
from config import GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_MODEL_NAME

logger = logging.getLogger(__name__)

PROMPTS = {
    "police": (
        "Ultra-photorealistic raw photo, 8k resolution, taken with DSLR, natural lighting. "
        "One person only, same identity. Change only clothing to a plain green Vietnamese criminal police uniform. "
        "Keep the same face, body, hairstyle, and pose. Professional police-related background. "
        "Lifelike textures, natural skin, unedited photography."
    ),
    "doctor": (
        "Ultra-photorealistic raw photo, 8k resolution, taken with DSLR, natural lighting. "
        "One person only, same identity. Change only clothing to a white doctor coat with a professional medical look. "
        "Keep the same face, body, hairstyle, and pose. Clean hospital or clinic background. "
        "Lifelike textures, natural skin, unedited photography."
    ),
    "teacher": (
        "Ultra-photorealistic raw photo, 8k resolution, taken with DSLR, natural lighting. "
        "One person only, same identity. Change only clothing to a neat professional teacher outfit. "
        "Keep the same face, body, hairstyle, and pose. Classroom or school background. "
        "Lifelike textures, natural skin, unedited photography."
    ),
    "singer": (
        "Ultra-photorealistic raw photo, 8k resolution, taken with DSLR, natural lighting. "
        "One person only, same identity. Change only clothing to an elegant professional singer stage outfit. "
        "Keep the same face, body, hairstyle, and pose. Concert or stage background. "
        "Lifelike textures, natural skin, unedited photography."
    ),
}

NEGATIVE_PROMPT = (
    "multiple people, extra person, duplicate person, different identity, changed face, "
    "deformed face, bad eyes, bad anatomy, blurry, low quality, text, watermark, logo, "
    "illustration, painting, cartoon, anime, 3d render, CGI, plastic, smooth skin, overly retouched, digital art, artificial looking"
)


def change_clothes_gemini(image_bytes: bytes, profession: str) -> str:
    """
    Use Google Gemini API to change clothing in the image.
    Returns base64-encoded result image.
    """
    profession = profession.lower()
    if profession not in PROMPTS:
        raise ValueError(f"Unknown profession: {profession}. Choose from: {list(PROMPTS.keys())}")

    prompt = PROMPTS[profession]
    full_prompt = (
        f"Edit this person's image: {prompt}\n\n"
        f"Do NOT do: {NEGATIVE_PROMPT}\n\n"
        f"Generate an edited image of the person with the described outfit changes only."
    )

    logger.info(f"[Gemini] Calling {GEMINI_MODEL_NAME} for profession={profession}")

    # Load image with PIL
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    def attempt_gemini(api_key: str):
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name=GEMINI_MODEL_NAME)
        response = model.generate_content([full_prompt, pil_image])

        for part in response.candidates[0].content.parts:
            if part.inline_data and "image" in part.inline_data.mime_type:
                return base64.b64encode(part.inline_data.data).decode("utf-8")
        
        raise RuntimeError("Gemini did not return an image in the response.")

    try:
        result = attempt_gemini(GEMINI_API_KEY)
        logger.info(f"[Gemini] Successfully generated image for profession={profession} using primary key")
        return result
    except Exception as e:
        logger.warning(f"[Gemini] Primary key failed: {e}. Falling back to GEMINI_API_KEY_2")
        if not GEMINI_API_KEY_2:
            raise e
        
        try:
            result = attempt_gemini(GEMINI_API_KEY_2)
            logger.info(f"[Gemini] Successfully generated image for profession={profession} using fallback key")
            return result
        except Exception as fallback_e:
            logger.error(f"[Gemini] Fallback key also failed: {fallback_e}")
            raise fallback_e
