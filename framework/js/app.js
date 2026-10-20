/**
 * Cayetino R4 - Main Application Controller
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

    this.bindDomElements();
    this.attachEventListeners();
    this.loadDefaultSignal();
  }

  bindDomElements() {
    // Buttons Header
    this.btnSerial = document.getElementById('btnConnectSerial');
    this.btnBle = document.getElementById('btnConnectBle');
    this.btnDisconnect = document.getElementById('btnDisconnect');
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');

    // Generator Controls
    this.tabGenerate = document.getElementById('tabGenerate');
    this.tabUpload = document.getElementById('tabUpload');
    this.panelGenerate = document.getElementById('panelGenerate');
    this.panelUpload = document.getElementById('panelUpload');
    this.signalTypeSelect = document.getElementById('signalType');
    this.samplingRateInput = document.getElementById('samplingRate');
    this.durationInput = document.getElementById('duration');
    this.heartRateInput = document.getElementById('heartRate');
    this.hrGroup = document.getElementById('hrGroup');
    this.btnGenerate = document.getElementById('btnGenerate');
    this.btnDownloadCsv = document.getElementById('btnDownloadCsv');

    // File Upload Controls
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.sampleFilesSelect = document.getElementById('sampleFiles');

    // Stats
    this.statName = document.getElementById('statName');
    this.statSamples = document.getElementById('statSamples');
    this.statDuration = document.getElementById('statDuration');
    this.statFs = document.getElementById('statFs');
    this.statVpp = document.getElementById('statVpp');

    // Storage / Device Controls
    this.uploadFilenameInput = document.getElementById('uploadFilename');
    this.btnUpload = document.getElementById('btnUpload');
    this.uploadProgressContainer = document.getElementById('uploadProgressContainer');
    this.uploadProgressBar = document.getElementById('uploadProgressBar');
    this.btnRefreshFiles = document.getElementById('btnRefreshFiles');
    this.fileTableBody = document.getElementById('fileTableBody');

    // Playback Controls
    this.btnPlay = document.getElementById('btnPlay');
    this.btnStop = document.getElementById('btnStop');
    this.chkLoop = document.getElementById('chkLoop');
    this.nowPlayingLabel = document.getElementById('nowPlayingLabel');

    // Terminal
    this.terminal = document.getElementById('terminalOutput');
    this.btnClearLogs = document.getElementById('btnClearLogs');
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

    // Tabs
    this.tabGenerate.addEventListener('click', () => {
      this.tabGenerate.classList.add('active');
      this.tabUpload.classList.remove('active');
      this.panelGenerate.style.display = 'block';
      this.panelUpload.style.display = 'none';
    });

    this.tabUpload.addEventListener('click', () => {
      this.tabUpload.classList.add('active');
      this.tabGenerate.classList.remove('active');
      this.panelGenerate.style.display = 'none';
      this.panelUpload.style.display = 'block';
    });

    // Signal type switch
    this.signalTypeSelect.addEventListener('change', () => {
      const type = this.signalTypeSelect.value;
      this.hrGroup.style.display = (type === 'ecg') ? 'block' : 'none';
    });

    this.btnGenerate.addEventListener('click', () => this.generateActiveSignal());
    this.btnDownloadCsv.addEventListener('click', () => this.downloadCurrentCsv());

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
    if (this.sampleFilesSelect) {
      this.sampleFilesSelect.addEventListener('change', () => {
        const val = this.sampleFilesSelect.value;
        if (val) this.loadSampleFile(val);
      });
    }

    // Upload to Arduino
    this.btnUpload.addEventListener('click', () => this.uploadSignalToDevice());

    // Device Files
    this.btnRefreshFiles.addEventListener('click', () => this.requestFileList());

    // Playback
    this.btnPlay.addEventListener('click', () => this.playSelectedFile());
    this.btnStop.addEventListener('click', () => this.stopPlayback());

    // Terminal
    if (this.btnClearLogs) {
      this.btnClearLogs.addEventListener('click', () => {
        this.terminal.innerHTML = '';
      });
    }
  }

  loadDefaultSignal() {
    this.generateActiveSignal();
  }

  generateActiveSignal() {
    const type = this.signalTypeSelect.value;
    const fs = parseInt(this.samplingRateInput.value, 10) || 250;
    const dur = parseFloat(this.durationInput.value) || 4.0;
    const hr = parseInt(this.heartRateInput.value, 10) || 72;

    let signalData = null;
    switch (type) {
      case 'ecg':
        signalData = SignalGenerator.generateECG(dur, fs, hr);
        break;
      case 'emg':
        signalData = SignalGenerator.generateEMG(dur, fs);
        break;
      case 'sine':
        signalData = SignalGenerator.generateSine(dur, fs, 1.0);
        break;
      case 'triangle':
        signalData = SignalGenerator.generateTriangle(dur, fs, 2.0);
        break;
      default:
        signalData = SignalGenerator.generateECG(dur, fs, hr);
    }

    this.setLoadedSignal(signalData);
    this.log(`Señal generada: ${signalData.name} (${signalData.samples.length} muestras)`, 'info');
  }

  async loadSampleFile(filename) {
    try {
      this.log(`Cargando archivo de muestra: ${filename}...`, 'info');
      const resp = await fetch(`./sample_signals/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const signalData = SignalGenerator.parseFileContent(text, filename);
      this.setLoadedSignal(signalData);
      this.log(`Archivo cargado con éxito: ${signalData.name}`, 'success');
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
      this.log(`Archivo importado: ${signalData.name} con ${signalData.samples.length} muestras @ ${signalData.samplingRate} Hz`, 'success');
    } catch (err) {
      this.log(`Error al procesar archivo: ${err.message}`, 'error');
      alert(`Error al procesar archivo: ${err.message}`);
    }
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

    // Preset upload filename
    this.uploadFilenameInput.value = `${signalData.name.substring(0, 12)}.CSV`;
    this.btnUpload.disabled = !this.activeComm || !this.activeComm.isConnected;
    this.btnDownloadCsv.disabled = false;
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
    this.log(`Descargando CSV: ${this.currentSignal.name}.csv`, 'info');
  }

  // Connection management
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

    // Send PING and ask for list
    setTimeout(() => {
      this.sendToDevice('PING\n');
      this.requestFileList();
    }, 500);
  }

  updateConnectionUI(connected, desc, type) {
    if (connected) {
      this.statusDot.className = 'status-dot connected';
      this.statusText.textContent = desc;
      this.log(`Conectado exitosamente vía ${desc}`, 'success');
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
      this.log('Error: No hay conexión activa con el Arduino.', 'error');
      return;
    }
    this.log(`TX: ${cmd.trim()}`, 'tx');
    await this.activeComm.send(cmd);
  }

  // Device File Transfer & Playback
  async uploadSignalToDevice() {
    if (!this.currentSignal || !this.activeComm || this.isUploading) return;

    const filename = this.uploadFilenameInput.value.trim() || 'CUSTOM.CSV';
    const packets = Protocol.createUploadPackets(
      filename,
      this.currentSignal.samplingRate,
      this.currentSignal.samples,
      25 // 25 samples per line fits comfortably in BLE/Serial buffers
    );

    this.isUploading = true;
    this.btnUpload.disabled = true;
    this.uploadProgressContainer.style.display = 'block';
    this.uploadProgressBar.style.width = '0%';

    this.log(`Iniciando envío de ${filename} (${this.currentSignal.samples.length} muestras, ${packets.length} paquetes)...`, 'info');

    try {
      for (let i = 0; i < packets.length; i++) {
        const pkt = packets[i];
        await this.activeComm.send(pkt.command);
        
        // Progress update
        const pct = Math.round(((i + 1) / packets.length) * 100);
        this.uploadProgressBar.style.width = `${pct}%`;

        // Small yield to let Arduino buffer and process
        await new Promise(r => setTimeout(r, 18));
      }
      this.log(`Transferencia finalizada. Esperando confirmación de almacenamiento...`, 'info');
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
        this.log('Arduino Uno R4 respondió: PONG (Enlace OK)', 'success');
        break;

      case 'FILE_LIST':
        this.renderFileList(parsed.files);
        break;

      case 'PLAYING':
        this.isPlaying = true;
        this.statusDot.className = 'status-dot playing';
        this.nowPlayingLabel.textContent = `▶ Reproduciendo: ${parsed.file} (DAC A0 activo)`;
        this.nowPlayingLabel.style.color = '#38bdf8';
        break;

      case 'STOPPED':
        this.isPlaying = false;
        this.statusDot.className = 'status-dot connected';
        this.nowPlayingLabel.textContent = '⏹ En espera (DAC A0 en reposo)';
        this.nowPlayingLabel.style.color = '#94a3b8';
        break;

      case 'SAVED':
        this.log(`Archivo ${parsed.file} guardado correctamente en Arduino.`, 'success');
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
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem; font-size:0.75rem;" data-file="${f.name}">
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
