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

// --- DAC CONFIGURATION ---
#define DAC_RESOLUTION_BITS  12     // 0 to 4095 levels
#define DAC_BASELINE_LEVEL   2048   // Midpoint DC level (~2.5V reference)
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
#define MAX_CUSTOM_FILES         2
#define MAX_CUSTOM_SAMPLES       2500   // 2500 samples @ 250 Hz = 10.0 seconds (5.0s @ 500 Hz)
#define SERIAL_BAUD_RATE         115200

// BLE configuration (Nordic UART Service)
#define BLE_DEVICE_NAME          "Cayetino-R4"
#define BLE_LOCAL_NAME           "Cayetino Uno R4"
