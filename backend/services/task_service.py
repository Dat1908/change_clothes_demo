import logging
import threading
import uuid
from typing import Dict, Any

from config import OPENAI_API_KEY, GEMINI_API_KEYS, BACKUP_TIMEOUT_SECONDS
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


def _run_with_backup_race(call_fn, max_attempts: int, log_prefix: str):
    """Run call_fn() once, and if it hasn't finished within
    BACKUP_TIMEOUT_SECONDS, fire another independent attempt in parallel (up
    to max_attempts total, one per BACKUP_TIMEOUT_SECONDS interval) —
    whichever attempt finishes first wins; the rest are simply abandoned
    (their threads keep running to completion but their result is ignored).
    Entirely internal to the backend — callers just get back the winning
    result or the last error if every attempt that was started failed.
    """
    result_holder = {}
    done_event = threading.Event()
    lock = threading.Lock()
    pending_count = 0
    last_error = None

    def worker(label: str):
        nonlocal pending_count, last_error
        try:
            value = call_fn()
            with lock:
                if "result" not in result_holder:
                    result_holder["result"] = value
                    done_event.set()
            logger.info(f"[{log_prefix}] {label} attempt succeeded.")
        except Exception as e:
            logger.warning(f"[{log_prefix}] {label} attempt failed: {e}")
            with lock:
                last_error = e
                pending_count -= 1
                if pending_count <= 0 and "result" not in result_holder:
                    done_event.set()

    with lock:
        pending_count += 1
    threading.Thread(target=worker, args=("primary",), daemon=True).start()

    for n in range(1, max_attempts):
        fired = done_event.wait(timeout=BACKUP_TIMEOUT_SECONDS)
        if fired:
            break
        with lock:
            if "result" in result_holder:
                break
            pending_count += 1
        logger.warning(
            f"[{log_prefix}] Exceeded {BACKUP_TIMEOUT_SECONDS}s, firing backup attempt #{n + 1} in parallel..."
        )
        threading.Thread(target=worker, args=(f"backup #{n + 1}",), daemon=True).start()

    done_event.wait()

    if "result" in result_holder:
        return result_holder["result"]
    if last_error:
        raise last_error
    raise RuntimeError(f"[{log_prefix}] All attempts failed without setting an error.")


def run_clothing_transformation(
    task_id: str, image_bytes: bytes, profession: str, ai_provider: str, gender: str = "nam"
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
            if not GEMINI_API_KEYS:
                raise ValueError("No Gemini API key configured.")
            # Race up to one attempt per configured Gemini key: if the first
            # attempt hasn't finished within BACKUP_TIMEOUT_SECONDS, fire
            # another independent attempt in parallel and take whichever
            # finishes first.
            result_b64 = _run_with_backup_race(
                lambda: change_clothes_gemini(image_bytes, profession, gender=gender),
                max_attempts=max(1, len(GEMINI_API_KEYS)),
                log_prefix=f"Transform/task={task_id}",
            )

        # Update task on success
        TASKS[task_id]["status"] = "completed"
        TASKS[task_id]["result_b64"] = result_b64
        logger.info(f"Task {task_id} completed successfully.")

    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        TASKS[task_id]["status"] = "failed"
        TASKS[task_id]["error"] = str(e)
