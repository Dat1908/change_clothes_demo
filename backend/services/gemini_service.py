import base64
import io
import logging
import google.generativeai as genai
from PIL import Image
from config import GEMINI_MODEL_NAME
from services.gemini_key_pool import call_with_priority_fallback, AttemptBudget
from services.prompts import PROMPTS_NAM, PROMPTS_NU, PROMPTS_NAM_FALLBACK, PROMPTS_NU_FALLBACK, NEGATIVE_PROMPT

logger = logging.getLogger(__name__)


def change_clothes_gemini(
    image_bytes: bytes,
    profession: str,
    gender: str = "nam",
    budget: "AttemptBudget | None" = None,
) -> str:
    """
    Use Google Gemini API to change clothing in the image.
    Returns base64-encoded result image.

    `budget`, if given, is a shared AttemptBudget so that retries here
    (triggered by a key failing/hitting quota) count against the same total
    attempt cap as any concurrent backup-timeout attempts fired by the
    caller — see services/task_service.py.
    """
    profession = profession.lower()
    prompts_dict = PROMPTS_NU if gender.lower().strip() == "nu" else PROMPTS_NAM
    fallback_dict = PROMPTS_NU_FALLBACK if gender.lower().strip() == "nu" else PROMPTS_NAM_FALLBACK
    
    if profession not in prompts_dict:
        raise ValueError(f"Unknown profession: {profession}. Choose from: {list(prompts_dict.keys())}")

    prompt = prompts_dict[profession]
    full_prompt = (
        f"Đây là một bức ảnh hóa trang (cosplay) an toàn, vui nhộn và thân thiện với gia đình.\n"
        f"Hãy chỉnh sửa hình ảnh của người này theo yêu cầu sau:\n{prompt}\n\n"
        f"Tuyệt đối KHÔNG được làm những điều sau:\n{NEGATIVE_PROMPT}\n\n"
        f"Tạo một hình ảnh mới của người này với trang phục được thay đổi và bối cảnh (background) như mô tả, không cần giữ lại bối cảnh của ảnh gốc."
    )
    
    fallback_prompt_text = fallback_dict.get(profession)
    if fallback_prompt_text:
        full_fallback_prompt = (
            f"Đây là một bức ảnh hóa trang (cosplay) an toàn, vui nhộn và thân thiện với gia đình.\n"
            f"Hãy chỉnh sửa hình ảnh của người này theo yêu cầu sau:\n{fallback_prompt_text}\n\n"
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

    # Normalise gender — accept "nam"/"nu" only, default to "nam"
    gender_folder = "nu" if gender.lower().strip() == "nu" else "nam"

    sample_paths = []
    badge_paths = []
    name_tag_paths = []
    logo_co_ao_paths = []
    logo_paths = []

    if profession in POLICE_PROFESSIONS:
        prof_dir = os.path.join(sample_dir, gender_folder, profession)
        if not os.path.isdir(prof_dir):
            fallback_dir = os.path.join(sample_dir, profession)
            if os.path.isdir(fallback_dir):
                logger.warning(f"[Gemini] Gendered folder '{prof_dir}' not found, falling back to '{fallback_dir}'")
                prof_dir = fallback_dir
        
        if os.path.isdir(prof_dir):
            for f in os.listdir(prof_dir):
                f_lower = f.lower()
                if not f_lower.endswith(('.jpg', '.png', '.jpeg', '.webp')):
                    continue
                full_p = os.path.join(prof_dir, f)
                if f_lower.startswith("trang_phuc"):
                    sample_paths.append(full_p)
                elif f_lower.startswith("quan_ham"):
                    badge_paths.append(full_p)
                elif f_lower.startswith("bien_ten"):
                    name_tag_paths.append(full_p)
                elif f_lower.startswith("logo_co_ao"):
                    logo_co_ao_paths.append(full_p)
                elif f_lower.startswith("logo"):
                    logo_paths.append(full_p)
            
            sample_paths.sort()
            badge_paths.sort()
            name_tag_paths.sort()
            logo_co_ao_paths.sort()
            logo_paths.sort()
    else:
        # Fallback for non-police professions
        sample_path_jpg = os.path.join(sample_dir, f"{profession}.jpg")
        sample_path_png = os.path.join(sample_dir, f"{profession}.png")
        if os.path.exists(sample_path_jpg):
            sample_paths.append(sample_path_jpg)
        elif os.path.exists(sample_path_png):
            sample_paths.append(sample_path_png)
    
    images_to_pass = []
    prompt_additions = []
    
    img_idx = 1
    for p in sample_paths:
        images_to_pass.append(Image.open(p).convert("RGB"))
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO TRANG PHỤC CHÍNH. Bắt buộc sao chép y hệt màu sắc, kiểu dáng, thiết kế từ bức ảnh này.")
        img_idx += 1
        
    for p in badge_paths:
        images_to_pass.append(Image.open(p).convert("RGB"))
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO QUÂN HÀM. Bắt buộc gắn chính xác thiết kế quân hàm này lên vai/cổ áo của trang phục. Bỏ qua các mô tả bằng chữ nếu có sự khác biệt, ảnh này là NGUỒN CHÍNH XÁC TUYỆT ĐỐI.")
        img_idx += 1
        
    for p in name_tag_paths:
        images_to_pass.append(Image.open(p).convert("RGB"))
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO BIỂN TÊN. Bắt buộc gắn chính xác thiết kế biển tên này lên ngực phải của trang phục. Giữ nguyên chính xác từng chữ cái và số trên biển tên.")
        img_idx += 1
        
    for p in logo_paths:
        images_to_pass.append(Image.open(p).convert("RGB"))
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO LOGO/HUY HIỆU. Bắt buộc gắn chính xác logo này lên CÁNH TAY TRÁI của trang phục. Đây là nguồn tuyệt đối cho thiết kế logo cánh tay.")
        img_idx += 1
        
    for p in logo_co_ao_paths:
        images_to_pass.append(Image.open(p).convert("RGB"))
        prompt_additions.append(f"{img_idx}. Hình ảnh #{img_idx} là ẢNH THAM KHẢO LOGO CỔ ÁO. Bắt buộc gắn chính xác thiết kế logo này lên CẢ 2 BÊN CỔ ÁO của trang phục. Đây là nguồn tuyệt đối cho thiết kế logo ở cổ áo.")
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
        
    fallback_payload = None
    if fallback_prompt_text:
        fallback_prompt_with_res = full_fallback_prompt + "\n\nQUAN TRỌNG: Hình ảnh tạo ra BẮT BUỘC phải ở độ phân giải 4K với chất lượng cực kỳ cao."
        fallback_payload = [fallback_prompt_with_res, pil_image]

    def attempt_gemini(api_key: str):
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name=GEMINI_MODEL_NAME)
        # Using low temperature for strict adherence
        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        
        def call_model(payload):
            return model.generate_content(
                payload,
                generation_config=genai.types.GenerationConfig(temperature=0.0, top_k=1, top_p=0.1),
                safety_settings={
                    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                }
            )

        try:
            response = call_model(content_payload)
            if hasattr(response, 'prompt_feedback') and response.prompt_feedback.block_reason:
                raise ValueError(f"Prompt blocked by Gemini safety: {response.prompt_feedback.block_reason}")
            if hasattr(response, 'candidates') and response.candidates and hasattr(response.candidates[0], 'finish_reason'):
                fr = response.candidates[0].finish_reason
                fr_name = getattr(fr, 'name', str(fr))
                if fr_name in ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', '11']:
                    raise ValueError(f"Candidate blocked by Gemini safety (finish_reason: {fr_name})")
        except Exception as e:
            err_msg = str(e).lower()
            if fallback_payload and ("block" in err_msg or "safety" in err_msg or type(e).__name__ in ["StopCandidateException", "InvalidArgument"]):
                logger.warning(f"[Gemini] Prompt blocked by safety system for {profession} ({e}). Retrying with fallback prompt...")
                response = call_model(fallback_payload)
            else:
                raise e

        if not hasattr(response, 'candidates') or not response.candidates:
            raise RuntimeError(f"Gemini did not return any candidates. Response: {response}")

        for part in response.candidates[0].content.parts:
            if part.inline_data and "image" in part.inline_data.mime_type:
                return base64.b64encode(part.inline_data.data).decode("utf-8")

        raise RuntimeError("Gemini did not return an image in the response.")

    return call_with_priority_fallback(
        attempt_gemini, log_prefix=f"Gemini/profession={profession}", budget=budget
    )
