import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root project directory (one level up from backend/)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
GPT_MODEL_NAME: str = os.getenv("GPT_MODEL_NAME", "gpt-image-1")
GEMINI_MODEL_NAME: str = os.getenv("GEMINI_MODEL_NAME", "gemini-2.0-flash-exp")

# How long the backend waits for the change-clothes transform to finish
# before firing an additional parallel attempt internally (whichever
# attempt finishes first wins; the rest are abandoned). Entirely a backend
# concern — the frontend just submits one task and polls it, unaware of how
# many attempts run underneath. Configurable via .env, defaults to
# DEFAULT_BACKUP_TIMEOUT_SECONDS if unset/invalid.
DEFAULT_BACKUP_TIMEOUT_SECONDS = 45.0
try:
    BACKUP_TIMEOUT_SECONDS: float = float(
        os.getenv("BACKUP_TIMEOUT_SECONDS", DEFAULT_BACKUP_TIMEOUT_SECONDS)
    )
except ValueError:
    BACKUP_TIMEOUT_SECONDS = DEFAULT_BACKUP_TIMEOUT_SECONDS

# Ordered pool of configured Gemini keys, paired with their .env variable name
# so logs can identify which key was used without ever printing its value.
# Any number of GEMINI_API_KEY_<n> variables is supported (not just 1-3) —
# priority order follows the numeric suffix (GEMINI_API_KEY_1 first, etc).
# Gemini is tried before OpenAI since it's the preferred/cheaper provider.
_GEMINI_KEY_PATTERN = re.compile(r"^GEMINI_API_KEY_(\d+)$")


def _discover_gemini_keys() -> "list[tuple[str, str]]":
    found = []
    for name, value in os.environ.items():
        match = _GEMINI_KEY_PATTERN.match(name)
        if match and value:
            found.append((int(match.group(1)), name, value))
    found.sort(key=lambda item: item[0])
    return [(name, value) for _, name, value in found]


GEMINI_API_KEYS: list[tuple[str, str]] = _discover_gemini_keys()

# Validate required keys
def validate_config():
    errors = []
    if not OPENAI_API_KEY:
        errors.append("OPENAI_API_KEY is missing in .env")
    if not GEMINI_API_KEYS:
        errors.append("No GEMINI_API_KEY_<n> configured in .env")
    return errors
