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

// --- CUSTOM LCD CHARACTERS (5x8) ---
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

byte charStop[8] = {
  B00000,
  B11111,
  B11111,
  B11111,
  B11111,
  B11111,
  B00000,
  B00000
};

byte charUsb[8] = {
  B00100,
  B01110,
  B10101,
  B00100,
  B01110,
  B01110,
  B00100,
  B00000
};

byte charBle[8] = {
  B01100,
  B01010,
  B10100,
  B01100,
  B10100,
  B01010,
  B01100,
  B00000
};

// --- LOCAL MENU & CONNECTION STATE ---
uint8_t selectedFileIndex = 0;
uint8_t detailViewIndex = 0; // 0: Fs & Muestras, 1: Duracion, 2: Enlace PC, 3: DAC Pin A0
bool lastPlayState = false;
unsigned long lastLcdUpdate = 0;
bool heartBeatBlink = false;

unsigned long lastSerialActivity = 0;
unsigned long lastBleActivity = 0;

enum LinkType {
  LINK_NONE = 0,
  LINK_USB,
  LINK_BLE
};

LinkType getActiveLinkType() {
#if ENABLE_BLE
  BLEDevice central = BLE.central();
  if (central && central.connected()) {
    return LINK_BLE;
  }
#endif
  if (Serial || (millis() - lastSerialActivity < 8000)) {
    return LINK_USB;
  }
  return LINK_NONE;
}

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
  lcd.createChar(2, charStop);
  lcd.createChar(3, charUsb);
  lcd.createChar(4, charBle);

  // Splash Screen
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CAYETINO R4 BIO ");
  lcd.setCursor(0, 1);
  lcd.print("DAC:A0  KEYS:A2 ");
  delay(1200);
  lcd.clear(); // Limpieza total para evitar residuos visuales en DDRAM

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

    case KEY_LEFT:
      // Navegar a la izquierda entre las vistas de detalles de la fila 2
      if (detailViewIndex > 0) {
        detailViewIndex--;
      } else {
        detailViewIndex = 3; // wrap around (0 a 3)
      }
      updateLcdDisplay(true);
      break;

    case KEY_RIGHT:
      // Navegar a la derecha entre las vistas de detalles de la fila 2
      detailViewIndex = (detailViewIndex + 1) % 4;
      updateLcdDisplay(true);
      break;

    case KEY_SELECT: {
      if (dacPlayer.isPlaying()) {
        const WaveformEntry* active = dacPlayer.getActiveFile();
        WaveformEntry* cur = fileStorage.getFile(selectedFileIndex);
        if (cur && active && strcmp(cur->name, active->name) == 0) {
          // Pulso SELECT en la señal activa -> Detener
          dacPlayer.stop();
          Serial.println("[LOCAL] Reproduccion detenida.");
        } else if (cur) {
          // Pulso SELECT en otra senal navegada -> Cambiar a esa senal
          dacPlayer.play(cur, true);
          Serial.print("[LOCAL] Reproduciendo: ");
          Serial.println(cur->name);
        }
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

    default:
      break;
  }
}

