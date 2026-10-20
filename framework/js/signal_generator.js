/**
 * Cayetino R4 - Advanced Signal Generator & Mixer Engine
 * Inspired by Cayetino 2 biomedical & synthetic waveform synthesis.
 * Generates 12-bit DAC signals (0 - 4095, 0 - 5.0V) for Arduino Uno R4.
 */

export class SignalGenerator {

  // ==========================================================================
  // 1. BASIC PERIODIC WAVEFORMS
  // ==========================================================================

  /**
   * Pure Sine Wave
   * @param {number} freq - Frequency in Hz
   * @param {number} vpp - Peak-to-peak amplitude in Volts (0.1 - 5.0)
   * @param {number} offset - DC Offset in Volts (0.0 - 5.0)
   * @param {number} phaseDeg - Phase offset in degrees (0 - 360)
   */
  static generateSine(duration = 4.0, samplingRate = 250, freq = 1.0, vpp = 4.0, offset = 2.5, phaseDeg = 0) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const phaseRad = (phaseDeg * Math.PI) / 180.0;
    const halfVpp = vpp / 2.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const v = offset + halfVpp * Math.sin(2 * Math.PI * freq * t + phaseRad);
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `SINE_${freq}HZ`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Square Wave with adjustable Duty Cycle
   */
  static generateSquare(duration = 4.0, samplingRate = 250, freq = 1.0, dutyCycle = 50, vpp = 4.0, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const period = 1.0 / freq;
    const dutyFraction = Math.max(1, Math.min(99, dutyCycle)) / 100.0;
    const halfVpp = vpp / 2.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period) / period;
      const v = offset + (phase < dutyFraction ? halfVpp : -halfVpp);
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `SQR_${freq}HZ_${dutyCycle}D`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Symmetrical Triangle Wave
   */
  static generateTriangle(duration = 4.0, samplingRate = 250, freq = 2.0, vpp = 4.0, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const period = 1.0 / freq;
    const halfVpp = vpp / 2.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period) / period;
      // Triangular function from -1 to +1
      const triNorm = phase < 0.5 ? (4 * phase - 1) : (3 - 4 * phase);
      const v = offset + halfVpp * triNorm;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `TRI_${freq}HZ`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Sawtooth Wave (Ramp Up)
   */
  static generateSawtooth(duration = 4.0, samplingRate = 250, freq = 2.0, vpp = 4.0, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const period = 1.0 / freq;
    const halfVpp = vpp / 2.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period) / period;
      const sawNorm = 2.0 * phase - 1.0;
      const v = offset + halfVpp * sawNorm;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `SAW_${freq}HZ`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Inverted Sawtooth Wave (Ramp Down)
   */
  static generateInvertedSawtooth(duration = 4.0, samplingRate = 250, freq = 2.0, vpp = 4.0, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const period = 1.0 / freq;
    const halfVpp = vpp / 2.0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period) / period;
      const invSawNorm = 1.0 - 2.0 * phase;
      const v = offset + halfVpp * invSawNorm;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `INVSAW_${freq}HZ`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  // ==========================================================================
  // 2. BIOMEDICAL SIGNALS
  // ==========================================================================

  /**
   * Clinical ECG Lead II (Gaussian P-Q-R-S-T Model)
   */
  static generateECG(duration = 4.0, samplingRate = 250, heartRate = 72, vpp = 3.3, offset = 2.5, noiseLevel = 0.02) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const beatPeriod = 60.0 / Math.max(30, Math.min(200, heartRate));

