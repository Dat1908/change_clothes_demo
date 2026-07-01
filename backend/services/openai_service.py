import base64
import io
import logging
from openai import OpenAI
from config import OPENAI_API_KEY, GPT_MODEL_NAME

logger = logging.getLogger(__name__)


PROMPTS = {
    "police": (
        "Keep the exact same number of people and identities. Change only clothing to a plain green Vietnamese criminal police uniform for all people in the image. "
        "Keep the same faces, bodies, hairstyles, and poses. Use a professional police-related background."
    ),
    "doctor": (
        "Keep the exact same number of people and identities. Change only clothing to a white doctor coat with a professional medical look for all people in the image. "
        "Keep the same faces, bodies, hairstyles, and poses. Use a clean hospital or clinic background."
    ),
    "teacher": (
        "Keep the exact same number of people and identities. Change only clothing to a neat professional teacher outfit for all people in the image. "
        "Keep the same faces, bodies, hairstyles, and poses. Use a classroom or school background."
    ),
    "singer": (
        "Keep the exact same number of people and identities. Change only clothing to an elegant professional singer stage outfit for all people in the image. "
        "Keep the same faces, bodies, hairstyles, and poses. Use a concert or stage background."
    ),
}

NEGATIVE_PROMPT = (
    "different identity, changed face, "
    "deformed face, bad eyes, bad anatomy, blurry, low quality, text, watermark, logo"
)


def change_clothes_openai(image_bytes: bytes, profession: str) -> str:
    """
    Use OpenAI GPT-Image API to change clothing in the image.
    Returns base64-encoded result image.
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    profession = profession.lower()
    if profession not in PROMPTS:
        raise ValueError(f"Unknown profession: {profession}. Choose from: {list(PROMPTS.keys())}")

    prompt = PROMPTS[profession]
    full_prompt = f"{prompt}\n\nAvoid: {NEGATIVE_PROMPT}"

    logger.info(f"[OpenAI] Calling {GPT_MODEL_NAME} for profession={profession}")

    # Prepare image as PNG for the API
    image_file = io.BytesIO(image_bytes)
    image_file.name = "input.png"

    response = client.images.edit(
        model=GPT_MODEL_NAME,
        image=image_file,
        prompt=full_prompt,
        n=1,
        size="1024x1024",
    )

    # gpt-image-2 returns URL; download and convert to base64
    image_url = response.data[0].url
    if image_url:
        import httpx
        img_response = httpx.get(image_url, timeout=60)
        img_response.raise_for_status()
        result_b64 = base64.b64encode(img_response.content).decode("utf-8")
    else:
        # Fallback: b64_json if available
        result_b64 = response.data[0].b64_json

    logger.info(f"[OpenAI] Successfully generated image for profession={profession}")
    return result_b64
