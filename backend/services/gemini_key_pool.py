import logging
import threading
import time
from collections import deque

from config import GEMINI_API_KEYS

logger = logging.getLogger(__name__)

# Worst-case response time recorded for a key that errored out (wrong/expired
# key, quota exhausted, rate-limited, etc.) — used both as the failure
# penalty and to derive the default/untested value below. Shared by the
# generate pool's speed-priority logic only; the classify pool doesn't use
# response times at all.
MAX_RESPONSE_SECONDS = 120.0
DEFAULT_RESPONSE_SECONDS = MAX_RESPONSE_SECONDS / 2
_RESPONSE_HISTORY_SIZE = 5


class _KeyPool:
    """Tracks a "busy/free" flag per Gemini key, independently for one task
    kind (classify or generate) — a key marked busy by a classify call has no
    effect on whether generate can use that same key concurrently, and vice
    versa. Subclassed/parameterized by the two call_with_*_fallback()
    functions below rather than exposed directly.
    """

    def __init__(self):
        self._busy = {key_name: False for key_name, _ in GEMINI_API_KEYS}
        self._lock = threading.Lock()

    def try_claim(self, key_name: str) -> bool:
        """Mark a key busy and return True, or return False if it's already
        busy (caller should skip it and try another key)."""
        with self._lock:
            if self._busy[key_name]:
                return False
            self._busy[key_name] = True
            return True

    def release(self, key_name: str):
        with self._lock:
            self._busy[key_name] = False


# ─── Model classify: simple round-robin ─────────────────────────────────────
# Own busy/free pool, independent from the generate pool below.
_classify_pool = _KeyPool()
_classify_next_index = 0
_classify_index_lock = threading.Lock()


def call_with_round_robin_fallback(call_fn, log_prefix: str):
    """Classify: call_fn(api_key) against configured Gemini keys in turn.

    - Advances a shared round-robin pointer by one on every call
      (independent of outcome), so the next call starts from the next key —
      never restarting from key #1 each time.
    - A key already busy with another in-flight classify call is skipped.
    - On failure (call raised, e.g. quota exhausted), moves on to the next
      key in order, continuing from where the pointer left off rather than
      restarting.
    - Raises the last error only if every key was tried and all failed.
    """
    if not GEMINI_API_KEYS:
        raise ValueError("No Gemini API key configured.")

    global _classify_next_index
    with _classify_index_lock:
        start_index = _classify_next_index % len(GEMINI_API_KEYS)
        _classify_next_index = (start_index + 1) % len(GEMINI_API_KEYS)

    last_error = None
    for offset in range(len(GEMINI_API_KEYS)):
        key_index = (start_index + offset) % len(GEMINI_API_KEYS)
        key_name, api_key = GEMINI_API_KEYS[key_index]

        if not _classify_pool.try_claim(key_name):
            logger.info(f"[{log_prefix}] {key_name} busy, skipping to next key")
            continue

        logger.info(f"[{log_prefix}] Calling Gemini using {key_name}")
        try:
            result = call_fn(api_key)
            logger.info(f"[{log_prefix}] {key_name} succeeded")
            return result
        except Exception as e:
            logger.warning(f"[{log_prefix}] {key_name} failed, trying next key: {e}")
            last_error = e
        finally:
            _classify_pool.release(key_name)

    logger.error(f"[{log_prefix}] All {len(GEMINI_API_KEYS)} key(s) failed or busy.")
    if last_error:
        raise last_error
    raise RuntimeError(f"[{log_prefix}] All Gemini keys busy or failed without setting an error.")


# ─── Model generate: priority by average response speed ────────────────────
# Own busy/free pool, independent from the classify pool above.
_generate_pool = _KeyPool()
_response_times = {
    key_name: deque([DEFAULT_RESPONSE_SECONDS] * _RESPONSE_HISTORY_SIZE, maxlen=_RESPONSE_HISTORY_SIZE)
    for key_name, _ in GEMINI_API_KEYS
}
_response_times_lock = threading.Lock()


