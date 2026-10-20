/**
 * DAC Waveform Player Implementation
 */

#include "dac_player.h"

// Global pointer for ISR callback
static DacPlayer* s_dacPlayerInstance = nullptr;

#if HAS_FSP_TIMER
static void fspTimerIsrCallback(timer_callback_args_t __attribute((unused)) *p_args) {
  if (s_dacPlayerInstance) {
    s_dacPlayerInstance->onTimerTick();
  }
}
#endif

DacPlayer::DacPlayer(FileStorage& storage)
  : _storage(storage), _activeFile(nullptr), _isPlaying(false),
    _loop(true), _currentIndex(0), _currentFs(DEFAULT_SAMPLING_FS),
    _intervalMicros(1000000 / DEFAULT_SAMPLING_FS), _lastTickMicros(0)
#if HAS_FSP_TIMER
    , _timerInitialized(false)
#endif
{
  s_dacPlayerInstance = this;
}

void DacPlayer::init() {
  // Set DAC resolution to 12-bit (0 - 4095)
  analogWriteResolution(DAC_RESOLUTION_BITS);
  
  // Set output to baseline (2048 = ~2.5V reference)
  analogWrite(PIN_DAC_OUTPUT, DAC_BASELINE_LEVEL);
}

void DacPlayer::onTimerTick() {
  if (!_isPlaying || !_activeFile) return;

  uint16_t sample = _storage.getSample(_activeFile, _currentIndex);
  
  // Safe hardware scaling to 0 - 3.3V (protects external 3.3V microcontrollers)
  uint16_t outDac = ((uint32_t)sample * DAC_MAX_COUNTS_3V3) / 4095UL;
  if (outDac > DAC_MAX_COUNTS_3V3) outDac = DAC_MAX_COUNTS_3V3;

  analogWrite(PIN_DAC_OUTPUT, outDac);

  _currentIndex++;
  if (_currentIndex >= _activeFile->length) {
    if (_loop) {
      _currentIndex = 0;
    } else {
      _isPlaying = false;
      analogWrite(PIN_DAC_OUTPUT, DAC_BASELINE_LEVEL);
    }
  }
}

bool DacPlayer::play(WaveformEntry* entry, bool loop) {
  if (!entry || entry->length == 0) return false;

  stop(); // Ensure clean restart

  _activeFile = entry;
  _loop = loop;
  _currentIndex = 0;
  _currentFs = entry->samplingRate > 0 ? entry->samplingRate : DEFAULT_SAMPLING_FS;
  _intervalMicros = 1000000 / _currentFs;

#if HAS_FSP_TIMER
  if (startHardwareTimer((float)_currentFs)) {
    _isPlaying = true;
    return true;
  }
#endif

  // Fallback to high-resolution micros timer
  _isPlaying = true;
  _lastTickMicros = micros();
  return true;
}

void DacPlayer::stop() {
  _isPlaying = false;
#if HAS_FSP_TIMER
  stopHardwareTimer();
#endif
  analogWrite(PIN_DAC_OUTPUT, DAC_BASELINE_LEVEL);
  _currentIndex = 0;
}

void DacPlayer::setSampleRate(uint16_t fs) {
  if (fs < 10 || fs > 2000) return;
  _currentFs = fs;
  _intervalMicros = 1000000 / _currentFs;
  if (_isPlaying) {
#if HAS_FSP_TIMER
    stopHardwareTimer();
    startHardwareTimer((float)_currentFs);
#endif
  }
}

void DacPlayer::update() {
  // If hardware timer is not available, execute via deterministic microsecond polling
#if HAS_FSP_TIMER
  if (_timerInitialized) return; // Handled directly in ISR
#endif

  if (_isPlaying) {
    unsigned long now = micros();
    if ((now - _lastTickMicros) >= _intervalMicros) {
      _lastTickMicros += _intervalMicros;
      onTimerTick();
    }
  }
}

#if HAS_FSP_TIMER
bool DacPlayer::startHardwareTimer(float frequencyHz) {
  uint8_t timer_type = GPT_TIMER;
  int8_t tindex = FspTimer::get_available_timer(timer_type);
  if (tindex < 0) {
    timer_type = AGT_TIMER;
    tindex = FspTimer::get_available_timer(timer_type);
  }
  if (tindex < 0) return false;

  bool ok = _timer.begin(TIMER_MODE_PERIODIC, timer_type, tindex, frequencyHz, 50.0f, fspTimerIsrCallback, nullptr);
  if (!ok) return false;

  _timer.setup_overflow_irq(12);
  _timer.open();
  _timer.start();
  _timerInitialized = true;
  return true;
}

void DacPlayer::stopHardwareTimer() {
  if (_timerInitialized) {
    _timer.stop();
    _timer.close();
    _timerInitialized = false;
  }
}
#endif
