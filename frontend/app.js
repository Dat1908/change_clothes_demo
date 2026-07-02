/* ══════════════════════════════════════════════════════════════════════
   AI OUTFIT STUDIO — Frontend App Logic
   ══════════════════════════════════════════════════════════════════════ */

const API_BASE = "";

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
const dropZone = document.getElementById("dropZone");
const previewImg = document.getElementById("previewImg");
const fileInput = document.getElementById("fileInput");
const capturedPlaceholder = document.getElementById("capturedPlaceholder");
const capturedSubtitle = document.getElementById("capturedSubtitle");

const sourceTabs = document.querySelectorAll(".source-tab");
const sourceBodies = {
	upload: document.getElementById("sourceBody-upload"),
	camera: document.getElementById("sourceBody-camera"),
	rtsp: document.getElementById("sourceBody-rtsp"),
};

const professionBtns = document.querySelectorAll(".profession-btn");
const providerBtns = document.querySelectorAll(".provider-btn");

const transformBtn = document.getElementById("transformBtn");
const transformContent = document.getElementById("transformBtnContent");

const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const resultImgWrap = document.getElementById("resultImgWrap");
const resultImg = document.getElementById("resultImg");
const resultBadge = document.getElementById("resultBadge");
const resultActions = document.getElementById("resultActions");
const resultSubtitle = document.getElementById("resultSubtitle");
const downloadBtn = document.getElementById("downloadBtn");
const shareBtn = document.getElementById("shareBtn");

const compareSection = document.getElementById("compareSection");
const compareOriginal = document.getElementById("compareOriginal");
const compareResult = document.getElementById("compareResult");
const afterLabel = document.getElementById("afterLabel");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

// ── Profession Metadata ───────────────────────────────────────────────────
const PROFESSIONS = {
	police: {
		label: "Cảnh Sát",
		icon: "👮🚔",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	doctor: {
		label: "Bác Sĩ",
		icon: "🧑‍⚕️🏥",
		color: "#3b82f6",
		badgeBg: "rgba(59,130,246,0.35)",
		badgeBorder: "#3b82f6",
	},
	teacher: {
		label: "Giáo Viên",
		icon: "🧑‍🏫📚",
		color: "#f59e0b",
		badgeBg: "rgba(245,158,11,0.35)",
		badgeBorder: "#f59e0b",
	},
	singer: {
		label: "Ca Sĩ",
		icon: "🧑‍🎤🎤",
		color: "#ec4899",
		badgeBg: "rgba(236,72,153,0.35)",
		badgeBorder: "#ec4899",
	},
	firefighter: {
		label: "Lính Cứu Hỏa",
		icon: "🧑‍🚒🚒",
		color: "#ef4444",
		badgeBg: "rgba(239,68,68,0.35)",
		badgeBorder: "#ef4444",
	},
	pilot: {
		label: "Phi Công",
		icon: "🧑‍✈️✈️",
		color: "#06b6d4",
		badgeBg: "rgba(6,182,212,0.35)",
		badgeBorder: "#06b6d4",
	},
	chef: {
		label: "Đầu Bếp",
		icon: "👨‍🍳🔪",
		color: "#a855f7",
		badgeBg: "rgba(168,85,247,0.35)",
		badgeBorder: "#a855f7",
	},
	engineer: {
		label: "Kỹ Sư",
		icon: "👷🔧",
		color: "#eab308",
		badgeBg: "rgba(234,179,8,0.35)",
		badgeBorder: "#eab308",
	},
};

// ── Health Check ──────────────────────────────────────────────────────────
async function checkHealth() {
	try {
		const res = await fetch(`${API_BASE}/health`, {
			headers: { "ngrok-skip-browser-warning": "true" },
			signal: AbortSignal.timeout(5000),
		});
		const data = await res.json();
		if (data.status === "ok" || data.status === "degraded") {
			statusDot.className = "status-dot online";
			statusText.textContent =
				data.status === "ok" ? "API sẵn sàng" : "API khởi động (thiếu key)";
		} else {
			throw new Error("Bad status");
		}
	} catch {
		statusDot.className = "status-dot offline";
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
		capturedPlaceholder.classList.add("hidden");
		capturedSubtitle.textContent = "Sẵn sàng để biến đổi";
		hideError();
		updateTransformBtn();
		setTimeout(() => {
			document
				.querySelector(".controls-panel")
				.scrollIntoView({ behavior: "smooth", block: "start" });
		}, 500);
	};
	reader.readAsDataURL(file);
}

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
	e.preventDefault();
	dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () =>
	dropZone.classList.remove("drag-over"),
);
dropZone.addEventListener("drop", (e) => {
	e.preventDefault();
	dropZone.classList.remove("drag-over");
	const file = e.dataTransfer.files[0];
	handleFile(file);
});

