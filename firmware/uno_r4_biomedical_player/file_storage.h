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

  // File write protocol methods
  bool startWrite(const char* filename, uint16_t samplingRate, uint16_t totalSamples);
  bool appendSamples(const uint16_t* samples, uint16_t count);
  bool commitWrite();
  void abortWrite();

  // Read a sample safely from either ROM or RAM
  uint16_t getSample(const WaveformEntry* entry, uint16_t index);

  bool isWriting() const { return _isWriting; }

private:
  WaveformEntry _entries[5 + MAX_CUSTOM_FILES];
  uint8_t _totalFiles;

  // Custom RAM storage buffers
  uint16_t _customBuffers[MAX_CUSTOM_FILES][MAX_CUSTOM_SAMPLES];
  uint8_t _customCount;

  // Active write transaction
  bool _isWriting;
  uint8_t _activeSlot;
  uint16_t _writeIndex;
  uint16_t _expectedSamples;
  char _writingName[18];
  uint16_t _writingFs;

  void loadRomFiles();
};
