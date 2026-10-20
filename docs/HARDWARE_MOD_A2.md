# Protocolo de Modificación Física y Validación: LCD Keypad Shield (A0 → A2)

## 1. Fundamento Técnico y Necesidad de la Modificación

En el **Arduino Uno R4 WiFi** (microcontrolador Renesas RA4M1), el convertidor digital-analógico real de 12 bits (**DAC**) está conectado **única y exclusivamente al pin analógico A0** (puerto P014 del microcontrolador).

Por diseño histórico, los módulos **LCD 16x2 Keypad Shield** comerciales utilizan una red divisora de tensión resistiva conectada al pin **A0** para leer el estado de 5 pulsadores (`RIGHT`, `UP`, `DOWN`, `LEFT`, `SELECT`).

### El Problema de Coexistencia:
Si el shield se monta sin modificar sobre el Arduino Uno R4:
1. La impedancia de salida del DAC compite directamente contra las resistencias del divisor de tensión (resistores de $2\,\text{k}\Omega$, $330\,\Omega$, $620\,\Omega$, etc.).
2. El DAC se satura o sufre distorsión armónica masiva, perdiendo su rango dinámico (0 a 4095) e impidiendo la reproducción de bioseñales fieles.
3. Presionar un botón altera el voltaje del DAC y corrompe la señal biomédica.

### La Solución:
Interrumpir la pista de cobre que lleva la señal de los pulsadores hacia el pin **A0** y redirigirla mediante un puente de soldadura hacia el pin **A2**. Con esto:
- **Pin A0:** Queda 100% aislado, de alta fidelidad y libre para el DAC de 12 bits.
- **Pin A2:** Asume la lectura del teclado con idéntica precisión analógica.

---

## 2. Procedimiento de Modificación Física (Paso a Paso)

### Herramientas Requeridas:
- Bisturí / cutter de precisión (tipo X-Acto).
- Soldador de punta fina (25W - 40W o estación regulada a 320 °C) y estaño 60/40.
- Trozo de cable delgado para puentes (AWG 30 / Kynar o similar aislado).
- Multímetro digital con probador de continuidad acústica (bip).
- Lupa o microscopio de inspección.

### Pasos de Ejecución:
1. **Identificar la pista en la cara inferior (bottom layer):**
   - Da la vuelta al LCD Keypad Shield. Localiza la tira de pines macho del conector analógico (`AD` o `ANALOG IN`).
   - Ubica el pin macho etiquetado como **A0**.
   - Observa la pista de cobre que llega a la soldadura del pin A0 proveniente de la red de pulsadores.

2. **Corte de la pista hacia A0:**
   - Con el cutter de precisión, realiza dos cortes paralelos separados por aproximadamente $1\,\text{mm}$ en la pista justo antes de que ingrese a la almohadilla (pad) del pin A0.
   - Retira el pequeño segmento de cobre intermedio con la punta del cutter para asegurar un corte limpio y evitar rebabas metálicas.

3. **Soldadura del puente hacia A2:**
   - Pela y estaña los extremos de un cable aislado de aproximadamente $2\,\text{cm}$.
   - Suelda un extremo en el nodo común de las resistencias de los botones (o en la pista cortada del lado de los botones).
   - Suelda el otro extremo directamente en el pin macho o pad del pin **A2**.

---

## 3. Protocolo de Validación Eléctrica (Checklist con Multímetro)

> [!IMPORTANT]
> Realiza estas mediciones con el shield **DESCONECTADO** del Arduino Uno R4.

```
                      TABLA DE VALIDACIÓN ELÉCTRICA
┌──────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────┐
│ Test │ Punta Roja (+)       │ Punta Negra (-)      │ Condición / Acción   │ Esperado │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-01 │ Pin A0 del Shield    │ Pin A2 del Shield    │ Reposo               │ Circuito │
│      │                      │                      │                      │ ABIERTO  │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-02 │ Pin A0 del Shield    │ Cualquier botón      │ Pulsar cada botón    │ Circuito │
│      │                      │                      │ (R, U, D, L, S)      │ ABIERTO  │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-03 │ Pin A2 del Shield    │ Línea VCC (5V)       │ Reposo (sin pulsar)  │ ~4.7 kΩ  │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-04 │ Pin A2 del Shield    │ Línea GND            │ Presionar RIGHT      │ 0 a 10 Ω │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-05 │ Pin A2 del Shield    │ Línea GND            │ Presionar UP         │ ~140 Ω   │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-06 │ Pin A2 del Shield    │ Línea GND            │ Presionar DOWN       │ ~330 Ω   │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-07 │ Pin A2 del Shield    │ Línea GND            │ Presionar LEFT       │ ~500 Ω   │
├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┤
│ T-08 │ Pin A2 del Shield    │ Línea GND            │ Presionar SELECT     │ ~740 Ω   │
└──────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────┘
```

### Criterio de Aceptación:
- **T-01 y T-02 (Aislamiento de A0):** El multímetro **NO debe pitar** ni marcar resistencia medible ($>1\,\text{M}\Omega$ o "OL"). Esto garantiza que el DAC de 12 bits operará sin distorsión.
- **T-03 a T-08 (Lectura en A2):** Cada botón debe reflejar su respectivo valor de resistencia hacia GND al ser presionado.

---

## 4. Validación Funcional con Firmware de Diagnóstico

Una vez verificado con multímetro:
1. Monta el shield modificado sobre el Arduino Uno R4 WiFi.
2. Abre y carga el sketch de validación:
   `firmware/hardware_validation_test/hardware_validation_test.ino`
3. Observa la pantalla LCD:
   - Al no pulsar nada: `BTN(A2):NONE` y `A2:~1023`.
   - Al pulsar cada botón: Debe mostrarse exactamente el nombre de la tecla (`RIGHT`, `UP`, `DOWN`, `LEFT`, `SELECT`).
4. Conecta un multímetro en modo voltaje de DC o un osciloscopio en el pin **A0**:
   - Debes observar una rampa analógica continua de $0\,\text{V}$ a $5.0\,\text{V}$ generada por el DAC.
   - **Prueba crítica:** Presiona repetidamente los botones; la rampa del DAC en el pin A0 debe mantenerse absolutamente estable, limpia y sin la más mínima perturbación o caída de tensión.
