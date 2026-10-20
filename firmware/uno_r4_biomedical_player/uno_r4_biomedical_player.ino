/**
 * ============================================================================
 * CAYETINO R4 - REPRODUCTOR AUTÓNOMO DE SEÑALES BIOMÉDICAS Y CALIBRACIÓN
 * Placa: Arduino Uno R4 WiFi
 * 
 * MODIFICACIONES DE HARDWARE:
 * 1. Pin A0: Salida directa del DAC interno de 12 bits (0 - 4095, 0 - 5.0V).
 *            Pista del shield cortada para eliminar la carga del divisor resistivo.
 * 2. Pin A2: Entrada de la red resistiva de botones del LCD Keypad Shield
 *            (puente soldado desde la salida de los botones hacia A2).
 * 3. Pines LCD: RS=8, EN=9, D4=4, D5=5, D6=6, D7=7, Backlight=10.
 * ============================================================================
 */

#include <Arduino.h>
#include <LiquidCrystal.h>
#include "config.h"
#include "keypad_a1.h"
#include "file_storage.h"
#include "dac_player.h"
#include "comm_protocol.h"

// Check for ArduinoBLE library support (standard on Uno R4 WiFi)
#if defined(ARDUINO_UNOR4_WIFI)
  #include <ArduinoBLE.h>
  #define ENABLE_BLE 1
#else
  #define ENABLE_BLE 0
#endif

// --- HARDWARE INSTANCES ---
LiquidCrystal lcd(PIN_LCD_RS, PIN_LCD_EN, PIN_LCD_D4, PIN_LCD_D5, PIN_LCD_D6, PIN_LCD_D7);
KeypadA1 keypad(PIN_KEYPAD_ANALOG);
FileStorage fileStorage;
DacPlayer dacPlayer(fileStorage);
CommProtocol comm(fileStorage, dacPlayer);

