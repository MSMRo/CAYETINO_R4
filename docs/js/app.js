/**
 * Cayetino R4 - Main Application Controller
 * High-performance, responsive controller supporting Web Serial, Web BLE,
 * interactive biomedical synthesis, multi-component signal mixer with live
 * sub-wave previews, and direct flash transfer across all tabs.
 */

import { WaveformRenderer } from './chart_renderer.js';
import { SignalGenerator } from './signal_generator.js';
import { Protocol } from './protocol.js';
import { SerialComm } from './serial_comm.js';
import { BleComm } from './ble_comm.js';

class App {
  constructor() {
    this.renderer = new WaveformRenderer('waveformCanvas');
    this.serial = new SerialComm();
    this.ble = new BleComm();
    this.activeComm = null; // Either this.serial or this.ble

    this.currentSignal = null;
    this.filesOnDevice = [];
    this.selectedFile = null;
    this.isPlaying = false;
    this.isUploading = false;
    this.responseWaiters = [];
    this.activeTabKey = 'tabBasic';
    this.playheadAnimId = null;
    this.capacityInfo = { usedSlots: 0, maxSlots: 8, poolUsed: 0, poolMax: 4000 };

    // Mixer state
    this.numMixComponents = 2; // 2 or 3
    this.mixOp1 = 'add'; // 'add', 'multiply', 'subtract'
    this.mixOp2 = 'add';

    this.bindDomElements();
    this.attachEventListeners();
    this.setupSliderSync();

    // Initial clean standby state (no auto-generated stretching signal)
    this.resetStatsDisplay();
    this.updateAllMiniPreviews();
  }

  bindDomElements() {
    // Header
    this.btnSerial = document.getElementById('btnConnectSerial');
    this.btnBle = document.getElementById('btnConnectBle');
    this.btnDisconnect = document.getElementById('btnDisconnect');
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');

    // Navigation Tabs
    this.tabButtons = document.querySelectorAll('.nav-tab-btn');
    this.tabPanels = {
      tabBasic: document.getElementById('panelBasic'),
      tabBiomed: document.getElementById('panelBiomed'),
      tabMixer: document.getElementById('panelMixer'),
      tabFiles: document.getElementById('panelFiles'),
      tabFlash: document.getElementById('panelFlash'),
      tabHardware: document.getElementById('panelHardware')
    };

    // Playback Controls
    this.btnPlay = document.getElementById('btnPlay');
    this.btnStop = document.getElementById('btnStop');
    this.chkLoop = document.getElementById('chkLoop');
    this.nowPlayingLabel = document.getElementById('nowPlayingLabel');

    // Tab 1: Basic
    this.basicWaveType = document.getElementById('basicWaveType');
    this.basicFreq = document.getElementById('basicFreq');
    this.basicFreqNum = document.getElementById('basicFreqNum');
    this.lblBasicFreq = document.getElementById('lblBasicFreq');
    this.basicVpp = document.getElementById('basicVpp');
    this.basicVppNum = document.getElementById('basicVppNum');
    this.lblBasicVpp = document.getElementById('lblBasicVpp');
    this.basicOffset = document.getElementById('basicOffset');
    this.basicOffsetNum = document.getElementById('basicOffsetNum');
    this.lblBasicOffset = document.getElementById('lblBasicOffset');
    this.basicDuty = document.getElementById('basicDuty');
    this.basicDutyNum = document.getElementById('basicDutyNum');
    this.lblBasicDuty = document.getElementById('lblBasicDuty');
    this.grpDutyCycle = document.getElementById('grpDutyCycle');
    this.basicPhase = document.getElementById('basicPhase');
    this.basicPhaseNum = document.getElementById('basicPhaseNum');
    this.lblBasicPhase = document.getElementById('lblBasicPhase');
    this.basicFs = document.getElementById('basicFs');
    this.basicDuration = document.getElementById('basicDuration');
    this.nameBasic = document.getElementById('nameBasic');
    this.btnGenerateBasic = document.getElementById('btnGenerateBasic');
    this.btnDownloadBasicCsv = document.getElementById('btnDownloadBasicCsv');
    this.btnSaveBasicToArduino = document.getElementById('btnSaveBasicToArduino');

    // Tab 2: Biomed
    this.biomedType = document.getElementById('biomedType');
    this.grpBiomedBpm = document.getElementById('grpBiomedBpm');
    this.lblBiomedRateTitle = document.getElementById('lblBiomedRateTitle');
    this.biomedBpm = document.getElementById('biomedBpm');
    this.biomedBpmNum = document.getElementById('biomedBpmNum');
    this.lblBiomedBpm = document.getElementById('lblBiomedBpm');
    this.biomedVpp = document.getElementById('biomedVpp');
    this.biomedVppNum = document.getElementById('biomedVppNum');
    this.lblBiomedVpp = document.getElementById('lblBiomedVpp');
    this.biomedOffset = document.getElementById('biomedOffset');
    this.biomedOffsetNum = document.getElementById('biomedOffsetNum');
    this.lblBiomedOffset = document.getElementById('lblBiomedOffset');
    this.biomedFs = document.getElementById('biomedFs');
    this.biomedDuration = document.getElementById('biomedDuration');
    this.nameBiomed = document.getElementById('nameBiomed');
    this.btnGenerateBiomed = document.getElementById('btnGenerateBiomed');
    this.btnDownloadBiomedCsv = document.getElementById('btnDownloadBiomedCsv');
    this.btnSaveBiomedToArduino = document.getElementById('btnSaveBiomedToArduino');

    // Tab 3: Mixer
    this.btnMixMode2 = document.getElementById('btnMixMode2');
    this.btnMixMode3 = document.getElementById('btnMixMode3');
    this.mixTypeA = document.getElementById('mixTypeA');
    this.mixFreqA = document.getElementById('mixFreqA');
    this.mixAmpA = document.getElementById('mixAmpA');
    this.canvasComp1 = document.getElementById('canvasPreviewComp1');

    this.op1Buttons = document.querySelectorAll('[data-op1]');
    this.mixTypeB = document.getElementById('mixTypeB');
    this.mixFreqB = document.getElementById('mixFreqB');
    this.mixAmpB = document.getElementById('mixAmpB');
    this.canvasComp2 = document.getElementById('canvasPreviewComp2');

    this.wrapOp2 = document.getElementById('wrapOp2');
    this.op2Buttons = document.querySelectorAll('[data-op2]');
    this.wrapComp3 = document.getElementById('wrapComp3');
    this.mixTypeC = document.getElementById('mixTypeC');
    this.mixFreqC = document.getElementById('mixFreqC');
    this.mixAmpC = document.getElementById('mixAmpC');
    this.canvasComp3 = document.getElementById('canvasPreviewComp3');

    this.mixMasterGain = document.getElementById('mixMasterGain');
    this.mixMasterOffset = document.getElementById('mixMasterOffset');
    this.mixFs = document.getElementById('mixFs');
    this.mixDuration = document.getElementById('mixDuration');
    this.nameMix = document.getElementById('nameMix');
    this.btnGenerateMix = document.getElementById('btnGenerateMix');
    this.btnDownloadMixCsv = document.getElementById('btnDownloadMixCsv');
    this.btnSaveMixToArduino = document.getElementById('btnSaveMixToArduino');

    // Tab 4: Files
    this.sampleFiles = document.getElementById('sampleFiles');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.nameFile = document.getElementById('nameFile');
    this.btnDownloadFileCsv = document.getElementById('btnDownloadFileCsv');
    this.btnSaveFileToArduino = document.getElementById('btnSaveFileToArduino');

    // Tab 5: Flash Storage
    this.uploadFilename = document.getElementById('uploadFilename');
    this.btnUpload = document.getElementById('btnUpload');
    this.uploadProgressContainer = document.getElementById('uploadProgressContainer');
    this.uploadProgressBar = document.getElementById('uploadProgressBar');
    this.btnRefreshFiles = document.getElementById('btnRefreshFiles');
    this.btnClearAllFlash = document.getElementById('btnClearAllFlash');
    this.flashSlotCount = document.getElementById('flashSlotCount');
    this.flashSlotBadge = document.getElementById('flashSlotBadge');
    this.flashSlotProgressBar = document.getElementById('flashSlotProgressBar');
    this.flashSlotHint = document.getElementById('flashSlotHint');
    this.fileTableBody = document.getElementById('fileTableBody');

    // Oscilloscope Stats
    this.statName = document.getElementById('statName');
    this.statSamples = document.getElementById('statSamples');
    this.statDuration = document.getElementById('statDuration');
    this.statFs = document.getElementById('statFs');
    this.statVpp = document.getElementById('statVpp');

    // Terminal
    this.terminal = document.getElementById('terminalOutput');
    this.btnClearLogs = document.getElementById('btnClearLogs');
  }

