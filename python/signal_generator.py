#!/usr/bin/env python3
"""
Biomedical & Synthetic Signal Generator for Arduino Uno R4 WiFi
Uses NeuroKit2, NumPy, and SciPy to generate clinical-grade waveforms
quantized to 12-bit (0-4095) for the internal DAC on Pin A0.
"""

import os
import sys
import argparse
import numpy as np
from pathlib import Path

# Try importing neurokit2, give friendly message if environment is still syncing
try:
    import neurokit2 as nk
except ImportError:
    nk = None


def quantize_to_12bit(signal: np.ndarray, headroom: float = 0.90) -> np.ndarray:
    """
    Scale a floating point signal to 12-bit unsigned integers (0 - 4095)
    centered at 2048 (Vref/2) with safety headroom to prevent clipping.
    """
    signal = np.asarray(signal, dtype=np.float64)
    # Remove any extreme outliers or NaN
    signal = np.nan_to_num(signal, nan=0.0)
    
    # Center around zero
    s_mean = np.mean(signal)
    s_centered = signal - s_mean
    
    # Peak amplitude
    max_abs = np.max(np.abs(s_centered))
    if max_abs == 0:
        max_abs = 1.0

    # Scale to fill 12-bit range with safety headroom
    # 2048 is the DC midpoint (approx 2.5V on 5V Uno R4)
    max_swing = 2047.0 * headroom
    scaled = (s_centered / max_abs) * max_swing + 2048.0
    
    # Hard clamp to 0 - 4095
    dac_values = np.clip(np.round(scaled), 0, 4095).astype(np.uint16)
    return dac_values


def generate_ecg_normal(duration: float = 4.0, sampling_rate: int = 250, heart_rate: int = 72) -> np.ndarray:
    """Generate Lead II Normal Sinus Rhythm with realistic HRV."""
    if nk is None:
        raise RuntimeError("neurokit2 is not installed. Run 'uv sync' first.")
    ecg = nk.ecg_simulate(
        duration=duration,
        sampling_rate=sampling_rate,
        heart_rate=heart_rate,
        method="ecgsyn",
        noise=0.02
    )
    return ecg


def generate_ecg_arrhythmia(duration: float = 4.0, sampling_rate: int = 250) -> np.ndarray:
    """Generate Ventricular Arrhythmia / Premature Ventricular Contractions."""
    if nk is None:
        raise RuntimeError("neurokit2 is not installed. Run 'uv sync' first.")
    ecg = nk.ecg_simulate(
        duration=duration,
        sampling_rate=sampling_rate,
        heart_rate=95,
        method="simple",
        noise=0.05
    )
    # Inject PVC-like wide QRS complex
    t = np.linspace(0, duration, len(ecg))
    pvc_center = duration * 0.55
    pvc_wave = -2.5 * np.exp(-((t - pvc_center) ** 2) / (2 * (0.07 ** 2)))
    pvc_twave = 1.2 * np.exp(-((t - (pvc_center + 0.15)) ** 2) / (2 * (0.12 ** 2)))
    return ecg + pvc_wave + pvc_twave


def generate_emg_burst(duration: float = 4.0, sampling_rate: int = 250) -> np.ndarray:
    """Generate realistic Surface Electromyogram (sEMG) with muscle activation bursts."""
    if nk is None:
        raise RuntimeError("neurokit2 is not installed. Run 'uv sync' first.")
    emg = nk.emg_simulate(
        duration=duration,
        sampling_rate=sampling_rate,
        burst_number=3,
        burst_duration=0.6,
        noise=0.05
    )
    return emg


def generate_sine_wave(duration: float = 4.0, sampling_rate: int = 250, freq: float = 1.0) -> np.ndarray:
    """Generate pure sine calibration waveform."""
    t = np.linspace(0, duration, int(duration * sampling_rate), endpoint=False)
    return np.sin(2 * np.pi * freq * t)


def generate_triangle_wave(duration: float = 4.0, sampling_rate: int = 250, freq: float = 2.0) -> np.ndarray:
    """Generate triangle calibration waveform."""
    t = np.linspace(0, duration, int(duration * sampling_rate), endpoint=False)
    # Sawtooth/triangle from scipy or numpy
    period = 1.0 / freq
    tri = 2.0 * np.abs(2.0 * (t / period - np.floor(t / period + 0.5))) - 1.0
    return tri