    // Gaussian wave definitions [a: amp mV, b: width s, d: time offset s]
    const waves = [
      { a: 0.15, b: 0.035, d: -0.16 }, // P wave
      { a: -0.22, b: 0.020, d: -0.05 }, // Q wave
      { a: 1.25, b: 0.025, d: 0.00 },  // R peak
      { a: -0.38, b: 0.025, d: 0.06 },  // S wave
      { a: 0.30, b: 0.070, d: 0.22 }   // T wave
    ];

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % beatPeriod) - (beatPeriod / 2.0);
      let valMv = 0.0;

      for (const w of waves) {
        const dt = phase - w.d;
        valMv += w.a * Math.exp(-(dt * dt) / (2 * w.b * w.b));
      }

      // Physiological baseline wander (respiration 0.2 Hz)
      valMv += 0.04 * Math.sin(2 * Math.PI * 0.2 * t);
      // Thermal microvolt noise
      if (noiseLevel > 0) {
        valMv += (Math.random() - 0.5) * noiseLevel;
      }

      // Normalized to [-0.4, 1.25] -> span 1.65 mV
      const norm = (valMv + 0.4) / 1.65; // ~0 to 1
      const v = (offset - vpp / 2.0) + norm * vpp;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `ECG_${heartRate}BPM`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Arrhythmia: Premature Ventricular Contraction (PVC / Extrasystole)
   */
  static generateArrhythmia(duration = 4.0, samplingRate = 250, heartRate = 75, vpp = 3.5, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const normalPeriod = 60.0 / heartRate;

    // We inject a PVC every ~3.5 seconds
    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      let valMv = 0.0;

      // Determine if current time falls in a PVC window (e.g. at t = 1.8s)
      const pvcTime = 1.8;
      const dtPvc = t - pvcTime;

      if (Math.abs(dtPvc) < 0.35) {
        // PVC Waveform: bizarre, wide, inverted QRS followed by inverted large T
        const qrs = -1.6 * Math.exp(-(dtPvc * dtPvc) / 0.005);
        const tWave = 0.6 * Math.exp(-((dtPvc - 0.18) * (dtPvc - 0.18)) / 0.015);
        valMv = qrs + tWave;
      } else {
        // Normal beat
        const phase = ((t + 0.3) % normalPeriod) - (normalPeriod / 2.0);
        const waves = [
          { a: 0.14, b: 0.035, d: -0.16 },
          { a: -0.20, b: 0.020, d: -0.05 },
          { a: 1.20, b: 0.025, d: 0.00 },
          { a: -0.35, b: 0.025, d: 0.06 },
          { a: 0.28, b: 0.070, d: 0.22 }
        ];
        for (const w of waves) {
          const dt = phase - w.d;
          valMv += w.a * Math.exp(-(dt * dt) / (2 * w.b * w.b));
        }
      }

      valMv += 0.03 * Math.sin(2 * Math.PI * 0.2 * t);
      valMv += (Math.random() - 0.5) * 0.02;

      const norm = (valMv + 1.6) / 2.9; // span
      const v = (offset - vpp / 2.0) + norm * vpp;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `ECG_PVC_ARRHY`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Surface EMG with Voluntary Muscle Contraction Bursts
   */
  static generateEMG(duration = 4.0, samplingRate = 250, vpp = 3.6, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    
    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      // Contraction active windows: 0.8s-1.8s and 2.5s-3.5s
      let envelope = 0.08; // baseline tone
      if ((t >= 0.8 && t <= 1.8) || (t >= 2.5 && t <= 3.5)) {
        // Trapezoidal ramp envelope
        const burstT = (t >= 0.8 && t <= 1.8) ? (t - 0.8) : (t - 2.5);
        if (burstT < 0.2) envelope = 0.08 + (burstT / 0.2) * 0.85;
        else if (burstT > 0.8) envelope = 0.08 + ((1.0 - burstT) / 0.2) * 0.85;
        else envelope = 0.93;
      }
      
      // Central limit noise (sum of 3 uniforms) simulating MUAPs firing
      const noise = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const emgVal = noise * envelope; // [-1.0, 1.0]

      const v = offset + (vpp / 2.0) * emgVal;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: 'EMG_BURST',
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * EEG Brain Waves (Alpha, Beta, Theta, Delta)
   */
  static generateEEG(duration = 4.0, samplingRate = 250, rhythm = 'alpha', vpp = 3.0, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);

    let centerFreq = 10.0; // Alpha: 8 - 13 Hz
    if (rhythm === 'beta') centerFreq = 20.0; // Beta: 13 - 30 Hz
    else if (rhythm === 'theta') centerFreq = 6.0; // Theta: 4 - 8 Hz
    else if (rhythm === 'delta') centerFreq = 2.0; // Delta: 0.5 - 4 Hz

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      // Combine dominant rhythm with minor harmonics and biological phase jitter
      const main = Math.sin(2 * Math.PI * centerFreq * t);
      const harm = 0.3 * Math.sin(2 * Math.PI * (centerFreq * 1.35) * t + 1.2);
      const sub = 0.25 * Math.sin(2 * Math.PI * (centerFreq * 0.72) * t + 0.5);
      const wander = 0.15 * Math.sin(2 * Math.PI * 0.4 * t);
      const noise = (Math.random() - 0.5) * 0.15;

      const raw = (main + harm + sub + wander + noise) / 1.8; // [-1, 1]
      const v = offset + (vpp / 2.0) * raw;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `EEG_${rhythm.toUpperCase()}`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Respiration Waveform (RSP)
   */
  static generateRespiration(duration = 4.0, samplingRate = 250, bpm = 16, vpp = 3.8, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const freq = bpm / 60.0;
    const period = 1.0 / freq;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period) / period;
      // Asymmetric inhalation (shorter 40%) vs exhalation (longer 60%)
      let norm = 0;
      if (phase < 0.4) {
        norm = 0.5 - 0.5 * Math.cos((phase / 0.4) * Math.PI);
      } else {
        norm = 0.5 + 0.5 * Math.cos(((phase - 0.4) / 0.6) * Math.PI);
      }
      norm = (norm * 2.0) - 1.0; // [-1, 1]

      const v = offset + (vpp / 2.0) * norm;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `RSP_${bpm}BPM`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  /**
   * Photoplethysmogram (PPG) Arterial Pulse
   */
  static generatePPG(duration = 4.0, samplingRate = 250, heartRate = 72, vpp = 3.5, offset = 2.5) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);
    const period = 60.0 / heartRate;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const phase = (t % period);

      // Systolic peak + Dicrotic notch + Diastolic peak
      const systolic = 1.0 * Math.exp(-Math.pow((phase - 0.16) / 0.08, 2));
      const notch = -0.15 * Math.exp(-Math.pow((phase - 0.32) / 0.03, 2));
      const diastolic = 0.35 * Math.exp(-Math.pow((phase - 0.42) / 0.10, 2));

      let val = systolic + notch + diastolic;
      val = (val - 0.05) / 1.05; // normalize [0, 1]
      val = (val * 2.0) - 1.0; // [-1, 1]

      const v = offset + (vpp / 2.0) * val;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    return {
      name: `PPG_${heartRate}BPM`,
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  // ==========================================================================
  // 3. CLINICAL ARTEFACTS & NOISE
  // ==========================================================================

  static generatePowerlineNoise(t, freq = 60.0) {
    return Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * (freq * 3) * t);
  }

  static generateBaselineWander(t, freq = 0.25) {
    return Math.sin(2 * Math.PI * freq * t);
  }

  static generateGaussianNoise() {
    // Box-Muller transform
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  // ==========================================================================
  // 4. SIGNAL MIXER & COMPOSER (SUMADOR / MEZCLADOR)
  // ==========================================================================

  /**
   * Evaluates component signal at instantaneous time t in normalized units [-1, 1]
   */
  static evaluateComponent(type, t, freq, phaseDeg = 0) {
    const phaseRad = (phaseDeg * Math.PI) / 180.0;
    const period = freq > 0 ? (1.0 / freq) : 1.0;

    switch (type) {
      case 'sine':
        return Math.sin(2 * Math.PI * freq * t + phaseRad);

      case 'square': {
        const ph = ((t + (phaseDeg / 360.0) * period) % period) / period;
        return ph < 0.5 ? 1.0 : -1.0;
      }

      case 'triangle': {
        const ph = ((t + (phaseDeg / 360.0) * period) % period) / period;
        return ph < 0.5 ? (4 * ph - 1) : (3 - 4 * ph);
      }

      case 'sawtooth': {
        const ph = ((t + (phaseDeg / 360.0) * period) % period) / period;
        return 2.0 * ph - 1.0;
      }

      case 'noise_60hz':
        return SignalGenerator.generatePowerlineNoise(t, 60.0);

      case 'noise_50hz':
        return SignalGenerator.generatePowerlineNoise(t, 50.0);

      case 'wander':
        return SignalGenerator.generateBaselineWander(t, 0.25);

      case 'gaussian':
        return SignalGenerator.generateGaussianNoise() * 0.35;

      case 'ecg': {
        // Fast evaluation ECG beat
        const hr = freq > 0 ? (freq * 60.0) : 72;
        const beatP = 60.0 / hr;
        const ph = (t % beatP) - (beatP / 2.0);
        let val = 0;
        const waves = [
          { a: 0.15, b: 0.035, d: -0.16 },
          { a: -0.22, b: 0.020, d: -0.05 },
          { a: 1.25, b: 0.025, d: 0.00 },
          { a: -0.38, b: 0.025, d: 0.06 },
          { a: 0.30, b: 0.070, d: 0.22 }
        ];
        for (const w of waves) {
          const dt = ph - w.d;
          val += w.a * Math.exp(-(dt * dt) / (2 * w.b * w.b));
        }
        return val / 1.25;
      }

      default:
        return Math.sin(2 * Math.PI * freq * t + phaseRad);
    }
  }

  /**
   * Generates a small preview buffer (e.g. 100 points) to draw live mini-oscilloscopes
   */
  static generateMiniPreview(type, freq = 1.0, amp = 2.0, phase = 0, numPoints = 120) {
    const points = new Float32Array(numPoints);
    const displayPeriods = (type.startsWith('noise') || type === 'wander' || type === 'gaussian') ? 1.0 : 2.0;
    const timeSpan = freq > 0 ? (displayPeriods / freq) : 2.0;

    for (let i = 0; i < numPoints; i++) {
      const t = (i / (numPoints - 1)) * timeSpan;
      points[i] = SignalGenerator.evaluateComponent(type, t, freq, phase);
    }
    return points;
  }

  /**
   * Combines 2 or 3 signal components (Sum, Multiply/Modulate, Subtract)
   */
  static mixSignals({
    duration = 4.0,
    samplingRate = 250,
    numComponents = 2,
    // Component A
    typeA = 'sine',
    freqA = 1.0,
    ampA = 2.0,
    phaseA = 0,
    // Op 1
    op1 = 'add', // 'add', 'multiply', 'subtract'
    // Component B
    typeB = 'sine',
    freqB = 5.0,
    ampB = 1.0,
    phaseB = 0,
    // Op 2 (if 3 components)
    op2 = 'add',
    // Component C (if 3 components)
    typeC = 'noise_60hz',
    freqC = 60.0,
    ampC = 0.5,
    phaseC = 0,
    // Master Output Controls
    masterGain = 1.0,
    masterOffset = 2.5
  }) {
    const totalSamples = Math.floor(duration * samplingRate);
    const samples = new Uint16Array(totalSamples);

    const applyOp = (val1, val2, op) => {
      if (op === 'multiply') return (val1 * val2) / 2.0;
      if (op === 'subtract') return val1 - val2;
      return val1 + val2;
    };

    for (let i = 0; i < totalSamples; i++) {
      const t = i / samplingRate;
      const valA = (ampA / 2.0) * SignalGenerator.evaluateComponent(typeA, t, freqA, phaseA);
      const valB = (ampB / 2.0) * SignalGenerator.evaluateComponent(typeB, t, freqB, phaseB);

      let combined = applyOp(valA, valB, op1);

      if (numComponents === 3) {
        const valC = (ampC / 2.0) * SignalGenerator.evaluateComponent(typeC, t, freqC, phaseC);
        combined = applyOp(combined, valC, op2);
      }

      // Apply master gain and offset
      const v = masterOffset + combined * masterGain;
      samples[i] = SignalGenerator.voltageToDac(v);
    }

    const opSymbol = op1 === 'add' ? 'PLUS' : op1 === 'multiply' ? 'MOD' : 'SUB';
    let name = `MIX_${typeA.toUpperCase().substring(0, 3)}_${opSymbol}_${typeB.toUpperCase().substring(0, 3)}`;
    if (numComponents === 3) {
      name += `_${typeC.toUpperCase().substring(0, 3)}`;
    }

    return {
      name: name.substring(0, 16),
      samplingRate,
      samples: Array.from(samples),
      duration
    };
  }

  // ==========================================================================
  // 5. UTILITY & FILE CONVERTERS
  // ==========================================================================

  /**
   * Clamps voltage (0.0V - 5.0V) and maps to 12-bit DAC value (0 - 4095)
   */
  static voltageToDac(voltage) {
    const clamped = Math.max(0.0, Math.min(5.0, voltage));
    return Math.round((clamped / 5.0) * 4095.0);
  }

  /**
   * Converts 12-bit DAC value to approximate output voltage
   */
  static dacToVoltage(dac) {
    return (dac / 4095.0) * 5.0;
  }

  /**
   * Parses CSV or TXT file content
   */
  static parseFileContent(text, filename = 'UPLOADED.CSV') {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let samplingRate = 250;
    let name = filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const rawValues = [];

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (line.includes('SamplingRate:')) {
          const match = line.match(/SamplingRate:\s*(\d+)/i);
          if (match) samplingRate = parseInt(match[1], 10);
        } else if (line.includes('Name:')) {
          const match = line.match(/Name:\s*([\w\-]+)/i);
          if (match) name = match[1];
        }
        continue;
      }

      if (line.toLowerCase().includes('dac_value') || line.toLowerCase().includes('index') || line.toLowerCase().includes('voltage')) {
        continue;
      }

      if (line.includes(',')) {
        const parts = line.split(',');
        let val = NaN;
        if (parts.length >= 2) {
          val = parseInt(parts[1], 10);
          if (isNaN(val)) val = parseInt(parts[0], 10);
        } else {
          val = parseInt(parts[0], 10);
        }
        if (!isNaN(val)) rawValues.push(val);
      } else {
        const val = parseInt(line, 10);
        if (!isNaN(val)) rawValues.push(val);
      }
    }

    if (rawValues.length === 0) {
      throw new Error('No se encontraron muestras numéricas válidas en el archivo.');
    }

    const samples = rawValues.map(v => Math.max(0, Math.min(4095, Math.round(v))));
    const duration = samples.length / samplingRate;

    return {
      name: name.toUpperCase().substring(0, 16),
      samplingRate,
      samples,
      duration
    };
  }

  /**
   * Exports signal structure to standard CSV string
   */
  static exportToCSV(signalData) {
    const { name, samplingRate, samples } = signalData;
    let csv = `# Name: ${name}\n`;
    csv += `# SamplingRate: ${samplingRate}\n`;
    csv += `# Samples: ${samples.length}\n`;
    csv += `# Duration_s: ${(samples.length / samplingRate).toFixed(3)}\n`;
    csv += `index,dac_value,voltage_v\n`;
    for (let i = 0; i < samples.length; i++) {
      const v = SignalGenerator.dacToVoltage(samples[i]).toFixed(4);
      csv += `${i},${samples[i]},${v}\n`;
    }
    return csv;
  }
}
