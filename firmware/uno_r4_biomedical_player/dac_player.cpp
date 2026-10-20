/**
 * DAC Waveform Player Implementation
 */

#include "dac_player.h"
#include "r_dac.h"
#include "hal_data.h"

// Global pointer for ISR callback
static DacPlayer* s_dacPlayerInstance = nullptr;

// FSP DAC controller and configuration (Channel 0 on Pin A0 / P014)
static dac_instance_ctrl_t s_dac_ctrl;
static dac_extended_cfg_t s_dac_ext_cfg = {
  .enable_charge_pump = false,
  .output_amplifier_enabled = false,
  .internal_output_enabled = false,
  .data_format = DAC_DATA_FORMAT_FLUSH_RIGHT
};
static dac_cfg_t s_dac_cfg = {
  .channel = 0,
  .ad_da_synchronized = false,
  .p_extend = &s_dac_ext_cfg
};
static bool s_dac_hardware_ready = false;

static inline void writeDacHardware(uint16_t value) {
  if (s_dac_hardware_ready) {
    R_DAC->DADR[0] = value;
  } else {
    analogWrite(PIN_DAC_OUTPUT, value);
  }
}

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
  // 1. Configure Pin A0 as analog peripheral (CAC/AD/DA DA0)
  R_IOPORT_PinCfg(NULL, g_pin_cfg[PIN_DAC_OUTPUT].pin,
                  (uint32_t)((uint32_t)IOPORT_CFG_ANALOG_ENABLE |
                             (uint32_t)IOPORT_CFG_PERIPHERAL_PIN |
                             (uint32_t)IOPORT_PERIPHERAL_CAC_AD));

  // 2. Open and Start 12-bit DAC via Renesas FSP once
  fsp_err_t err = R_DAC_Open(&s_dac_ctrl, &s_dac_cfg);
  if (err == FSP_SUCCESS || err == FSP_ERR_ALREADY_OPEN) {
    R_DAC_Start(&s_dac_ctrl);
    s_dac_hardware_ready = true;
  }

  // Fallback configuration if FSP call fails
  analogWriteResolution(DAC_RESOLUTION_BITS);

  // Set initial baseline level (1351 = 1.65V DC reference)
  writeDacHardware(DAC_BASELINE_LEVEL);

#if HAS_FSP_TIMER
  setupTimerOnce();
#endif
}

void DacPlayer::onTimerTick() {
  if (!_isPlaying || !_activeFile) return;

  uint16_t sample = _storage.getSample(_activeFile, _currentIndex);
  
  // Safe hardware scaling to 0 - 3.3V (protects external 3.3V microcontrollers)
  // Maps 0..4095 digital samples to 0..2703 DAC counts on 5.0V AVCC reference
  uint16_t outDac = ((uint32_t)sample * DAC_MAX_COUNTS_3V3) / 4095UL;
  if (outDac > DAC_MAX_COUNTS_3V3) outDac = DAC_MAX_COUNTS_3V3;

  // Single-cycle glitch-free hardware write (preserves DAOE0 continuously)
  writeDacHardware(outDac);

  _currentIndex++;
  if (_currentIndex >= _activeFile->length) {
    if (_loop) {
      _currentIndex = 0;
    } else {
      _isPlaying = false;
      writeDacHardware(DAC_BASELINE_LEVEL);
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
  if (!_timerInitialized) {
    setupTimerOnce();
  }

  if (_timerInitialized) {
    _timer.set_frequency((float)_currentFs);
    _timer.start();
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
  if (_timerInitialized) {
    _timer.stop();
  }
#endif
  writeDacHardware(DAC_BASELINE_LEVEL);
  _currentIndex = 0;
}

void DacPlayer::setSampleRate(uint16_t fs) {
  if (fs < 10 || fs > 2000) return;
  _currentFs = fs;
  _intervalMicros = 1000000 / _currentFs;
  if (_isPlaying) {
#if HAS_FSP_TIMER
    if (_timerInitialized) {
      _timer.set_frequency((float)_currentFs);
    }
#endif
  }
}

void DacPlayer::update() {
  // If hardware timer is active, samples are clocked via deterministic NVIC ISR
#if HAS_FSP_TIMER
  if (_timerInitialized) return;
#endif

  if (_isPlaying) {
    unsigned long now = micros();
    if ((now - _lastTickMicros) >= _intervalMicros) {
      _lastTickMicros = now; // Never burst catch-up
      onTimerTick();
    }
  }
}

#if HAS_FSP_TIMER
bool DacPlayer::setupTimerOnce() {
  if (_timerInitialized) return true;

  uint8_t timer_type = GPT_TIMER;
  int8_t tindex = FspTimer::get_available_timer(timer_type, true);
  if (tindex < 0) {
    timer_type = AGT_TIMER;
    tindex = FspTimer::get_available_timer(timer_type, true);
  }
  if (tindex < 0) {
    return false;
  }

  bool ok = _timer.begin(TIMER_MODE_PERIODIC, timer_type, tindex, (float)DEFAULT_SAMPLING_FS, 50.0f, fspTimerIsrCallback, nullptr);
  if (!ok) {
    return false;
  }

  // Priority 6 (out of 15): Higher priority than UART and LCD bit-banging to ensure zero jitter
  _timer.setup_overflow_irq(6);
  _timer.open();
  _timerInitialized = true;
  return true;
}
#endif
