import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image

# Load environment variables
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

sys.path.append(os.path.abspath('backend'))
from config import GEMINI_API_KEYS

# Extract classifier model and key
model_name = os.getenv("MODEL_CLASSIFIER", "gemini-2.0-flash")
if not GEMINI_API_KEYS:
    print("Error: No GEMINI API key found in config.")
    sys.exit(1)

_, api_key = GEMINI_API_KEYS[0]  # Just use the first available key
genai.configure(api_key=api_key)

image_path = r"D:\change_clothes_demo\backend\samples\nu\canh_sat_giao_thong\trang_phuc.jpg"
if not os.path.exists(image_path):
    print(f"Error: Image not found at {image_path}")
    sys.exit(1)

print(f"Testing gender classification...")
print(f"Model: {model_name}")
print(f"Image: {image_path}")

try:
    img = Image.open(image_path).convert("RGB")
    
    model_name = os.getenv("MODEL_CLASSIFIER", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name)
    
    prompt = "Người trong ảnh là nam hay nữ? Nếu là nam hãy trả về số 1, nếu là nữ hãy trả về số 0. Trả về duy nhất 1 con số."
    
    # We use low temperature because we want a deterministic, factual answer
    start_time = time.time()
    response = model.generate_content(
        [prompt, img],
        generation_config=genai.types.GenerationConfig(temperature=0.0)
    )
    end_time = time.time()
    
    result = response.text.strip()
    
    # Extract just the number in case it adds punctuation
    if "1" in result:
        output = 1
    elif "0" in result:
        output = 0
    else:
        output = result # fallback
        
    print(f"Output: {output}")
    print(f"Thời gian nhận diện: {end_time - start_time:.2f} giây")
    
except Exception as e:
    print(f"Error during classification: {e}")
