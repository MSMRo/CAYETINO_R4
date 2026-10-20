/**
 * Cayetino R4 - Configuration & Hardware Pinout
 * 
 * Hardware Notes:
 * - Pin A0: Dedicated 12-bit DAC output (Free of resistive loads after hardware mod)
 * - Pin A2: LCD Keypad Shield button matrix input (Modified bridge from A0 to A2)
 * - Pins D4-D9: Standard LCD 16x2 parallel interface
 * - Pin D10: LCD Backlight control (Optional PWM)
 */

#pragma once
#include <Arduino.h>

// --- PINOUT DEFINITIONS ---
#define PIN_DAC_OUTPUT       A0     // 12-bit true DAC on Arduino Uno R4 (RA4M1)
#define PIN_KEYPAD_ANALOG    A2     // Analog button ladder on LCD Keypad Shield (Modified to A2)
#define PIN_LCD_RS           8
#define PIN_LCD_EN           9
#define PIN_LCD_D4           4
#define PIN_LCD_D5           5
#define PIN_LCD_D6           6
#define PIN_LCD_D7           7
#define PIN_LCD_BACKLIGHT    10

// --- DAC CONFIGURATION (3.3V MAX SAFE OUTPUT) ---
// Uno R4 AVCC0 is 5.0V; 12-bit DAC: 0 to 4095
// Maximum 3.3V output: (3.3V / 5.0V) * 4095 = 2703 counts
// Midpoint 1.65V reference: 2703 / 2 = 1351 counts
#define DAC_RESOLUTION_BITS  12     // 0 to 4095 levels
#define DAC_MAX_COUNTS_3V3   2703   // (3.3V / 5.0V) * 4095 = 2703
#define DAC_BASELINE_LEVEL   1351   // Midpoint DC level (~1.65V reference)
#define DEFAULT_SAMPLING_FS  250    // Default 250 Hz sample rate (4.0 ms period)

// --- KEYPAD THRESHOLDS (10-bit ADC: 0 - 1023 on Pin A2) ---
// Voltage divider typically:
// RIGHT: ~0V (<50), UP: ~0.7V (<195), DOWN: ~1.6V (<380),
// LEFT: ~2.5V (<555), SELECT: ~3.6V (<790), NONE: >800 (~1023)
#define KEYPAD_THRESHOLD_RIGHT   60
#define KEYPAD_THRESHOLD_UP      200
#define KEYPAD_THRESHOLD_DOWN    400
#define KEYPAD_THRESHOLD_LEFT    600
#define KEYPAD_THRESHOLD_SELECT  800

// --- SYSTEM LIMITS ---
#define MAX_CUSTOM_FILES         8      // Up to 8 user waveform files (4x previous capacity)
#define CUSTOM_POOL_SAMPLES      4000   // 4000 samples shared dynamic pool (8 KB RAM, e.g. 8 files x 500 pts)
#define MAX_SAMPLES_PER_FILE     1500   // Max 1500 samples for any single stored file (6.0s @ 250 Hz)
#define MAX_PREVIEW_SAMPLES      1000   // Dedicated Live RAM Preview buffer (2 KB RAM, 4.0s @ 250 Hz)
#define SERIAL_BAUD_RATE         115200

// BLE configuration (Nordic UART Service)
#define BLE_DEVICE_NAME          "Cayetino-R4"
#define BLE_LOCAL_NAME           "Cayetino Uno R4"