void updateLcdDisplay(bool forceFull) {
  uint8_t totalFiles = fileStorage.getTotalFiles();
  if (totalFiles == 0) {
    lcd.setCursor(0, 0);
    lcd.print("SIN ARCHIVOS    ");
    lcd.setCursor(0, 1);
    lcd.print("                ");
    return;
  }

  bool isPlaying = dacPlayer.isPlaying();

  // Si esta reproduciendo activamente, mantener sincronizado con el archivo en ejecucion
  if (isPlaying) {
    const WaveformEntry* activeEntry = dacPlayer.getActiveFile();
    if (activeEntry) {
      int8_t activeIdx = fileStorage.findFileIndex(activeEntry->name);
      if (activeIdx >= 0) {
        selectedFileIndex = activeIdx;
      }
    }
  }

  if (selectedFileIndex >= totalFiles) {
    selectedFileIndex = 0;
  }

  WaveformEntry* entry = fileStorage.getFile(selectedFileIndex);
  if (!entry) return;

  LinkType link = getActiveLinkType();

  // -------------------------------------------------------------
  // LINEA 1 (16 CARACTERES EXACTOS)
  // Col 0:      Icono Play (▶) o Stop (■)
  // Col 1..12:  Nombre del archivo limpio sin .CSV (12 caracteres)
  // Col 13:     Espacio (' ')
  // Col 14:     Icono Conexión (USB ⑂ / BLE ᛒ / ' ')
  // Col 15:     Latido (♥) o reposo (' ')
  // -------------------------------------------------------------
  lcd.setCursor(0, 0);

  // Col 0: Estado Play / Stop
  if (isPlaying) {
    lcd.write(byte(1)); // Play (▶)
  } else {
    lcd.write(byte(2)); // Stop (■)
  }

  // Col 1..12: Nombre limpio sin extensión .CSV
  char cleanName[16];
  strncpy(cleanName, entry->name, 15);
  cleanName[15] = '\0';
  char* dot = strrchr(cleanName, '.');
  if (dot) *dot = '\0';

  char nameBuf[13];
  snprintf(nameBuf, sizeof(nameBuf), "%-12.12s", cleanName);
  lcd.print(nameBuf);

  // Col 13: Espacio
  lcd.print(" ");

  // Col 14: Icono de enlace de comunicación
  if (link == LINK_USB) {
    lcd.write(byte(3)); // USB Cable Icon
  } else if (link == LINK_BLE) {
    lcd.write(byte(4)); // BLE Icon
  } else {
    lcd.print(" ");
  }

  // Col 15: Indicador de latido
  if (isPlaying) {
    heartBeatBlink = !heartBeatBlink;
    if (heartBeatBlink) {
      lcd.write(byte(0)); // Latido Corazón (♥)
    } else {
      lcd.print(" ");
    }
  } else {
    lcd.print(" ");
  }

  // -------------------------------------------------------------
  // LINEA 2 (16 CARACTERES EXACTOS)
  // Navegación interactiva con LEFT / RIGHT (detailViewIndex: 0..3)
  // -------------------------------------------------------------
  char line2[17];
  memset(line2, ' ', 16);
  line2[16] = '\0';

  switch (detailViewIndex) {
    case 0:
      // Vista 0: Frecuencia (Fs), Muestras (pt) y Tipo (ROM/FLS)
      // Ej: "250Hz  500pt ROM " o "500Hz 1000pt FLASH"
      snprintf(line2, sizeof(line2), "%3uHz %4upt %-5s",
               entry->samplingRate,
               entry->length,
               entry->isRom ? "ROM" : "FLASH");
      break;

    case 1: {
      // Vista 1: Duración calculada en segundos
      // Ej: "Dur:2.00s  [ROM]"
      uint16_t fs = entry->samplingRate > 0 ? entry->samplingRate : 250;
      float durSec = (float)entry->length / (float)fs;
      char durStr[8];
      dtostrf(durSec, 4, 2, durStr);
      snprintf(line2, sizeof(line2), "Dur:%ss %-7s", durStr, entry->isRom ? "[ROM]" : "[FLASH]");
      break;
    }

    case 2:
      // Vista 2: Estado de conexión PC / Cable / BLE
      if (link == LINK_USB) {
        snprintf(line2, sizeof(line2), "PC: USB CABLE OK");
      } else if (link == LINK_BLE) {
        snprintf(line2, sizeof(line2), "PC: BLE ACTIVO ");
      } else {
        snprintf(line2, sizeof(line2), "PC: DESCONECTADO");
      }
      break;

    case 3:
      // Vista 3: Salida DAC Pin A0 y estado de reproducción
      if (isPlaying) {
        snprintf(line2, sizeof(line2), "DAC A0: EN PLAY ");
      } else {
        snprintf(line2, sizeof(line2), "DAC A0: EN PAUSA");
      }
      break;

    default:
      detailViewIndex = 0;
      snprintf(line2, sizeof(line2), "%3uHz %4upt %-5s",
               entry->samplingRate,
               entry->length,
               entry->isRom ? "ROM" : "FLASH");
      break;
  }

  // Garantizar exactamente 16 caracteres completando con espacios
  int len2 = strlen(line2);
  while (len2 < 16) {
    line2[len2++] = ' ';
  }
  line2[16] = '\0';

  lcd.setCursor(0, 1);
  lcd.print(line2);
}

// ----------------------------------------------------------------------------
// HOST COMMUNICATION: SERIAL & BLE
// ----------------------------------------------------------------------------
void handleSerialInput() {
  while (Serial.available()) {
    char c = Serial.read();
    lastSerialActivity = millis();
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
      lastBleActivity = millis();
      String str = rxChar.value();
      int len = str.length();
      for (int i = 0; i < len; i++) {
        char c = str[i];
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
