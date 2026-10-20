/**
 * Web Bluetooth API Driver for Arduino Uno R4 WiFi (Nordic UART Service)
 * Fully compatible with ArduinoBLE and mobile browsers (Chrome Android, Bluefy iOS).
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
      throw new Error('Web Bluetooth no está soportado en este navegador. Utiliza Google Chrome, Edge u Opera en PC o Android, o Bluefy en iOS.');
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
    
    // The Arduino Uno R4 rxCharacteristic buffer is 64 bytes.
    // Setting chunkSize = 60 ensures all commands (PLAY, STOP, PING, WRITE)
    // are transmitted in ONE atomic BLE packet without any artificial splitting!
    const chunkSize = 60;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      try {
        if (this.rxCharacteristic.writeValueWithoutResponse) {
          await this.rxCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.rxCharacteristic.writeValue(chunk);
        }
      } catch (err) {
        // Fallback to writeValue if writeValueWithoutResponse fails
        await this.rxCharacteristic.writeValue(chunk);
      }
      
      // Delay between chunks to let Arduino Uno R4 / ESP32 BLE stack process
      if (data.length > chunkSize) {
        await new Promise(r => setTimeout(r, 20));
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
