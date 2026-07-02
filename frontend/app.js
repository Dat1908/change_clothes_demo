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
const sourceSubtitle = document.getElementById("sourceSubtitle");
const frozenImgWrap = document.getElementById("frozenImgWrap");
const removeImgBtn = document.getElementById("removeImgBtn");

const sourceTabs = document.querySelectorAll(".source-tab");
const sourceBodies = {
	upload: document.getElementById("sourceBody-upload"),
	camera: document.getElementById("sourceBody-camera"),
};

const professionBtns = document.querySelectorAll(".profession-btn");
const providerBtns = document.querySelectorAll(".provider-btn");

const professionPicker = document.getElementById("professionPicker");
const professionSlotEmpty = document.getElementById("professionSlotEmpty");
const professionSlotFilled = document.getElementById("professionSlotFilled");
const slotPhotoIcon = document.getElementById("slotPhotoIcon");
const slotPersonIcon = document.getElementById("slotPersonIcon");
const slotLabel = document.getElementById("slotLabel");
const removeSlotBtn = document.getElementById("removeSlotBtn");

const transformBtn = document.getElementById("transformBtn");
const transformContent = document.getElementById("transformBtnContent");

const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const placeholderText = document.getElementById("placeholderText");
const placeholderSpinner = document.getElementById("placeholderSpinner");
const resultImgWrap = document.getElementById("resultImgWrap");
const resultImg = document.getElementById("resultImg");
const resultTimeBadge = document.getElementById("resultTimeBadge");
const resultSubtitle = document.getElementById("resultSubtitle");
const downloadBtn = document.getElementById("downloadBtn");

// Wipe-slider elements inside the result box (original → transformed)
const compareOriginal = document.getElementById("compareOriginal");
const compareAfterWrap = document.getElementById("compareAfterWrap");
const compareSliderHandle = document.getElementById("compareSliderHandle");

const statusDot = document.getElementById("statusDot");
const headerStatus = document.getElementById("headerStatus");

