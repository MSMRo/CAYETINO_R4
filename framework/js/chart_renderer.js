/**
 * Waveform Canvas Oscilloscope Renderer
 * High-performance, responsive HTML5 canvas renderer with ECG/biomedical grid,
 * zoom, hover crosshairs, and live playback cursor.
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

    this.initCanvas();
    this.attachEvents();
  }

  initCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = (rect.width || 800) * dpr;
    this.canvas.height = (rect.height || 280) * dpr;
    this.ctx.scale(dpr, dpr);
    this.cssWidth = rect.width || 800;
    this.cssHeight = rect.height || 280;
    this.render();
  }

  attachEvents() {
    window.addEventListener('resize', () => {
      this.initCanvas();
    });

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
    const w = this.cssWidth;
    const h = this.cssHeight;

    // Clear background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, w, h);

    // Draw Grid Lines (Medical Oscilloscope Style)
    this.drawGrid(w, h);

    if (!this.samples || this.samples.length === 0) {
      // Empty state prompt
      ctx.fillStyle = '#64748b';
      ctx.font = '13px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin señal cargada. Selecciona una señal o genera una nueva.', w / 2, h / 2);
      return;
    }

    // Draw Baseline (2048 = midpoint for 12-bit DAC, ~2.5V)
    const midY = h - (2048 / 4095.0) * h;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Plot Waveform Trace
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      // Invert Y: 4095 is top (0), 0 is bottom (h)
      const val = this.samples[i];
      const y = h - (val / 4095.0) * (h - 20) - 10;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Draw Playhead if active
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

    // Draw Hover Crosshair and Tooltip
    if (this.isHovering && n > 0) {
      const hoverFraction = Math.max(0, Math.min(1, this.hoverX / w));
      const sampleIdx = Math.round(hoverFraction * (n - 1));
      const val = this.samples[sampleIdx];
      const timeSec = (sampleIdx / this.samplingRate).toFixed(3);
      const voltage = ((val / 4095.0) * 5.0).toFixed(3);
      const valY = h - (val / 4095.0) * (h - 20) - 10;

      // Vertical line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.hoverX, 0);
      ctx.lineTo(this.hoverX, h);
      ctx.stroke();

      // Dot on curve
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(this.hoverX, valY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip box
      const text = `#${sampleIdx} | t=${timeSec}s | DAC: ${val} (${voltage}V)`;
      ctx.font = '11px monospace';
      const textWidth = ctx.measureText(text).width;
      let boxX = this.hoverX + 10;
      if (boxX + textWidth + 16 > w) boxX = this.hoverX - textWidth - 16;
      let boxY = this.hoverY - 26;
      if (boxY < 10) boxY = this.hoverY + 16;

      ctx.fillStyle = 'rgba(18, 25, 39, 0.9)';
      ctx.strokeStyle = '#23314d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, textWidth + 12, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, boxX + 6, boxY + 11);
    }
  }

  drawGrid(w, h) {
    const ctx = this.ctx;
    // Minor grid
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

    // Voltage scale ticks on left
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('5.0V (4095)', 6, 4);
    ctx.textBaseline = 'middle';
    ctx.fillText('2.5V (2048)', 6, h / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0.0V (0)', 6, h - 4);
  }
}
