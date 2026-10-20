/**
 * File Storage & Waveform Manager for Uno R4
 * Manages ROM files (preloaded in flash) and dynamic Custom files received over Serial/BLE.
 */

#pragma once
#include <Arduino.h>
#include "config.h"

struct WaveformEntry {
  char name[18];
  uint16_t samplingRate;
  uint16_t length;
  bool isRom;
  const uint16_t* dataRom;
  uint16_t* dataRam;
};

class FileStorage {
public:
  FileStorage();
  void init();

  uint8_t getTotalFiles();
  WaveformEntry* getFile(uint8_t index);
  WaveformEntry* findFile(const char* name);
  int8_t findFileIndex(const char* name);

  // File write & delete protocol methods (Stored Files in Flash/RAM Pool)
  bool startWrite(const char* filename, uint16_t samplingRate, uint16_t totalSamples);
  bool appendSamples(const uint16_t* samples, uint16_t count);
  bool commitWrite();
  void abortWrite();
  bool deleteFile(const char* name);
  bool deleteAllCustomFiles();

  // Live RAM Preview methods (Instant Playback without saving)
  bool startPreviewWrite(const char* name, uint16_t samplingRate, uint16_t totalSamples);
  bool appendPreviewSamples(const uint16_t* samples, uint16_t count);
  bool commitPreviewWrite();
  void abortPreviewWrite();
  WaveformEntry* getPreviewEntry() { return &_previewEntry; }
  bool isPreviewActive() const { return _isPreviewActive; }
  void setPreviewActive(bool active) { _isPreviewActive = active; }

  // Read a sample safely from either ROM, RAM pool, or Preview buffer
  uint16_t getSample(const WaveformEntry* entry, uint16_t index);

  bool isWriting() const { return _isWriting; }
  bool isPreviewWriting() const { return _isPreviewWriting; }
  uint8_t getCustomCount() const { return _customCount; }
  uint16_t getPoolUsed() const { return _poolUsed; }
  uint16_t getPoolRemaining() const {
    return (_poolUsed < CUSTOM_POOL_SAMPLES) ? (CUSTOM_POOL_SAMPLES - _poolUsed) : 0;
  }

private:
  WaveformEntry _entries[5 + MAX_CUSTOM_FILES];
  uint8_t _totalFiles;
  uint8_t _customCount;

  // Shared Dynamic Sample Pool for Stored Custom Files
  uint16_t _samplePool[CUSTOM_POOL_SAMPLES];
  uint16_t _poolUsed;

  // Active write transaction for Stored Files
  bool _isWriting;
  uint16_t _writeIndex;
  uint16_t _expectedSamples;
  char _writingName[18];
  uint16_t _writingFs;

  // Dedicated Live RAM Preview
  WaveformEntry _previewEntry;
  uint16_t _previewBuffer[MAX_PREVIEW_SAMPLES];
  bool _isPreviewWriting;
  bool _isPreviewActive;
  uint16_t _previewWriteIndex;
  uint16_t _previewExpected;
  uint16_t _previewFs;
  char _previewName[18];

  void loadRomFiles();
};