// ── Profession Metadata ───────────────────────────────────────────────────
const PROFESSIONS = {
	an_ninh_nhan_dan: {
		label: "An Ninh Nhân Dân",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/an_ninh_nhan_dan.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	canh_sat_nhan_dan: {
		label: "Cảnh Sát Nhân Dân",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/canh_sat_nhan_dan.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	canh_sat_giao_thong: {
		label: "Cảnh Sát Giao Thông",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/canh_sat_giao_thong.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	canh_sat_co_dong: {
		label: "Cảnh Sát Cơ Động",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/canh_sat_co_dong.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	canh_sat_dac_nhiem: {
		label: "Cảnh Sát Đặc Nhiệm",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/canh_sat_dac_nhiem.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	canh_sat_pccc: {
		label: "Cảnh Sát PCCC",
		personIcon: "👮",
		itemIcon: "",
		photoIcon: "assets/icons/canh_sat_pccc.png",
		color: "#10b981",
		badgeBg: "rgba(16,185,129,0.35)",
		badgeBorder: "#10b981",
	},
	doctor: {
		label: "Bác Sĩ",
		personIcon: "🧑‍⚕️",
		itemIcon: "🏥",
		color: "#3b82f6",
		badgeBg: "rgba(59,130,246,0.35)",
		badgeBorder: "#3b82f6",
	},
	teacher: {
		label: "Giáo Viên",
		personIcon: "🧑‍🏫",
		itemIcon: "📚",
		color: "#f59e0b",
		badgeBg: "rgba(245,158,11,0.35)",
		badgeBorder: "#f59e0b",
	},
	singer: {
		label: "Ca Sĩ",
		personIcon: "🧑‍🎤",
		itemIcon: "🎤",
		color: "#ec4899",
		badgeBg: "rgba(236,72,153,0.35)",
		badgeBorder: "#ec4899",
	},

	pilot: {
		label: "Phi Công",
		personIcon: "🧑‍✈️",
		itemIcon: "✈️",
		color: "#06b6d4",
		badgeBg: "rgba(6,182,212,0.35)",
		badgeBorder: "#06b6d4",
	},
	chef: {
		label: "Đầu Bếp",
		personIcon: "👨‍🍳",
		itemIcon: "🔪",
		color: "#a855f7",
		badgeBg: "rgba(168,85,247,0.35)",
		badgeBorder: "#a855f7",
	},
	engineer: {
		label: "Kỹ Sư",
		personIcon: "👷",
		itemIcon: "🔧",
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
		if (data.status === "ok") {
			statusDot.className = "status-dot online";
			headerStatus.title = "API sẵn sàng";
		} else if (data.status === "degraded") {
			statusDot.className = "status-dot warning";
			headerStatus.title = "API khởi động (thiếu key)";
		} else {
			throw new Error("Bad status");
		}
	} catch {
		statusDot.className = "status-dot offline";
		headerStatus.title = "API chưa kết nối";
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
		freezeImage();
		hideError();
		updateTransformBtn();
	};
	reader.readAsDataURL(file);
}

// Track which source tab was active before freezing, so removing the image
// can return the user to the same tab (e.g. straight back to the camera)
// instead of always resetting to Upload.
let lastActiveSource = "upload";

// Freeze the captured/uploaded image: hide the source tabs + camera/upload
// body, show the frozen preview with an X button to start over.
function freezeImage() {
	const activeTab = document.querySelector(".source-tab.active");
	if (activeTab) lastActiveSource = activeTab.dataset.source;
	stopCamera();
	sourceTabs.forEach((t) => t.classList.add("hidden"));
	Object.values(sourceBodies).forEach((el) => el.classList.add("hidden"));
	frozenImgWrap.classList.remove("hidden");
	sourceSubtitle.textContent = "Sẵn sàng để biến đổi";
}

function unfreezeImage() {
	state.imageFile = null;
	state.imageDataUrl = null;
	previewImg.src = "";
	// Reset the file input so re-selecting the same file still fires "change".
	fileInput.value = "";
	frozenImgWrap.classList.add("hidden");
	sourceTabs.forEach((t) => t.classList.remove("hidden"));
	sourceBodies.upload.classList.toggle("hidden", lastActiveSource !== "upload");
	sourceBodies.camera.classList.toggle("hidden", lastActiveSource !== "camera");
	sourceTabs.forEach((t) => {
		const isActive = t.dataset.source === lastActiveSource;
		t.classList.toggle("active", isActive);
		t.setAttribute("aria-selected", isActive ? "true" : "false");
	});
	sourceSubtitle.textContent = "Chọn cách lấy ảnh: tải lên hoặc camera";
	hideError();
	if (lastActiveSource === "camera") {
		openCamera();
	}
	updateTransformBtn();
}

removeImgBtn.addEventListener("click", () => {
	if (state.isLoading) return;
	unfreezeImage();
});

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

// ── Auto Capture (MediaPipe) ──────────────────────────────────────────────
const autoCaptureToggle = document.getElementById("autoCaptureToggle");
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownText = document.getElementById("countdownText");

let hands = null;
let isMediaPipeReady = false;
let isDetecting = false;
let detectLoopId = null;
let lastVideoTime = -1;
let fingersUpDuration = 0;
let lastDetectionTime = 0;
let isCountingDown = false;
let countdownIntervalId = null;

async function initMediaPipe() {
	if (hands) return;
	hands = new Hands({
		locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
	});
	hands.setOptions({
		maxNumHands: 1,
		modelComplexity: 1,
		minDetectionConfidence: 0.6,
		minTrackingConfidence: 0.6
	});
	hands.onResults(onHandsResult);
	await hands.initialize();
	isMediaPipeReady = true;
}

async function detectHandsLoop() {
	if (!videoStream || !isDetecting) return;

	// Guard against sending a frame before the video has real dimensions —
	// MediaPipe's WASM graph throws an unrecoverable fatal error on a
	// zero-size frame, permanently breaking hand detection for the rest of
	// the page's life (only the first camera session would ever work).
	const hasValidFrame = cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0;

	if (isMediaPipeReady && hasValidFrame && autoCaptureToggle.checked && !isCountingDown) {
		if (cameraVideo.currentTime !== lastVideoTime) {
			lastVideoTime = cameraVideo.currentTime;
			try {
				await hands.send({ image: cameraVideo });
			} catch (e) { }
		}
	}
	detectLoopId = requestAnimationFrame(detectHandsLoop);
}

function startHandDetection() {
	if (!isDetecting) {
		isDetecting = true;
		initMediaPipe().then(() => {
			detectHandsLoop();
		});
	}
}

function stopHandDetection() {
	isDetecting = false;
	if (detectLoopId) {
		cancelAnimationFrame(detectLoopId);
		detectLoopId = null;
	}
	if (countdownIntervalId) {
		clearInterval(countdownIntervalId);
		countdownIntervalId = null;
	}
	isCountingDown = false;
	countdownOverlay.classList.add('hidden');
	// Reset gesture-tracking accumulators so a fresh camera session doesn't
	// inherit stale timing from the previous one.
	fingersUpDuration = 0;
	lastDetectionTime = 0;
	lastVideoTime = -1;
}

function onHandsResult(results) {
	if (!autoCaptureToggle.checked || isCountingDown) return;

	let openFingers = 0;
	if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
		const landmarks = results.multiHandLandmarks[0];
		// Index, Middle, Ring, Pinky
		if (landmarks[8].y < landmarks[6].y) openFingers++;
		if (landmarks[12].y < landmarks[10].y) openFingers++;
		if (landmarks[16].y < landmarks[14].y) openFingers++;
		if (landmarks[20].y < landmarks[18].y) openFingers++;
		// Thumb: simple heuristic based on x distance from base
		if (Math.abs(landmarks[4].x - landmarks[2].x) > 0.05) openFingers++;
	}

	const now = Date.now();
	if (openFingers >= 4) { // Dơ 4-5 ngón là tính
		if (lastDetectionTime === 0) {
			lastDetectionTime = now;
		} else {
			fingersUpDuration += (now - lastDetectionTime);
			lastDetectionTime = now;
		}

		if (fingersUpDuration > 1000) { // Giữ 1 giây
			startCountdown();
			fingersUpDuration = 0;
			lastDetectionTime = 0;
		}
	} else {
		fingersUpDuration = 0;
		lastDetectionTime = 0;
	}
}

function startCountdown() {
	isCountingDown = true;
	countdownOverlay.classList.remove('hidden');
	let count = 3;
	countdownText.textContent = count;

	countdownIntervalId = setInterval(() => {
		count--;
		if (count > 0) {
			countdownText.style.animation = 'none';
			countdownText.offsetHeight; // trigger reflow
			countdownText.style.animation = null;
			countdownText.textContent = count;
		} else {
			clearInterval(countdownIntervalId);
			countdownIntervalId = null;
			countdownOverlay.classList.add('hidden');
			captureCameraBtn.click();
			isCountingDown = false;
		}
	}, 1000);
}

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

	// Populate camera list immediately so the user can choose even if stream hangs
	await populateCameraList();

	try {
		const constraints = {
			video: currentDeviceId ? { deviceId: { exact: currentDeviceId } } : { facingMode: "user" },
			audio: false,
		};
		videoStream = await navigator.mediaDevices.getUserMedia(constraints);
		cameraVideo.srcObject = videoStream;
		cameraPreviewWrap.classList.add("is-live");
		captureCameraBtn.disabled = false;

		// Re-populate to get real device names (after permission is granted)
		await populateCameraList();
		startHandDetection();
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
	stopHandDetection();
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

// ── Profession Selection ──────────────────────────────────────────────────
function fillProfessionSlot(profession) {
	const info = PROFESSIONS[profession];
	if (info.photoIcon) {
		slotPhotoIcon.src = info.photoIcon;
		slotPhotoIcon.classList.remove("hidden");
		slotPersonIcon.classList.add("hidden");
	} else {
		slotPersonIcon.textContent = info.personIcon;
		slotPersonIcon.classList.remove("hidden");
		slotPhotoIcon.classList.add("hidden");
	}
	slotLabel.textContent = info.label;
	professionSlotEmpty.classList.add("hidden");
	professionSlotFilled.classList.remove("hidden");
}

function clearProfessionSlot() {
	state.selectedProfession = null;
	professionBtns.forEach((b) => {
		b.classList.remove("selected");
		b.setAttribute("aria-checked", "false");
	});
	professionSlotFilled.classList.add("hidden");
	professionSlotEmpty.classList.remove("hidden");
	professionPicker.classList.remove("hidden");

	// If a previous result existed, it no longer matches — reset back to the
	// placeholder, and swap the transform button back from the time badge
	// to "Biến Đổi Ngay" so the next run starts fresh.
	if (state.resultB64) {
		state.resultB64 = null;
		resultImgWrap.classList.add("hidden");
		downloadBtn.classList.add("hidden");
		resultTimeBadge.classList.add("hidden");
		resultPlaceholder.classList.add("hidden");
		transformContent.classList.remove("hidden");
		transformBtn.classList.remove("is-done");
	}

	updateTransformBtn();
}

professionBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		state.selectedProfession = btn.dataset.profession;

		professionBtns.forEach((b) => {
			b.classList.remove("selected");
			b.setAttribute("aria-checked", "false");
		});
		btn.classList.add("selected");
		btn.setAttribute("aria-checked", "true");

		fillProfessionSlot(state.selectedProfession);
		hideError();
		updateTransformBtn();
	});
});

removeSlotBtn.addEventListener("click", () => {
	if (state.isLoading) return;
	clearProfessionSlot();
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
		state.imageFile &&
		state.selectedProfession &&
		!state.isLoading &&
		!state.resultB64;
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
	const requestStartedAt = performance.now();
	// Snapshot the profession so a mid-flight "remove" click (which sets
	// state.selectedProfession back to null) can't break the completion handler.
	const transformingProfession = state.selectedProfession;

	// Button loading state
	transformBtn.disabled = true;
	transformBtn.classList.add("is-loading");
	transformContent.innerHTML = `<span class="loading-spinner"></span><span>Đang xử lý...</span>`;

	// Disable capture buttons while inferring — no new frame can be grabbed mid-transform
	captureCameraBtn.disabled = true;

	// Lock the image and profession slots during the transform — no swapping
	// the source photo or profession mid-flight.
	removeImgBtn.disabled = true;
	removeImgBtn.classList.add("is-disabled");
	removeSlotBtn.disabled = true;
	removeSlotBtn.classList.add("is-disabled");

	// Hide the profession picker right away and show the waiting screen
	// in its place — no need to wait for the result to come back.
	professionPicker.classList.add("hidden");
	resultImgWrap.classList.add("hidden");
	downloadBtn.classList.add("hidden");
	resultTimeBadge.classList.add("hidden");
	placeholderSpinner.classList.remove("hidden");
	resultPlaceholder.classList.remove("hidden");

	try {
		async function attemptTransform(provider) {
			const formData = new FormData();
			formData.append("image", state.imageFile);
			formData.append("profession", transformingProfession);
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
		let providerUsed = "gemini";
		try {
			taskResult = await attemptTransform("gemini");
		} catch (err) {
			console.warn("Gemini failed, falling back to OpenAI...", err);
			providerUsed = "openai";
			taskResult = await attemptTransform("openai");
		}

		state.resultB64 = taskResult.result_image_b64;

		// Update result panel
		const resultSrc = `data:image/png;base64,${state.resultB64}`;
		resultImg.src = resultSrc;
		compareOriginal.src = state.imageDataUrl;

		const elapsedSeconds = (performance.now() - requestStartedAt) / 1000;
		resultTimeBadge.textContent = `⏱️ ${elapsedSeconds.toFixed(1)}s`;
		resultTimeBadge.classList.remove("hidden");
		transformContent.classList.add("hidden");
		transformBtn.classList.add("is-done");

		resultPlaceholder.classList.add("hidden");
		resultImgWrap.classList.remove("hidden");
		downloadBtn.classList.remove("hidden");
		professionPicker.classList.add("hidden");

		// Restart the wipe animation from scratch (CSS "forwards" animations
		// only play once, so force a reflow to re-trigger them each time).
		compareAfterWrap.style.animation = "none";
		compareSliderHandle.style.animation = "none";
		void compareAfterWrap.offsetWidth;
		compareAfterWrap.style.animation = "";
		compareSliderHandle.style.animation = "";
	} catch (err) {
		console.error("Transform error:", err);
		showError(err.message || "Đã có lỗi xảy ra. Vui lòng thử lại.");
		// Transform failed — let the user pick a profession again.
		resultPlaceholder.classList.add("hidden");
		professionPicker.classList.remove("hidden");
	} finally {
		placeholderSpinner.classList.add("hidden");
		state.isLoading = false;
		transformBtn.classList.remove("is-loading");
		transformContent.innerHTML = `<span class="btn-icon">✨</span><span>Biến Đổi Ngay</span>`;
		// Only re-reveal the button text on failure — on success it stays
		// replaced by the time badge until the profession slot is cleared.
		if (!state.resultB64) {
			transformContent.classList.remove("hidden");
		}
		updateTransformBtn();

		// Unlock the image and profession slots now that the transform is done.
		removeImgBtn.disabled = false;
		removeImgBtn.classList.remove("is-disabled");
		removeSlotBtn.disabled = false;
		removeSlotBtn.classList.remove("is-disabled");

		// Re-enable capture button only if the camera stream is still active
		captureCameraBtn.disabled = !videoStream;
	}
});

// ── Download Result ───────────────────────────────────────────────────────
function downloadResult() {
	if (!state.resultB64) return;
	const a = document.createElement("a");
	a.href = `data:image/png;base64,${state.resultB64}`;
	a.download = `outfit_${state.selectedProfession}_${Date.now()}.png`;
	a.click();
}
downloadBtn.addEventListener("click", downloadResult);

