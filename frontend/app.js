/* ══════════════════════════════════════════════════════════════════════
   AI OUTFIT STUDIO — Frontend App Logic
   ══════════════════════════════════════════════════════════════════════ */

const API_BASE = "";
let isOpenAiKeySet = false;

// ── Fullscreen Toggle ─────────────────────────────────────────────────────
// F11 is a browser-chrome shortcut the page can never see or control
// directly — document.fullscreenElement stays null even while F11 is
// active. So when the user is in F11 and clicks the button to exit, a plain
// exitFullscreen() call would fail (nothing is "fullscreenElement" from the
// API's point of view). The fix: first requestFullscreen() (harmless no-op
// visually, since we're already fullscreen) so the browser starts tracking
// an active fullscreenElement, then immediately exitFullscreen() — which
// drops out of fullscreen entirely, both the page's and F11's, in one click.
const fullscreenToggleBtn = document.getElementById("fullscreenToggleBtn");
const fullscreenIcon = document.getElementById("fullscreenIcon");

// Set right after we ask the browser to exit fullscreen, so the icon
// reflects "exited" immediately even if window.innerWidth/innerHeight (our
// only signal for F11, which the Fullscreen API can't see) haven't caught
// up yet. Cleared again on the next resize/fullscreenchange so real
// fullscreen state (e.g. re-entering via F11 right after) isn't masked.
let justExitedFullscreen = false;

function isLikelyFullscreen() {
	if (justExitedFullscreen) return false;
	return (
		!!document.fullscreenElement ||
		(window.innerWidth >= screen.width && window.innerHeight >= screen.height)
	);
}

function updateFullscreenIcon() {
	const isFullscreen = isLikelyFullscreen();
	fullscreenIcon.textContent = isFullscreen ? "✕" : "⛶";
	fullscreenToggleBtn.classList.toggle("is-fullscreen", isFullscreen);
	const label = isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình";
	fullscreenToggleBtn.setAttribute("aria-label", label);
	fullscreenToggleBtn.title = label;
}

fullscreenToggleBtn.addEventListener("click", async () => {
	if (document.fullscreenElement) {
		await document.exitFullscreen();
		justExitedFullscreen = true;
		updateFullscreenIcon();
		return;
	}
	if (isLikelyFullscreen()) {
		// Fullscreen via F11: claim the Fullscreen API first so the browser
		// has something to exit, then exit it immediately — one click both
		// enters and leaves the API's fullscreen, ending the F11 state too.
		try {
			await document.documentElement.requestFullscreen();
			await document.exitFullscreen();
		} catch (err) {
			console.warn("Failed to exit F11 fullscreen:", err);
		}
		justExitedFullscreen = true;
		updateFullscreenIcon();
		return;
	}
	document.documentElement.requestFullscreen().catch((err) => {
		console.warn("Failed to enter fullscreen:", err);
	});
	updateFullscreenIcon();
});

document.addEventListener("fullscreenchange", () => {
	// Only clear the "just exited" override if the API itself now reports an
	// active fullscreenElement (i.e. fullscreen was genuinely re-entered) —
	// don't let the exit's own trailing fullscreenchange event stomp the
	// flag we just set to reflect that same exit.
	if (document.fullscreenElement) justExitedFullscreen = false;
	updateFullscreenIcon();
});
window.addEventListener("resize", () => {
	justExitedFullscreen = false;
	updateFullscreenIcon();
});

