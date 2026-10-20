/**
 * LCD Keypad Shield Button Driver on Pin A2
 * Handles reading the analog resistor ladder, debouncing, and key events.
 */

#pragma once
#include <Arduino.h>
#include "config.h"

enum KeypadButton {
  KEY_NONE = 0,
  KEY_RIGHT,
  KEY_UP,
  KEY_DOWN,
  KEY_LEFT,
  KEY_SELECT
};

class KeypadA1 {
public:
  KeypadA1(uint8_t pin = PIN_KEYPAD_ANALOG);
  void init();
  
  // Updates internal debouncing. Call regularly in loop().
  void update();
  
  // Returns the currently pressed button (raw or debounced)
  KeypadButton getCurrentKey();
  
  // Returns single-shot key event (triggered only once per press or on auto-repeat)
  KeypadButton getKeyEvent();
  
  // Helper to get string name of button
  static const char* getKeyName(KeypadButton btn);

  // Raw analog read for diagnostics
  int readRaw();

private:
  uint8_t _pin;
  KeypadButton _lastKey;
  KeypadButton _stableKey;
  KeypadButton _pendingEvent;
  unsigned long _lastDebounceTime;
  unsigned long _pressStartTime;
  unsigned long _lastRepeatTime;
  
  KeypadButton classifyAdc(int adcValue);
};
