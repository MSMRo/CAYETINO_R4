/**
 * DAC Waveform Player for Arduino Uno R4 (Pin A0)
 * Uses 12-bit true DAC and Hardware Timer (FspTimer) for jitter-free output.
 */

#pragma once
#include <Arduino.h>
#include "config.h"
#include "file_storage.h"

#if defined(ARDUINO_UNOR4_WIFI) || defined(ARDUINO_UNOR4_MINIMA)
  #define HAS_FSP_TIMER 1
  #include "FspTimer.h"
#endif

class DacPlayer {
public:
  DacPlayer(FileStorage& storage);
  void init();

  // Playback control
  bool play(WaveformEntry* entry, bool loop = true);
  void stop();
  void setSampleRate(uint16_t fs);

  bool isPlaying() const { return _isPlaying; }
  uint16_t getCurrentIndex() const { return _currentIndex; }
  uint16_t getSampleRate() const { return _currentFs; }
  const WaveformEntry* getActiveFile() const { return _activeFile; }

  // Called by hardware timer or main loop fallback
  void onTimerTick();

  // Call in loop() to handle non-ISR tasks or fallback timing
  void update();

private:
  FileStorage& _storage;
  WaveformEntry* _activeFile;
  volatile bool _isPlaying;
  volatile bool _loop;
  volatile uint16_t _currentIndex;
  volatile uint16_t _currentFs;
  unsigned long _intervalMicros;
  unsigned long _lastTickMicros;

#if HAS_FSP_TIMER
  FspTimer _timer;
  bool _timerInitialized;
  bool setupTimerOnce();
#endif
};
