/**
 * PAB Campaign Landing Page - App Logic
 * Handles preloader, background shapes, modal system, and jingle player
 */

(function () {
  'use strict';

  // ========== PRELOADER ==========
  function initPreloader() {
    const preloader = document.getElementById('preloader');
    window.addEventListener('load', () => {
      setTimeout(() => {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.remove(), 600);
      }, 800);
    });
  }

  // ========== BACKGROUND SHAPES ==========
  function createBackgroundShapes() {
    const container = document.getElementById('hero-bg-shapes');
    if (!container) return;

    const shapeCount = 18;
    for (let i = 0; i < shapeCount; i++) {
      const shape = document.createElement('div');
      shape.className = 'floating-shape';
      const size = 30 + Math.random() * 100;
      shape.style.cssText = `
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        width: ${size}px;
        height: ${size}px;
        animation-delay: ${Math.random() * -20}s;
        animation-duration: ${18 + Math.random() * 22}s;
        opacity: ${0.02 + Math.random() * 0.05};
        border-radius: ${15 + Math.random() * 20}%;
      `;
      container.appendChild(shape);
    }
  }

  // ========== MODAL SYSTEM ==========
  class ModalManager {
    constructor() {
      this.activeModal = null;
      this.init();
    }

    init() {
      // Open modal via data-modal attribute
      document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const modalId = 'modal-' + e.currentTarget.dataset.modal;
          this.open(modalId);
        });
      });

      // Close modal via close button
      document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => this.close());
      });

      // Close modal via overlay click
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.close();
        });
      });

      // Close modal via Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.activeModal) {
          this.close();
        }
      });
    }

    open(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      // Close any existing modal first
      if (this.activeModal) {
        this.close();
      }

      this.activeModal = modal;
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      // Focus first focusable element
      const focusable = modal.querySelector('.modal-close');
      if (focusable) focusable.focus();
    }

    close() {
      if (!this.activeModal) return;

      this.activeModal.classList.remove('active');
      this.activeModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      this.activeModal = null;

      // Stop any playing audio
      document.querySelectorAll('audio').forEach(a => {
        a.pause();
        a.currentTime = 0;
      });
      document.querySelectorAll('.jingle-card').forEach(c => c.classList.remove('playing'));
      document.querySelectorAll('.btn-play').forEach(btn => {
        btn.querySelector('.icon-play').style.display = '';
        btn.querySelector('.icon-pause').style.display = 'none';
      });
    }
  }

  // ========== JINGLE PLAYER ==========
  class JinglePlayer {
    constructor() {
      this.currentAudio = null;
      this.currentBtn = null;
      this.init();
    }

    init() {
      document.querySelectorAll('.btn-play').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const audioId = btn.dataset.audio;
          const audio = document.getElementById(audioId);
          if (!audio) return;

          if (this.currentAudio === audio && !audio.paused) {
            this.pause(btn, audio);
          } else {
            // Pause any currently playing
            if (this.currentAudio && !this.currentAudio.paused) {
              this.pause(this.currentBtn, this.currentAudio);
            }
            this.play(btn, audio);
          }
        });
      });
    }

    play(btn, audio) {
      audio.play().catch(() => {
        console.warn('Audio playback failed - source may not be loaded');
      });
      btn.querySelector('.icon-play').style.display = 'none';
      btn.querySelector('.icon-pause').style.display = '';
      btn.closest('.jingle-card').classList.add('playing');
      this.currentAudio = audio;
      this.currentBtn = btn;

      audio.onended = () => this.pause(btn, audio);
    }

    pause(btn, audio) {
      audio.pause();
      btn.querySelector('.icon-play').style.display = '';
      btn.querySelector('.icon-pause').style.display = 'none';
      btn.closest('.jingle-card').classList.remove('playing');
    }
  }

  // ========== INITIALIZATION ==========
  function init() {
    initPreloader();
    createBackgroundShapes();
    new ModalManager();
    new JinglePlayer();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
