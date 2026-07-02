import logging
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from config import validate_config, OPENAI_API_KEY, GEMINI_API_KEY, GPT_MODEL_NAME, GEMINI_MODEL_NAME
from services.task_service import create_task, get_task_status, run_clothing_transformation

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    errors = validate_config()
    # At least one AI provider key is enough to serve requests; only degrade
    # when neither key is configured (both providers unusable).
    has_any_key = bool(OPENAI_API_KEY) or bool(GEMINI_API_KEY)
    return {
        "status": "ok" if has_any_key else "degraded",
        "config_errors": errors,
        "openai_model": GPT_MODEL_NAME,
        "gemini_model": GEMINI_MODEL_NAME,
        "openai_key_set": bool(OPENAI_API_KEY),
        "gemini_key_set": bool(GEMINI_API_KEY),
    }

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
    ai_provider: str = Form(default="openai", description="AI provider: openai | gemini"),
):
    """
    Submit a task to transform clothing. Returns a task_id immediately.
    """
    allowed_professions = {
        "an_ninh_nhan_dan", "canh_sat_nhan_dan", "canh_sat_giao_thong",
        "canh_sat_co_dong", "canh_sat_dac_nhiem", "canh_sat_pccc",
        "doctor", "teacher", "singer", "pilot", "chef", "engineer",
    }
    allowed_providers = {"openai", "gemini"}

    profession = profession.lower().strip()
    ai_provider = ai_provider.lower().strip()

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

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image (JPG, PNG, WEBP, etc.)")

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    max_size_mb = 10
    if len(image_bytes) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image too large. Maximum size: {max_size_mb}MB")

    logger.info(
        f"Creating task for: profession={profession}, provider={ai_provider}, "
        f"image_size={len(image_bytes)/1024:.1f}KB, filename={image.filename}"
    )

    task_id = create_task()
    
    # Add to background tasks
    background_tasks.add_task(
        run_clothing_transformation,
        task_id=task_id,
        image_bytes=image_bytes,
        profession=profession,
        ai_provider=ai_provider
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
