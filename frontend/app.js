/* ══════════════════════════════════════════════════════════════════════
   AI OUTFIT STUDIO — Frontend App Logic
   ══════════════════════════════════════════════════════════════════════ */

const API_BASE = "http://localhost:8000";

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  imageFile: null,
  imageDataUrl: null,
  selectedProfession: null,
  selectedProvider: "openai",
  isLoading: false,
  resultB64: null,
};

// ── DOM Refs ──────────────────────────────────────────────────────────────
const dropZone         = document.getElementById("dropZone");
const dropZoneInner    = document.getElementById("dropZoneInner");
const previewImg       = document.getElementById("previewImg");
const previewOverlay   = document.getElementById("previewOverlay");
const fileInput        = document.getElementById("fileInput");
const changeImgBtn     = document.getElementById("changeImgBtn");

const professionBtns   = document.querySelectorAll(".profession-btn");
const providerBtns     = document.querySelectorAll(".provider-btn");

const transformBtn     = document.getElementById("transformBtn");
const transformContent = document.getElementById("transformBtnContent");

const progressSection  = document.getElementById("progressSection");
const progressBar      = document.getElementById("progressBar");
const progressText     = document.getElementById("progressText");

const errorBox         = document.getElementById("errorBox");
const errorMessage     = document.getElementById("errorMessage");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const resultImgWrap    = document.getElementById("resultImgWrap");
const resultImg        = document.getElementById("resultImg");
const resultBadge      = document.getElementById("resultBadge");
const resultActions    = document.getElementById("resultActions");
const resultSubtitle   = document.getElementById("resultSubtitle");
const downloadBtn      = document.getElementById("downloadBtn");
const shareBtn         = document.getElementById("shareBtn");

const compareSection   = document.getElementById("compareSection");
const compareOriginal  = document.getElementById("compareOriginal");
const compareResult    = document.getElementById("compareResult");
const afterLabel       = document.getElementById("afterLabel");

const statusDot        = document.getElementById("statusDot");
const statusText       = document.getElementById("statusText");

// ── Profession Metadata ───────────────────────────────────────────────────
const PROFESSIONS = {
  police:  { label: "Cảnh Sát",  icon: "🚔", color: "#10b981", badgeBg: "rgba(16,185,129,0.35)",  badgeBorder: "#10b981" },
  doctor:  { label: "Bác Sĩ",    icon: "🏥", color: "#3b82f6", badgeBg: "rgba(59,130,246,0.35)",  badgeBorder: "#3b82f6" },
  teacher: { label: "Giáo Viên", icon: "📚", color: "#f59e0b", badgeBg: "rgba(245,158,11,0.35)", badgeBorder: "#f59e0b" },
  singer:  { label: "Ca Sĩ",     icon: "🎤", color: "#ec4899", badgeBg: "rgba(236,72,153,0.35)",  badgeBorder: "#ec4899" },
};

// ── Health Check ──────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.status === "ok" || data.status === "degraded") {
      statusDot.className  = "status-dot online";
      statusText.textContent = data.status === "ok" ? "API sẵn sàng" : "API khởi động (thiếu key)";
    } else {
      throw new Error("Bad status");
    }
  } catch {
    statusDot.className   = "status-dot offline";
    statusText.textContent = "API chưa kết nối";
  }
}
checkHealth();
setInterval(checkHealth, 30_000);

// ── Image Upload ──────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showError("Vui lòng chọn file ảnh (JPG, PNG, WEBP...)");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError("Ảnh quá lớn! Tối đa 10MB.");
    return;
  }

  state.imageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.imageDataUrl = e.target.result;
    previewImg.src = state.imageDataUrl;
    previewImg.classList.remove("hidden");
    dropZoneInner.classList.add("hidden");
    previewOverlay.classList.remove("hidden");
    hideError();
    updateTransformBtn();
  };
  reader.readAsDataURL(file);
}

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

// Click to upload
dropZone.addEventListener("click", (e) => {
  if (e.target === changeImgBtn || changeImgBtn.contains(e.target)) return;
  fileInput.click();
});
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
changeImgBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

// ── Profession Selection ──────────────────────────────────────────────────
professionBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.selectedProfession = btn.dataset.profession;

    professionBtns.forEach((b) => {
      b.classList.remove("selected");
      b.setAttribute("aria-checked", "false");
    });
    btn.classList.add("selected");
    btn.setAttribute("aria-checked", "true");

    hideError();
    updateTransformBtn();
  });
});

// ── Provider Selection ────────────────────────────────────────────────────
providerBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.selectedProvider = btn.dataset.provider;
    providerBtns.forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
  });
});

// ── Transform Button State ────────────────────────────────────────────────
function updateTransformBtn() {
  const canTransform = state.imageFile && state.selectedProfession && !state.isLoading;
  transformBtn.disabled = !canTransform;
}

// ── Progress Simulation ───────────────────────────────────────────────────
const PROGRESS_STEPS = [
  { pct: 10, text: "Đang tải ảnh lên server..." },
  { pct: 25, text: "Đang phân tích ảnh..." },
  { pct: 45, text: "Đang gọi AI model..." },
  { pct: 65, text: "AI đang biến đổi trang phục..." },
  { pct: 82, text: "Đang hoàn thiện ảnh..." },
  { pct: 95, text: "Gần xong rồi..." },
];
let progressTimer = null;
let stepIdx = 0;