// ── State ─────────────────────────────────────────────────────────────────
const state = {
	imageFile: null,
	imageDataUrl: null,
	selectedProfession: null,
	selectedGender: "nam",
	isLoading: false,
	isDetectingGender: false,
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
const tabCamera = document.getElementById("tab-camera");
const sourceBodies = {
	upload: document.getElementById("sourceBody-upload"),
	camera: document.getElementById("sourceBody-camera"),
};

const professionBtns = document.querySelectorAll(".profession-btn");
const genderBtns = document.querySelectorAll(".gender-btn");
const genderSelector = document.getElementById("genderSelector");

const professionPicker = document.getElementById("professionPicker");
const professionSlotEmpty = document.getElementById("professionSlotEmpty");
const professionSlotFilled = document.getElementById("professionSlotFilled");
const slotPhotoIcon = document.getElementById("slotPhotoIcon");
const slotPersonIcon = document.getElementById("slotPersonIcon");
const slotLabel = document.getElementById("slotLabel");
const removeSlotBtn = document.getElementById("removeSlotBtn");

const transformBtn = document.getElementById("transformBtn");
const transformContent = document.getElementById("transformBtnContent");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const placeholderSpinner = document.getElementById("placeholderSpinner");
const resultImgWrap = document.getElementById("resultImgWrap");
const resultImg = document.getElementById("resultImg");
const resultTimeBadge = document.getElementById("resultTimeBadge");
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
		isOpenAiKeySet = !!data.openai_key_set;
		if (data.gemini_key_count > 0) {
			statusDot.className = "status-dot online";
			headerStatus.title = `API sẵn sàng (${data.gemini_key_count} Gemini key)`;
		} else {
			statusDot.className = "status-dot warning";
			headerStatus.title = "Không có Gemini key nào được cấu hình";
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
		// Only clear the chosen profession if it was already used to
		// produce a result for the previous photo — otherwise keep it, so a
		// user still setting up (no transform run yet) doesn't lose their
		// pick just for swapping the photo before hitting transform.
		if (state.resultB64) {
			clearProfessionSlot();
		}
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
	// Keep the Tải ảnh / Chụp ảnh tabs clickable even while an image is
	// frozen (including mid gender-detection) so the user can start over
	// with a new photo at any time, not just via the X button.
	Object.values(sourceBodies).forEach((el) => el.classList.add("hidden"));
	frozenImgWrap.classList.remove("hidden");
	sourceSubtitle.textContent = "Sẵn sàng để biến đổi";
	tabCamera.querySelector("span:last-child").textContent = "Chụp ảnh khác";
	tabCamera.classList.add("is-retake");

	// Keep the gender selector disabled + unhighlighted, and dim the frozen
	// preview, while gender detection is in flight.
	resetGenderSelector();
	frozenImgWrap.classList.add("is-detecting");
	autoDetectGender();
}

async function autoDetectGender() {
	if (!state.imageFile) return;
	const targetImageFile = state.imageFile;

	state.isDetectingGender = true;
	updateTransformBtn();

	const genderSelector = document.getElementById("genderSelector");
	genderSelector.classList.add("is-detecting");

	// No client-side timeout/abort here on purpose — the backend is the one
	// that owns key selection/fallback timing (it tries every configured key
	// in turn before giving up), so the frontend simply waits for whatever
	// the backend ultimately returns instead of racing it with its own
	// timer and risking a premature "nam" fallback while a later key is
	// still succeeding server-side.
	let gender = "nam";
	try {
		const formData = new FormData();
		formData.append("image", targetImageFile);

		const res = await fetch("/api/detect-gender", {
			method: "POST",
			body: formData,
		});

		if (!res.ok) throw new Error("API failed");

		const data = await res.json();
		gender = data.gender || "nam";
	} catch (err) {
		console.warn("Auto-detect gender failed:", err);
		gender = "nam";
	} finally {
		// If the image was removed/replaced while this request was in flight,
		// this result is stale — don't touch the (now-different) current state.
		if (state.imageFile !== targetImageFile) return;

		// Only now — once we have a result (or a fallback) — enable the
		// selector and highlight the detected gender.
		enableGenderSelector();
		const btnToClick = document.querySelector(
			`.gender-btn[data-gender="${gender}"]`,
		);
		if (btnToClick) btnToClick.click();

		genderSelector.classList.remove("is-detecting");
		frozenImgWrap.classList.remove("is-detecting");

		state.isDetectingGender = false;
		updateTransformBtn();

		// Auto scroll to the result panel (useful on mobile)
		const resultPanel = document.querySelector(".result-panel");
		if (resultPanel) {
			resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
			window.scrollBy({ top: 5, behavior: "smooth" });
		}
	}
}

function unfreezeImage() {
	state.imageFile = null;
	state.imageDataUrl = null;
	previewImg.src = "";
	// Reset the file input so re-selecting the same file still fires "change".
	fileInput.value = "";
	frozenImgWrap.classList.add("hidden");
	sourceBodies.upload.classList.toggle("hidden", lastActiveSource !== "upload");
	sourceBodies.camera.classList.toggle("hidden", lastActiveSource !== "camera");
	sourceTabs.forEach((t) => {
		t.disabled = false;
		t.classList.remove("is-disabled");
		const isActive = t.dataset.source === lastActiveSource;
		t.classList.toggle("active", isActive);
		t.setAttribute("aria-selected", isActive ? "true" : "false");
	});
	sourceSubtitle.textContent = "Chọn cách lấy ảnh: tải lên hoặc camera";
	resetGenderSelector();
	state.isDetectingGender = false;
	hideError();
	// Only clear the chosen profession if the image being removed already
	// produced a result — the profession picked for it no longer applies to
	// whatever photo comes next. If the user is still setting up (no result
	// yet), removing/replacing the photo shouldn't lose their profession
	// pick, since they can just re-transform once a new photo is in place.
	if (state.resultB64) {
		clearProfessionSlot();
	}
	// Removing the photo via X (as opposed to starting over via a tab click)
	// goes back to the plain "Chụp ảnh" label.
	tabCamera.querySelector("span:last-child").textContent = "Chụp ảnh";
	tabCamera.classList.remove("is-retake");
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
		if (tab.disabled) return;
		const source = tab.dataset.source;

		// Clicking a tab while a photo is already frozen (including mid
		// gender-detection) means "start over with a different source" —
		// discard the current photo/profession first, same as the X button,
		// then proceed to open the newly-selected tab below.
		if (!frozenImgWrap.classList.contains("hidden")) {
			unfreezeImage();
		}

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
		locateFile: (file) =>
			`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
	});
	hands.setOptions({
		maxNumHands: 1,
		modelComplexity: 1,
		minDetectionConfidence: 0.6,
		minTrackingConfidence: 0.6,
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
	const hasValidFrame =
		cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0;

	if (
		isMediaPipeReady &&
		hasValidFrame &&
		autoCaptureToggle.checked &&
		!isCountingDown
	) {
		if (cameraVideo.currentTime !== lastVideoTime) {
			lastVideoTime = cameraVideo.currentTime;
			try {
				await hands.send({ image: cameraVideo });
			} catch (e) {}
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
	countdownOverlay.classList.add("hidden");
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
	if (openFingers >= 4) {
		// Dơ 4-5 ngón là tính
		if (lastDetectionTime === 0) {
			lastDetectionTime = now;
		} else {
			fingersUpDuration += now - lastDetectionTime;
			lastDetectionTime = now;
		}

		if (fingersUpDuration > 1000) {
			// Giữ 1 giây
			startCountdown(() => capturePhotoNow());
			fingersUpDuration = 0;
			lastDetectionTime = 0;
		}
	} else {
		fingersUpDuration = 0;
		lastDetectionTime = 0;
	}
}

const COUNTDOWN_SECONDS = 5;

// Shared countdown used by both auto-capture (gesture-triggered) and manual
// capture (button-triggered) — both count down the same 5 seconds and then
// perform the actual capture.
function startCountdown(onDone) {
	isCountingDown = true;
	countdownOverlay.classList.remove("hidden");
	let count = COUNTDOWN_SECONDS;
	countdownText.textContent = count;

	countdownIntervalId = setInterval(() => {
		count--;
		if (count > 0) {
			countdownText.style.animation = "none";
			countdownText.offsetHeight; // trigger reflow
			countdownText.style.animation = null;
			countdownText.textContent = count;
		} else {
			clearInterval(countdownIntervalId);
			countdownIntervalId = null;
			countdownOverlay.classList.add("hidden");
			isCountingDown = false;
			onDone();
		}
	}, 1000);
}

async function populateCameraList() {
	if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices)
		return;
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const videoDevices = devices.filter((d) => d.kind === "videoinput");

		cameraSelect.innerHTML = "";
		if (videoDevices.length > 0) {
			cameraSelect.classList.remove("hidden");
			videoDevices.forEach((device, index) => {
				const option = document.createElement("option");
				option.value = device.deviceId;
				option.text = device.label || `Camera ${index + 1}`;
				cameraSelect.appendChild(option);
			});

			if (
				currentDeviceId &&
				videoDevices.find((d) => d.deviceId === currentDeviceId)
			) {
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
			cameraSelect.classList.add("hidden");
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
			video: currentDeviceId
				? { deviceId: { exact: currentDeviceId } }
				: { facingMode: "user" },
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
				'Quyền camera đang bị chặn cho trang này. Nhấn vào biểu tượng ổ khóa/camera trên thanh địa chỉ trình duyệt, chọn "Cho phép" rồi tải lại trang.',
			);
		} else if (
			err.name === "NotFoundError" ||
			err.name === "OverconstrainedError"
		) {
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

// Grabs the current video frame and hands it off as the captured photo.
// Called directly by auto-capture (after its own countdown) and by the
// manual capture button (also after a countdown — see the click handler
// below) — never call this straight from a click without a countdown first.
function capturePhotoNow() {
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
}

captureCameraBtn.addEventListener("click", () => {
	if (!videoStream || isCountingDown) return;
	startCountdown(() => capturePhotoNow());
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

	resetResultState();
	updateTransformBtn();
}

function resetResultState() {
	if (state.resultB64) {
		state.resultB64 = null;
		resultImgWrap.classList.add("hidden");
		downloadBtn.classList.add("hidden");
		resultTimeBadge.classList.add("hidden");
		resultPlaceholder.classList.add("hidden");
		transformContent.classList.remove("hidden");
		transformBtn.classList.remove("is-done");
	}
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

// ── Gender Selection ──────────────────────────────────────────────────────
genderBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		if (btn.disabled) return;
		state.selectedGender = btn.dataset.gender;
		genderBtns.forEach((b) => {
			b.classList.remove("active");
			b.setAttribute("aria-pressed", "false");
		});
		btn.classList.add("active");
		btn.setAttribute("aria-pressed", "true");
	});
});

// Enabled (defaulting to "Nam" highlighted) once gender detection
// resolves; the caller immediately clicks the detected gender's button
// afterwards to correct the highlight if detection returned "nu".
function enableGenderSelector() {
	genderSelector.classList.remove("is-disabled");
	state.selectedGender = "nam";
	genderBtns.forEach((b) => {
		b.disabled = false;
		const isNam = b.dataset.gender === "nam";
		b.classList.toggle("active", isNam);
		b.setAttribute("aria-pressed", isNam ? "true" : "false");
	});
}
function resetGenderSelector() {
	genderSelector.classList.add("is-disabled");
	state.selectedGender = "nam";
	genderBtns.forEach((b) => {
		b.disabled = true;
		b.classList.remove("active");
		b.setAttribute("aria-pressed", "false");
	});
}

// ── Transform Button State ────────────────────────────────────────────────
function updateTransformBtn() {
	const canTransform =
		state.imageFile &&
		state.selectedProfession &&
		!state.isLoading &&
		!state.isDetectingGender &&
		!state.resultB64;
	transformBtn.disabled = !canTransform;
}

// ── Error Helpers ─────────────────────────────────────────────────────────
// Errors are intentionally never surfaced in the UI — they're logged here
// for developers/backend only, so a failure never interrupts the user's flow.
function showError(msg) {
	console.error("[App]", msg);
}
function hideError() {}

// ── Main Transform Call ───────────────────────────────────────────────────
transformBtn.addEventListener("click", async () => {
	if (
		!state.imageFile ||
		!state.selectedProfession ||
		state.isLoading ||
		state.isDetectingGender
	)
		return;

	state.isLoading = true;
	hideError();
	const requestStartedAt = performance.now();
	// Snapshot the profession so a mid-flight "remove" click (which sets
	// state.selectedProfession back to null) can't break the completion handler.
	const transformingProfession = state.selectedProfession;

	// Button loading state
	transformBtn.disabled = true;
	transformBtn.classList.add("is-loading");
	transformContent.innerHTML = `<span class="loading-spinner"></span><span>Đang biến đổi...</span>`;

	// Disable capture buttons while inferring — no new frame can be grabbed mid-transform
	captureCameraBtn.disabled = true;

	// Lock the image and profession slots during the transform — no swapping
	// the source photo or profession mid-flight.
	removeImgBtn.disabled = true;
	removeImgBtn.classList.add("is-disabled");
	removeSlotBtn.disabled = true;
	removeSlotBtn.classList.add("is-disabled");
	genderSelector.classList.add("is-disabled");
	genderBtns.forEach((b) => (b.disabled = true));
	// Also lock the Tải ảnh / Chụp ảnh (lại) tabs — no uploading or
	// (re)capturing a new photo while a transform is in flight.
	sourceTabs.forEach((t) => {
		t.disabled = true;
		t.classList.add("is-disabled");
	});

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
			formData.append("gender", state.selectedGender);

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

		// Backend owns all coordination for this call — retrying across
		// Gemini keys, prioritizing by response speed, and racing a backup
		// request after BACKUP_TIMEOUT_SECONDS if needed. The frontend just
		// submits one task and polls it; it only receives the winning
		// result and how long it took, purely for display.
		let taskResult = null;
		let providerUsed = "gemini";
		try {
			taskResult = await attemptTransform("gemini");
		} catch (err) {
			// Only fall back to OpenAI if a key is actually configured —
			// otherwise the fallback attempt would just fail with a confusing
			// "OpenAI key not configured" error that hides the real Gemini
			// failure from the user. In that case, surface the original error.
			if (!isOpenAiKeySet) {
				throw err;
			}
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
		// Log the real technical reason for developers only — the visible
		// UI always shows a generic message so internal config/provider
		// details are never exposed to the end user.
		console.error("Transform error:", err);
		showError("Đã có lỗi xảy ra. Vui lòng thử lại.");
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
		genderSelector.classList.remove("is-disabled");
		genderBtns.forEach((b) => (b.disabled = false));
		sourceTabs.forEach((t) => {
			t.disabled = false;
			t.classList.remove("is-disabled");
		});

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