// Click to upload
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
	if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

// ── Source Tabs ───────────────────────────────────────────────────────────
sourceTabs.forEach((tab) => {
	tab.addEventListener("click", () => {
		const source = tab.dataset.source;
		sourceTabs.forEach((t) => {
			t.classList.remove("active");
			t.setAttribute("aria-selected", "false");
		});
		tab.classList.add("active");
		tab.setAttribute("aria-selected", "true");

		Object.entries(sourceBodies).forEach(([key, el]) => {
			el.classList.toggle("hidden", key !== source);
		});

		if (source === "camera") {
			openCamera();
		} else {
			stopCamera();
		}
	});
});

// ── Camera Feature ────────────────────────────────────────────────────────
const captureCameraBtn = document.getElementById("captureCameraBtn");
const cameraPreviewWrap = document.getElementById("cameraPreviewWrap");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const cameraSelect = document.getElementById("cameraSelect");
let videoStream = null;
let currentDeviceId = null;

async function populateCameraList() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const videoDevices = devices.filter(d => d.kind === 'videoinput');
		
		cameraSelect.innerHTML = '';
		if (videoDevices.length > 0) {
			cameraSelect.classList.remove('hidden');
			videoDevices.forEach((device, index) => {
				const option = document.createElement('option');
				option.value = device.deviceId;
				option.text = device.label || `Camera ${index + 1}`;
				cameraSelect.appendChild(option);
			});
			
			if (currentDeviceId && videoDevices.find(d => d.deviceId === currentDeviceId)) {
				cameraSelect.value = currentDeviceId;
			} else {
				currentDeviceId = cameraSelect.value;
			}
			
			cameraSelect.onchange = () => {
				currentDeviceId = cameraSelect.value;
				stopCamera();
				openCamera();
			};
		} else {
			cameraSelect.classList.add('hidden');
		}
	} catch (e) {
		console.error("Lỗi lấy danh sách camera", e);
	}
}

function showCameraError(message) {
	cameraPreviewWrap.classList.remove("is-live");
	cameraPlaceholder.classList.remove("hidden");
	cameraPlaceholder.querySelector(".drop-title").textContent =
		"Không thể mở camera";
	cameraPlaceholder.querySelector(".drop-subtitle").textContent = message;
}

async function openCamera() {
	if (videoStream) return;

	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		const { hostname, protocol, port, pathname, search } = window.location;
		const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
		if (protocol === "http:" && !isLocalHost) {
			const fixedUrl = `http://localhost${port ? ":" + port : ""}${pathname}${search}`;
			showCameraError(
				`Địa chỉ "${hostname}" không được trình duyệt coi là an toàn để dùng Camera. Hãy mở lại bằng: ${fixedUrl}`,
			);
		} else {
			showCameraError(
				"Trình duyệt hoặc kết nối này không hỗ trợ Camera (cần HTTPS hoặc localhost).",
			);
		}
		return;
	}

	try {
		const constraints = {
			video: currentDeviceId ? { deviceId: { exact: currentDeviceId } } : { facingMode: "user" },
			audio: false,
		};
		videoStream = await navigator.mediaDevices.getUserMedia(constraints);
		cameraVideo.srcObject = videoStream;
		cameraPreviewWrap.classList.add("is-live");
		captureCameraBtn.disabled = false;
		
		await populateCameraList();
	} catch (err) {
		if (err.name === "NotAllowedError" || err.name === "SecurityError") {
			showCameraError(
				"Quyền camera đang bị chặn cho trang này. Nhấn vào biểu tượng ổ khóa/camera trên thanh địa chỉ trình duyệt, chọn \"Cho phép\" rồi tải lại trang.",
			);
		} else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
			showCameraError(
				"Không tìm thấy camera trên thiết bị này, hoặc camera đang được ứng dụng khác sử dụng.",
			);
		} else if (err.name === "NotReadableError") {
			showCameraError(
				"Camera đang được ứng dụng khác sử dụng. Vui lòng đóng ứng dụng đó rồi thử lại.",
			);
		} else {
			showCameraError(
				"Không thể mở camera (" + (err.message || err.name) + ")",
			);
		}
	}
}

