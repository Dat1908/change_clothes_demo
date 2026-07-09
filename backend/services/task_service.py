import base64
import logging
import threading
import uuid
from typing import Dict, Any

from config import OPENAI_API_KEY, GEMINI_API_KEYS, BACKUP_TIMEOUT_SECONDS, UPLOADS_DIR
from services.openai_service import change_clothes_openai
from services.gemini_service import change_clothes_gemini
from services.gemini_key_pool import AttemptBudget

logger = logging.getLogger(__name__)

# In-memory task store. Structure:
# { task_id: {"status": "processing" | "completed" | "failed", "result_b64": str,
#             "result_image_path": str, "error": str} }
TASKS: Dict[str, Dict[str, Any]] = {}

def create_task() -> str:
    """Create a new task and return its ID."""
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
        "status": "processing",
        "result_b64": None,
        "result_image_path": None,
        "error": None,
    }
    return task_id

def get_task_status(task_id: str) -> Dict[str, Any]:
    """Get the current status of a task."""
    return TASKS.get(task_id)


def _run_with_backup_race(call_fn, budget: AttemptBudget, log_prefix: str):
    """Run call_fn() once, and if it hasn't finished within
    BACKUP_TIMEOUT_SECONDS, fire another independent attempt in parallel —
    whichever attempt finishes first wins; the rest are simply abandoned
    (their threads keep running to completion but their result is ignored).

    call_fn() itself may also retry across multiple keys internally on
    failure (see call_with_priority_fallback). Both triggers — a
    backup-timeout firing a new parallel attempt here, and a failure
    causing an internal retry inside call_fn() — draw from the same shared
    `budget`, so the combined total number of Gemini calls across this
    whole request never exceeds len(GEMINI_API_KEYS), no matter how the
    individual attempts are distributed between the two triggers.
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

    backup_n = 1
    while True:
        fired = done_event.wait(timeout=BACKUP_TIMEOUT_SECONDS)
        if fired:
            break
        with lock:
            if "result" in result_holder:
                break
        if not budget.try_take():
            logger.info(f"[{log_prefix}] Attempt budget exhausted, no more backups will fire.")
            break
        backup_n += 1
        with lock:
            pending_count += 1
        logger.warning(
            f"[{log_prefix}] Exceeded {BACKUP_TIMEOUT_SECONDS}s, firing backup attempt #{backup_n} in parallel..."
        )
        threading.Thread(target=worker, args=(f"backup #{backup_n}",), daemon=True).start()

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
            result_b64 = change_clothes_openai(image_bytes, profession, gender=gender)
        else:
            if not GEMINI_API_KEYS:
                raise ValueError("No Gemini API key configured.")
            # One shared budget for the whole request: every attempt — the
            # primary's first try, any of its internal retries-on-failure,
            # and any backup-timeout attempt fired below — draws from the
            # same pool via call_with_priority_fallback(budget=...), capping
            # the combined total at len(GEMINI_API_KEYS).
            budget = AttemptBudget(max_attempts=len(GEMINI_API_KEYS))
            result_b64 = _run_with_backup_race(
                lambda: change_clothes_gemini(image_bytes, profession, gender=gender, budget=budget),
                budget=budget,
                log_prefix=f"Transform/task={task_id}",
            )

        # Write the result to disk, keyed by task_id, so it can be served
        # over HTTP (e.g. via the result QR code) — not just held as base64
        # in memory, which no external device (like the phone scanning the
        # QR) can reach directly.
        image_path = UPLOADS_DIR / f"{task_id}.png"
        image_path.write_bytes(base64.b64decode(result_b64))

        # Update task on success
        TASKS[task_id]["status"] = "completed"
        TASKS[task_id]["result_b64"] = result_b64
        TASKS[task_id]["result_image_path"] = str(image_path)
        logger.info(f"Task {task_id} completed successfully, image saved to {image_path}")

    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        TASKS[task_id]["status"] = "failed"
        TASKS[task_id]["error"] = str(e)
