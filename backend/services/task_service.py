import logging
import uuid
from typing import Dict, Any

from config import OPENAI_API_KEY, GEMINI_API_KEY
from services.openai_service import change_clothes_openai
from services.gemini_service import change_clothes_gemini

logger = logging.getLogger(__name__)

# In-memory task store. Structure:
# { task_id: {"status": "processing" | "completed" | "failed", "result_b64": str, "error": str} }
TASKS: Dict[str, Dict[str, Any]] = {}

def create_task() -> str:
    """Create a new task and return its ID."""
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {"status": "processing", "result_b64": None, "error": None}
    return task_id

def get_task_status(task_id: str) -> Dict[str, Any]:
    """Get the current status of a task."""
    return TASKS.get(task_id)

def run_clothing_transformation(
    task_id: str, image_bytes: bytes, profession: str, ai_provider: str
):
    """
    Background worker function that performs the AI transformation
    and updates the TASKS dictionary with the result.
    """
    try:
        if ai_provider == "openai":
            if not OPENAI_API_KEY:
                raise ValueError("OpenAI API key not configured.")
            result_b64 = change_clothes_openai(image_bytes, profession)
        else:
            if not GEMINI_API_KEY:
                raise ValueError("Gemini API key not configured.")
            result_b64 = change_clothes_gemini(image_bytes, profession)

        # Update task on success
        TASKS[task_id]["status"] = "completed"
        TASKS[task_id]["result_b64"] = result_b64
        logger.info(f"Task {task_id} completed successfully.")

    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        TASKS[task_id]["status"] = "failed"
        TASKS[task_id]["error"] = str(e)
