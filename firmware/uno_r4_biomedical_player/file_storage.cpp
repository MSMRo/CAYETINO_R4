/**
 * File Storage Implementation
 */

#include "file_storage.h"
#include "builtin_signals.h"
#include <string.h>

FileStorage::FileStorage()
  : _totalFiles(0), _customCount(0), _poolUsed(0), _isWriting(false),
    _writeIndex(0), _expectedSamples(0), _writingFs(250),
    _isPreviewWriting(false), _isPreviewActive(false),
    _previewWriteIndex(0), _previewExpected(0), _previewFs(250) {
  memset(_samplePool, 0, sizeof(_samplePool));
  memset(_previewBuffer, 0, sizeof(_previewBuffer));
  memset(&_previewEntry, 0, sizeof(WaveformEntry));
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
  if (_isWriting || _isPreviewWriting) return false;
  if (totalSamples == 0 || totalSamples > MAX_SAMPLES_PER_FILE) return false;

  // Check if file already exists in custom slots (reclaim space by deleting old version)
  int8_t existingIdx = findFileIndex(filename);
  if (existingIdx >= 5) {
    deleteFile(filename);
  }

  // Check if slot capacity is full
  if (_customCount >= MAX_CUSTOM_FILES) {
    return false; // All 8 slots occupied
  }

  // Check if pool capacity has enough room
  if (_poolUsed + totalSamples > CUSTOM_POOL_SAMPLES) {
    return false; // Shared pool capacity exceeded
  }

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
  if (_poolUsed + _writeIndex + count > CUSTOM_POOL_SAMPLES) return false;
  if (_writeIndex + count > _expectedSamples) return false;

  for (uint16_t i = 0; i < count; i++) {
    _samplePool[_poolUsed + _writeIndex++] = samples[i];
  }
  return true;
}

bool FileStorage::commitWrite() {
  if (!_isWriting) return false;

  uint8_t entryIdx = 5 + _customCount;
  strncpy(_entries[entryIdx].name, _writingName, 17);
  _entries[entryIdx].samplingRate = _writingFs;
  _entries[entryIdx].length = _writeIndex;
  _entries[entryIdx].isRom = false;
  _entries[entryIdx].dataRom = nullptr;
  _entries[entryIdx].dataRam = &_samplePool[_poolUsed];

  _poolUsed += _writeIndex;
  _customCount++;
  _totalFiles = 5 + _customCount;

  _isWriting = false;
  return true;
}

void FileStorage::abortWrite() {
  _isWriting = false;
  _writeIndex = 0;
}

bool FileStorage::deleteFile(const char* name) {
  int8_t idx = findFileIndex(name);
  if (idx < 5) {
    return false; // Cannot delete preloaded ROM files (indices 0 to 4)
  }

  uint8_t slotToDelete = idx - 5;
  if (slotToDelete >= _customCount) {
    return false;
  }

  uint16_t delLen = _entries[idx].length;
  uint16_t delOffset = _entries[idx].dataRam - _samplePool;

  // Move subsequent pool samples down to keep pool contiguous
  uint16_t samplesToMove = _poolUsed - (delOffset + delLen);
  if (samplesToMove > 0) {
    memmove(&_samplePool[delOffset], &_samplePool[delOffset + delLen], samplesToMove * sizeof(uint16_t));
  }
  _poolUsed -= delLen;

  // Shift subsequent custom slots down and adjust their dataRam pointers
  for (uint8_t s = slotToDelete; s < _customCount - 1; s++) {
    _entries[5 + s] = _entries[5 + s + 1];
    _entries[5 + s].dataRam -= delLen;
  }

  _customCount--;
  _totalFiles = 5 + _customCount;

  // Clear vacant slot
  memset(&_entries[5 + _customCount], 0, sizeof(WaveformEntry));

  return true;
}

bool FileStorage::deleteAllCustomFiles() {
  for (uint8_t s = 0; s < MAX_CUSTOM_FILES; s++) {
    memset(&_entries[5 + s], 0, sizeof(WaveformEntry));
  }
  _customCount = 0;
  _totalFiles = 5;
  _poolUsed = 0;
  return true;
}

// ----------------------------------------------------------------------------
// LIVE RAM PREVIEW METHODS (Instant Playback without occupying storage slots)
// ----------------------------------------------------------------------------
bool FileStorage::startPreviewWrite(const char* name, uint16_t samplingRate, uint16_t totalSamples) {
  if (_isWriting || _isPreviewWriting) return false;
  if (totalSamples == 0 || totalSamples > MAX_PREVIEW_SAMPLES) return false;

  _isPreviewWriting = true;
  _previewWriteIndex = 0;
  _previewExpected = totalSamples;
  _previewFs = samplingRate > 0 ? samplingRate : 250;
  strncpy(_previewName, name, 16);
  _previewName[16] = '\0';
  return true;
}

bool FileStorage::appendPreviewSamples(const uint16_t* samples, uint16_t count) {
  if (!_isPreviewWriting) return false;
  if (_previewWriteIndex + count > MAX_PREVIEW_SAMPLES) return false;

  for (uint16_t i = 0; i < count; i++) {
    _previewBuffer[_previewWriteIndex++] = samples[i];
  }
  return true;
}

bool FileStorage::commitPreviewWrite() {
  if (!_isPreviewWriting) return false;

  strncpy(_previewEntry.name, _previewName, 17);
  _previewEntry.samplingRate = _previewFs;
  _previewEntry.length = _previewWriteIndex;
  _previewEntry.isRom = false;
  _previewEntry.dataRom = nullptr;
  _previewEntry.dataRam = _previewBuffer;

  _isPreviewWriting = false;
  _isPreviewActive = true;
  return true;
}

void FileStorage::abortPreviewWrite() {
  _isPreviewWriting = false;
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
