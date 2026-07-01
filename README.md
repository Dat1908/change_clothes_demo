# AI Outfit Studio

Hệ thống demo web thay đổi trang phục bằng AI, hỗ trợ **OpenAI GPT-Image** và **Google Gemini**.

## Cấu trúc dự án

```
change_clothes_demo/
├── .env                        # API keys (đã có sẵn)
├── start.sh                    # Script khởi động nhanh
├── backend/
│   ├── main.py                 # FastAPI server (port 8000)
│   ├── config.py               # Load biến môi trường từ .env
│   ├── requirements.txt
│   └── services/
│       ├── openai_service.py   # Xử lý với OpenAI GPT-Image
│       └── gemini_service.py   # Xử lý với Google Gemini
└── frontend/
    ├── index.html              # Giao diện web (dark premium)
    ├── style.css               # CSS animations & glassmorphism
    └── app.js                  # Logic kết nối API
```

## Cài đặt & Chạy

### Cách 1: Script tự động

```bash
cd change_clothes_demo
chmod +x start.sh
./start.sh
```

### Cách 2: Thủ công

```bash
cd backend
conda create -n ai_lab_demo python=3.10
source activate ai_lab_demo
pip install -r requirements.txt
python main.py
```

Sau khi server chạy:
- **Frontend UI**: http://localhost:8000/app
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Public Ngrok**: 
```bash
ngrok http 8000 --pooling-enabled
```
## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/health` | Kiểm tra trạng thái server & API keys |
| GET | `/api/professions` | Danh sách nghề nghiệp |
| POST | `/api/change-clothes` | Biến đổi trang phục |

### POST `/api/change-clothes`

**Form Data:**
- `image`: file ảnh (JPG/PNG/WEBP, max 10MB)
- `profession`: `police` | `doctor` | `teacher` | `singer`
- `ai_provider`: `openai` (default) | `gemini`

**Response:**
```json
{
  "success": true,
  "profession": "police",
  "ai_provider": "openai",
  "result_image_b64": "<base64 PNG>",
  "message": "Successfully transformed to police outfit using OPENAI."
}
```

## Prompts sử dụng

| Nghề | Prompt |
|------|--------|
| 🚔 Police | Đồng phục cảnh sát nhân dân Việt Nam màu xanh lá |
| 🏥 Doctor | Áo blouse trắng bác sĩ, nền bệnh viện |
| 📚 Teacher | Trang phục giáo viên lịch sự, nền lớp học |
| 🎤 Singer | Trang phục biểu diễn ca sĩ, nền sân khấu |

**Negative prompt** áp dụng chung: tránh nhiều người, khuôn mặt bị thay đổi, chất lượng thấp.

## Biến môi trường (.env)

```env
OPENAI_API_KEY=...
GPT_MODEL_NAME=gpt-image-2-2026-04-21
GEMINI_API_KEY=...
GEMINI_MODEL_NAME=gemini-3-pro-image
```
