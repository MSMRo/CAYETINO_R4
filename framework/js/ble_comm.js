/**
 * Web Bluetooth API Driver for Arduino Uno R4 WiFi (Nordic UART Service)
 */

export class BleComm {
  constructor() {
    this.device = null;
    this.server = null;
    this.rxCharacteristic = null; // We write to device RX
    this.txCharacteristic = null; // Device notifies us on TX
    this.isConnected = false;
    this.onLineReceived = null;
    this.onStatusChange = null;
    this.rxBuffer = '';

    // Standard Nordic UART Service (supported by ArduinoBLE and ESP32)
    this.SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
    this.TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify
  }

  static isSupported() {
    return 'bluetooth' in navigator;
  }

  async connect() {
    if (!BleComm.isSupported()) {
      throw new Error('Web Bluetooth API no está soportada en este navegador o sistema operativo.');
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Cayetino' },
          { namePrefix: 'Arduino' },
          { services: [this.SERVICE_UUID] }
        ],
        optionalServices: [this.SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.disconnect();
      });

      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(this.SERVICE_UUID);

      this.rxCharacteristic = await service.getCharacteristic(this.RX_CHAR_UUID);
      this.txCharacteristic = await service.getCharacteristic(this.TX_CHAR_UUID);

      await this.txCharacteristic.startNotifications();
      this.txCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
        this.handleNotification(e);
      });

      this.isConnected = true;
      if (this.onStatusChange) {
        this.onStatusChange(true, `BLE: ${this.device.name || 'Uno R4 WiFi'}`);
      }

      return true;
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const str = decoder.decode(value);
    
    this.rxBuffer += str;
    const lines = this.rxBuffer.split('\n');
    this.rxBuffer = lines.pop(); // keep last incomplete chunk

    for (const line of lines) {
      const clean = line.trim();
      if (clean.length > 0 && this.onLineReceived) {
        this.onLineReceived(clean);
      }
    }
  }

  async send(text) {
    if (!this.isConnected || !this.rxCharacteristic) {
      throw new Error('No conectado por Bluetooth.');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // BLE packet chunking (typical MTU payload 20 bytes for maximum compatibility)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.rxCharacteristic.writeValueWithoutResponse(chunk);
      // Brief yield to avoid BLE queue congestion
      if (data.length > chunkSize) {
        await new Promise(r => setTimeout(r, 8));
      }
    }
  }

  disconnect() {
    this.isConnected = false;
    if (this.server && this.server.connected) {
      try { this.server.disconnect(); } catch (e) {}
    }
    this.device = null;
    this.server = null;
    this.rxCharacteristic = null;
    this.txCharacteristic = null;
    if (this.onStatusChange) this.onStatusChange(false, 'Desconectado');
  }
}
