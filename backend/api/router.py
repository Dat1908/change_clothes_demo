import io
import logging
import socket
from fastapi import APIRouter, File, Form, Request, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
import qrcode

from config import validate_config, OPENAI_API_KEY, GEMINI_API_KEYS, GPT_MODEL_NAME, GEMINI_MODEL_NAME, BACKUP_TIMEOUT_SECONDS
from services.task_service import create_task, get_task_status, run_clothing_transformation
from services.prompts import PROMPTS_NAM
from services.classifier_service import detect_gender

logger = logging.getLogger(__name__)


def _get_lan_ip() -> str:
    """Best-effort local LAN IP (e.g. 192.168.x.x) — a phone on the same
    WiFi can reach this, unlike 127.0.0.1/localhost which only resolves on
    the host machine itself. Doesn't actually send any traffic (UDP
    connect() to a public IP just to see which local interface the OS would
    route through); falls back to 127.0.0.1 if that fails (e.g. no network).
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


_LOCALHOST_NAMES = {"localhost", "127.0.0.1", "0.0.0.0"}
router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    errors = validate_config()
    # At least one AI provider key is enough to serve requests; only degrade
    # when neither provider has any key configured (both unusable).
    has_any_key = bool(OPENAI_API_KEY) or bool(GEMINI_API_KEYS)
    return {
        "status": "ok" if has_any_key else "degraded",
        "config_errors": errors,
        "openai_model": GPT_MODEL_NAME,
        "gemini_model": GEMINI_MODEL_NAME,
        "openai_key_set": bool(OPENAI_API_KEY),
        "gemini_key_set": bool(GEMINI_API_KEYS),
        "gemini_key_count": len(GEMINI_API_KEYS),
        "backup_timeout_seconds": BACKUP_TIMEOUT_SECONDS,
    }

@router.post("/api/detect-gender")
async def api_detect_gender(image: UploadFile = File(...)):
    """
    Detect the gender of the person in the uploaded image.
    Returns: {"gender": "nam" | "nu"}
    """
    try:
        image_bytes = await image.read()
        gender = detect_gender(image_bytes)
        return {"gender": gender}
    except Exception as e:
        logger.error(f"Error in detect_gender API: {e}")
        return {"gender": "nam"} # Default fallback


@router.get("/api/professions")
async def get_professions():
    """Return available profession options."""
    return {
        "professions": [
            {
                "id": "an_ninh_nhan_dan",
                "label": "An Ninh Nhân Dân",
                "label_en": "People's Security",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục an ninh nhân dân Việt Nam",
            },
            {
                "id": "canh_sat_nhan_dan",
                "label": "Cảnh Sát Nhân Dân",
                "label_en": "People's Police",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục cảnh sát nhân dân Việt Nam",
            },
            {
                "id": "canh_sat_giao_thong",
                "label": "Cảnh Sát Giao Thông",
                "label_en": "Traffic Police",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục cảnh sát giao thông",
            },
            {
                "id": "canh_sat_co_dong",
                "label": "Cảnh Sát Cơ Động",
                "label_en": "Mobile Police",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục cảnh sát cơ động",
            },
            {
                "id": "canh_sat_dac_nhiem",
                "label": "Cảnh Sát Đặc Nhiệm",
                "label_en": "Special Task Police",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục cảnh sát đặc nhiệm",
            },
            {
                "id": "canh_sat_pccc",
                "label": "Cảnh Sát PCCC",
                "label_en": "Fire Prevention Police",
                "icon": "👮",
                "color": "#10b981",
                "description": "Đồng phục cảnh sát phòng cháy chữa cháy",
            },
            {
                "id": "doctor",
                "label": "Bác Sĩ",
                "label_en": "Doctor",
                "icon": "🧑‍⚕️🏥",
                "color": "#3b82f6",
                "description": "Áo blouse trắng bác sĩ chuyên nghiệp",
            },
            {
                "id": "teacher",
                "label": "Giáo Viên",
                "label_en": "Teacher",
                "icon": "🧑‍🏫📚",
                "color": "#f59e0b",
                "description": "Trang phục giáo viên lịch sự",
            },
            {
                "id": "singer",
                "label": "Ca Sĩ",
                "label_en": "Singer",
                "icon": "🎤",
                "color": "#ec4899",
                "description": "Trang phục biểu diễn ca sĩ",
            },
            {
                "id": "pilot",
                "label": "Phi Công",
                "label_en": "Pilot",
                "icon": "✈️",
                "color": "#06b6d4",
                "description": "Đồng phục phi công hàng không",
            },
            {
                "id": "chef",
                "label": "Đầu Bếp",
                "label_en": "Chef",
                "icon": "👨‍🍳",
                "color": "#a855f7",
                "description": "Đồng phục đầu bếp chuyên nghiệp",
            },
            {
                "id": "engineer",
                "label": "Kỹ Sư",
                "label_en": "Engineer",
                "icon": "👷",
                "color": "#eab308",
                "description": "Trang phục kỹ sư công trình",
            },
        ]
    }


@router.post("/api/tasks/change-clothes")
async def create_change_clothes_task(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(..., description="Input person image (JPG/PNG)"),
    profession: str = Form(..., description="Profession: an_ninh_nhan_dan | canh_sat_nhan_dan | canh_sat_giao_thong | canh_sat_co_dong | canh_sat_dac_nhiem | canh_sat_pccc | doctor | teacher | singer | pilot | chef | engineer"),
    gender: str = Form(default="nam", description="Gender for sample images: nam | nu"),
    ai_provider: str = Form(default="openai", description="AI provider: openai | gemini"),
):
    """
    Submit a task to transform clothing. Returns a task_id immediately.
    """
    allowed_professions = set(PROMPTS_NAM.keys())
    allowed_providers = {"openai", "gemini"}
    allowed_genders = {"nam", "nu"}

    profession = profession.lower().strip()
    ai_provider = ai_provider.lower().strip()
    gender = gender.lower().strip()

    if profession not in allowed_professions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid profession '{profession}'. Choose from: {sorted(allowed_professions)}",
        )
    if ai_provider not in allowed_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ai_provider '{ai_provider}'. Choose from: {sorted(allowed_providers)}",
        )
    if gender not in allowed_genders:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid gender '{gender}'. Choose from: nam, nu",
        )

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image (JPG, PNG, WEBP, etc.)")

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    max_size_mb = 10
    if len(image_bytes) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image too large. Maximum size: {max_size_mb}MB")

    logger.info(
        f"Creating task for: profession={profession}, gender={gender}, provider={ai_provider}, "
        f"image_size={len(image_bytes)/1024:.1f}KB, filename={image.filename}"
    )

    task_id = create_task()
    
    # Add to background tasks
    background_tasks.add_task(
        run_clothing_transformation,
        task_id=task_id,
        image_bytes=image_bytes,
        profession=profession,
        ai_provider=ai_provider,
        gender=gender,
    )

    return JSONResponse(
        content={
            "success": True,
            "task_id": task_id,
            "message": "Task created successfully.",
        }
    )

@router.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    """
    Get the status of a background task.
    """
    task = get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    return JSONResponse(
        content={
            "success": True,
            "task_id": task_id,
            "status": task["status"],
            "result_image_b64": task["result_b64"],
            "error": task["error"],
        }
    )


def _public_base_url(request: Request) -> str:
    """The base URL a phone scanning a QR code would need to use to reach
    this server. Derived from the incoming request itself (not a
    hardcoded/.env value), so this works unmodified whether the app is
    reached via an ngrok tunnel or a real domain once deployed. The one
    exception: if the request came in on localhost/127.0.0.1 (i.e. local dev
    on this machine's own browser), that hostname is swapped for this
    machine's LAN IP — a phone scanning the code can reach 192.168.x.x over
    WiFi but has no route to 127.0.0.1, which only means "this device" to
    the phone itself.
    """
    base_url = request.base_url
    if base_url.hostname in _LOCALHOST_NAMES:
        base_url = base_url.replace(hostname=_get_lan_ip())
    return str(base_url).rstrip("/")


@router.get("/api/tasks/{task_id}/qrcode")
async def get_task_qrcode(task_id: str, request: Request):
    """
    Return a QR code (PNG) encoding a link to a small preview/download page
    for the completed result image — not the raw image file directly, so
    the phone shows a clear "Tải xuống" button instead of just opening the
    image inline with no obvious way to save it.
    """
    task = get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] != "completed" or not task.get("result_image_path"):
        raise HTTPException(status_code=409, detail="Task result is not ready yet.")

    page_url = f"{_public_base_url(request)}/preview/{task_id}"

    qr_img = qrcode.make(page_url, box_size=10, border=2)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="image/png")


@router.get("/preview/{task_id}", response_class=HTMLResponse)
async def download_page(task_id: str):
    """
    Small mobile-friendly page a phone lands on after scanning the result
    QR code: shows the transformed photo and a clear "Tải xuống" button
    (rather than opening the raw image file inline, which leaves the user
    guessing whether/how to save it).
    """
    task = get_task_status(task_id)
    if not task or task["status"] != "completed" or not task.get("result_image_path"):
        return HTMLResponse(
            "<h1>Không tìm thấy ảnh kết quả.</h1>", status_code=404
        )

    # Relative path, not an absolute URL with scheme+host: the <a download>
    # attribute is silently ignored by browsers for cross-origin links, and
    # behind a reverse proxy (Nginx, Cloudflare, etc. once deployed) the
    # scheme/host FastAPI sees from the request can end up not exactly
    # matching what the browser considers the page's own origin — even
    # though it's actually the same server. A path with no scheme/host is
    # always resolved same-origin, so this can't happen regardless of
    # proxy setup.
    image_url = f"/uploads/{task_id}.png"

    return HTMLResponse(f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tải ảnh kết quả - Ước Mơ Của Tôi</title>
<style>
  body {{
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 24px;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #fffbeb;
  }}
  img {{
    max-width: 100%;
    max-height: 65vh;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25);
  }}
  a.download-btn {{
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 32px;
    border-radius: 14px;
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    color: #fff;
    font-size: 1.15rem;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 4px 16px rgba(59,130,246,0.4);
  }}
</style>
</head>
<body>
  <img src="{image_url}" alt="Ảnh kết quả" />
  <a class="download-btn" href="{image_url}" download="uoc-mo-cua-toi-{task_id}.png">⬇️ Tải xuống</a>
</body>
</html>""")
