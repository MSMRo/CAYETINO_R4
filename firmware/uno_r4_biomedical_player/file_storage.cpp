/**
 * File Storage Implementation
 */

#include "file_storage.h"
#include "builtin_signals.h"
#include <string.h>

FileStorage::FileStorage()
  : _totalFiles(0), _customCount(0), _isWriting(false),
    _activeSlot(0), _writeIndex(0), _expectedSamples(0), _writingFs(250) {
}

void FileStorage::init() {
  loadRomFiles();
}

void FileStorage::loadRomFiles() {
  _totalFiles = 0;

  // 1. ECG Normal (Lead II 72 BPM)
  strncpy(_entries[_totalFiles].name, "01_ECG_NORM.CSV", 17);
  _entries[_totalFiles].samplingRate = 250;
  _entries[_totalFiles].length = sizeof(rom_ecg_norm_data) / sizeof(uint16_t);
  _entries[_totalFiles].isRom = true;
  _entries[_totalFiles].dataRom = rom_ecg_norm_data;
  _entries[_totalFiles].dataRam = nullptr;
  _totalFiles++;

  // 2. ECG Arrhythmia / PVC
  strncpy(_entries[_totalFiles].name, "02_ECG_ARRH.CSV", 17);
  _entries[_totalFiles].samplingRate = 250;
  _entries[_totalFiles].length = sizeof(rom_ecg_arrh_data) / sizeof(uint16_t);
  _entries[_totalFiles].isRom = true;
  _entries[_totalFiles].dataRom = rom_ecg_arrh_data;
  _entries[_totalFiles].dataRam = nullptr;
  _totalFiles++;

  // 3. EMG Muscle Contraction
  strncpy(_entries[_totalFiles].name, "03_EMG_BURST.CSV", 17);
  _entries[_totalFiles].samplingRate = 250;
  _entries[_totalFiles].length = sizeof(rom_emg_burst_data) / sizeof(uint16_t);
  _entries[_totalFiles].isRom = true;
  _entries[_totalFiles].dataRom = rom_emg_burst_data;
  _entries[_totalFiles].dataRam = nullptr;
  _totalFiles++;

  // 4. Pure Sine Wave 1 Hz (Calibration)
  strncpy(_entries[_totalFiles].name, "04_SINE_1HZ.CSV", 17);
  _entries[_totalFiles].samplingRate = 250;
  _entries[_totalFiles].length = sizeof(rom_sine_1hz_data) / sizeof(uint16_t);
  _entries[_totalFiles].isRom = true;
  _entries[_totalFiles].dataRom = rom_sine_1hz_data;
  _entries[_totalFiles].dataRam = nullptr;
  _totalFiles++;

  // 5. Triangle Wave 2 Hz (Calibration)
  strncpy(_entries[_totalFiles].name, "05_TRI_2HZ.CSV", 17);
  _entries[_totalFiles].samplingRate = 250;
  _entries[_totalFiles].length = sizeof(rom_tri_2hz_data) / sizeof(uint16_t);
  _entries[_totalFiles].isRom = true;
  _entries[_totalFiles].dataRom = rom_tri_2hz_data;
  _entries[_totalFiles].dataRam = nullptr;
  _totalFiles++;
}

uint8_t FileStorage::getTotalFiles() {
  return _totalFiles;
}

WaveformEntry* FileStorage::getFile(uint8_t index) {
  if (index < _totalFiles) {
    return &_entries[index];
  }
  return nullptr;
}

WaveformEntry* FileStorage::findFile(const char* name) {
  for (uint8_t i = 0; i < _totalFiles; i++) {
    if (strcasecmp(_entries[i].name, name) == 0) {
      return &_entries[i];
    }
  }
  return nullptr;
}

int8_t FileStorage::findFileIndex(const char* name) {
  for (uint8_t i = 0; i < _totalFiles; i++) {
    if (strcasecmp(_entries[i].name, name) == 0) {
      return (int8_t)i;
    }
  }
  return -1;
}

bool FileStorage::startWrite(const char* filename, uint16_t samplingRate, uint16_t totalSamples) {
  if (totalSamples > MAX_CUSTOM_SAMPLES) {
    return false; // exceeds buffer capacity
  }

  // Check if file already exists in custom slots to overwrite
  int slot = -1;
  for (uint8_t i = 5; i < _totalFiles; i++) {
    if (strcasecmp(_entries[i].name, filename) == 0) {
      slot = i - 5;
      break;
    }
  }

  if (slot < 0) {
    // New slot
    if (_customCount < MAX_CUSTOM_FILES) {
      slot = _customCount;
    } else {
      // Overwrite oldest custom slot (round robin)
      slot = 0;
    }
  }

  _activeSlot = slot;
  _isWriting = true;
  _writeIndex = 0;
  _expectedSamples = totalSamples;
  _writingFs = samplingRate > 0 ? samplingRate : 250;
  strncpy(_writingName, filename, 16);
  _writingName[16] = '\0';

  return true;
}

bool FileStorage::appendSamples(const uint16_t* samples, uint16_t count) {
  if (!_isWriting) return false;
  if (_writeIndex + count > MAX_CUSTOM_SAMPLES) return false;

  for (uint16_t i = 0; i < count; i++) {
    _customBuffers[_activeSlot][_writeIndex++] = samples[i];
  }
  return true;
}

bool FileStorage::commitWrite() {
  if (!_isWriting) return false;

  uint8_t entryIdx = 5 + _activeSlot;
  strncpy(_entries[entryIdx].name, _writingName, 17);
  _entries[entryIdx].samplingRate = _writingFs;
  _entries[entryIdx].length = _writeIndex;
  _entries[entryIdx].isRom = false;
  _entries[entryIdx].dataRom = nullptr;
  _entries[entryIdx].dataRam = _customBuffers[_activeSlot];

  if (_activeSlot >= _customCount) {
    _customCount = _activeSlot + 1;
    _totalFiles = 5 + _customCount;
  }

  _isWriting = false;
  return true;
}

void FileStorage::abortWrite() {
  _isWriting = false;
  _writeIndex = 0;
}

uint16_t FileStorage::getSample(const WaveformEntry* entry, uint16_t index) {
  if (!entry || index >= entry->length) {
    return DAC_BASELINE_LEVEL;
  }
  if (entry->isRom && entry->dataRom) {
    return pgm_read_word(&(entry->dataRom[index]));
  }
  if (!entry->isRom && entry->dataRam) {
    return entry->dataRam[index];
  }
  return DAC_BASELINE_LEVEL;
}
