/**
 * Communication Protocol Encoder and Parser for Cayetino R4
 * Handles framing, chunking for serial/BLE MTU limits, and command processing.
 */

export class Protocol {
  /**
   * Packetize samples for reliable serial/BLE transmission
   * @param {string} filename 
   * @param {number} samplingRate 
   * @param {Array<number>} samples 
   * @param {number} chunkSize Number of samples per data line (e.g. 20-30 samples per packet to fit BLE MTU)
   */
  static createUploadPackets(filename, samplingRate, samples, chunkSize = 20) {
    const packets = [];
    const cleanName = filename.replace(/[^A-Za-z0-9_.]/g, '').toUpperCase().substring(0, 16);
    
    // Header command: WRITE <name> <fs> <count>
    packets.push({
      type: 'INIT',
      command: `WRITE ${cleanName} ${samplingRate} ${samples.length}\n`,
      seq: 0
    });

    // Data chunks
    let seq = 1;
    for (let i = 0; i < samples.length; i += chunkSize) {
      const slice = samples.slice(i, i + chunkSize);
      const dataStr = slice.join(',');
      packets.push({
        type: 'DATA',
        command: `D ${seq} ${dataStr}\n`,
        seq: seq
      });
      seq++;
    }

    // Commit command
    packets.push({
      type: 'COMMIT',
      command: `COMMIT\n`,
      seq: seq
    });

    return packets;
  }

  /**
   * Packetize samples for Live RAM Preview streaming without saving to Flash
   */
  static createPreviewPackets(name, samplingRate, samples, chunkSize = 20, loop = true) {
    const packets = [];
    const cleanName = name.replace(/[^A-Za-z0-9_.]/g, '').toUpperCase().substring(0, 16);

    // Header command: PREVIEW <name> <fs> <count>
    packets.push({
      type: 'PREVIEW_INIT',
      command: `PREVIEW ${cleanName} ${samplingRate} ${samples.length}\n`,
      seq: 0
    });

    // Data chunks
    let seq = 1;
    for (let i = 0; i < samples.length; i += chunkSize) {
      const slice = samples.slice(i, i + chunkSize);
      const dataStr = slice.join(',');
      packets.push({
        type: 'DATA',
        command: `D ${seq} ${dataStr}\n`,
        seq: seq
      });
      seq++;
    }

    // Run preview command: PRUN <loop>
    packets.push({
      type: 'PREVIEW_RUN',
      command: `PRUN ${loop ? 1 : 0}\n`,
      seq: seq
    });

    return packets;
  }

  static createPlayCommand(filename, loop = true) {
    const cleanName = filename.replace(/[^A-Za-z0-9_.]/g, '').toUpperCase();
    return `PLAY ${cleanName} ${loop ? 1 : 0}\n`;
  }

  static createStopCommand() {
    return `STOP\n`;
  }

  static createListCommand() {
    return `LIST\n`;
  }

  static createStatusCommand() {
    return `STATUS\n`;
  }

  static createDeleteCommand(filename) {
    const cleanName = filename.replace(/[^A-Za-z0-9_.]/g, '').toUpperCase();
    return `DELETE ${cleanName}\n`;
  }

  /**
   * Parses responses from the Arduino Uno R4
   */
  static parseLine(line) {
    line = line.trim();
    if (!line) return null;

    if (line.startsWith('PONG')) {
      return { type: 'PONG' };
    }

    if (line.startsWith('FILES:')) {
      // Format: FILES:NAME1:LEN:FS|NAME2:LEN:FS|...
      const payload = line.substring(6);
      const files = [];
      if (payload.trim().length > 0) {
        const parts = payload.split('|');
        for (const p of parts) {
          const item = p.split(':');
          if (item.length >= 3) {
            files.push({
              name: item[0],
              samples: parseInt(item[1], 10),
              samplingRate: parseInt(item[2], 10),
              type: item[3] || 'ROM'
            });
          }
        }
      }
      return { type: 'FILE_LIST', files };
    }

    if (line.startsWith('CAPACITY:')) {
      // Format: CAPACITY:<usedSlots>:<maxSlots>:<poolUsed>:<poolMax>
      const parts = line.substring(9).split(':');
      return {
        type: 'CAPACITY',
        usedSlots: parseInt(parts[0] || '0', 10),
        maxSlots: parseInt(parts[1] || '8', 10),
        poolUsed: parseInt(parts[2] || '0', 10),
        poolMax: parseInt(parts[3] || '4000', 10)
      };
    }

    if (line.startsWith('STATUS:')) {
      // Format: STATUS:STATE:FILE:CURRENT_INDEX:FS
      const parts = line.split(':');
      return {
        type: 'STATUS',
        state: parts[1] || 'IDLE',
        file: parts[2] || '',
        currentIndex: parseInt(parts[3] || '0', 10),
        samplingRate: parseInt(parts[4] || '250', 10)
      };
    }

    if (line.startsWith('ACK')) {
      const parts = line.split(' ');
      return { type: 'ACK', seq: parseInt(parts[1] || '0', 10) };
    }

    if (line.startsWith('OK PLAYING PREVIEW')) {
      return { type: 'PLAYING_PREVIEW', file: line.substring(18).trim() };
    }

    if (line.startsWith('OK PLAYING')) {
      return { type: 'PLAYING', file: line.substring(11).trim() };
    }

    if (line.startsWith('OK STOPPED')) {
      return { type: 'STOPPED' };
    }

    if (line.startsWith('OK SAVED')) {
      return { type: 'SAVED', file: line.substring(9).trim() };
    }

    if (line.startsWith('OK DELETED')) {
      return { type: 'DELETED', file: line.substring(10).trim() };
    }

    if (line.startsWith('OK READY PREVIEW')) {
      return { type: 'READY_PREVIEW' };
    }

    if (line.startsWith('OK READY')) {
      return { type: 'READY' };
    }

    if (line.startsWith('ERR')) {
      return { type: 'ERROR', message: line };
    }

    return { type: 'TEXT', text: line };
  }
}