function startProgress() {
  stepIdx = 0;
  progressSection.classList.remove("hidden");
  progressBar.style.width = "0%";

  function tick() {
    if (stepIdx >= PROGRESS_STEPS.length) return;
    const step = PROGRESS_STEPS[stepIdx++];
    progressBar.style.width = step.pct + "%";
    progressText.textContent = step.text;
    progressTimer = setTimeout(tick, 1200 + Math.random() * 800);
  }
  tick();
}
function finishProgress() {
  clearTimeout(progressTimer);
  progressBar.style.width = "100%";
  progressText.textContent = "Hoàn thành! ✓";
  setTimeout(() => progressSection.classList.add("hidden"), 1200);
}
function resetProgress() {
  clearTimeout(progressTimer);
  progressSection.classList.add("hidden");
  progressBar.style.width = "0%";
}

// ── Error Helpers ─────────────────────────────────────────────────────────
function showError(msg) {
  errorMessage.textContent = msg;
  errorBox.classList.remove("hidden");
}
function hideError() {
  errorBox.classList.add("hidden");
}

// ── Main Transform Call ───────────────────────────────────────────────────
transformBtn.addEventListener("click", async () => {
  if (!state.imageFile || !state.selectedProfession || state.isLoading) return;

  state.isLoading = true;
  hideError();

  // Button loading state
  transformBtn.disabled = true;
  transformContent.innerHTML = `<span class="loading-spinner"></span><span>Đang xử lý...</span>`;

  // Reset result area
  resultImgWrap.classList.add("hidden");
  resultActions.classList.add("hidden");
  compareSection.classList.add("hidden");
  resultPlaceholder.classList.remove("hidden");

  startProgress();

  try {
    const formData = new FormData();
    formData.append("image", state.imageFile);
    formData.append("profession", state.selectedProfession);
    formData.append("ai_provider", state.selectedProvider);

    // 1. Submit task
    const res = await fetch(`${API_BASE}/api/tasks/change-clothes`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || `Lỗi server: ${res.status}`);
    }

    const taskId = data.task_id;
    
    // 2. Poll for status
    let taskResult = null;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
      
      const pollRes = await fetch(`${API_BASE}/api/tasks/${taskId}`);
      const pollData = await pollRes.json();
      
      if (!pollRes.ok) {
        throw new Error(pollData.detail || `Lỗi server: ${pollRes.status}`);
      }
      
      if (pollData.status === "completed") {
        taskResult = pollData;
        break;
      } else if (pollData.status === "failed") {
        throw new Error(pollData.error || "Quá trình xử lý thất bại.");
      }
      // if processing, continue loop
    }

    state.resultB64 = taskResult.result_image_b64;
    const profInfo  = PROFESSIONS[state.selectedProfession];

    // Update result panel
    const resultSrc = `data:image/png;base64,${state.resultB64}`;
    resultImg.src   = resultSrc;

    resultBadge.textContent = `${profInfo.icon} ${profInfo.label}`;
    resultBadge.style.background   = profInfo.badgeBg;
    resultBadge.style.border       = `1px solid ${profInfo.badgeBorder}`;

    resultSubtitle.textContent = `${profInfo.icon} ${profInfo.label} · ${state.selectedProvider.toUpperCase()}`;

    resultPlaceholder.classList.add("hidden");
    resultImgWrap.classList.remove("hidden");
    resultActions.classList.remove("hidden");

    // Compare section
    compareOriginal.src = state.imageDataUrl;
    compareResult.src   = resultSrc;
    afterLabel.textContent = `${profInfo.icon} ${profInfo.label.toUpperCase()}`;
    compareSection.classList.remove("hidden");
    compareSection.scrollIntoView({ behavior: "smooth", block: "nearest" });

    finishProgress();

  } catch (err) {
    resetProgress();
    console.error("Transform error:", err);
    showError(err.message || "Đã có lỗi xảy ra. Vui lòng thử lại.");
  } finally {
    state.isLoading = false;
    transformContent.innerHTML = `<span class="btn-icon">✨</span><span>Biến Đổi Ngay</span>`;
    updateTransformBtn();
  }
});

// ── Download Result ───────────────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  if (!state.resultB64) return;
  const profInfo = PROFESSIONS[state.selectedProfession] || { label: "result" };
  const a = document.createElement("a");
  a.href     = `data:image/png;base64,${state.resultB64}`;
  a.download = `outfit_${state.selectedProfession}_${Date.now()}.png`;
  a.click();
});

// ── Copy / Share Result ───────────────────────────────────────────────────
shareBtn.addEventListener("click", async () => {
  if (!state.resultB64) return;
  try {
    const blob = await (await fetch(`data:image/png;base64,${state.resultB64}`)).blob();
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    shareBtn.innerHTML = `<span>✅</span> Đã sao chép!`;
    setTimeout(() => {
      shareBtn.innerHTML = `<span>📋</span> Sao Chép`;
    }, 2000);
  } catch {
    // Fallback: open in new tab
    const win = window.open();
    win.document.write(`<img src="data:image/png;base64,${state.resultB64}" style="max-width:100%" />`);
  }
});
