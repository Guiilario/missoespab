/**
 * PAB Campaign - Molduras (Twibbonize System)
 * Canvas-based photo frame editor with drag, zoom, and high-quality export
 */

(function () {
  'use strict';

  // ========== CONFIGURATION ==========
  // Add moldura images here. Each entry needs:
  //   - src: path to PNG with transparency
  //   - name: display name
  //   - width/height: native resolution (for high quality export)
  const MOLDURAS = [
    { src: 'assets/molduras/moldura1-eu-voto.png', name: 'Eu Voto! (Stories)', width: 576, height: 1024 },
    { src: 'assets/molduras/moldura2-meu-federal.png', name: 'O Meu Federal É', width: 1024, height: 1024 },
    { src: 'assets/molduras/moldura3-fechado.png', name: 'Tô Fechado com PAB!', width: 819, height: 1024 },
    { src: 'assets/molduras/moldura4-fechada.png', name: 'Tô Fechada com PAB!', width: 819, height: 1024 },
    { src: 'assets/molduras/moldura5-fechada-foto.png', name: 'Tô Fechada com PAB! (Foto)', width: 819, height: 1024 },
  ];

  // ========== MOLDURAS EDITOR CLASS ==========
  class MoldurasEditor {
    constructor() {
      // DOM elements
      this.canvas = document.getElementById('molduras-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.canvasContainer = document.getElementById('canvas-container');
      this.uploadOverlay = document.getElementById('upload-overlay');
      this.uploadDropzone = document.getElementById('upload-dropzone');
      this.photoInput = document.getElementById('photo-input');
      this.dragHint = document.getElementById('drag-hint');
      this.controls = document.getElementById('molduras-controls');
      this.zoomSlider = document.getElementById('zoom-slider');
      this.btnActivate = document.getElementById('btn-activate');
      this.downloadSection = document.getElementById('download-section');
      this.btnDownload = document.getElementById('btn-download-result');
      this.optionsContainer = document.getElementById('molduras-options');

      // State
      this.frame = null;          // Frame image
      this.photo = null;          // User's photo
      this.photoX = 0;            // Photo position X (in canvas coords)
      this.photoY = 0;            // Photo position Y (in canvas coords)
      this.photoScale = 1;        // Photo scale factor
      this.baseScale = 1;         // Initial fit scale
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.lastPinchDist = 0;
      this.isGenerated = false;

      // Default canvas size
      this.canvas.width = 1080;
      this.canvas.height = 1080;

      this.init();
    }

    init() {
      this.populateMolduraOptions();
      this.bindUploadEvents();
      this.bindCanvasEvents();
      this.bindControlEvents();
      this.renderPlaceholder();
    }

    // ---- Moldura Selection ----
    populateMolduraOptions() {
      if (MOLDURAS.length === 0) return; // Keep placeholder message

      // Clear placeholder
      this.optionsContainer.innerHTML = '';

      MOLDURAS.forEach((moldura, index) => {
        const option = document.createElement('div');
        option.className = 'moldura-option';
        option.dataset.index = index;
        option.innerHTML = `
          <img src="${moldura.src}" alt="${moldura.name}" loading="lazy">
          <span class="moldura-name">${moldura.name}</span>
        `;
        option.addEventListener('click', () => this.selectMoldura(index, option));
        this.optionsContainer.appendChild(option);
      });

      // Auto-select first moldura
      const firstOption = this.optionsContainer.querySelector('.moldura-option');
      if (firstOption) {
        this.selectMoldura(0, firstOption);
      }
    }

    selectMoldura(index, element) {
      // Update UI selection
      this.optionsContainer.querySelectorAll('.moldura-option').forEach(el => {
        el.classList.remove('selected');
      });
      element.classList.add('selected');

      // Load frame image
      const moldura = MOLDURAS[index];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.frame = img;
        this.canvas.width = moldura.width || img.naturalWidth;
        this.canvas.height = moldura.height || img.naturalHeight;

        if (this.photo) {
          this.fitPhotoToCanvas();
          this.render();
          this.updateActivateButton();
        } else {
          this.renderFrameOnly();
        }
      };
      img.onerror = () => {
        console.error('Failed to load moldura:', moldura.src);
      };
      img.src = moldura.src;

      // Reset generated state
      this.isGenerated = false;
      this.downloadSection.hidden = true;
    }

    // ---- Upload Events ----
    bindUploadEvents() {
      // Click to upload
      this.uploadOverlay.addEventListener('click', (e) => {
        if (e.target === this.uploadOverlay || this.uploadDropzone.contains(e.target)) {
          this.photoInput.click();
        }
      });

      // File input change
      this.photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadPhoto(file);
      });

      // Drag and drop
      this.uploadDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.uploadDropzone.classList.add('dragover');
      });

      this.uploadDropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.uploadDropzone.classList.remove('dragover');
      });

      this.uploadDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.uploadDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          this.loadPhoto(file);
        }
      });

      // Change photo button
      document.getElementById('btn-change-photo').addEventListener('click', () => {
        this.photoInput.value = '';
        this.photoInput.click();
      });
    }

    loadPhoto(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          this.photo = img;
          this.fitPhotoToCanvas();
          this.showEditor();
          this.render();
          this.updateActivateButton();

          // Reset generated state
          this.isGenerated = false;
          this.downloadSection.hidden = true;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    fitPhotoToCanvas() {
      if (!this.photo) return;

      const canvasW = this.canvas.width;
      const canvasH = this.canvas.height;
      const photoW = this.photo.naturalWidth;
      const photoH = this.photo.naturalHeight;

      // Cover mode: photo fills entire canvas
      const scaleX = canvasW / photoW;
      const scaleY = canvasH / photoH;
      this.baseScale = Math.max(scaleX, scaleY);
      this.photoScale = this.baseScale;

      // Center photo
      this.photoX = (canvasW - photoW * this.photoScale) / 2;
      this.photoY = (canvasH - photoH * this.photoScale) / 2;

      // Update zoom slider
      this.zoomSlider.value = 100;
    }

    showEditor() {
      this.uploadOverlay.classList.add('hidden');
      this.dragHint.hidden = false;
      this.controls.hidden = false;

      // Hide drag hint after 4 seconds
      setTimeout(() => {
        if (this.dragHint) {
          this.dragHint.style.opacity = '0';
          setTimeout(() => { this.dragHint.hidden = true; }, 500);
        }
      }, 4000);
    }

    // ---- Canvas Drawing ----
    renderPlaceholder() {
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.ctx.clearRect(0, 0, w, h);

      // Draw checkered background to indicate transparency
      const size = 20;
      for (let y = 0; y < h; y += size) {
        for (let x = 0; x < w; x += size) {
          this.ctx.fillStyle = ((x / size + y / size) % 2 === 0)
            ? 'rgba(255, 255, 255, 0.03)'
            : 'rgba(255, 255, 255, 0.01)';
          this.ctx.fillRect(x, y, size, size);
        }
      }

      // Center text
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.font = `bold ${Math.min(w, h) * 0.04}px Inter, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Selecione uma moldura e envie sua foto', w / 2, h / 2);
    }

    renderFrameOnly() {
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.ctx.clearRect(0, 0, w, h);

      // Background
      this.ctx.fillStyle = '#0d1b4a';
      this.ctx.fillRect(0, 0, w, h);

      // Draw frame
      if (this.frame) {
        this.ctx.drawImage(this.frame, 0, 0, w, h);
      }

      // Hint text
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.font = `bold ${Math.min(w, h) * 0.035}px Inter, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Envie sua foto', w / 2, h / 2);
    }

    render() {
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.ctx.clearRect(0, 0, w, h);

      // Draw photo (behind frame)
      if (this.photo) {
        this.ctx.drawImage(
          this.photo,
          this.photoX, this.photoY,
          this.photo.naturalWidth * this.photoScale,
          this.photo.naturalHeight * this.photoScale
        );
      }

      // Draw frame on top
      if (this.frame) {
        this.ctx.drawImage(this.frame, 0, 0, w, h);
      }
    }

    // ---- Canvas Interaction (Drag & Zoom) ----
    bindCanvasEvents() {
      // Mouse events
      this.canvas.addEventListener('mousedown', (e) => {
        if (!this.photo) return;
        e.preventDefault();
        const coords = this.getCanvasCoords(e);
        this.startDrag(coords.x, coords.y);
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        e.preventDefault();
        const coords = this.getCanvasCoords(e);
        this.drag(coords.x, coords.y);
      });

      window.addEventListener('mouseup', () => {
        this.endDrag();
      });

      // Mouse wheel zoom
      this.canvas.addEventListener('wheel', (e) => {
        if (!this.photo) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        this.zoom(delta, this.getCanvasCoords(e));
      }, { passive: false });

      // Touch events
      this.canvas.addEventListener('touchstart', (e) => {
        if (!this.photo) return;
        e.preventDefault();
        if (e.touches.length === 1) {
          const coords = this.getTouchCoords(e.touches[0]);
          this.startDrag(coords.x, coords.y);
        }
        if (e.touches.length === 2) {
          this.lastPinchDist = this.getPinchDistance(e.touches);
        }
      }, { passive: false });

      this.canvas.addEventListener('touchmove', (e) => {
        if (!this.photo) return;
        e.preventDefault();
        if (e.touches.length === 1 && this.isDragging) {
          const coords = this.getTouchCoords(e.touches[0]);
          this.drag(coords.x, coords.y);
        }
        if (e.touches.length === 2) {
          const dist = this.getPinchDistance(e.touches);
          if (this.lastPinchDist > 0) {
            const delta = (dist - this.lastPinchDist) > 0 ? 1 : -1;
            const center = this.getPinchCenter(e.touches);
            this.zoom(delta, center, 0.02);
          }
          this.lastPinchDist = dist;
        }
      }, { passive: false });

      this.canvas.addEventListener('touchend', (e) => {
        this.endDrag();
        if (e.touches.length < 2) {
          this.lastPinchDist = 0;
        }
      });
    }

    getCanvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    getTouchCoords(touch) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    }

    getPinchDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    getPinchCenter(touches) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: ((touches[0].clientX + touches[1].clientX) / 2 - rect.left) * scaleX,
        y: ((touches[0].clientY + touches[1].clientY) / 2 - rect.top) * scaleY
      };
    }

    startDrag(x, y) {
      this.isDragging = true;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.isGenerated = false;
      this.downloadSection.hidden = true;
    }

    drag(x, y) {
      if (!this.isDragging) return;

      const dx = x - this.lastMouseX;
      const dy = y - this.lastMouseY;
      this.photoX += dx;
      this.photoY += dy;
      this.lastMouseX = x;
      this.lastMouseY = y;

      this.render();
    }

    endDrag() {
      this.isDragging = false;
    }

    zoom(delta, center, factor = 0.08) {
      const oldScale = this.photoScale;
      const zoomFactor = 1 + (delta > 0 ? factor : -factor);
      this.photoScale *= zoomFactor;

      // Clamp scale (min 10% of base, max 500% of base)
      const minScale = this.baseScale * 0.1;
      const maxScale = this.baseScale * 5;
      this.photoScale = Math.max(minScale, Math.min(maxScale, this.photoScale));

      // Zoom towards the cursor/center point
      if (center) {
        const scaleRatio = this.photoScale / oldScale;
        this.photoX = center.x - (center.x - this.photoX) * scaleRatio;
        this.photoY = center.y - (center.y - this.photoY) * scaleRatio;
      }

      // Update zoom slider
      const zoomPercent = (this.photoScale / this.baseScale) * 100;
      this.zoomSlider.value = Math.round(zoomPercent);

      this.isGenerated = false;
      this.downloadSection.hidden = true;
      this.render();
    }

    // ---- Control Events ----
    bindControlEvents() {
      // Zoom slider
      this.zoomSlider.addEventListener('input', () => {
        if (!this.photo) return;
        const zoomPercent = parseInt(this.zoomSlider.value);
        const newScale = this.baseScale * (zoomPercent / 100);

        // Zoom towards center
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const scaleRatio = newScale / this.photoScale;
        this.photoX = cx - (cx - this.photoX) * scaleRatio;
        this.photoY = cy - (cy - this.photoY) * scaleRatio;
        this.photoScale = newScale;

        this.isGenerated = false;
        this.downloadSection.hidden = true;
        this.render();
      });

      // Zoom buttons
      document.getElementById('zoom-in').addEventListener('click', () => {
        if (!this.photo) return;
        const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        this.zoom(1, center, 0.15);
      });

      document.getElementById('zoom-out').addEventListener('click', () => {
        if (!this.photo) return;
        const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        this.zoom(-1, center, 0.15);
      });

      // Reset position
      document.getElementById('btn-reset').addEventListener('click', () => {
        if (!this.photo) return;
        this.fitPhotoToCanvas();
        this.isGenerated = false;
        this.downloadSection.hidden = true;
        this.render();
      });

      // Activate button
      this.btnActivate.addEventListener('click', () => {
        this.generateImage();
      });
    }

    updateActivateButton() {
      const canActivate = this.photo && this.frame;
      this.btnActivate.disabled = !canActivate;
    }

    // ---- Generate & Download ----
    generateImage() {
      if (!this.photo || !this.frame) return;

      // Re-render at full resolution (canvas is already at full res)
      this.render();

      // Convert to blob for download
      this.canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to generate image');
          return;
        }

        const url = URL.createObjectURL(blob);
        this.btnDownload.href = url;

        // Show download section
        this.downloadSection.hidden = false;
        this.isGenerated = true;

        // Scroll download section into view
        this.downloadSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Clean up old blob URLs (to prevent memory leaks)
        this.btnDownload.addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }, { once: true });

      }, 'image/png', 1.0);
    }
  }

  // ========== INITIALIZATION ==========
  function init() {
    // Only init when DOM is ready and modal elements exist
    if (document.getElementById('molduras-canvas')) {
      new MoldurasEditor();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
