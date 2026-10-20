/**
 * LCD Keypad Shield Button Driver on Pin A2 Implementation
 */

#include "keypad_a1.h"

KeypadA1::KeypadA1(uint8_t pin)
  : _pin(pin), _lastKey(KEY_NONE), _stableKey(KEY_NONE),
    _pendingEvent(KEY_NONE), _lastDebounceTime(0),
    _pressStartTime(0), _lastRepeatTime(0) {
}

void KeypadA1::init() {
  pinMode(_pin, INPUT);
}

int KeypadA1::readRaw() {
  // Ensure we read consistently in 10-bit scale (0 - 1023)
  // Uno R4 defaults to 10-bit analogRead unless changed
  return analogRead(_pin);
}

KeypadButton KeypadA1::classifyAdc(int adc) {
  // If resolution is higher (e.g. 12-bit, >1023), scale down to 10-bit
  if (adc > 1023) {
    adc = adc >> 2; // divide by 4
  }

  if (adc < KEYPAD_THRESHOLD_RIGHT)  return KEY_RIGHT;
  if (adc < KEYPAD_THRESHOLD_UP)     return KEY_UP;
  if (adc < KEYPAD_THRESHOLD_DOWN)   return KEY_DOWN;
  if (adc < KEYPAD_THRESHOLD_LEFT)   return KEY_LEFT;
  if (adc < KEYPAD_THRESHOLD_SELECT) return KEY_SELECT;
  
  return KEY_NONE;
}

void KeypadA1::update() {
  int raw = readRaw();
  KeypadButton reading = classifyAdc(raw);
  unsigned long now = millis();

  if (reading != _lastKey) {
    _lastDebounceTime = now;
    _lastKey = reading;
  }

  if ((now - _lastDebounceTime) > 35) { // 35ms debounce window
    if (reading != _stableKey) {
      _stableKey = reading;
      if (_stableKey != KEY_NONE) {
        _pendingEvent = _stableKey;
        _pressStartTime = now;
        _lastRepeatTime = now;
      }
    } else if (_stableKey != KEY_NONE) {
      // Auto-repeat for scrolling menus if held
      if ((now - _pressStartTime) > 500 && (now - _lastRepeatTime) > 200) {
        _pendingEvent = _stableKey;
        _lastRepeatTime = now;
      }
    }
  }
}

KeypadButton KeypadA1::getCurrentKey() {
  return _stableKey;
}

KeypadButton KeypadA1::getKeyEvent() {
  KeypadButton ev = _pendingEvent;
  _pendingEvent = KEY_NONE;
  return ev;
}

const char* KeypadA1::getKeyName(KeypadButton btn) {
  switch (btn) {
    case KEY_RIGHT:  return "RIGHT";
    case KEY_UP:     return "UP";
    case KEY_DOWN:   return "DOWN";
    case KEY_LEFT:   return "LEFT";
    case KEY_SELECT: return "SELECT";
    default:         return "NONE";
  }
}