function stopCamera() {
	if (videoStream) {
		videoStream.getTracks().forEach((track) => track.stop());
		videoStream = null;
	}
	cameraVideo.srcObject = null;
	cameraPreviewWrap.classList.remove("is-live");
	captureCameraBtn.disabled = true;
}

captureCameraBtn.addEventListener("click", () => {
	if (!videoStream) return;
	const width = cameraVideo.videoWidth;
	const height = cameraVideo.videoHeight;
	if (!width || !height) return;

	cameraCanvas.width = width;
	cameraCanvas.height = height;
	const ctx = cameraCanvas.getContext("2d");
	ctx.drawImage(cameraVideo, 0, 0, width, height);

	cameraCanvas.toBlob(
		(blob) => {
			if (blob) {
				const file = new File([blob], "camera_capture.jpg", {
					type: "image/jpeg",
				});
				handleFile(file);
			}
		},
		"image/jpeg",
		0.9,
	);
});

// ── RTSP Feature (UI only, backend not implemented yet) ──────────────────
const rtspUrlInput = document.getElementById("rtspUrlInput");
const rtspActionBtn = document.getElementById("rtspActionBtn");
const rtspPreviewWrap = document.getElementById("rtspPreviewWrap");
const rtspPlaceholder = document.getElementById("rtspPlaceholder");

function connectRtsp() {
	const url = rtspUrlInput.value.trim();
	if (!url) {
		showError("Vui lòng nhập địa chỉ RTSP.");
		return;
	}
	showError("Kết nối RTSP chưa được hỗ trợ ở backend. Đây là giao diện demo.");

	rtspActionBtn.disabled = true;
}

rtspUrlInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		connectRtsp();
	}
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
	const canTransform =
		state.imageFile && state.selectedProfession && !state.isLoading;
	transformBtn.disabled = !canTransform;
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
	transformBtn.classList.add("is-loading");
	transformContent.innerHTML = `<span class="loading-spinner"></span><span>Đang xử lý...</span>`;

	// Disable capture buttons while inferring — no new frame can be grabbed mid-transform
	captureCameraBtn.disabled = true;
	const rtspWasReady = rtspActionBtn.dataset.mode === "capture" && !rtspActionBtn.disabled;
	rtspActionBtn.disabled = true;

	// Reset result area
	resultImgWrap.classList.add("hidden");
	resultActions.classList.add("hidden");
	compareSection.classList.add("hidden");
	resultPlaceholder.classList.remove("hidden");

	try {
		async function attemptTransform(provider) {
			const formData = new FormData();
			formData.append("image", state.imageFile);
			formData.append("profession", state.selectedProfession);
			formData.append("ai_provider", provider);

			// 1. Submit task
			const res = await fetch(`${API_BASE}/api/tasks/change-clothes`, {
				method: "POST",
				headers: { "ngrok-skip-browser-warning": "true" },
				body: formData,
			});

			const textData = await res.text();
			let data;
			try {
				data = JSON.parse(textData);
			} catch (e) {
				if (!res.ok) {
					throw new Error(
						`Ngrok/Server Error (${res.status}): Máy chủ bận hoặc lỗi kết nối ngrok.`,
					);
				}
				throw new Error("Lỗi mạng: Không thể đọc dữ liệu JSON từ server.");
			}

			if (!res.ok) {
				throw new Error(data.detail || `Lỗi server: ${res.status}`);
			}

			const taskId = data.task_id;

			// 2. Poll for status
			let taskResult = null;
			while (true) {
				await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5s to avoid ngrok rate limits

				const pollRes = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
					headers: { "ngrok-skip-browser-warning": "true" },
				});

				const textData = await pollRes.text();
				let pollData;
				try {
					pollData = JSON.parse(textData);
				} catch (e) {
					// If ngrok returns an HTML error page (like 429 Too Many Requests), throw a clear error
					if (!pollRes.ok) {
						throw new Error(
							`Ngrok/Server Error (${pollRes.status}): Máy chủ bận hoặc lỗi kết nối ngrok.`,
						);
					}
					throw new Error("Lỗi mạng: Không thể đọc dữ liệu JSON từ server.");
				}

				if (!pollRes.ok) {
					throw new Error(pollData.detail || `Lỗi server: ${pollRes.status}`);
				}

				if (pollData.status === "completed") {
					taskResult = pollData;
					break;
				} else if (pollData.status === "failed") {
					throw new Error(pollData.error || "Quá trình xử lý thất bại.");
				}
				// else processing -> continue loop
			}
			return taskResult;
		}

		let taskResult = null;
		let providerUsed = "openai";
		try {
			taskResult = await attemptTransform("openai");
		} catch (err) {
			console.warn("OpenAI failed, falling back to Gemini...", err);
			providerUsed = "gemini";
			taskResult = await attemptTransform("gemini");
		}

		state.resultB64 = taskResult.result_image_b64;
		const profInfo = PROFESSIONS[state.selectedProfession];

		// Update result panel
		const resultSrc = `data:image/png;base64,${state.resultB64}`;
		resultImg.src = resultSrc;

		resultBadge.textContent = `${profInfo.icon} ${profInfo.label}`;
		resultBadge.style.background = profInfo.badgeBg;
		resultBadge.style.border = `1px solid ${profInfo.badgeBorder}`;

		resultSubtitle.textContent = `Hóa thân thành ${profInfo.label}`;

		resultPlaceholder.classList.add("hidden");
		resultImgWrap.classList.remove("hidden");
		resultActions.classList.remove("hidden");

		// Compare section
		compareOriginal.src = state.imageDataUrl;
		compareResult.src = resultSrc;
		afterLabel.textContent = `${profInfo.icon} ${profInfo.label.toUpperCase()}`;
		compareSection.classList.remove("hidden");
		compareSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
	} catch (err) {
		console.error("Transform error:", err);
		showError(err.message || "Đã có lỗi xảy ra. Vui lòng thử lại.");
	} finally {
		state.isLoading = false;
		transformBtn.classList.remove("is-loading");
		transformContent.innerHTML = `<span class="btn-icon">✨</span><span>Biến Đổi Ngay</span>`;
		updateTransformBtn();

		// Re-enable capture buttons only if their underlying source is still ready
		captureCameraBtn.disabled = !videoStream;
		if (rtspWasReady) rtspActionBtn.disabled = false;
	}
});

// ── Download Result ───────────────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
	if (!state.resultB64) return;
	const profInfo = PROFESSIONS[state.selectedProfession] || { label: "result" };
	const a = document.createElement("a");
	a.href = `data:image/png;base64,${state.resultB64}`;
	a.download = `outfit_${state.selectedProfession}_${Date.now()}.png`;
	a.click();
});

// ── Copy / Share Result ───────────────────────────────────────────────────
shareBtn.addEventListener("click", async () => {
	if (!state.resultB64) return;
	try {
		const blob = await (
			await fetch(`data:image/png;base64,${state.resultB64}`)
		).blob();
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		shareBtn.innerHTML = `<span>✅</span> Đã sao chép!`;
		setTimeout(() => {
			shareBtn.innerHTML = `<span>📋</span> Sao Chép`;
		}, 2000);
	} catch {
		// Fallback: open in new tab
		const win = window.open();
		win.document.write(
			`<img src="data:image/png;base64,${state.resultB64}" style="max-width:100%" />`,
		);
	}
});