  setupSliderSync() {
    const bindSync = (slider, numInput, label, unit = '', decimals = 1) => {
      const update = (val) => {
        const num = parseFloat(val);
        slider.value = num;
        numInput.value = num;
        if (label) {
          label.textContent = `${num.toFixed(decimals)} ${unit}`.trim();
        }
      };

      slider.addEventListener('input', (e) => update(e.target.value));
      numInput.addEventListener('input', (e) => update(e.target.value));
    };

    // Basic Sliders
    bindSync(this.basicFreq, this.basicFreqNum, this.lblBasicFreq, 'Hz', 1);
    bindSync(this.basicVpp, this.basicVppNum, this.lblBasicVpp, 'V', 1);
    bindSync(this.basicOffset, this.basicOffsetNum, this.lblBasicOffset, 'V', 1);
    bindSync(this.basicDuty, this.basicDutyNum, this.lblBasicDuty, '%', 0);
    bindSync(this.basicPhase, this.basicPhaseNum, this.lblBasicPhase, '°', 0);

    // Biomed Sliders
    bindSync(this.biomedBpm, this.biomedBpmNum, this.lblBiomedBpm, 'BPM', 0);
    bindSync(this.biomedVpp, this.biomedVppNum, this.lblBiomedVpp, 'V', 1);
    bindSync(this.biomedOffset, this.biomedOffsetNum, this.lblBiomedOffset, 'V', 1);
  }