def export_signal_files(name: str, raw_sig: np.ndarray, sampling_rate: int, output_dirs: list[Path]):
    """Export signal as CSV, TXT, and C header (.h)."""
    dac_values = quantize_to_12bit(raw_sig)
    num_samples = len(dac_values)
    duration = num_samples / sampling_rate

    for out_dir in output_dirs:
        out_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. CSV Format (with header comments for web loader)
        csv_path = out_dir / f"{name}.csv"
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(f"# Name: {name}\n")
            f.write(f"# SamplingRate: {sampling_rate}\n")
            f.write(f"# Samples: {num_samples}\n")
            f.write(f"# Duration_s: {duration:.3f}\n")
            f.write(f"# BitResolution: 12\n")
            f.write("index,dac_value,voltage_v\n")
            for i, val in enumerate(dac_values):
                v = (val / 4095.0) * 5.0  # Approx 5V reference
                f.write(f"{i},{val},{v:.4f}\n")

        # 2. Raw Plain TXT (one integer per line)
        txt_path = out_dir / f"{name}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            for val in dac_values:
                f.write(f"{val}\n")

        # 3. C Header file (.h) for direct PROGMEM firmware embedding
        h_path = out_dir / f"{name}.h"
        var_name = name.lower().replace("-", "_")
        with open(h_path, "w", encoding="utf-8") as f:
            f.write(f"// Generated biomedical signal: {name}\n")
            f.write(f"// Sampling Rate: {sampling_rate} Hz | Samples: {num_samples} | Duration: {duration:.2f} s\n")
            f.write(f"#pragma once\n#include <stdint.h>\n\n")
            f.write(f"const uint16_t {var_name}_fs = {sampling_rate};\n")
            f.write(f"const uint16_t {var_name}_len = {num_samples};\n")
            f.write(f"const uint16_t {var_name}_samples[{num_samples}] = {{\n")
            for i in range(0, num_samples, 12):
                chunk = dac_values[i:i+12]
                f.write("  " + ", ".join(f"{x}" for x in chunk) + (",\n" if i + 12 < num_samples else "\n"))
            f.write("};\n")

    print(f"  [OK] Generated '{name}': {num_samples} samples @ {sampling_rate} Hz ({duration:.2f} s)")


def generate_all(sampling_rate: int = 250, duration: float = 4.0):
    """Generate the full standard suite of clinical and calibration signals."""
    base_dir = Path(__file__).resolve().parent
    workspace_root = base_dir.parent
    
    # We output to python/output, root signals/, and framework/sample_signals/
    target_dirs = [
        base_dir / "output",
        workspace_root / "signals",
        workspace_root / "framework" / "sample_signals"
    ]
    
    print("\n--- Generating Biomedical & Calibration Signals (12-bit DAC / 250 Hz) ---")
    signals = {
        "ECG_NORMAL_72BPM": generate_ecg_normal(duration=duration, sampling_rate=sampling_rate, heart_rate=72),
        "ECG_ARRHYTHMIA": generate_ecg_arrhythmia(duration=duration, sampling_rate=sampling_rate),
        "EMG_CONTRACTION": generate_emg_burst(duration=duration, sampling_rate=sampling_rate),
        "CAL_SINE_1HZ": generate_sine_wave(duration=duration, sampling_rate=sampling_rate, freq=1.0),
        "CAL_TRIANGLE_2HZ": generate_triangle_wave(duration=duration, sampling_rate=sampling_rate, freq=2.0),
    }

    for name, raw in signals.items():
        export_signal_files(name, raw, sampling_rate, target_dirs)

    print("\nAll signals successfully exported to:")
    for d in target_dirs:
        print(f"  -> {d.resolve()}")
    print("------------------------------------------------------------------------\n")


def main():
    parser = argparse.ArgumentParser(description="Biomedical Signal Generator for Arduino Uno R4 (12-bit DAC)")
    parser.add_argument("--all", action="store_true", default=True, help="Generate all default signals")
    parser.add_argument("--sampling-rate", "-fs", type=int, default=250, help="Sampling frequency in Hz (default: 250)")
    parser.add_argument("--duration", "-d", type=float, default=4.0, help="Signal duration in seconds (default: 4.0)")
    args = parser.parse_args()

    generate_all(sampling_rate=args.sampling_rate, duration=args.duration)


if __name__ == "__main__":
    main()
