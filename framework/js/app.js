/**
 * Cayetino R4 - Main Application Controller
 * High-performance, responsive controller supporting Web Serial, Web BLE,
 * interactive biomedical synthesis, multi-component signal mixer, and flash transfer.
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
    this.mixOperation = 'add'; // 'add', 'multiply', 'subtract'

    this.bindDomElements();
    this.attachEventListeners();
    this.setupSliderSync();
    this.resetStatsDisplay();
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
    this.btnGenerateBasic = document.getElementById('btnGenerateBasic');
    this.btnDownloadBasicCsv = document.getElementById('btnDownloadBasicCsv');

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
    this.btnGenerateBiomed = document.getElementById('btnGenerateBiomed');
    this.btnDownloadBiomedCsv = document.getElementById('btnDownloadBiomedCsv');

    // Tab 3: Mixer
    this.mixTypeA = document.getElementById('mixTypeA');
    this.mixFreqA = document.getElementById('mixFreqA');
    this.mixAmpA = document.getElementById('mixAmpA');
    this.opButtons = document.querySelectorAll('.op-btn');
    this.mixTypeB = document.getElementById('mixTypeB');
    this.mixFreqB = document.getElementById('mixFreqB');
    this.mixAmpB = document.getElementById('mixAmpB');
    this.mixMasterGain = document.getElementById('mixMasterGain');
    this.mixMasterOffset = document.getElementById('mixMasterOffset');
    this.mixFs = document.getElementById('mixFs');
    this.mixDuration = document.getElementById('mixDuration');
    this.btnGenerateMix = document.getElementById('btnGenerateMix');
    this.btnDownloadMixCsv = document.getElementById('btnDownloadMixCsv');

    // Tab 4: Files
    this.sampleFiles = document.getElementById('sampleFiles');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');

    // Tab 5: Flash Storage
    this.uploadFilename = document.getElementById('uploadFilename');
    this.btnUpload = document.getElementById('btnUpload');
    this.uploadProgressContainer = document.getElementById('uploadProgressContainer');
    this.uploadProgressBar = document.getElementById('uploadProgressBar');
    this.btnRefreshFiles = document.getElementById('btnRefreshFiles');
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
    // Connection
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

    // Waveform Types Toggle
    this.basicWaveType.addEventListener('change', () => {
      this.grpDutyCycle.style.display = (this.basicWaveType.value === 'square') ? 'block' : 'none';
      this.generateActiveSignal('basic');
    });

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
      this.generateActiveSignal('biomed');
    });

    // Mixer Operations (Add, Multiply, Subtract)
    this.opButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.opButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mixOperation = btn.getAttribute('data-op');
        this.generateActiveSignal('mixer');
      });
    });

    // Generation buttons
    this.btnGenerateBasic.addEventListener('click', () => this.generateActiveSignal('basic'));
    this.btnDownloadBasicCsv.addEventListener('click', () => this.downloadCurrentCsv());

    this.btnGenerateBiomed.addEventListener('click', () => this.generateActiveSignal('biomed'));
    this.btnDownloadBiomedCsv.addEventListener('click', () => this.downloadCurrentCsv());

    this.btnGenerateMix.addEventListener('click', () => this.generateActiveSignal('mixer'));
    this.btnDownloadMixCsv.addEventListener('click', () => this.downloadCurrentCsv());

    // File Drag & Drop
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

    // Sample files dropdown
    if (this.sampleFiles) {
      this.sampleFiles.addEventListener('change', () => {
        const val = this.sampleFiles.value;
        if (val) this.loadSampleFile(val);
      });
    }

    // Flash Memory Transfer & Playback
    this.btnUpload.addEventListener('click', () => this.uploadSignalToDevice());
    this.btnRefreshFiles.addEventListener('click', () => this.requestFileList());
    this.btnPlay.addEventListener('click', () => this.playSelectedFile());
    this.btnStop.addEventListener('click', () => this.stopPlayback());

    // Clear logs
    if (this.btnClearLogs) {
      this.btnClearLogs.addEventListener('click', () => {
        this.terminal.innerHTML = '';
      });
    }
  }

  switchTab(targetTab) {
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
  }

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

      const masterGain = parseFloat(this.mixMasterGain.value) || 1.0;
      const masterOffset = parseFloat(this.mixMasterOffset.value) || 2.5;
      const fs = parseInt(this.mixFs.value, 10) || 250;
      const dur = parseFloat(this.mixDuration.value) || 4.0;

      sig = SignalGenerator.mixSignals({
        duration: dur,
        samplingRate: fs,
        typeA,
        freqA,
        ampA,
        typeB,
        freqB,
        ampB,
        operation: this.mixOperation,
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
    this.uploadFilename.value = '';
    this.btnUpload.disabled = true;
    if (this.btnDownloadBasicCsv) this.btnDownloadBasicCsv.disabled = true;
    if (this.btnDownloadBiomedCsv) this.btnDownloadBiomedCsv.disabled = true;
    if (this.btnDownloadMixCsv) this.btnDownloadMixCsv.disabled = true;
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
    const vpp = (((max - min) / 4095.0) * 5.0).toFixed(2);
    this.statVpp.textContent = `${vpp} V`;

    // Preset flash filename
    this.uploadFilename.value = `${signalData.name.substring(0, 12)}.CSV`;
    this.btnUpload.disabled = !this.activeComm || !this.activeComm.isConnected;
    if (this.btnDownloadBasicCsv) this.btnDownloadBasicCsv.disabled = false;
    if (this.btnDownloadBiomedCsv) this.btnDownloadBiomedCsv.disabled = false;
    if (this.btnDownloadMixCsv) this.btnDownloadMixCsv.disabled = false;
  }

  async loadSampleFile(filename) {
    try {
      this.log(`Cargando archivo de muestra: ${filename}...`, 'info');
      const resp = await fetch(`./sample_signals/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const signalData = SignalGenerator.parseFileContent(text, filename);
      this.setLoadedSignal(signalData);
      this.log(`Muestra cargada: ${signalData.name}`, 'success');
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
    this.btnUpload.disabled = !this.currentSignal;
    this.btnRefreshFiles.disabled = false;
    this.btnPlay.disabled = false;
    this.btnStop.disabled = false;

    // Send PING and request files
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
      this.btnUpload.disabled = true;
      this.btnRefreshFiles.disabled = true;
      this.btnPlay.disabled = true;
      this.btnStop.disabled = true;
      this.activeComm = null;
      this.log('Dispositivo desconectado.', 'info');
    }
  }

  async sendToDevice(cmd) {
    if (!this.activeComm || !this.activeComm.isConnected) {
      this.log('Error: Sin enlace activo con Arduino.', 'error');
      return;
    }
    this.log(`TX: ${cmd.trim()}`, 'tx');
    await this.activeComm.send(cmd);
  }

  async uploadSignalToDevice() {
    if (!this.currentSignal || !this.activeComm || this.isUploading) return;

    const filename = this.uploadFilename.value.trim() || 'CUSTOM.CSV';
    const packets = Protocol.createUploadPackets(
      filename,
      this.currentSignal.samplingRate,
      this.currentSignal.samples,
      25 // 25 samples per packet fits comfortably in standard BLE/Serial MTU
    );

    this.isUploading = true;
    this.btnUpload.disabled = true;
    this.uploadProgressContainer.style.display = 'block';
    this.uploadProgressBar.style.width = '0%';

    this.log(`Enviando ${filename} (${this.currentSignal.samples.length} muestras, ${packets.length} paquetes)...`, 'info');

    try {
      for (let i = 0; i < packets.length; i++) {
        const pkt = packets[i];
        await this.activeComm.send(pkt.command);
        
        const pct = Math.round(((i + 1) / packets.length) * 100);
        this.uploadProgressBar.style.width = `${pct}%`;

        // Small yield to allow Arduino processing
        await new Promise(r => setTimeout(r, 18));
      }
      this.log(`Envío completado. Esperando confirmación de almacenamiento...`, 'info');
    } catch (err) {
      this.log(`Error durante la transmisión: ${err.message}`, 'error');
    } finally {
      this.isUploading = false;
      this.btnUpload.disabled = false;
      setTimeout(() => {
        this.uploadProgressContainer.style.display = 'none';
        this.requestFileList();
      }, 1000);
    }
  }

  requestFileList() {
    this.sendToDevice(Protocol.createListCommand());
  }

  playSelectedFile() {
    if (!this.selectedFile && this.filesOnDevice.length > 0) {
      this.selectedFile = this.filesOnDevice[0].name;
    }
    if (!this.selectedFile) {
      alert('Por favor selecciona un archivo de la lista.');
      return;
    }
    const loop = this.chkLoop.checked;
    this.sendToDevice(Protocol.createPlayCommand(this.selectedFile, loop));
  }

  stopPlayback() {
    this.sendToDevice(Protocol.createStopCommand());
  }

  handleDeviceResponse(line) {
    this.log(`RX: ${line}`, 'rx');
    const parsed = Protocol.parseLine(line);
    if (!parsed) return;

    switch (parsed.type) {
      case 'PONG':
        this.log('Arduino Uno R4 respondió: PONG (Enlace verificado)', 'success');
        break;

      case 'FILE_LIST':
        this.renderFileList(parsed.files);
        break;

      case 'PLAYING':
        this.isPlaying = true;
        this.statusDot.className = 'status-dot playing';
        this.nowPlayingLabel.innerHTML = `<span>▶ Reproduciendo: <strong>${parsed.file}</strong> (DAC A0 12-bit activo)</span>`;
        this.nowPlayingLabel.classList.add('active');
        break;

      case 'STOPPED':
        this.isPlaying = false;
        this.statusDot.className = 'status-dot connected';
        this.nowPlayingLabel.innerHTML = `<span>⏹ En espera (DAC A0 reposo)</span>`;
        this.nowPlayingLabel.classList.remove('active');
        break;

      case 'SAVED':
        this.log(`Archivo ${parsed.file} guardado exitosamente en Flash de Arduino.`, 'success');
        this.requestFileList();
        break;

      case 'ERROR':
        this.log(`Alerta de Arduino: ${parsed.message}`, 'error');
        break;
    }
  }

  renderFileList(files) {
    this.filesOnDevice = files;
    this.fileTableBody.innerHTML = '';

    if (files.length === 0) {
      this.fileTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b;">No hay archivos almacenados</td></tr>`;
      return;
    }

    files.forEach((f, idx) => {
      const tr = document.createElement('tr');
      const isSelected = this.selectedFile === f.name || (!this.selectedFile && idx === 0);
      if (isSelected) {
        this.selectedFile = f.name;
        tr.style.backgroundColor = 'rgba(6, 182, 212, 0.15)';
      }

      tr.innerHTML = `
        <td><strong>${f.name}</strong></td>
        <td><span class="badge ${f.type === 'ROM' ? 'badge-rom' : 'badge-flash'}">${f.type}</span></td>
        <td>${f.samples} pts @ ${f.samplingRate} Hz</td>
        <td>
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem; font-size:0.75rem; min-height:28px;" data-file="${f.name}">
            ▶ Seleccionar
          </button>
        </td>
      `;

      tr.querySelector('button').addEventListener('click', () => {
        this.selectedFile = f.name;
        this.renderFileList(this.filesOnDevice);
        this.playSelectedFile();
      });

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
