const page = document.body.dataset.page;

function showEl(el) {
  if (el) el.classList.remove('d-none');
}

function hideEl(el) {
  if (el) el.classList.add('d-none');
}

function showToast(el, message, isError = false) {
  if (!el) return;
  if (message) el.textContent = message;
  el.classList.toggle('error', isError);
  showEl(el);
}

function hideToast(el) {
  if (el) el.classList.remove('error');
  hideEl(el);
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

function setBadge(el, text, online) {
  if (!el) return;
  el.textContent = text;
  el.className = `wa-badge${online ? ' online' : ''}`;
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
    showEl(qrLoading);
    hideEl(qrImage);

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
      hideEl(qrLoading);
      showEl(qrImage);

      captureUrlEl.textContent = session.captureUrl;

      if (isOnline) {
        setBadge(networkBadge, 'Disponível na internet', true);
        qrSubtitle.textContent = 'Qualquer convidado pode escanear e enviar';
        instructionsSubtitle.textContent = 'Sem necessidade de mesma rede Wi-Fi';
        hideEl(localNetworkBox);
        openMobileLink.href = session.captureUrl;
      } else {
        setBadge(networkBadge, `Rede local · ${network.ip}`, false);
        qrSubtitle.textContent = 'Celular e computador na mesma rede Wi-Fi';
        instructionsSubtitle.textContent = 'Conexão local';
        networkUrlEl.textContent = networkCaptureUrl;
        showEl(localNetworkBox);
        openMobileLink.href = networkCaptureUrl;
      }

      showEl(openMobileLink);
      showEl(btnCopyLink);
    } catch {
      setBadge(networkBadge, 'Erro ao carregar', false);
      captureUrlEl.textContent = 'Verifique se o servidor está rodando.';
    }
  }

  btnCopyLink.addEventListener('click', async () => {
    if (!lastCaptureUrl) return;
    const ok = await copyText(lastCaptureUrl);
    btnCopyLink.textContent = ok ? 'Link copiado' : 'Não foi possível copiar';
    setTimeout(() => {
      btnCopyLink.textContent = 'Copiar link';
    }, 2000);
  });

  btnRefresh.addEventListener('click', loadSession);
  loadSession();
}

/* ---------- CAPTURE ---------- */
function fitCaptureViewport() {
  const setHeight = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
  };
  setHeight();
  window.addEventListener('resize', setHeight);
  window.visualViewport?.addEventListener('resize', setHeight);
  window.visualViewport?.addEventListener('scroll', setHeight);
}

