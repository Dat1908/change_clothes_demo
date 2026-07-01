import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root project directory (one level up from backend/)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
GPT_MODEL_NAME: str = os.getenv("GPT_MODEL_NAME", "gpt-image-1")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_KEY_2: str = os.getenv("GEMINI_API_KEY_2", "")
GEMINI_MODEL_NAME: str = os.getenv("GEMINI_MODEL_NAME", "gemini-2.0-flash-exp")

# Validate required keys
def validate_config():
    errors = []
    if not OPENAI_API_KEY:
        errors.append("OPENAI_API_KEY is missing in .env")
    if not GEMINI_API_KEY:
        errors.append("GEMINI_API_KEY is missing in .env")
    return errors
