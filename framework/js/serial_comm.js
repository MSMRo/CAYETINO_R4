/**
 * Web Serial API Driver for Arduino Uno R4 WiFi
 */

export class SerialComm {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.onLineReceived = null;
    this.onStatusChange = null;
    this.readLoopPromise = null;
  }

  static isSupported() {
    return 'serial' in navigator;
  }

  async connect(baudRate = 115200) {
    if (!SerialComm.isSupported()) {
      throw new Error('Web Serial API no está soportada en este navegador. Usa Chrome o Edge.');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate });

      this.writer = this.port.writable.getWriter();
      this.isConnected = true;
      if (this.onStatusChange) this.onStatusChange(true, 'Serial USB (115200 baud)');

      this.startReading();
      return true;
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  async startReading() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';
    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          // keep incomplete last line in buffer
          buffer = lines.pop();
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.length > 0 && this.onLineReceived) {
              this.onLineReceived(cleanLine);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error reading from serial port:', error);
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch (e) {}
      }
    }
  }

  async send(text) {
    if (!this.isConnected || !this.writer) {
      throw new Error('No conectado al puerto serie.');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    await this.writer.write(data);
  }

  async disconnect() {
    this.isConnected = false;
    if (this.writer) {
      try {
        await this.writer.close();
      } catch (e) {}
      this.writer = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
      this.reader = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }
    if (this.onStatusChange) this.onStatusChange(false, 'Desconectado');
  }
}