  attachEventListeners() {
    // Connection Buttons
    this.btnSerial.addEventListener('click', () => this.connectSerial());
    this.btnBle.addEventListener('click', () => this.connectBle());
    this.btnDisconnect.addEventListener('click', () => this.disconnect());

    this.serial.onLineReceived = (line) => this.handleDeviceResponse(line);
    this.serial.onStatusChange = (conn, desc) => this.updateConnectionUI(conn, desc, 'serial');

    this.ble.onLineReceived = (line) => this.handleDeviceResponse(line);
    this.ble.onStatusChange = (conn, desc) => this.updateConnectionUI(conn, desc, 'ble');

    // Tab Switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Basic Controls
    this.basicWaveType.addEventListener('change', () => {
      this.grpDutyCycle.style.display = (this.basicWaveType.value === 'square') ? 'block' : 'none';
    });

    this.btnGenerateBasic.addEventListener('click', () => this.generateActiveSignal('basic'));
    this.btnDownloadBasicCsv.addEventListener('click', () => this.downloadCurrentCsv());
    this.btnSaveBasicToArduino.addEventListener('click', () => {
      const name = this.nameBasic ? this.nameBasic.value : null;
      this.uploadSignalToDevice(name);
    });

    // Biomed Controls
    this.biomedType.addEventListener('change', () => {
      const type = this.biomedType.value;
      if (type.startsWith('eeg')) {
        this.grpBiomedBpm.style.display = 'none';
      } else {
        this.grpBiomedBpm.style.display = 'block';
        if (type === 'rsp') {
          this.lblBiomedRateTitle.textContent = 'Frecuencia Respiratoria';
          this.lblBiomedBpm.textContent = `${this.biomedBpm.value} RPM`;
        } else {
          this.lblBiomedRateTitle.textContent = 'Frecuencia Cardíaca';
          this.lblBiomedBpm.textContent = `${this.biomedBpm.value} BPM`;
        }
      }
    });

    this.btnGenerateBiomed.addEventListener('click', () => this.generateActiveSignal('biomed'));
    this.btnDownloadBiomedCsv.addEventListener('click', () => this.downloadCurrentCsv());
    this.btnSaveBiomedToArduino.addEventListener('click', () => {
      const name = this.nameBiomed ? this.nameBiomed.value : null;
      this.uploadSignalToDevice(name);
    });

    // Mixer Component Count Toggle (2 or 3 components)
    this.btnMixMode2.addEventListener('click', () => {
      this.numMixComponents = 2;
      this.btnMixMode2.classList.add('active');
      this.btnMixMode3.classList.remove('active');
      this.wrapOp2.style.display = 'none';
      this.wrapComp3.style.display = 'none';
    });

    this.btnMixMode3.addEventListener('click', () => {
      this.numMixComponents = 3;
      this.btnMixMode3.classList.add('active');
      this.btnMixMode2.classList.remove('active');
      this.wrapOp2.style.display = 'flex';
      this.wrapComp3.style.display = 'block';
      this.updateMiniPreview(3);
    });

    // Mixer Operator 1 buttons
    this.op1Buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.op1Buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mixOp1 = btn.getAttribute('data-op1');
      });
    });

    // Mixer Operator 2 buttons
    this.op2Buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.op2Buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mixOp2 = btn.getAttribute('data-op2');
      });
    });

    // Live update for mini-canvases when changing mixer parameters
    [this.mixTypeA, this.mixFreqA, this.mixAmpA].forEach(el => {
      el.addEventListener('input', () => this.updateMiniPreview(1));
    });

    [this.mixTypeB, this.mixFreqB, this.mixAmpB].forEach(el => {
      el.addEventListener('input', () => this.updateMiniPreview(2));
    });

    [this.mixTypeC, this.mixFreqC, this.mixAmpC].forEach(el => {
      el.addEventListener('input', () => this.updateMiniPreview(3));
    });

    this.btnGenerateMix.addEventListener('click', () => this.generateActiveSignal('mixer'));
    this.btnDownloadMixCsv.addEventListener('click', () => this.downloadCurrentCsv());
    this.btnSaveMixToArduino.addEventListener('click', () => {
      const name = this.nameMix ? this.nameMix.value : null;
      this.uploadSignalToDevice(name);
    });

    // File Drag & Drop & Upload
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e.target.files[0]));

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFileSelection(e.dataTransfer.files[0]);
      }
    });

    if (this.sampleFiles) {
      this.sampleFiles.addEventListener('change', () => {
        const val = this.sampleFiles.value;
        if (val) this.loadSampleFile(val);
      });
    }

    this.btnDownloadFileCsv.addEventListener('click', () => this.downloadCurrentCsv());
    this.btnSaveFileToArduino.addEventListener('click', () => {
      const name = this.nameFile ? this.nameFile.value : null;
      this.uploadSignalToDevice(name);
    });

    // Flash Storage Tab Controls
    this.btnUpload.addEventListener('click', () => {
      const name = this.uploadFilename ? this.uploadFilename.value : null;
      this.uploadSignalToDevice(name);
    });
    this.btnRefreshFiles.addEventListener('click', () => this.requestFileList());
    if (this.btnClearAllFlash) {
      this.btnClearAllFlash.addEventListener('click', () => {
        if (!this.activeComm || !this.activeComm.isConnected) {
          alert('Debes conectarte al Arduino para realizar esta acción.');
          return;
        }
        if (confirm('¿Estás seguro de que deseas borrar TODAS las señales personalizadas guardadas en la memoria Flash del Arduino?')) {
          this.log('Solicitando borrar todas las señales en Flash...', 'info');
          this.sendToDevice('DELETE ALL\n');
        }
      });
    }
    this.btnPlay.addEventListener('click', () => this.handlePlayClick());
    this.btnStop.addEventListener('click', () => this.stopPlayback());

    if (this.btnClearLogs) {
      this.btnClearLogs.addEventListener('click', () => {
        this.terminal.innerHTML = '';
      });
    }
  }

  switchTab(targetTab) {
    this.activeTabKey = targetTab;
    this.tabButtons.forEach(b => {
      if (b.getAttribute('data-tab') === targetTab) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    Object.keys(this.tabPanels).forEach(key => {
      if (key === targetTab) {
        this.tabPanels[key].style.display = 'block';
      } else {
        this.tabPanels[key].style.display = 'none';
      }
    });

    if (targetTab === 'tabMixer') {
      this.updateAllMiniPreviews();
    }
  }

  // ==========================================================================
  // MINI WAVEFORM PREVIEWS FOR MIXER COMPONENTS
  // ==========================================================================
  updateAllMiniPreviews() {
    this.updateMiniPreview(1);
    this.updateMiniPreview(2);
    this.updateMiniPreview(3);
  }

  updateMiniPreview(compNum) {
    let canvas, type, freq, amp;
    let color = '#38bdf8';

    if (compNum === 1) {
      canvas = this.canvasComp1;
      type = this.mixTypeA.value;
      freq = parseFloat(this.mixFreqA.value) || 1.0;
      amp = parseFloat(this.mixAmpA.value) || 2.0;
      color = '#38bdf8'; // Cyan
    } else if (compNum === 2) {
      canvas = this.canvasComp2;
      type = this.mixTypeB.value;
      freq = parseFloat(this.mixFreqB.value) || 60.0;
      amp = parseFloat(this.mixAmpB.value) || 0.6;
      color = '#34d399'; // Emerald
    } else if (compNum === 3) {
      canvas = this.canvasComp3;
      type = this.mixTypeC.value;
      freq = parseFloat(this.mixFreqC.value) || 0.25;
      amp = parseFloat(this.mixAmpC.value) || 0.4;
      color = '#fbbf24'; // Amber
    }

    if (!canvas) return;

    const points = SignalGenerator.generateMiniPreview(type, freq, amp, 0, 100);
    this.renderMiniCanvas(canvas, points, color);
  }

  renderMiniCanvas(canvas, points, strokeColor) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 65;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dark background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);

    // Center dotted line
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!points || points.length === 0) return;

    // Draw component waveform
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();

    const n = points.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      // Invert Y: normalized value in [-1, 1]
      const y = h / 2 - (points[i] * (h / 2 - 6));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ==========================================================================
  // SIGNAL SYNTHESIS & GENERATION
  // ==========================================================================
  generateActiveSignal(category = 'basic') {
    let sig = null;

    if (category === 'basic') {
      const type = this.basicWaveType.value;
      const freq = parseFloat(this.basicFreq.value) || 2.0;
      const vpp = parseFloat(this.basicVpp.value) || 4.0;
      const offset = parseFloat(this.basicOffset.value) || 2.5;
      const duty = parseInt(this.basicDuty.value, 10) || 50;
      const phase = parseInt(this.basicPhase.value, 10) || 0;
      const fs = parseInt(this.basicFs.value, 10) || 250;
      const dur = parseFloat(this.basicDuration.value) || 4.0;

      switch (type) {
        case 'sine':
          sig = SignalGenerator.generateSine(dur, fs, freq, vpp, offset, phase);
          break;
        case 'square':
          sig = SignalGenerator.generateSquare(dur, fs, freq, duty, vpp, offset);
          break;
        case 'triangle':
          sig = SignalGenerator.generateTriangle(dur, fs, freq, vpp, offset);
          break;
        case 'sawtooth':
          sig = SignalGenerator.generateSawtooth(dur, fs, freq, vpp, offset);
          break;
        case 'invsaw':
          sig = SignalGenerator.generateInvertedSawtooth(dur, fs, freq, vpp, offset);
          break;
        default:
          sig = SignalGenerator.generateTriangle(dur, fs, freq, vpp, offset);
      }
    } else if (category === 'biomed') {
      const type = this.biomedType.value;
      const bpm = parseInt(this.biomedBpm.value, 10) || 72;
      const vpp = parseFloat(this.biomedVpp.value) || 3.3;
      const offset = parseFloat(this.biomedOffset.value) || 2.5;
      const fs = parseInt(this.biomedFs.value, 10) || 250;
      const dur = parseFloat(this.biomedDuration.value) || 4.0;

      switch (type) {
        case 'ecg':
          sig = SignalGenerator.generateECG(dur, fs, bpm, vpp, offset);
          break;
        case 'arrhythmia':
          sig = SignalGenerator.generateArrhythmia(dur, fs, bpm, vpp, offset);
          break;
        case 'emg':
          sig = SignalGenerator.generateEMG(dur, fs, vpp, offset);
          break;
        case 'eeg_alpha':
          sig = SignalGenerator.generateEEG(dur, fs, 'alpha', vpp, offset);
          break;
        case 'eeg_beta':
          sig = SignalGenerator.generateEEG(dur, fs, 'beta', vpp, offset);
          break;
        case 'eeg_theta':
          sig = SignalGenerator.generateEEG(dur, fs, 'theta', vpp, offset);
          break;
        case 'eeg_delta':
          sig = SignalGenerator.generateEEG(dur, fs, 'delta', vpp, offset);
          break;
        case 'rsp':
          sig = SignalGenerator.generateRespiration(dur, fs, bpm, vpp, offset);
          break;
        case 'ppg':
          sig = SignalGenerator.generatePPG(dur, fs, bpm, vpp, offset);
          break;
        default:
          sig = SignalGenerator.generateECG(dur, fs, bpm, vpp, offset);
      }
    } else if (category === 'mixer') {
      const typeA = this.mixTypeA.value;
      const freqA = parseFloat(this.mixFreqA.value) || 1.0;
      const ampA = parseFloat(this.mixAmpA.value) || 2.0;

      const typeB = this.mixTypeB.value;
      const freqB = parseFloat(this.mixFreqB.value) || 60.0;
      const ampB = parseFloat(this.mixAmpB.value) || 0.6;

      const typeC = this.mixTypeC.value;
      const freqC = parseFloat(this.mixFreqC.value) || 0.25;
      const ampC = parseFloat(this.mixAmpC.value) || 0.4;

      const masterGain = parseFloat(this.mixMasterGain.value) || 1.0;
      const masterOffset = parseFloat(this.mixMasterOffset.value) || 2.5;
      const fs = parseInt(this.mixFs.value, 10) || 250;
      const dur = parseFloat(this.mixDuration.value) || 4.0;

      sig = SignalGenerator.mixSignals({
        duration: dur,
        samplingRate: fs,
        numComponents: this.numMixComponents,
        typeA,
        freqA,
        ampA,
        op1: this.mixOp1,
        typeB,
        freqB,
        ampB,
        op2: this.mixOp2,
        typeC,
        freqC,
        ampC,
        masterGain,
        masterOffset
      });
    }

    if (sig) {
      this.setLoadedSignal(sig);
      this.log(`Señal sintetizada: ${sig.name} (${sig.samples.length} pts @ ${sig.samplingRate} Hz)`, 'info');
    }
  }

  resetStatsDisplay() {
    this.currentSignal = null;
    this.renderer.setData([], 250);
    this.statName.textContent = '--';
    this.statSamples.textContent = '0';
    this.statDuration.textContent = '0.00s';
    this.statFs.textContent = '250 Hz';
    this.statVpp.textContent = '0.00 V';
    if (this.uploadFilename) this.uploadFilename.value = '';
    if (this.nameBasic) this.nameBasic.value = 'BASIC_01.CSV';
    if (this.nameBiomed) this.nameBiomed.value = 'BIOMED_01.CSV';
    if (this.nameMix) this.nameMix.value = 'MIX_01.CSV';
    if (this.nameFile) this.nameFile.value = 'FILE_01.CSV';
    this.updateRecordButtonsState();
  }

  setLoadedSignal(signalData) {
    this.currentSignal = signalData;
    this.renderer.setData(signalData.samples, signalData.samplingRate);

    // Update stats UI
    this.statName.textContent = signalData.name;
    this.statSamples.textContent = signalData.samples.length;
    this.statDuration.textContent = `${signalData.duration.toFixed(2)}s`;
    this.statFs.textContent = `${signalData.samplingRate} Hz`;

    const min = Math.min(...signalData.samples);
    const max = Math.max(...signalData.samples);
    const vpp = (((max - min) / 4095.0) * 3.3).toFixed(2);
    this.statVpp.textContent = `${vpp} V`;

    // Preset flash filename across all tabs
    const cleanBaseName = signalData.name.replace(/[^A-Za-z0-9_]/g, '_').substring(0, 12).toUpperCase();
    const defaultCsv = `${cleanBaseName}.CSV`;
    if (this.uploadFilename) this.uploadFilename.value = defaultCsv;
    if (this.nameBasic) this.nameBasic.value = defaultCsv;
    if (this.nameBiomed) this.nameBiomed.value = defaultCsv;
    if (this.nameMix) this.nameMix.value = defaultCsv;
    if (this.nameFile) this.nameFile.value = defaultCsv;
    this.updateRecordButtonsState();
  }

  updateRecordButtonsState() {
    const isConn = this.activeComm && this.activeComm.isConnected;
    const hasSig = !!this.currentSignal;
    const canSave = isConn && hasSig;

    // Flash Save buttons across all tabs
    if (this.btnSaveBasicToArduino) this.btnSaveBasicToArduino.disabled = !canSave;
    if (this.btnSaveBiomedToArduino) this.btnSaveBiomedToArduino.disabled = !canSave;
    if (this.btnSaveMixToArduino) this.btnSaveMixToArduino.disabled = !canSave;
    if (this.btnSaveFileToArduino) this.btnSaveFileToArduino.disabled = !canSave;
    if (this.btnUpload) this.btnUpload.disabled = !canSave;

    // CSV Download buttons
    if (this.btnDownloadBasicCsv) this.btnDownloadBasicCsv.disabled = !hasSig;
    if (this.btnDownloadBiomedCsv) this.btnDownloadBiomedCsv.disabled = !hasSig;
    if (this.btnDownloadMixCsv) this.btnDownloadMixCsv.disabled = !hasSig;
    if (this.btnDownloadFileCsv) this.btnDownloadFileCsv.disabled = !hasSig;
  }

  async loadSampleFile(filename) {
    try {
      this.log(`Cargando archivo de muestra: ${filename}...`, 'info');
      const resp = await fetch(`./sample_signals/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const signalData = SignalGenerator.parseFileContent(text, filename);
      this.setLoadedSignal(signalData);
      this.log(`Muestra cargada: ${signalData.name} (${signalData.samples.length} pts)`, 'success');
    } catch (err) {
      this.log(`Error al cargar muestra: ${err.message}`, 'error');
    }
  }

  async handleFileSelection(file) {
    if (!file) return;
    try {
      this.log(`Leyendo archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`, 'info');
      const text = await file.text();
      const signalData = SignalGenerator.parseFileContent(text, file.name);
      this.setLoadedSignal(signalData);
      this.log(`Archivo importado: ${signalData.name} (${signalData.samples.length} pts)`, 'success');
    } catch (err) {
      this.log(`Error al procesar archivo: ${err.message}`, 'error');
      alert(`Error al procesar archivo: ${err.message}`);
    }
  }

  downloadCurrentCsv() {
    if (!this.currentSignal) return;
    const csv = SignalGenerator.exportToCSV(this.currentSignal);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentSignal.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.log(`Descargado archivo local: ${this.currentSignal.name}.csv`, 'info');
  }

  // ==========================================================================
  // HARDWARE CONNECTION & PROTOCOL
  // ==========================================================================
  async connectSerial() {
    try {
      await this.serial.connect(115200);
      this.activeComm = this.serial;
      this.onConnected();
    } catch (err) {
      this.log(`Fallo al conectar Web Serial: ${err.message}`, 'error');
    }
  }

  async connectBle() {
    try {
      await this.ble.connect();
      this.activeComm = this.ble;
      this.onConnected();
    } catch (err) {
      this.log(`Fallo al conectar Web BLE: ${err.message}`, 'error');
    }
  }

  disconnect() {
    if (this.activeComm) {
      this.activeComm.disconnect();
      this.activeComm = null;
    }
    this.updateConnectionUI(false, 'Desconectado');
  }

  onConnected() {
    this.btnDisconnect.disabled = false;
    this.btnSerial.disabled = true;
    this.btnBle.disabled = true;
    this.btnRefreshFiles.disabled = false;
    this.btnPlay.disabled = false;
    this.btnStop.disabled = false;
    this.updateRecordButtonsState();

    // Send PING and request files list
    setTimeout(() => {
      this.sendToDevice('PING\n');
      this.requestFileList();
    }, 400);
  }

  updateConnectionUI(connected, desc, type) {
    if (connected) {
      this.statusDot.className = 'status-dot connected';
      this.statusText.textContent = desc;
      this.log(`Conexión establecida vía ${desc}`, 'success');
    } else {
      this.statusDot.className = 'status-dot';
      this.statusText.textContent = 'Desconectado';
      this.btnDisconnect.disabled = true;
      this.btnSerial.disabled = false;
      this.btnBle.disabled = false;
      this.btnRefreshFiles.disabled = true;
      this.btnPlay.disabled = true;
      this.btnStop.disabled = true;
      this.activeComm = null;
      this.log('Dispositivo desconectado.', 'info');
    }
    this.updateRecordButtonsState();
  }

  async sendToDevice(cmd) {
    if (!this.activeComm || !this.activeComm.isConnected) {
      this.log('Error: Sin enlace activo con Arduino.', 'error');
      return;
    }
    this.log(`TX: ${cmd.trim()}`, 'tx');
    await this.activeComm.send(cmd);
  }

  waitForResponse(successPredicate, errorPredicate, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const handler = (line) => {
        if (errorPredicate && errorPredicate(line)) {
          cleanup();
          reject(new Error(line));
        } else if (successPredicate(line)) {
          cleanup();
          resolve(line);
        }
      };

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        const idx = this.responseWaiters.indexOf(handler);
        if (idx !== -1) this.responseWaiters.splice(idx, 1);
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Tiempo agotado (${timeoutMs} ms) esperando respuesta del Arduino.`));
      }, timeoutMs);

      this.responseWaiters.push(handler);
    });
  }

  // ==========================================================================
  // FLASH TRANSFER WITH STRICT SAMPLE CAPACITY CHECK & FLOW CONTROL
  // ==========================================================================
  async uploadSignalToDevice(customFilename = null) {
    if (!this.currentSignal) {
      alert('Primero debes generar o cargar una señal antes de grabar en Arduino.');
      return;
    }

    if (!this.activeComm || !this.activeComm.isConnected) {
      alert('Debes conectarte al Arduino (por Web Serial o Web Bluetooth) para poder grabar.');
      return;
    }

    if (this.isUploading) return;

    // Capacity check for Arduino Uno R4 (MAX 1500 samples per file in pool)
    const MAX_SAMPLES_ALLOWED = 1500;
    if (this.currentSignal.samples.length > MAX_SAMPLES_ALLOWED) {
      const msg = `La señal actual tiene ${this.currentSignal.samples.length} muestras, lo que supera el límite por archivo del Arduino Uno R4 (máx. ${MAX_SAMPLES_ALLOWED} muestras por archivo).\n\nPor favor reduce la duración (ej. a 2 - 4 seg) o la frecuencia Fs (ej. 250 Hz) para poder grabarla en memoria Flash.`;
      alert(msg);
      this.log(`Error: ${msg}`, 'error');
      return;
    }

    let rawName = (customFilename || (this.uploadFilename ? this.uploadFilename.value : '') || '').trim();
    if (!rawName) {
      rawName = this.currentSignal.name;
    }
    // Clean filename: alphanumeric and underscore only, uppercase, ends with .CSV, max 16 chars
    let clean = rawName.toUpperCase().replace(/[^A-Z0-9_.]/g, '_');
    if (clean.endsWith('.CSV')) {
      clean = clean.slice(0, -4);
    }
    clean = clean.replace(/\./g, '_');
    if (clean.length > 12) {
      clean = clean.substring(0, 12);
    }
    if (!clean) clean = 'SIGNAL_01';
    const filename = `${clean}.CSV`;

    // Sync all filename input fields with the resolved filename
    if (this.uploadFilename) this.uploadFilename.value = filename;
    if (this.nameBasic) this.nameBasic.value = filename;
    if (this.nameBiomed) this.nameBiomed.value = filename;
    if (this.nameMix) this.nameMix.value = filename;
    if (this.nameFile) this.nameFile.value = filename;

    const packets = Protocol.createUploadPackets(
      filename,
      this.currentSignal.samplingRate,
      this.currentSignal.samples,
      10 // 10 samples per packet fits reliably within single BLE MTU and Serial buffers (<55 bytes)
    );

    const initPacket = packets[0]; // WRITE <cleanName> <fs> <count>\n
    const dataPackets = packets.slice(1, -1); // D seq ...
    const commitPacket = packets[packets.length - 1]; // COMMIT\n

    this.isUploading = true;
    this.updateRecordButtonsState();
    this.uploadProgressContainer.style.display = 'block';
    this.uploadProgressBar.style.width = '2%';

    this.log(`Iniciando grabación de ${filename} (${this.currentSignal.samples.length} muestras, ${dataPackets.length} paquetes)...`, 'info');

    let streamError = null;
    const streamErrorHandler = (line) => {
      if (line.includes('ERR')) {
        streamError = line;
      }
    };

    try {
      // 1. Handshake inicial: Enviar WRITE y esperar OK READY
      this.log(`TX: ${initPacket.command.trim()}`, 'tx');
      const writePromise = this.waitForResponse(
        (line) => line.includes('OK READY'),
        (line) => line.includes('ERR'),
        4000
      );
      await this.activeComm.send(initPacket.command);
      await writePromise;
      this.log(`Arduino listo para recibir datos (OK READY). Transmitiendo muestras...`, 'success');

      // 2. Transmisión de paquetes de muestras (D seq ...)
      this.responseWaiters.push(streamErrorHandler);
      const isBle = (this.activeComm === this.ble);
      const pacingMs = isBle ? 35 : 20;

      for (let i = 0; i < dataPackets.length; i++) {
        if (streamError) {
          throw new Error(`Arduino rechazó un paquete: ${streamError}`);
        }

        const pkt = dataPackets[i];
        await this.activeComm.send(pkt.command);

        const pct = Math.round(5 + ((i + 1) / dataPackets.length) * 85);
        this.uploadProgressBar.style.width = `${pct}%`;

        await new Promise(r => setTimeout(r, pacingMs));
      }

      // Desenganchar listener de errores de datos
      const errIdx = this.responseWaiters.indexOf(streamErrorHandler);
      if (errIdx !== -1) this.responseWaiters.splice(errIdx, 1);

      if (streamError) {
        throw new Error(`Error durante la transmisión: ${streamError}`);
      }

      // 3. Handshake final: Enviar COMMIT y esperar OK SAVED
      this.uploadProgressBar.style.width = '95%';
      this.log(`TX: COMMIT`, 'tx');
      const commitPromise = this.waitForResponse(
        (line) => line.includes('OK SAVED'),
        (line) => line.includes('ERR'),
        4000
      );
      await this.activeComm.send(commitPacket.command);
      await commitPromise;

      this.uploadProgressBar.style.width = '100%';
      this.selectedFile = filename;
      this.nowPlayingLabel.innerHTML = `<span>💾 Grabado y Listo: <strong>${filename}</strong> (Pulsa ▶ Reproducir para iniciar salida DAC A0)</span>`;
      this.nowPlayingLabel.classList.add('active');
      this.btnPlay.disabled = false;
      this.btnStop.disabled = false;
      this.log(`¡Éxito! Archivo ${filename} grabado exitosamente en memoria del Arduino Uno R4.`, 'success');
      alert(`¡Archivo ${filename} grabado exitosamente en el Arduino Uno R4!\n\nPuedes pulsar 'Reproducir (Play)' en cualquier pestaña para iniciar la salida analógica DAC A0.`);

    } catch (err) {
      this.log(`Error al grabar en Arduino: ${err.message}`, 'error');
      alert(`Error al grabar en Arduino:\n${err.message}`);
    } finally {
      // Limpiar handler en caso de salida por excepción
      const errIdx = this.responseWaiters.indexOf(streamErrorHandler);
      if (errIdx !== -1) this.responseWaiters.splice(errIdx, 1);

      this.isUploading = false;
      this.updateRecordButtonsState();
      setTimeout(() => {
        this.uploadProgressContainer.style.display = 'none';
        this.uploadProgressBar.style.width = '0%';
        this.requestFileList();
      }, 1200);
    }
  }

  requestFileList() {
    this.sendToDevice(Protocol.createListCommand());
  }

  handlePlayClick() {
    if (this.activeTabKey === 'tabFlash') {
      this.playSelectedFile();
    } else {
      this.playLivePreview();
    }
  }

  async playLivePreview() {
    if (!this.activeComm || !this.activeComm.isConnected) {
      alert('Debes conectarte al Arduino Uno R4 (por Web Serial o Web Bluetooth) para reproducir en vivo por DAC A0.');
      return;
    }

    // Auto-generate if signal is missing but user is on a generator tab
    if (!this.currentSignal) {
      if (this.activeTabKey === 'tabBasic') {
        this.generateActiveSignal('basic');
      } else if (this.activeTabKey === 'tabBiomed') {
        this.generateActiveSignal('biomed');
      } else if (this.activeTabKey === 'tabMixer') {
        this.generateActiveSignal('mixer');
      }
    }

    if (!this.currentSignal || !this.currentSignal.samples || this.currentSignal.samples.length === 0) {
      alert('Primero genera o carga una señal en esta pestaña para reproducirla en vivo.');
      return;
    }

    if (this.isUploading) return;

    // Buffer limit in Arduino RAM preview buffer (MAX_PREVIEW_SAMPLES = 1000)
    const MAX_PREVIEW = 1000;
    let samples = this.currentSignal.samples;
    if (samples.length > MAX_PREVIEW) {
      this.log(`Aviso: La señal tiene ${samples.length} muestras. El búfer de reproducción en RAM admite hasta ${MAX_PREVIEW} pts (4.0s @ 250Hz). Se enviarán los primeros ${MAX_PREVIEW} pts.`, 'warn');
      samples = samples.slice(0, MAX_PREVIEW);
    }

    const loop = this.chkLoop ? this.chkLoop.checked : true;
    let rawName = this.currentSignal.name || 'PREVIEW';
    let cleanName = rawName.toUpperCase().replace(/[^A-Z0-9_]/g, '_').substring(0, 12);
    if (!cleanName) cleanName = 'PREVIEW';

    const packets = Protocol.createPreviewPackets(
      cleanName,
      this.currentSignal.samplingRate,
      samples,
      10,
      loop
    );

    const initPacket = packets[0]; // PREVIEW <name> <fs> <count>\n
    const dataPackets = packets.slice(1, -1); // D seq ...
    const runPacket = packets[packets.length - 1]; // PRUN <loop>\n

    this.isUploading = true;
    this.updateRecordButtonsState();
    this.uploadProgressContainer.style.display = 'block';
    this.uploadProgressBar.style.width = '5%';

    this.log(`Iniciando reproducción en vivo en RAM: ${cleanName} (${samples.length} pts @ ${this.currentSignal.samplingRate} Hz, sin ocupar Flash)...`, 'info');

    let streamError = null;
    const streamErrorHandler = (line) => {
      if (line.includes('ERR')) {
        streamError = line;
      }
    };

    try {
      // 1. Handshake inicial PREVIEW
      this.log(`TX: ${initPacket.command.trim()}`, 'tx');
      const previewInitPromise = this.waitForResponse(
        (line) => line.includes('OK READY PREVIEW') || line.includes('OK READY'),
        (line) => line.includes('ERR'),
        4000
      );
      await this.activeComm.send(initPacket.command);
      await previewInitPromise;

      // 2. Transmisión rápida a RAM
      this.responseWaiters.push(streamErrorHandler);
      const isBle = (this.activeComm === this.ble);
      const pacingMs = isBle ? 30 : 15;

      for (let i = 0; i < dataPackets.length; i++) {
        if (streamError) {
          throw new Error(`Arduino rechazó un paquete: ${streamError}`);
        }
        await this.activeComm.send(dataPackets[i].command);
        const pct = Math.round(5 + ((i + 1) / dataPackets.length) * 85);
        this.uploadProgressBar.style.width = `${pct}%`;
        await new Promise(r => setTimeout(r, pacingMs));
      }

      const errIdx = this.responseWaiters.indexOf(streamErrorHandler);
      if (errIdx !== -1) this.responseWaiters.splice(errIdx, 1);

      if (streamError) {
        throw new Error(`Error en transmisión a RAM: ${streamError}`);
      }

      // 3. Comando PRUN para iniciar ejecución inmediata
      this.uploadProgressBar.style.width = '95%';
      this.log(`TX: ${runPacket.command.trim()}`, 'tx');
      const runPromise = this.waitForResponse(
        (line) => line.includes('OK PLAYING PREVIEW') || line.includes('OK PLAYING'),
        (line) => line.includes('ERR'),
        4000
      );
      await this.activeComm.send(runPacket.command);
      await runPromise;

      this.uploadProgressBar.style.width = '100%';
      this.isPlaying = true;
      this.statusDot.className = 'status-dot playing';
      this.nowPlayingLabel.innerHTML = `<span>▶ En Vivo (RAM): <strong>${cleanName}</strong> (${samples.length} pts @ ${this.currentSignal.samplingRate} Hz - DAC A0 Activo)</span>`;
      this.nowPlayingLabel.classList.add('active');
      this.startPlayheadAnimation(samples.length, this.currentSignal.samplingRate, loop);

      this.log(`¡Reproducción en vivo activa! Señal emitiéndose en tiempo real por el pin DAC A0.`, 'success');
    } catch (err) {
      this.log(`Error al reproducir en vivo: ${err.message}`, 'error');
      alert(`Error al reproducir en vivo en Arduino:\n${err.message}`);
    } finally {
      const errIdx = this.responseWaiters.indexOf(streamErrorHandler);
      if (errIdx !== -1) this.responseWaiters.splice(errIdx, 1);
      this.isUploading = false;
      this.updateRecordButtonsState();
      setTimeout(() => {
        this.uploadProgressContainer.style.display = 'none';
        this.uploadProgressBar.style.width = '0%';
      }, 800);
    }
  }

  playSelectedFile() {
    if (!this.activeComm || !this.activeComm.isConnected) {
      alert('Debes conectarte al Arduino para reproducir señales.');
      return;
    }
    if (!this.selectedFile && this.filesOnDevice.length > 0) {
      this.selectedFile = this.filesOnDevice[0].name;
    }
    if (!this.selectedFile) {
      alert('Por favor selecciona un archivo de la lista en la pestaña Memoria Flash.');
      return;
    }
    const loop = this.chkLoop ? this.chkLoop.checked : true;
    this.sendToDevice(Protocol.createPlayCommand(this.selectedFile, loop));

    const fileObj = this.filesOnDevice.find(f => f.name === this.selectedFile);
    if (fileObj) {
      this.startPlayheadAnimation(fileObj.samples, fileObj.samplingRate, loop);
    }
  }

  stopPlayback() {
    this.stopPlayheadAnimation();
    this.sendToDevice(Protocol.createStopCommand());
  }

  startPlayheadAnimation(totalSamples, samplingRate, isLoop) {
    this.stopPlayheadAnimation();
    if (!totalSamples || totalSamples <= 0 || !samplingRate) return;

    const startTime = performance.now();
    const durationSec = totalSamples / samplingRate;

    const step = () => {
      if (!this.isPlaying) {
        if (this.renderer) this.renderer.setPlayhead(-1);
        return;
      }
      const elapsedSec = (performance.now() - startTime) / 1000;
      let currentIndex = 0;
      if (isLoop) {
        const loopTime = elapsedSec % durationSec;
        currentIndex = Math.floor(loopTime * samplingRate);
      } else {
        currentIndex = Math.floor(elapsedSec * samplingRate);
        if (currentIndex >= totalSamples) {
          if (this.renderer) this.renderer.setPlayhead(-1);
          this.isPlaying = false;
          this.statusDot.className = 'status-dot connected';
          this.nowPlayingLabel.innerHTML = `<span>⏹ Reproducción finalizada</span>`;
          this.nowPlayingLabel.classList.remove('active');
          return;
        }
      }
      if (this.renderer) this.renderer.setPlayhead(currentIndex);
      this.playheadAnimId = requestAnimationFrame(step);
    };

    this.playheadAnimId = requestAnimationFrame(step);
  }

  stopPlayheadAnimation() {
    if (this.playheadAnimId) {
      cancelAnimationFrame(this.playheadAnimId);
      this.playheadAnimId = null;
    }
    if (this.renderer) {
      this.renderer.setPlayhead(-1);
    }
  }

  updateCapacityUI() {
    if (!this.capacityInfo) return;
    const { usedSlots, maxSlots, poolUsed, poolMax } = this.capacityInfo;
    if (this.flashSlotCount) this.flashSlotCount.textContent = usedSlots;
    if (this.flashSlotProgressBar) {
      const pct = Math.min(100, Math.round((usedSlots / maxSlots) * 100));
      this.flashSlotProgressBar.style.width = `${pct}%`;
      this.flashSlotProgressBar.style.backgroundColor = usedSlots >= maxSlots ? '#ef4444' : (usedSlots >= 6 ? '#f59e0b' : '#0284c7');
    }
    if (this.flashSlotBadge) {
      if (usedSlots >= maxSlots) {
        this.flashSlotBadge.textContent = `${usedSlots} / ${maxSlots} Lleno`;
        this.flashSlotBadge.style.backgroundColor = '#fee2e2';
        this.flashSlotBadge.style.color = '#b91c1c';
      } else {
        this.flashSlotBadge.textContent = `${usedSlots} / ${maxSlots} Guardados`;
        this.flashSlotBadge.style.backgroundColor = '#e0f2fe';
        this.flashSlotBadge.style.color = '#0369a1';
      }
    }
    if (this.flashSlotHint) {
      const freeSlots = maxSlots - usedSlots;
      const freePool = Math.max(0, poolMax - poolUsed);
      this.flashSlotHint.textContent = `Disponibles: ${freeSlots} de ${maxSlots} ranuras (${freePool} pts libres en pool)`;
    }
  }

  handleDeviceResponse(line) {
    this.log(`RX: ${line}`, 'rx');

    // Notify any active response waiters first (e.g. upload handshake)
    if (this.responseWaiters && this.responseWaiters.length > 0) {
      const waiters = [...this.responseWaiters];
      for (const waiter of waiters) {
        try { waiter(line); } catch (e) { console.error(e); }
      }
    }

    const parsed = Protocol.parseLine(line);
    if (!parsed) return;

    switch (parsed.type) {
      case 'PONG':
        this.log('Arduino Uno R4 respondió: PONG (Enlace verificado)', 'success');
        break;

      case 'FILE_LIST':
        this.renderFileList(parsed.files);
        break;

      case 'CAPACITY':
        this.capacityInfo = parsed;
        this.updateCapacityUI();
        break;

      case 'PLAYING_PREVIEW':
        this.isPlaying = true;
        this.statusDot.className = 'status-dot playing';
        this.nowPlayingLabel.innerHTML = `<span>▶ En Vivo (RAM): <strong>${parsed.file}</strong> (DAC A0 Activo)</span>`;
        this.nowPlayingLabel.classList.add('active');
        break;

      case 'PLAYING':
        this.isPlaying = true;
        this.statusDot.className = 'status-dot playing';
        this.nowPlayingLabel.innerHTML = `<span>▶ Reproduciendo: <strong>${parsed.file}</strong> (DAC A0 12-bit activo)</span>`;
        this.nowPlayingLabel.classList.add('active');
        break;

      case 'STOPPED':
        this.isPlaying = false;
        this.stopPlayheadAnimation();
        this.statusDot.className = 'status-dot connected';
        this.nowPlayingLabel.innerHTML = `<span>⏹ En espera (DAC A0 reposo)</span>`;
        this.nowPlayingLabel.classList.remove('active');
        break;

      case 'SAVED':
        this.log(`¡Éxito! Archivo ${parsed.file} grabado en la memoria Flash del Arduino.`, 'success');
        this.requestFileList();
        break;

      case 'DELETED':
        this.log(`Archivo ${parsed.file} eliminado de la memoria Flash del Arduino.`, 'success');
        if (this.selectedFile === parsed.file || parsed.file === 'ALL') {
          this.selectedFile = null;
          if (this.isPlaying) {
            this.isPlaying = false;
            this.stopPlayheadAnimation();
            this.statusDot.className = 'status-dot connected';
            this.nowPlayingLabel.innerHTML = `<span>⏹ En espera (DAC A0 reposo)</span>`;
            this.nowPlayingLabel.classList.remove('active');
          }
        }
        this.requestFileList();
        break;

      case 'ERROR':
        this.log(`Alerta de Arduino: ${parsed.message}`, 'error');
        break;
    }
  }

  deleteFileFromDevice(filename) {
    if (!this.activeComm || !this.activeComm.isConnected) {
      alert('Debes conectarte al Arduino para borrar archivos.');
      return;
    }
    this.log(`Solicitando borrar archivo ${filename}...`, 'info');
    this.sendToDevice(Protocol.createDeleteCommand(filename));
  }

  renderFileList(files) {
    this.filesOnDevice = files;
    this.fileTableBody.innerHTML = '';

    // Update Flash capacity and slot meter
    const flashFiles = files.filter(f => f.type === 'FLASH');
    const customCount = flashFiles.length;
    const maxSlots = 8;
    const totalSamplesStored = flashFiles.reduce((acc, f) => acc + (f.samples || 0), 0);
    const maxPool = 4000;

    if (this.flashSlotCount) this.flashSlotCount.textContent = customCount;
    if (this.flashSlotProgressBar) {
      const pct = Math.min(100, Math.round((customCount / maxSlots) * 100));
      this.flashSlotProgressBar.style.width = `${pct}%`;
      this.flashSlotProgressBar.style.backgroundColor = customCount >= maxSlots ? '#ef4444' : (customCount >= 6 ? '#f59e0b' : '#0284c7');
    }
    if (this.flashSlotBadge) {
      if (customCount >= maxSlots) {
        this.flashSlotBadge.textContent = `${customCount} / ${maxSlots} Ocupado (Lleno)`;
        this.flashSlotBadge.style.backgroundColor = '#fee2e2';
        this.flashSlotBadge.style.color = '#b91c1c';
      } else {
        this.flashSlotBadge.textContent = `${customCount} / ${maxSlots} Guardados`;
        this.flashSlotBadge.style.backgroundColor = '#e0f2fe';
        this.flashSlotBadge.style.color = '#0369a1';
      }
    }
    if (this.flashSlotHint) {
      const freeSlots = maxSlots - customCount;
      const freePool = Math.max(0, maxPool - totalSamplesStored);
      this.flashSlotHint.textContent = freeSlots > 0
        ? `Memoria disponible: ${freeSlots} de ${maxSlots} ranuras (${freePool} pts libres en pool)`
        : 'Memoria llena: Borra un archivo para liberar ranuras en la memoria Flash';
    }
    if (this.btnClearAllFlash) {
      this.btnClearAllFlash.disabled = (customCount === 0 || !this.activeComm || !this.activeComm.isConnected);
    }

    if (files.length === 0) {
      this.fileTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b;">No hay archivos almacenados</td></tr>`;
      return;
    }

    files.forEach((f, idx) => {
      const tr = document.createElement('tr');
      const isSelected = this.selectedFile === f.name || (!this.selectedFile && idx === 0);
      if (isSelected) {
        this.selectedFile = f.name;
        tr.style.backgroundColor = '#e0f2fe';
      }

      let actionsHtml = `
        <button class="btn btn-outline btn-select-file" style="padding:0.2rem 0.5rem; font-size:0.75rem; min-height:28px;" data-file="${f.name}">
          ▶ Seleccionar
        </button>
      `;
      if (f.type === 'FLASH') {
        actionsHtml += `
          <button class="btn btn-outline btn-delete-file" style="padding:0.2rem 0.45rem; font-size:0.75rem; min-height:28px; color:#ef4444; border-color:#fca5a5; margin-left:0.35rem;" data-file="${f.name}" title="Borrar este archivo de la memoria Flash">
            🗑️ Borrar
          </button>
        `;
      }

      tr.innerHTML = `
        <td><strong>${f.name}</strong></td>
        <td><span class="badge ${f.type === 'ROM' ? 'badge-rom' : 'badge-flash'}">${f.type}</span></td>
        <td>${f.samples} pts @ ${f.samplingRate} Hz</td>
        <td>${actionsHtml}</td>
      `;

      const btnSelect = tr.querySelector('.btn-select-file');
      if (btnSelect) {
        btnSelect.addEventListener('click', () => {
          this.selectedFile = f.name;
          this.renderFileList(this.filesOnDevice);
          this.playSelectedFile();
        });
      }

      const btnDelete = tr.querySelector('.btn-delete-file');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`¿Estás seguro de que deseas borrar "${f.name}" de la memoria Flash del Arduino?`)) {
            this.deleteFileFromDevice(f.name);
          }
        });
      }

      this.fileTableBody.appendChild(tr);
    });
  }

  log(msg, type = 'info') {
    if (!this.terminal) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${msg}`;
    this.terminal.appendChild(entry);
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
