const page = document.body.dataset.page;

function showAlert(el, message) {
  if (!el) return;
  if (message) el.textContent = message;
  el.classList.add('visible');
}

function hideAlert(el) {
  if (el) el.classList.remove('visible');
}

function showToast(el, message) {
  if (!el) return;
  if (message) el.textContent = message;
  el.classList.remove('hidden');
}

function hideToast(el) {
  if (el) el.classList.add('hidden');
}

function formatDate(dateStr) {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isToday(dateStr) {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

/* ---------- HOME ---------- */
async function initHome() {
  const qrImage = document.getElementById('qr-image');
  const qrLoading = document.getElementById('qr-loading');
  const captureUrlEl = document.getElementById('capture-url');
  const networkUrlEl = document.getElementById('network-url');
  const networkBadge = document.getElementById('network-badge');
  const openMobileLink = document.getElementById('open-mobile-link');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnRefresh = document.getElementById('btn-refresh');
  const localNetworkBox = document.getElementById('local-network-box');
  const qrSubtitle = document.getElementById('qr-subtitle');
  const instructionsSubtitle = document.getElementById('instructions-subtitle');

  let lastCaptureUrl = '';

  async function loadSession() {
    qrLoading.classList.remove('hidden');
    qrImage.classList.add('hidden');

    try {
      const [sessionRes, networkRes] = await Promise.all([
        fetch('/api/session'),
        fetch('/api/network-info'),
      ]);

      if (!sessionRes.ok) throw new Error('Falha ao criar sessão');
      const session = await sessionRes.json();
      const network = networkRes.ok ? await networkRes.json() : null;

      const isOnline = network?.isRender || network?.isProduction;
      const networkCaptureUrl = network
        ? `${network.localUrl}/capture/${session.token}`
        : session.captureUrl;

      lastCaptureUrl = session.captureUrl;

      qrImage.src = session.qrDataUrl;
      qrImage.classList.remove('hidden');
      qrLoading.classList.add('hidden');

      captureUrlEl.textContent = session.captureUrl;

      if (isOnline) {
        networkBadge.textContent = 'Online — qualquer celular com internet';
        networkBadge.classList.add('badge-online');
        qrSubtitle.textContent = 'Escaneie de qualquer lugar, sem Wi-Fi local';
        instructionsSubtitle.textContent = 'Funciona em 4G/5G ou Wi-Fi';
        localNetworkBox.classList.add('hidden');
        openMobileLink.href = session.captureUrl;
      } else {
        networkBadge.textContent = `Rede local: ${network.ip}:${network.port}`;
        networkBadge.classList.remove('badge-online');
        qrSubtitle.textContent = 'Celular e PC na mesma rede Wi-Fi';
        instructionsSubtitle.textContent = 'Mesma rede Wi-Fi obrigatória';
        networkUrlEl.textContent = networkCaptureUrl;
        localNetworkBox.classList.remove('hidden');
        openMobileLink.href = networkCaptureUrl;
      }

      openMobileLink.classList.remove('hidden');
      btnCopyLink.classList.remove('hidden');
    } catch {
      networkBadge.textContent = 'Erro ao carregar';
      captureUrlEl.textContent = 'Verifique se o servidor está rodando.';
    }
  }

  btnCopyLink.addEventListener('click', async () => {
    if (!lastCaptureUrl) return;
    const ok = await copyText(lastCaptureUrl);
    btnCopyLink.textContent = ok ? 'Copiado!' : 'Erro ao copiar';
    setTimeout(() => {
      btnCopyLink.textContent = 'Copiar link';
    }, 2000);
  });

  btnRefresh.addEventListener('click', loadSession);
  loadSession();
}

/* ---------- CAPTURE ---------- */
async function initCapture() {
  const token = window.location.pathname.split('/capture/')[1]?.split('/')[0];
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const preview = document.getElementById('preview');
  const btnShutter = document.getElementById('btn-shutter');
  const btnRetake = document.getElementById('btn-retake');
  const btnUpload = document.getElementById('btn-upload');
  const dockCamera = document.getElementById('dock-camera');
  const dockPreview = document.getElementById('dock-preview');
  const toastCamera = document.getElementById('toast-camera');
  const toastError = document.getElementById('toast-error');
  const loadingOverlay = document.getElementById('loading-overlay');
  const cameraFrame = document.getElementById('camera-frame');
  const successScreen = document.getElementById('success-screen');

  if (!token) {
    showToast(toastError, 'Link inválido. Escaneie o QR Code novamente.');
    return;
  }

  let stream = null;
  let capturedBlob = null;

  async function checkCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      hideToast(toastCamera);
      showToast(
        toastError,
        'Navegador sem suporte à câmera. Use Chrome ou Safari.'
      );
      return false;
    }
    return true;
  }

  async function startCamera() {
    const ok = await checkCamera();
    if (!ok) return;

    showToast(toastCamera, 'Permita o acesso à câmera...');

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      video.srcObject = stream;
      await video.play();
      hideToast(toastCamera);
      hideToast(toastError);
      btnShutter.disabled = false;
      document.body.classList.add('camera-ready');
    } catch (err) {
      hideToast(toastCamera);
      let msg = 'Não foi possível abrir a câmera.';
      if (err.name === 'NotAllowedError') {
        msg = 'Permissão negada. Toque no cadeado da barra de endereço e libere a câmera.';
      } else if (err.name === 'NotFoundError') {
        msg = 'Nenhuma câmera encontrada neste aparelho.';
      }
      showToast(toastError, msg);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function enterPreviewMode() {
    document.body.classList.add('preview-mode');
    dockCamera.classList.add('hidden');
    dockPreview.classList.remove('hidden');
    cameraFrame.classList.add('hidden');
  }

  function exitPreviewMode() {
    document.body.classList.remove('preview-mode');
    dockPreview.classList.add('hidden');
    dockCamera.classList.remove('hidden');
    cameraFrame.classList.remove('hidden');
  }

  btnShutter.addEventListener('click', () => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        capturedBlob = blob;
        preview.src = URL.createObjectURL(blob);
        preview.classList.remove('hidden');
        video.classList.add('hidden');
        stopCamera();
        enterPreviewMode();
      },
      'image/jpeg',
      0.9
    );
  });

  btnRetake.addEventListener('click', () => {
    capturedBlob = null;
    preview.classList.add('hidden');
    video.classList.remove('hidden');
    hideToast(toastError);
    exitPreviewMode();
    startCamera();
  });

  btnUpload.addEventListener('click', async () => {
    if (!capturedBlob) {
      showToast(toastError, 'Tire uma foto antes de enviar.');
      return;
    }

    hideToast(toastError);
    loadingOverlay.classList.add('visible');
    btnUpload.disabled = true;

    const formData = new FormData();
    formData.append('photo', capturedBlob, `foto-${token}.jpg`);

    try {
      const res = await fetch(`/api/upload/${token}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');

      dockPreview.classList.add('hidden');
      successScreen.classList.remove('hidden');
      document.body.classList.add('upload-done');
    } catch (err) {
      showToast(toastError, err.message || 'Falha no envio. Tente de novo.');
      btnUpload.disabled = false;
    } finally {
      loadingOverlay.classList.remove('visible');
    }
  });

  startCamera();
}

/* ---------- ADMIN ---------- */
async function initAdmin() {
  const photosGrid = document.getElementById('photos-grid');
  const emptyState = document.getElementById('empty-state');
  const statTotal = document.getElementById('stat-total');
  const statToday = document.getElementById('stat-today');
  const btnRefresh = document.getElementById('btn-refresh-photos');

  async function loadPhotos() {
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) throw new Error('Erro ao carregar fotos');
      const photos = await res.json();

      statTotal.textContent = photos.length;
      statToday.textContent = photos.filter((p) => isToday(p.created_at)).length;

      photosGrid.innerHTML = '';

      if (photos.length === 0) {
        emptyState.classList.remove('hidden');
        photosGrid.classList.add('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      photosGrid.classList.remove('hidden');

      photos.forEach((photo) => {
        const card = document.createElement('article');
        card.className = 'photo-card';
        card.innerHTML = `
          <img class="photo-thumb" src="${photo.image_path}" alt="Foto ${photo.id}" loading="lazy">
          <div class="photo-info">
            <div class="photo-token">#${photo.id}</div>
            <div class="photo-date">${formatDate(photo.created_at)}</div>
          </div>
        `;
        photosGrid.appendChild(card);
      });
    } catch {
      statTotal.textContent = '!';
    }
  }

  btnRefresh.addEventListener('click', loadPhotos);
  loadPhotos();
}

if (page === 'home') initHome();
else if (page === 'capture') initCapture();
else if (page === 'admin') initAdmin();
