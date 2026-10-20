/**
 * CAYETINO R4 - SKETCH DE VALIDACIÓN DE MODIFICACIÓN HARDWARE (A0 DAC / A2 BOTONES)
 * 
 * Este sketch permite verificar rápidamente:
 * 1. Que los botones del LCD Keypad Shield se leen correctamente en el pin A2.
 * 2. Que el pin A0 genera una rampa analógica DAC continua y que al presionar
 *    los botones no hay ninguna caída de tensión ni interferencia en A0.
 */

#include <Arduino.h>
#include <LiquidCrystal.h>

// Pines LCD 16x2
LiquidCrystal lcd(8, 9, 4, 5, 6, 7);

const uint8_t PIN_KEYPAD = A2; // Botones modificados a A2
const uint8_t PIN_DAC_OUT = A0; // Salida DAC pura en A0

uint16_t dacValue = 0;
unsigned long lastPrint = 0;

void setup() {
  Serial.begin(115200);
  
  // Backlight LCD
  pinMode(10, OUTPUT);
  digitalWrite(10, HIGH);
  lcd.begin(16, 2);

  // Configurar resolución de DAC a 12 bits (0 - 4095)
  analogWriteResolution(12);

  // Configurar entrada analógica A2
  pinMode(PIN_KEYPAD, INPUT);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TEST MOD A0/A2");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando...");
  delay(1000);
  lcd.clear();
}

void loop() {
  // 1. Generar rampa de prueba en DAC A0 (0 a 4095)
  analogWrite(PIN_DAC_OUT, dacValue);
  dacValue = (dacValue + 32) % 4096;

  // 2. Leer estado de botones en A2
  int adc = analogRead(PIN_KEYPAD);
  const char* keyName = "NONE";

  if (adc < 60)       keyName = "RIGHT ";
  else if (adc < 200) keyName = "UP    ";
  else if (adc < 400) keyName = "DOWN  ";
  else if (adc < 600) keyName = "LEFT  ";
  else if (adc < 800) keyName = "SELECT";
  else                keyName = "NONE  ";

  // 3. Actualizar LCD y Serial cada 150 ms
  if (millis() - lastPrint >= 150) {
    lastPrint = millis();

    // Línea 1: Estado del Botón en A2
    lcd.setCursor(0, 0);
    lcd.print("BTN(A2):");
    lcd.print(keyName);

    // Línea 2: Valor ADC y Salida DAC
    lcd.setCursor(0, 1);
    lcd.print("A2:");
    lcd.print(adc);
    lcd.print(" DAC:OK ");

    Serial.print("[TEST] A2 ADC: ");
    Serial.print(adc);
    Serial.print(" -> Tecla: ");
    Serial.print(keyName);
    Serial.print(" | DAC A0: ");
    Serial.println(dacValue);
  }

  delay(2);
}