/* ---------- CAPTURE ---------- */
async function initCapture() {
  fitCaptureViewport();

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
    showToast(toastError, 'Link inválido. Escaneie o QR Code novamente.', true);
    return;
  }

  let stream = null;
  let capturedBlob = null;

  async function checkCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      hideToast(toastCamera);
      showToast(toastError, 'Navegador sem suporte à câmera. Use Chrome ou Safari.', true);
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
    } catch (err) {
      hideToast(toastCamera);
      let msg = 'Não foi possível abrir a câmera.';
      if (err.name === 'NotAllowedError') {
        msg = 'Permissão negada. Libere a câmera nas configurações do navegador.';
      } else if (err.name === 'NotFoundError') {
        msg = 'Nenhuma câmera encontrada neste aparelho.';
      }
      showToast(toastError, msg, true);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function enterPreviewMode() {
    document.body.classList.add('preview-mode');
    hideEl(dockCamera);
    showEl(dockPreview);
    hideEl(cameraFrame);
  }

  function exitPreviewMode() {
    document.body.classList.remove('preview-mode');
    hideEl(dockPreview);
    showEl(dockCamera);
    showEl(cameraFrame);
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
        showEl(preview);
        hideEl(video);
        stopCamera();
        enterPreviewMode();
      },
      'image/jpeg',
      0.9
    );
  });

  btnRetake.addEventListener('click', () => {
    capturedBlob = null;
    hideEl(preview);
    showEl(video);
    hideToast(toastError);
    exitPreviewMode();
    startCamera();
  });

  btnUpload.addEventListener('click', async () => {
    if (!capturedBlob) {
      showToast(toastError, 'Tire uma foto antes de enviar.', true);
      return;
    }

    hideToast(toastError);
    loadingOverlay.classList.add('show');
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

      hideEl(dockPreview);
      successScreen.classList.remove('d-none');
      document.body.classList.add('upload-done');
    } catch (err) {
      showToast(toastError, err.message || 'Falha no envio. Tente de novo.', true);
      btnUpload.disabled = false;
    } finally {
      loadingOverlay.classList.remove('show');
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
  const btnDownloadZip = document.getElementById('btn-download-zip');
  const modalEl = document.getElementById('photoModal');
  const photoModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxId = document.getElementById('lightbox-id');
  const lightboxDate = document.getElementById('lightbox-date');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');
  const lightboxDownload = document.getElementById('lightbox-download');
  const photoModalLabel = document.getElementById('photoModalLabel');

  let photosList = [];
  let lightboxIndex = 0;

  function updateModalNav() {
    const photo = photosList[lightboxIndex];
    lightboxImg.src = photo.image_path;
    lightboxImg.alt = `Foto ${photo.id}`;
    photoModalLabel.textContent = `Foto ${photo.id}`;
    lightboxId.textContent = `#${photo.id}`;
    lightboxDate.textContent = formatDate(photo.created_at);
    const ext = photo.image_path.match(/\.\w+$/)?.[0] || '.jpg';
    lightboxDownload.href = photo.image_path;
    lightboxDownload.download = `foto-${String(photo.id).padStart(4, '0')}${ext}`;
    lightboxPrev.disabled = lightboxIndex === 0;
    lightboxNext.disabled = lightboxIndex === photosList.length - 1;
  }

  function openLightbox(index) {
    if (!photosList.length) return;
    lightboxIndex = index;
    updateModalNav();
    photoModal.show();
  }

  function stepLightbox(delta) {
    const next = lightboxIndex + delta;
    if (next < 0 || next >= photosList.length) return;
    lightboxIndex = next;
    updateModalNav();
  }

  lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  lightboxNext.addEventListener('click', () => stepLightbox(1));

  modalEl.addEventListener('hidden.bs.modal', () => {
    lightboxImg.src = '';
  });

  async function loadPhotos() {
    try {
      const res = await fetch('/api/photos');
      if (!res.ok) throw new Error('Erro ao carregar fotos');
      photosList = await res.json();

      statTotal.textContent = photosList.length;
      statToday.textContent = photosList.filter((p) => isToday(p.created_at)).length;

      photosGrid.innerHTML = '';
      btnDownloadZip.disabled = photosList.length === 0;

      if (photosList.length === 0) {
        showEl(emptyState);
        hideEl(photosGrid);
        return;
      }

      hideEl(emptyState);
      showEl(photosGrid);

      photosList.forEach((photo, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wa-photo-item';
        btn.innerHTML = `<img src="${photo.image_path}" alt="Foto ${photo.id}" loading="lazy">`;
        btn.addEventListener('click', () => openLightbox(index));
        photosGrid.appendChild(btn);
      });
    } catch {
      statTotal.textContent = '—';
      btnDownloadZip.disabled = true;
    }
  }

  btnDownloadZip.addEventListener('click', async () => {
    if (!photosList.length) return;

    const label = btnDownloadZip.textContent;
    btnDownloadZip.disabled = true;
    btnDownloadZip.textContent = 'Preparando download...';

    try {
      const res = await fetch('/api/photos/download');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível gerar o ZIP');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `fotos-casamento-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Erro ao baixar as fotos.');
    } finally {
      btnDownloadZip.textContent = label;
      btnDownloadZip.disabled = photosList.length === 0;
    }
  });

  btnRefresh.addEventListener('click', loadPhotos);
  loadPhotos();
}

if (page === 'home') initHome();
else if (page === 'capture') initCapture();
else if (page === 'admin') initAdmin();
