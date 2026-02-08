/**
 * Mood Detection Wellness App - Core Logic
 */

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const emotionsMap = {
    neutral: { icon: '😐', label: 'Neutral', tip: 'Un momento de calma es perfecto para una respiración consciente.' },
    happy: { icon: '😊', label: 'Feliz', tip: '¡Qué alegría! Comparte esa luz con alguien hoy.' },
    sad: { icon: '😔', label: 'Triste', tip: 'Está bien no estar bien. Date permiso para sentir y descansar.' },
    angry: { icon: '😤', label: 'Enojo', tip: 'Respira profundo. Inhala calma, exhala tensión.' },
    fearful: { icon: '😨', label: 'Miedo', tip: 'Estás a salvo aquí. Enfócate en tu respiración.' },
    disgusted: { icon: '😒', label: 'Disgustado', tip: 'Tómate un momento para alejarte de lo que te incomoda.' },
    surprised: { icon: '😲', label: 'Sorprendido', tip: 'La vida siempre nos regala momentos inesperados. ¡Disfrútalo!' }
};

let sessionCount = 0;
let stream = null;

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const cameraScreen = document.getElementById('camera-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultsScreen = document.getElementById('results-screen');

const webcam = document.getElementById('webcam');
const fileInput = document.getElementById('file-input');
const resultImg = document.getElementById('result-img');
const emotionIcon = document.getElementById('emotion-icon');
const emotionLabel = document.getElementById('emotion-label');
const emotionsChart = document.getElementById('emotions-chart');
const wellnessTip = document.getElementById('wellness-tip');
const sessionCountEl = document.getElementById('session-count');
const toast = document.getElementById('toast');

let modelsLoaded = false;

// Initialize
async function init() {
    if (typeof faceapi === 'undefined') {
        console.error('face-api.js no se cargó correctamente');
        showToast('Error: Biblioteca de IA no encontrada.');
        return;
    }

    showToast('Iniciando sistema de bienestar...');
    try {
        // Switching to SsdMobilenetv1 for much better accuracy
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);

        modelsLoaded = true;
        console.log('Modelos SSD cargados exitosamente');
        showToast('Sistema de alta precisión listo');
    } catch (err) {
        console.error('Error detallado cargando modelos:', err);
        showToast('Error de conexión con la IA. Intenta recargar.');
    }
}

// Helper: Show screen
function showScreen(id) {
    [welcomeScreen, cameraScreen, loadingScreen, resultsScreen].forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        // Ensure webcam is visible/active if we return to camera screen
        if (id === 'camera-screen' && stream && stream.active) {
            webcam.srcObject = stream;
        }
    }
}

// Helper: Toast message
function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    // For errors or persistent status, we might want to keep it longer
    const duration = msg.includes('Error') ? 6000 : 3000;
    setTimeout(() => toast.classList.add('hidden'), duration);
}

// Camera Logic
async function startCamera() {
    if (!modelsLoaded) {
        showToast('Espera a que los modelos carguen...');
        return;
    }

    // Reuse stream if already active
    if (stream && stream.active) {
        showScreen('camera-screen');
        return;
    }

    // Modern browsers block camera on file:// protocol
    if (window.location.protocol === 'file:') {
        console.error('La cámara requiere HTTPS o Localhost para funcionar por seguridad del navegador.');
        showToast('Error: El navegador bloquea la cámara al abrir el archivo directamente. ¡Súbelo a GitHub/Vercel para que funcione!');
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 }, // High quality for better detection
                height: { ideal: 720 }
            }
        });
        webcam.srcObject = stream;
        showScreen('camera-screen');
    } catch (err) {
        console.error('Error cámara:', err);
        if (err.name === 'NotAllowedError') {
            showToast('Error: Permiso denegado. Haz clic en el icono del candado (izquierda de la URL) y selecciona "Permitir" en cámara.');
        } else if (err.name === 'NotFoundError') {
            showToast('Error: No se encontró ninguna cámara conectada.');
        } else {
            showToast('No se pudo acceder a la cámara. Si estás en móvil, intenta cerrar otras apps que usen la cámara.');
        }
    }
}

function stopCamera() {
    // Only stop when explicitly needed or closing app
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        webcam.srcObject = null;
    }
}

// Analysis Logic
async function analyzeImage(input) {
    if (!modelsLoaded) {
        showToast('La IA aún se está cargando...');
        return;
    }

    showScreen('loading-screen');

    let processInput = input;
    if (input instanceof HTMLVideoElement) {
        if (input.readyState < 2) {
            showScreen('camera-screen');
            showToast('Espera un segundo más...');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = input.videoWidth;
        canvas.height = input.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(input, 0, 0, canvas.width, canvas.height);
        processInput = canvas;
    }

    try {
        // SSD Mobilenet is more accurate and doesn't need as many options as Tiny
        console.log('Iniciando detección SSD de alta precisión...');
        const detection = await faceapi.detectSingleFace(processInput)
            .withFaceExpressions();

        if (!detection) {
            console.warn('No se detectó rostro con SSD');
            // If it was camera, go back to camera view
            showScreen(input instanceof HTMLVideoElement ? 'camera-screen' : 'welcome-screen');
            showToast('No logramos ver tu rostro claramente. Intenta con más luz o mira de frente.');
            return;
        }

        console.log('Detección SSD exitosa:', detection);
        const expressions = detection.expressions;
        const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
        const mainEmotion = sorted[0][0];

        displayResults(processInput, mainEmotion, expressions);
    } catch (err) {
        console.error('Error en análisis SSD:', err);
        showScreen('welcome-screen');
        showToast('Error técnico en el análisis.');
    }
}

function displayResults(input, mainEmotion, allExpressions) {
    sessionCount++;
    sessionCountEl.textContent = sessionCount;

    // Set Image
    if (input instanceof HTMLImageElement) {
        resultImg.src = input.src;
    } else if (input instanceof HTMLCanvasElement) {
        resultImg.src = input.toDataURL('image/webp');
    }

    // Set Info
    const info = emotionsMap[mainEmotion] || emotionsMap.neutral;
    emotionIcon.textContent = info.icon;
    emotionLabel.textContent = info.label;
    wellnessTip.textContent = info.tip;

    // Render Chart
    emotionsChart.innerHTML = '';
    Object.entries(allExpressions)
        .sort((a, b) => b[1] - a[1])
        .forEach(([emotion, value]) => {
            const percentage = Math.round(value * 100);
            if (percentage < 1) return; // Hide negligible emotions

            const label = emotionsMap[emotion]?.label || emotion;

            const item = document.createElement('div');
            item.className = 'chart-item';
            item.innerHTML = `
                <div class="chart-label">
                    <span>${label}</span>
                    <span>${percentage}%</span>
                </div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="width: ${percentage}%"></div>
                </div>
            `;
            emotionsChart.appendChild(item);
        });

    showScreen('results-screen');
}

// Event Listeners
document.getElementById('btn-camera').addEventListener('click', startCamera);

document.getElementById('btn-upload').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => analyzeImage(img);
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('btn-capture').addEventListener('click', () => {
    analyzeImage(webcam);
});

document.getElementById('btn-back-camera').addEventListener('click', () => {
    showScreen('welcome-screen');
});

document.getElementById('btn-reset').addEventListener('click', () => {
    showScreen('welcome-screen');
});

// Start app
init();