// --- BLE DEFINITIONS (Nordic UART Service) ---
#if ENABLE_BLE
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic rxChar("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite | BLEWriteWithoutResponse, 64);
BLEStringCharacteristic txChar("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", BLENotify, 64);

class BlePrint : public Print {
public:
  size_t write(uint8_t c) override {
    if (_len < sizeof(_buffer) - 1) {
      _buffer[_len++] = (char)c;
      if (c == '\n' || _len >= sizeof(_buffer) - 1) {
        flushBuffer();
      }
    }
    return 1;
  }
  void flushBuffer() {
    if (_len > 0) {
      _buffer[_len] = '\0';
      txChar.writeValue(_buffer);
      _len = 0;
    }
  }
private:
  char _buffer[64];
  size_t _len = 0;
} blePrint;
#endif

// --- CUSTOM LCD CHARACTERS ---
byte charHeart[8] = {
  B00000,
  B01010,
  B11111,
  B11111,
  B01110,
  B00100,
  B00000,
  B00000
};

byte charPlay[8] = {
  B00000,
  B01000,
  B01100,
  B01110,
  B01100,
  B01000,
  B00000,
  B00000
};

// --- LOCAL MENU STATE ---
uint8_t selectedFileIndex = 0;
bool lastPlayState = false;
unsigned long lastLcdUpdate = 0;
bool heartBeatBlink = false;

// Serial and BLE reception buffers
char serialBuffer[128];
uint8_t serialBufferIdx = 0;

char bleBuffer[128];
uint8_t bleBufferIdx = 0;

// Forward declarations
void updateLcdDisplay(bool forceFull);
void handleSerialInput();
void handleKeypad();
#if ENABLE_BLE
void handleBleInput();
#endif

void setup() {
  // 1. Initialize Serial Port
  Serial.begin(SERIAL_BAUD_RATE);

  // 2. Initialize LCD & Backlight
  pinMode(PIN_LCD_BACKLIGHT, OUTPUT);
  digitalWrite(PIN_LCD_BACKLIGHT, HIGH);
  lcd.begin(16, 2);
  lcd.createChar(0, charHeart);
  lcd.createChar(1, charPlay);

  // Splash Screen
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CAYETINO R4 BIO");
  lcd.setCursor(0, 1);
  lcd.print("DAC:A0  KEYS:A2");
  delay(1400);

  // 3. Initialize Keypad on Pin A2
  keypad.init();

  // 4. Initialize File Storage & Preloaded Waveforms
  fileStorage.init();

  // 5. Initialize 12-bit DAC on Pin A0
  dacPlayer.init();

  // 6. Initialize BLE if supported
#if ENABLE_BLE
  if (BLE.begin()) {
    BLE.setLocalName(BLE_LOCAL_NAME);
    BLE.setDeviceName(BLE_DEVICE_NAME);
    BLE.setAdvertisedService(uartService);
    uartService.addCharacteristic(rxChar);
    uartService.addCharacteristic(txChar);
    BLE.addService(uartService);
    BLE.advertise();
    Serial.println("[BLE] Servicio Nordic UART iniciado en Uno R4 WiFi");
  } else {
    Serial.println("[BLE] Advertencia: No se pudo inicializar BLE.");
  }
#endif

  Serial.println("=================================================");
  Serial.println("  CAYETINO R4 - SISTEMA INICIADO EXITOSAMENTE");
  Serial.println("  DAC: Pin A0 (12 bits) | Botones: Pin A2 (Mod)");
  Serial.println("=================================================");

  updateLcdDisplay(true);
}

void loop() {
  // A. Maintain DAC timer fallback if hardware ISR not active
  dacPlayer.update();

  // B. Process USB Serial Commands
  handleSerialInput();

  // C. Process BLE Commands
#if ENABLE_BLE
  handleBleInput();
#endif

  // D. Process Local Keypad on Pin A2
  handleKeypad();

  // E. Periodic LCD Refresh
  if (millis() - lastLcdUpdate >= 180) {
    lastLcdUpdate = millis();
    updateLcdDisplay(false);
  }
}

// ----------------------------------------------------------------------------
// LOCAL KEYPAD (PIN A2) & MENU LOGIC
// ----------------------------------------------------------------------------
void handleKeypad() {
  keypad.update();
  KeypadButton btn = keypad.getKeyEvent();

  if (btn == KEY_NONE) return;

  uint8_t totalFiles = fileStorage.getTotalFiles();
  if (totalFiles == 0) return;

  switch (btn) {
    case KEY_UP:
      if (selectedFileIndex > 0) {
        selectedFileIndex--;
      } else {
        selectedFileIndex = totalFiles - 1; // wrap around
      }
      updateLcdDisplay(true);
      break;

    case KEY_DOWN:
      if (selectedFileIndex < totalFiles - 1) {
        selectedFileIndex++;
      } else {
        selectedFileIndex = 0; // wrap around
      }
      updateLcdDisplay(true);
      break;

    case KEY_SELECT: {
      // Toggle Play / Stop
      if (dacPlayer.isPlaying()) {
        dacPlayer.stop();
        Serial.println("[LOCAL] Reproduccion detenida.");
      } else {
        WaveformEntry* entry = fileStorage.getFile(selectedFileIndex);
        if (entry) {
          dacPlayer.play(entry, true);
          Serial.print("[LOCAL] Reproduciendo: ");
          Serial.println(entry->name);
        }
      }
      updateLcdDisplay(true);
      break;
    }

    case KEY_LEFT: {
      // Decrease playback sample rate
      uint16_t curFs = dacPlayer.getSampleRate();
      if (curFs > 50) {
        curFs = curFs <= 125 ? 50 : (curFs <= 250 ? 125 : 250);
        dacPlayer.setSampleRate(curFs);
        updateLcdDisplay(true);
      }
      break;
    }

    case KEY_RIGHT: {
      // Increase playback sample rate
      uint16_t curFs = dacPlayer.getSampleRate();
      if (curFs < 1000) {
        curFs = curFs >= 500 ? 1000 : (curFs >= 250 ? 500 : 250);
        dacPlayer.setSampleRate(curFs);
        updateLcdDisplay(true);
      }
      break;
    }

    default:
      break;
  }
}

void updateLcdDisplay(bool forceFull) {
  WaveformEntry* entry = fileStorage.getFile(selectedFileIndex);
  if (!entry) return;

  bool isPlaying = dacPlayer.isPlaying();

  // Line 1: [Icono] NombreArchivo [♥/STP]
  lcd.setCursor(0, 0);
  if (isPlaying) {
    lcd.write(byte(1)); // Play arrow
  } else {
    lcd.print(" ");
  }
  
  // Format filename (up to 12 chars)
  char nameBuf[13];
  strncpy(nameBuf, entry->name, 12);
  nameBuf[12] = '\0';
  lcd.print(nameBuf);

  // Fill spaces to align icon
  int len = strlen(nameBuf);
  for (int i = len; i < 12; i++) {
    lcd.print(" ");
  }

  // Right-most status icon
  if (isPlaying) {
    heartBeatBlink = !heartBeatBlink;
    if (heartBeatBlink) {
      lcd.write(byte(0)); // Heart
    } else {
      lcd.print(" ");
    }
  } else {
    lcd.print(" ");
  }

  // Line 2: Fs:250Hz  1000pt
  lcd.setCursor(0, 1);
  lcd.print("Fs:");
  lcd.print(dacPlayer.getSampleRate());
  lcd.print("Hz ");
  
  lcd.print(entry->length);
  lcd.print("pt ");
  if (entry->isRom) {
    lcd.print("ROM");
  } else {
    lcd.print("FLS");
  }
}

// ----------------------------------------------------------------------------
// HOST COMMUNICATION: SERIAL & BLE
// ----------------------------------------------------------------------------
void handleSerialInput() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      serialBuffer[serialBufferIdx] = '\0';
      if (serialBufferIdx > 0) {
        comm.processLine(serialBuffer, Serial);
        updateLcdDisplay(true);
      }
      serialBufferIdx = 0;
    } else {
      if (serialBufferIdx < sizeof(serialBuffer) - 1) {
        serialBuffer[serialBufferIdx++] = c;
      }
    }
  }
}

#if ENABLE_BLE
void handleBleInput() {
  BLEDevice central = BLE.central();
  if (central && central.connected()) {
    if (rxChar.written()) {
      String received = rxChar.value();
      for (unsigned int i = 0; i < received.length(); i++) {
        char c = received[i];
        if (c == '\r') continue;
        if (c == '\n') {
          bleBuffer[bleBufferIdx] = '\0';
          if (bleBufferIdx > 0) {
            comm.processLine(bleBuffer, blePrint);
            blePrint.flushBuffer();
            updateLcdDisplay(true);
          }
          bleBufferIdx = 0;
        } else {
          if (bleBufferIdx < sizeof(bleBuffer) - 1) {
            bleBuffer[bleBufferIdx++] = c;
          }
        }
      }
    }
  }
}
#endif
