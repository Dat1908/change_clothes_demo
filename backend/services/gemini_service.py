import base64
import io
import logging
import google.generativeai as genai
from PIL import Image
from config import GEMINI_API_KEY, GEMINI_MODEL_NAME

logger = logging.getLogger(__name__)

PROMPTS = {
    "police": (
        "One person only, same identity. Change only clothing to a plain green Vietnamese criminal police uniform. "
        "Keep the same face, body, hairstyle, and pose. Use a professional police-related background."
    ),
    "doctor": (
        "One person only, same identity. Change only clothing to a white doctor coat with a professional medical look. "
        "Keep the same face, body, hairstyle, and pose. Use a clean hospital or clinic background."
    ),
    "teacher": (
        "One person only, same identity. Change only clothing to a neat professional teacher outfit. "
        "Keep the same face, body, hairstyle, and pose. Use a classroom or school background."
    ),
    "singer": (
        "One person only, same identity. Change only clothing to an elegant professional singer stage outfit. "
        "Keep the same face, body, hairstyle, and pose. Use a concert or stage background."
    ),
}

NEGATIVE_PROMPT = (
    "multiple people, extra person, duplicate person, different identity, changed face, "
    "deformed face, bad eyes, bad anatomy, blurry, low quality, text, watermark, logo"
)


def change_clothes_gemini(image_bytes: bytes, profession: str) -> str:
    """
    Use Google Gemini API to change clothing in the image.
    Returns base64-encoded result image.
    """
    genai.configure(api_key=GEMINI_API_KEY)

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

    model = genai.GenerativeModel(model_name=GEMINI_MODEL_NAME)
    response = model.generate_content(
        [full_prompt, pil_image],
        generation_config=genai.GenerationConfig(
            response_mime_type="image/png",
        ),
    )

    # Extract image from response
    for part in response.candidates[0].content.parts:
        if part.inline_data and "image" in part.inline_data.mime_type:
            result_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
            logger.info(f"[Gemini] Successfully generated image for profession={profession}")
            return result_b64

    raise RuntimeError("Gemini did not return an image in the response. Try a different model or prompt.")
