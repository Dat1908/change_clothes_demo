import base64
import io
import logging
import openai
from openai import OpenAI
from config import OPENAI_API_KEY, GPT_MODEL_NAME
from services.prompts import PROMPTS_NAM, PROMPTS_NU, PROMPTS_NAM_FALLBACK, PROMPTS_NU_FALLBACK, NEGATIVE_PROMPT

logger = logging.getLogger(__name__)


def change_clothes_openai(image_bytes: bytes, profession: str, gender: str = "nam") -> str:
    """
    Use OpenAI GPT-Image API to change clothing in the image.
    Returns base64-encoded result image.
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    profession = profession.lower()
    prompts_dict = PROMPTS_NU if gender.lower().strip() == "nu" else PROMPTS_NAM
    fallback_dict = PROMPTS_NU_FALLBACK if gender.lower().strip() == "nu" else PROMPTS_NAM_FALLBACK
    
    if profession not in prompts_dict:
        raise ValueError(f"Unknown profession: {profession}. Choose from: {list(prompts_dict.keys())}")

    prompt = prompts_dict[profession]
    full_prompt = f"{prompt}\n\nAvoid: {NEGATIVE_PROMPT}"

    logger.info(f"[OpenAI] Calling {GPT_MODEL_NAME} for profession={profession}")

    # Prepare image as PNG for the API
    image_file = io.BytesIO(image_bytes)
    image_file.name = "input.png"

    try:
        response = client.images.edit(
            model=GPT_MODEL_NAME,
            image=image_file,
            prompt=full_prompt,
            n=1,
            size="1024x1024",
        )
    except openai.BadRequestError as e:
        if "moderation_blocked" in str(e) and profession in fallback_dict:
            logger.warning(f"[OpenAI] Prompt blocked by safety system for {profession}. Retrying with fallback prompt...")
            fallback_prompt = fallback_dict[profession]
            full_fallback_prompt = f"{fallback_prompt}\n\nAvoid: {NEGATIVE_PROMPT}"
            
            image_file.seek(0)
            response = client.images.edit(
                model=GPT_MODEL_NAME,
                image=image_file,
                prompt=full_fallback_prompt,
                n=1,
                size="1024x1024",
            )
        else:
            raise e

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
