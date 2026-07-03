import base64
import io
import logging
import threading
import google.generativeai as genai
from PIL import Image
from config import GEMINI_API_KEYS, GEMINI_MODEL_NAME
from services.prompts import PROMPTS, NEGATIVE_PROMPT

logger = logging.getLogger(__name__)

# Index into GEMINI_API_KEYS of the key that last succeeded — future requests
# start there first instead of always retrying from key #1, so a key that's
# known to be rate-limited isn't hit again on every single request.
_last_good_key_index = 0
# Names of keys currently claimed by an in-flight request, so concurrent
# requests spread across different keys instead of racing onto the same one.
_keys_in_use = set()
_key_index_lock = threading.Lock()


def change_clothes_gemini(image_bytes: bytes, profession: str) -> str:
    """
    Use Google Gemini API to change clothing in the image.
    Returns base64-encoded result image.
    """
    profession = profession.lower()
    if profession not in PROMPTS:
        raise ValueError(f"Unknown profession: {profession}. Choose from: {list(PROMPTS.keys())}")

    prompt = PROMPTS[profession]
    full_prompt = (
        f"Hãy chỉnh sửa hình ảnh của người này theo yêu cầu sau:\n{prompt}\n\n"
        f"Tuyệt đối KHÔNG được làm những điều sau:\n{NEGATIVE_PROMPT}\n\n"
        f"Tạo một hình ảnh mới của người này với trang phục được thay đổi và bối cảnh (background) như mô tả, không cần giữ lại bối cảnh của ảnh gốc."
    )

    logger.info(f"[Gemini] Calling {GEMINI_MODEL_NAME} for profession={profession}")

    import os

    # Load image with PIL
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    sample_dir = os.path.join(os.path.dirname(__file__), '..', 'samples')
    
    POLICE_PROFESSIONS = [
        "an_ninh_nhan_dan", "canh_sat_nhan_dan", "canh_sat_giao_thong", 
        "canh_sat_co_dong", "canh_sat_dac_nhiem", "canh_sat_pccc"
    ]
    
    sample_path = None
    badge_path = None
    name_tag_path = None
    logo_path = None

    if profession in POLICE_PROFESSIONS:
        prof_dir = os.path.join(sample_dir, profession)
        
        # Check for main clothing reference
        tp_jpg = os.path.join(prof_dir, "trang_phuc.jpg")
        tp_png = os.path.join(prof_dir, "trang_phuc.png")
        sample_path = tp_jpg if os.path.exists(tp_jpg) else (tp_png if os.path.exists(tp_png) else None)
        
        # Check for badge reference
        qh_jpg = os.path.join(prof_dir, "quan_ham.jpg")
        qh_png = os.path.join(prof_dir, "quan_ham.png")
        badge_path = qh_jpg if os.path.exists(qh_jpg) else (qh_png if os.path.exists(qh_png) else None)
        
        # Check for name tag reference
        bt_jpg = os.path.join(prof_dir, "bien_ten.jpg")
        bt_png = os.path.join(prof_dir, "bien_ten.png")
        name_tag_path = bt_jpg if os.path.exists(bt_jpg) else (bt_png if os.path.exists(bt_png) else None)
        
        # Check for logo reference (used for canh_sat_co_dong)
        lg_jpg = os.path.join(prof_dir, "logo.jpg")
        lg_png = os.path.join(prof_dir, "logo.png")
        logo_path = lg_jpg if os.path.exists(lg_jpg) else (lg_png if os.path.exists(lg_png) else None)
    else:
        # Fallback for non-police professions
        sample_path_jpg = os.path.join(sample_dir, f"{profession}.jpg")
        sample_path_png = os.path.join(sample_dir, f"{profession}.png")
        sample_path = sample_path_jpg if os.path.exists(sample_path_jpg) else (sample_path_png if os.path.exists(sample_path_png) else None)
    
    images_to_pass = []
    prompt_additions = []
    
    img_idx = 1
    if sample_path:
        sample_image = Image.open(sample_path).convert("RGB")
        images_to_pass.append(sample_image)
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO TRANG PHỤC CHÍNH. Bắt buộc sao chép y hệt màu sắc, kiểu dáng, thiết kế từ bức ảnh này.")
        img_idx += 1
        
    if badge_path:
        badge_image = Image.open(badge_path).convert("RGB")
        images_to_pass.append(badge_image)
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO QUÂN HÀM. Bắt buộc gắn chính xác thiết kế quân hàm này lên vai/cổ áo của trang phục. Bỏ qua các mô tả bằng chữ nếu có sự khác biệt, ảnh này là NGUỒN CHÍNH XÁC TUYỆT ĐỐI.")
        img_idx += 1
        
    if name_tag_path:
        name_tag_image = Image.open(name_tag_path).convert("RGB")
        images_to_pass.append(name_tag_image)
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO BIỂN TÊN. Bắt buộc gắn chính xác thiết kế biển tên này lên ngực phải của trang phục. Giữ nguyên chính xác từng chữ cái và số trên biển tên.")
        img_idx += 1
        
    if logo_path:
        logo_image = Image.open(logo_path).convert("RGB")
        images_to_pass.append(logo_image)
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO LOGO/HUY HIỆU. Bắt buộc gắn chính xác logo này lên CÁNH TAY TRÁI của trang phục. Đây là nguồn tuyệt đối cho thiết kế logo cánh tay.")
        img_idx += 1
        
    target_idx = img_idx
    images_to_pass.append(pil_image)
    
    if len(images_to_pass) > 1:
        logger.info(f"[Gemini] Found {len(images_to_pass)-1} reference image(s) for {profession}, appending to prompt.")
        prompt_with_ref = full_prompt + f"\n\n[LỆNH ĐẶC BIỆT]: Tôi đã đính kèm tổng cộng {len(images_to_pass)} hình ảnh.\n"
        prompt_with_ref += "\n".join(prompt_additions)
        prompt_with_ref += f"\n{target_idx}. Hình ảnh #{target_idx} (ảnh cuối cùng) chính là ẢNH NGƯỜI CẦN CHỈNH SỬA (ẢNH GỐC CỦA NGƯỜI DÙNG).\n"
        prompt_with_ref += f"BẠN BẮT BUỘC PHẢI LẤY KHUÔN MẶT, BIỂU CẢM, CƠ THỂ VÀ TƯ THẾ TỪ HÌNH ẢNH #{target_idx} NÀY ĐỂ ĐƯA VÀO KẾT QUẢ CUỐI CÙNG, TUYỆT ĐỐI KHÔNG ĐƯỢC LẤY MẶT CỦA CÁC ẢNH THAM KHẢO BÊN TRÊN!!!\n"
        prompt_with_ref += "QUAN TRỌNG: Hình ảnh tạo ra BẮT BUỘC phải ở độ phân giải 4K với chất lượng cực kỳ cao."
        
        content_payload = [prompt_with_ref] + images_to_pass
    else:
        prompt_with_res = full_prompt + "\n\nQUAN TRỌNG: Hình ảnh tạo ra BẮT BUỘC phải ở độ phân giải 4K với chất lượng cực kỳ cao."
        content_payload = [prompt_with_res, pil_image]

    def attempt_gemini(api_key: str):
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name=GEMINI_MODEL_NAME)
        # Using low temperature for strict adherence
        response = model.generate_content(
            content_payload,
            generation_config=genai.types.GenerationConfig(temperature=0.2, top_k=1, top_p=0.1)
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data and "image" in part.inline_data.mime_type:
                return base64.b64encode(part.inline_data.data).decode("utf-8")

        raise RuntimeError("Gemini did not return an image in the response.")

    if not GEMINI_API_KEYS:
        raise ValueError("No Gemini API key configured.")

    global _last_good_key_index

    def claim_next_key(offset: int):
        """Pick the next candidate key, preferring the last-known-good one
        and skipping any key another concurrent request already has claimed
        (unless every key is already in use, in which case reuse is forced)."""
        with _key_index_lock:
            start_index = _last_good_key_index if _last_good_key_index < len(GEMINI_API_KEYS) else 0
            all_in_use = len(_keys_in_use) >= len(GEMINI_API_KEYS)
            for i in range(len(GEMINI_API_KEYS)):
                key_index = (start_index + offset + i) % len(GEMINI_API_KEYS)
                key_name, api_key = GEMINI_API_KEYS[key_index]
                if all_in_use or key_name not in _keys_in_use:
                    _keys_in_use.add(key_name)
                    return key_index, key_name, api_key
            # Shouldn't happen, but fall back to the first key just in case.
            key_index = start_index
            key_name, api_key = GEMINI_API_KEYS[key_index]
            return key_index, key_name, api_key

    # Try keys starting from the last one known to work, wrapping around the
    # pool, so a key that's currently rate-limited isn't retried first on
    # every subsequent request — the next free key gets priority instead.
    # Keys already claimed by another in-flight (concurrent) request are
    # skipped so parallel requests spread across different keys.
    last_error = None
    for offset in range(len(GEMINI_API_KEYS)):
        key_index, key_name, api_key = claim_next_key(offset)
        logger.info(f"[Gemini] Calling Gemini for profession={profession} using {key_name}")
        try:
            result = attempt_gemini(api_key)
            with _key_index_lock:
                _last_good_key_index = key_index
            logger.info(f"[Gemini] Successfully generated image for profession={profession} using {key_name}")
            return result
        except Exception as e:
            logger.warning(f"[Gemini] {key_name} failed: {e}")
            last_error = e
        finally:
            with _key_index_lock:
                _keys_in_use.discard(key_name)

    logger.error(f"[Gemini] All {len(GEMINI_API_KEYS)} key(s) failed.")
    raise last_error