def _record_response_time(key_name: str, elapsed_seconds: float):
    with _response_times_lock:
        _response_times[key_name].append(elapsed_seconds)


def _average_response_time(key_name: str) -> float:
    with _response_times_lock:
        history = _response_times[key_name]
        return sum(history) / len(history)


def _ranked_keys_by_speed():
    """All configured keys ordered fastest-average-first."""
    return sorted(GEMINI_API_KEYS, key=lambda entry: _average_response_time(entry[0]))


class AttemptBudget:
    """Shared, thread-safe counter of how many Gemini calls are still
    allowed across an entire logical request — used to cap the TOTAL number
    of attempts (whether triggered by a failure/quota error moving to the
    next key, or by a backup-timeout firing another attempt in parallel) at
    the number of configured keys, never more, regardless of which of those
    two triggers is responsible for any given attempt.
    """

    def __init__(self, max_attempts: int):
        self._remaining = max_attempts
        self._lock = threading.Lock()

    def try_take(self) -> bool:
        with self._lock:
            if self._remaining <= 0:
                return False
            self._remaining -= 1
            return True


def call_with_priority_fallback(call_fn, log_prefix: str, budget: "AttemptBudget | None" = None):
    """Generate: call_fn(api_key) against configured Gemini keys, fastest
    average-response-time first.

    - Each key keeps a rolling history of its last 5 response times
      (defaulting to MAX_RESPONSE_SECONDS/2 until it has real data); keys
      are tried in ascending order of that average, so a consistently fast
      key gets picked first on every call.
    - A key already busy with another in-flight generate call is skipped.
    - On failure (call raised, e.g. quota exhausted), that attempt's
      response time is recorded as MAX_RESPONSE_SECONDS (not the real
      elapsed time) so the key sinks to the back of the priority order, and
      the next-fastest available key is tried.
    - Raises the last error only if every key was tried and all failed.
    - If `budget` is given (shared across concurrent backup-timeout
      attempts for the same logical request), each retry-on-failure here
      also consumes one unit from it, so the combined total of
      failure-retries and backup-timeout attempts never exceeds
      len(GEMINI_API_KEYS) for the request as a whole. Without a budget,
      this function's own retries are still capped at len(GEMINI_API_KEYS)
      as before (single-attempt callers, e.g. classify-adjacent usage).
    """
    if not GEMINI_API_KEYS:
        raise ValueError("No Gemini API key configured.")

    last_error = None
    for _ in range(len(GEMINI_API_KEYS)):
        if budget is not None and not budget.try_take():
            logger.info(f"[{log_prefix}] Attempt budget exhausted, stopping.")
            break

        candidate = next(
            (
                (key_name, api_key)
                for key_name, api_key in _ranked_keys_by_speed()
                if _generate_pool.try_claim(key_name)
            ),
            None,
        )
        if candidate is None:
            logger.info(f"[{log_prefix}] All keys currently busy.")
            break
        key_name, api_key = candidate

        logger.info(f"[{log_prefix}] Calling Gemini using {key_name}")
        started_at = time.monotonic()
        try:
            result = call_fn(api_key)
            elapsed = time.monotonic() - started_at
            _record_response_time(key_name, elapsed)
            logger.info(f"[{log_prefix}] {key_name} succeeded in {elapsed:.1f}s")
            return result
        except Exception as e:
            _record_response_time(key_name, MAX_RESPONSE_SECONDS)
            logger.warning(f"[{log_prefix}] {key_name} failed, trying next key: {e}")
            last_error = e
        finally:
            _generate_pool.release(key_name)

    logger.error(f"[{log_prefix}] All {len(GEMINI_API_KEYS)} key(s) failed, busy, or budget exhausted.")
    if last_error:
        raise last_error
    raise RuntimeError(f"[{log_prefix}] All Gemini keys busy or failed without setting an error.")
