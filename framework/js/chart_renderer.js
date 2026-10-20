/**
 * Waveform Canvas Oscilloscope Renderer
 * High-performance, stable HTML5 canvas renderer with
 * biomedical grid, touch & mouse crosshair tracking, and live playhead.
 * Guaranteed fixed aspect ratio with zero layout feedback loops.
 */

export class WaveformRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.samples = [];
    this.samplingRate = 250;
    this.playheadIndex = -1;
    this.isHovering = false;
    this.hoverX = 0;
    this.hoverY = 0;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.resizePending = false;

    this.initCanvas();
    this.attachEvents();
  }

  initCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width <= 0 || height <= 0) return;

    // Guard: Only reconfigure if pixel dimensions actually changed
    if (width === this.cssWidth && height === this.cssHeight) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = width;
    this.cssHeight = height;

    // Set internal canvas pixel dimensions (NEVER modify canvas.style.width/height in JS)
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);

    // Apply scale for DPR
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  attachEvents() {
    const handleResize = () => {
      if (this.resizePending) return;
      this.resizePending = true;
      requestAnimationFrame(() => {
        this.resizePending = false;
        this.initCanvas();
      });
    };

    window.addEventListener('resize', handleResize);

    // ResizeObserver watches container resizing (device rotation, mobile browser URL bar, etc.)
    if (window.ResizeObserver && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver((entries) => {
        if (!entries || !entries[0]) return;
        const cr = entries[0].contentRect;
        const w = Math.floor(cr.width);
        const h = Math.floor(cr.height);
        if (w > 0 && h > 0 && (Math.abs(w - this.cssWidth) >= 2 || Math.abs(h - this.cssHeight) >= 2)) {
          handleResize();
        }
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }

    // Mouse Tracking
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.isHovering = true;
      this.hoverX = e.clientX - rect.left;
      this.hoverY = e.clientY - rect.top;
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.render();
    });

    // Touch Tracking for Smartphones & Tablets
    const handleTouch = (e) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.isHovering = true;
        this.hoverX = touch.clientX - rect.left;
        this.hoverY = touch.clientY - rect.top;
        this.render();
      }
    };

    this.canvas.addEventListener('touchstart', (e) => {
      handleTouch(e);
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      handleTouch(e);
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => {
      setTimeout(() => {
        this.isHovering = false;
        this.render();
      }, 1500);
    });
  }

  setData(samples, samplingRate = 250) {
    this.samples = samples || [];
    this.samplingRate = samplingRate;
    this.playheadIndex = -1;
    this.render();
  }

  setPlayhead(index) {
    this.playheadIndex = index;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.cssWidth || 800;
    const h = this.cssHeight || 280;

    // Background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, w, h);

    // Biomedical Oscilloscope Grid
    this.drawGrid(w, h);

    // Baseline (DAC 2048 = 2.5V reference for Uno R4 DAC on Pin A0)
    const midY = h - (2048 / 4095.0) * (h - 24) - 12;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!this.samples || this.samples.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ Osciloscopio en espera. Selecciona una señal o pulsa "Generar" para comenzar.', w / 2, h / 2 - 14);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('Línea punteada central: Nivel de reposo DAC A0 (1.65V / 1351)', w / 2, h / 2 + 12);
      return;
    }

    // Static Waveform Trace (Rock solid, no stretching)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const val = this.samples[i];
      // Invert Y: 4095 is top (12px margin), 0 is bottom (h - 12px margin)
      const y = h - (val / 4095.0) * (h - 24) - 12;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // reset glow

    // Playhead Cursor
    if (this.playheadIndex >= 0 && this.playheadIndex < n) {
      const phX = (this.playheadIndex / (n - 1)) * w;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Touch / Mouse Measurement Crosshair
    if (this.isHovering && n > 0) {
      const hoverFraction = Math.max(0, Math.min(1, this.hoverX / w));
      const sampleIdx = Math.round(hoverFraction * (n - 1));
      const val = this.samples[sampleIdx];
      const timeSec = (sampleIdx / this.samplingRate).toFixed(3);
      const voltage = ((val / 4095.0) * 3.3).toFixed(3);
      const valY = h - (val / 4095.0) * (h - 24) - 12;

      // Vertical line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.hoverX, 0);
      ctx.lineTo(this.hoverX, h);
      ctx.stroke();

      // Target dot
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(this.hoverX, valY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip box
      const text = `#${sampleIdx} | t=${timeSec}s | DAC: ${val} (${voltage}V)`;
      ctx.font = '11px ui-monospace, monospace';
      const textWidth = ctx.measureText(text).width;
      let boxX = this.hoverX + 10;
      if (boxX + textWidth + 16 > w) boxX = this.hoverX - textWidth - 16;
      let boxY = this.hoverY - 28;
      if (boxY < 8) boxY = this.hoverY + 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(boxX, boxY, textWidth + 14, 24, 4);
      } else {
        ctx.rect(boxX, boxY, textWidth + 14, 24);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, boxX + 7, boxY + 12);
    }
  }

  drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    const stepX = 25;
    const stepY = 25;

    ctx.beginPath();
    for (let x = 0; x < w; x += stepX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += stepY) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Major grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    const majorStepX = stepX * 4;
    const majorStepY = stepY * 4;
    ctx.beginPath();
    for (let x = 0; x < w; x += majorStepX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += majorStepY) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Voltage scale ticks
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('3.3V (2703)', 6, 4);
    ctx.textBaseline = 'middle';
    ctx.fillText('1.65V (1351)', 6, h / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0.0V (0)', 6, h - 4);
  }
}
