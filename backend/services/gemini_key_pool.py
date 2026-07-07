import logging
import threading
import time
from collections import deque

from config import GEMINI_API_KEYS

logger = logging.getLogger(__name__)

# Response-time history per key (last 5 calls, seconds), shared by every
# Gemini-calling service (clothing transform, gender classification, ...) so
# they all prioritize the same fastest-available key first. Starts as all
# INITIAL_RESPONSE_SECONDS (half of the failure penalty) until a key
# actually has real data — an untested key is treated as middling rather
# than assumed to be the best or the worst. A failed call records the full
# FAILURE_PENALTY_SECONDS instead of the real elapsed time, so a key that
# errors out (quota exhausted, invalid, etc.) — rather than just responding
# slowly — gets pushed to the back of the priority order instead of being
# rewarded for failing fast.
FAILURE_PENALTY_SECONDS = 200.0
INITIAL_RESPONSE_SECONDS = FAILURE_PENALTY_SECONDS / 2
_RESPONSE_HISTORY_SIZE = 5
_response_times = {
    key_name: deque([INITIAL_RESPONSE_SECONDS] * _RESPONSE_HISTORY_SIZE, maxlen=_RESPONSE_HISTORY_SIZE)
    for key_name, _ in GEMINI_API_KEYS
}
# Names of keys currently claimed by an in-flight request, so concurrent
# requests (from any service) spread across different keys instead of
# racing onto the same one.
_keys_in_use = set()
_lock = threading.Lock()


def _record_response_time(key_name: str, elapsed_seconds: float):
    with _lock:
        _response_times[key_name].append(elapsed_seconds)


def _average_response_time(key_name: str) -> float:
    history = _response_times[key_name]
    return sum(history) / len(history)


def _ranked_keys_by_speed():
    """All configured keys ordered fastest-average-first."""
    return sorted(GEMINI_API_KEYS, key=lambda entry: _average_response_time(entry[0]))


def _claim_fastest_available_key():
    """Pick the fastest-average-response key that no other in-flight
    request has already claimed (unless every key is already in use,
    forcing reuse of the fastest one anyway)."""
    with _lock:
        all_in_use = len(_keys_in_use) >= len(GEMINI_API_KEYS)
        for key_name, api_key in _ranked_keys_by_speed():
            if all_in_use or key_name not in _keys_in_use:
                _keys_in_use.add(key_name)
                return key_name, api_key
        # Shouldn't happen, but fall back to the fastest key just in case.
        key_name, api_key = _ranked_keys_by_speed()[0]
        return key_name, api_key


def call_with_key_fallback(call_fn, log_prefix: str):
    """Run call_fn(api_key) against every configured Gemini key, fastest
    average-response-time first, moving on to the next key immediately on
    any failure (wrong/expired key, quota exhausted, rate-limited, etc.)
    instead of giving up after the first error. Raises the last error only
    if every key fails.
    """
    if not GEMINI_API_KEYS:
        raise ValueError("No Gemini API key configured.")

    last_error = None
    for _ in range(len(GEMINI_API_KEYS)):
        key_name, api_key = _claim_fastest_available_key()
        logger.info(f"[{log_prefix}] Calling Gemini using {key_name}")
        started_at = time.monotonic()
        try:
            result = call_fn(api_key)
            elapsed = time.monotonic() - started_at
            _record_response_time(key_name, elapsed)
            logger.info(f"[{log_prefix}] {key_name} succeeded in {elapsed:.1f}s")
            return result
        except Exception as e:
            # Record the failure as the penalty value (not the real elapsed
            # time) so an erroring key is deprioritized rather than
            # rewarded for failing fast.
            _record_response_time(key_name, FAILURE_PENALTY_SECONDS)
            logger.warning(f"[{log_prefix}] {key_name} failed, trying next key: {e}")
            last_error = e
        finally:
            with _lock:
                _keys_in_use.discard(key_name)

    logger.error(f"[{log_prefix}] All {len(GEMINI_API_KEYS)} key(s) failed.")
    if last_error:
        raise last_error
    raise RuntimeError("No Gemini API keys available or all failed without setting an error.")


# Separate, simple round-robin pointer for lightweight callers (e.g. gender
# classification) that just need load spread evenly across keys in turn —
# no speed-based prioritization needed. Advances by one on every call
# regardless of outcome, so the same key is never reused back-to-back while
# others are available.
_next_round_robin_index = 0


def call_with_round_robin_fallback(call_fn, log_prefix: str):
    """Run call_fn(api_key) starting from the next key in turn (advancing
    the shared round-robin pointer every call, independent of outcome), and
    move on to the next key immediately on failure — trying every key at
    most once before giving up.
    """
    if not GEMINI_API_KEYS:
        raise ValueError("No Gemini API key configured.")

    global _next_round_robin_index
    with _lock:
        start_index = _next_round_robin_index % len(GEMINI_API_KEYS)
        _next_round_robin_index = (start_index + 1) % len(GEMINI_API_KEYS)

    last_error = None
    for offset in range(len(GEMINI_API_KEYS)):
        key_index = (start_index + offset) % len(GEMINI_API_KEYS)
        key_name, api_key = GEMINI_API_KEYS[key_index]
        logger.info(f"[{log_prefix}] Calling Gemini using {key_name}")
        try:
            result = call_fn(api_key)
            logger.info(f"[{log_prefix}] {key_name} succeeded")
            return result
        except Exception as e:
            logger.warning(f"[{log_prefix}] {key_name} failed, trying next key: {e}")
            last_error = e

    logger.error(f"[{log_prefix}] All {len(GEMINI_API_KEYS)} key(s) failed.")
    if last_error:
        raise last_error
    raise RuntimeError("No Gemini API keys available or all failed without setting an error.")
