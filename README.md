# CAYETINO R4 - Sistema Generador y Reproductor de Señales Biomédicas

Sistema completo y robusto para **Arduino Uno R4 WiFi** con **LCD Keypad Shield**, diseñado para generar, transmitir, almacenar y reproducir señales fisiológicas y de calibración con resolución de **12 bits** en el convertidor digital-analógico (**DAC**) integrado.

![](./img/Captura%20de%20pantalla%202026-10-20%20153809.png)

---

## 📑 Resumen de Arquitectura y Hardware

- **Placa:** Arduino Uno R4 WiFi (MCU Renesas RA4M1 32-bit Cortex-M4 @ 48 MHz).
- **Salida Analógica DAC (12 bits):** **Pin A0** exclusivo ($0 - 4095$ niveles, $0 - 5.0\,\text{V}$). Libre de interferencias.
- **Teclado Local (5 botones):** **Pin A2** mediante lectura analógica debounced tras modificación física del shield.
- **Pantalla LCD 16x2:** Pines digitales D4, D5, D6, D7, D8 (RS), D9 (EN) y D10 (Backlight).
- **Conectividad:** Doble soporte para **Web Serial API** (USB CDC a 115200 baud) y **Web Bluetooth API** (BLE con servicio Nordic UART).

> [!IMPORTANT]
> **Modificación Física del LCD Keypad Shield:**
> Por defecto, el shield conecta los botones a A0. Es indispensable cortar la pista de A0 y soldar un puente hacia A2.
> Consulta la [Guía de Modificación y Validación Eléctrica](docs/HARDWARE_MOD_A2.md).

---

## 📁 Estructura del Proyecto

```
CAYETINO_R4/
├── framework/                 # Aplicación Web Frontend (compatible con GitHub Pages)
│   ├── index.html             # Interfaz de usuario (Osciloscopio, Gestor y Controles)
│   ├── css/
│   │   └── style.css          # Estilo moderno modo oscuro / clínico
│   ├── js/
│   │   ├── app.js             # Controlador principal y gestión de eventos
│   │   ├── serial_comm.js     # Driver de Web Serial API
│   │   ├── ble_comm.js        # Driver de Web Bluetooth API
│   │   ├── signal_generator.js# Generador sintético/bio en navegador y parser CSV
│   │   ├── chart_renderer.js  # Osciloscopio interactivo Canvas 60 FPS
│   │   └── protocol.js        # Protocolo de tramas, paquetes y comandos
│   └── sample_signals/        # Señales de prueba generadas (.csv, .txt, .h)
├── python/                    # Entorno de procesamiento y servidor local con uv
│   ├── pyproject.toml         # Dependencias (neurokit2, numpy, scipy, matplotlib)
│   ├── signal_generator.py    # Script generador de bioseñales con NeuroKit2
│   ├── server.py              # Servidor HTTP local con CORS y MIME types
│   └── README.md
├── firmware/                  # Firmware para Arduino IDE
│   ├── uno_r4_biomedical_player/  # Sketch principal del reproductor
│   │   ├── uno_r4_biomedical_player.ino
│   │   ├── config.h           # Configuración de pines, DAC y teclado
│   │   ├── dac_player.h / .cpp# Reproductor DAC 12-bit con FspTimer por hardware
│   │   ├── keypad_a1.h / .cpp # Controlador de botones con antirrebote en A2
│   │   ├── file_storage.h / .cpp # Gestor de archivos en ROM y RAM/Flash
│   │   ├── comm_protocol.h / .cpp# Intérprete de comandos Serial / BLE
│   │   └── builtin_signals.h  # Señales clínicas precargadas en memoria Flash
│   └── hardware_validation_test/  # Sketch de validación rápida del corte A0/A2
├── docs/
│   └── HARDWARE_MOD_A2.md     # Protocolo detallado con mediciones de multímetro
├── signals/                   # Archivos maestros generados (.csv, .txt, .h)
├── index.html                 # Redirección raíz para GitHub Pages
└── README.md
```

---

## 🚀 Inicio Rápido (Comandos Operativos)

### 1. Levantar el Servidor Local de Pruebas

Para probar la interfaz web localmente antes de desplegarla en GitHub Pages:

```bash
cd python
uv run python server.py
```
*El servidor iniciará automáticamente en `http://localhost:8000` y abrirá tu navegador predeterminado.*

*(Opcional: Si deseas generar nuevas señales con NeuroKit2 en cualquier momento:)*
```bash
cd python
uv run python signal_generator.py
```

---

### 2. Cargar el Firmware en el Arduino Uno R4 WiFi

1. Abre el **Arduino IDE** (versión 2.x recomendada).
2. Ve a **Tools > Board > Arduino Renesas Uno R4 Boards > Arduino Uno R4 WiFi**.
3. Abre el sketch principal:
   `firmware/uno_r4_biomedical_player/uno_r4_biomedical_player.ino`
4. Presiona **Upload**.
5. Al encender, el LCD mostrará:
   ```text
   CAYETINO R4 BIO
   DAC:A0  KEYS:A2
   ```
   e ingresará automáticamente al menú de selección de bioseñales.

---

### 3. Operación Portátil Autónoma (Sin PC)

Gracias a las señales precargadas en la memoria Flash ROM del microcontrolador y la lectura en **A2**, el dispositivo es 100% autónomo:

- **UP / DOWN:** Navega entre los archivos disponibles:
  - `01_ECG_NORM.CSV` (ECG Derivación II Normal 72 BPM)
  - `02_ECG_ARRH.CSV` (ECG Arritmia Ventricular / Extrasístoles)
  - `03_EMG_BURST.CSV` (EMG Contracción Muscular)
  - `04_SINE_1HZ.CSV` (Seno 1 Hz Calibración)
  - `05_TRI_2HZ.CSV` (Triángulo 2 Hz Calibración)
  - Archivos dinámicos transferidos desde la web (`CUSTOM_*.CSV`)
- **SELECT:** Alterna entre **Reproducir (Play)** y **Detener (Stop)**. Durante la reproducción, el icono de corazón `♥` parpadea en la pantalla LCD al ritmo de la señal.
- **LEFT / RIGHT:** Modifica la frecuencia de muestreo de salida en tiempo real ($125\,\text{Hz} \leftrightarrow 250\,\text{Hz} \leftrightarrow 500\,\text{Hz} \leftrightarrow 1000\,\text{Hz}$).

---

### 4. Conexión y Control desde la Interfaz Web

1. Abre la interfaz web (local o en GitHub Pages).
2. Haz clic en **"🔌 Web Serial"** (para conexión USB a 115200 baud) o **"📶 Web Bluetooth"** (para conexión inalámbrica BLE buscando `Cayetino-R4`).
3. Genera una señal o carga un archivo `.CSV` / `.TXT` arrastrándolo al visor.
4. Pulsa **"📤 Enviar a Flash"** para transferir la señal al Arduino con barra de progreso interactiva.
5. Controla la reproducción directamente desde la web o el teclado físico.

---

### 5. Despliegue en GitHub Pages

La carpeta `framework/` y el archivo raíz `index.html` están optimizados para operar sin backend ni compiladores adicionales:

1. Crea un repositorio en GitHub y sube todo el contenido del proyecto:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Cayetino R4 biomedical system"
   git branch -M main
   git remote add origin https://github.com/<TU_USUARIO>/<TU_REPOSITORIO>.git
   git push -u origin main
   ```
2. En tu repositorio de GitHub, dirígete a **Settings > Pages**.
3. En **Build and deployment > Source**, selecciona:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Guarda los cambios. Tu aplicación estará disponible públicamente bajo HTTPS (requisito indispensable para que los navegadores permitan Web Serial y Web Bluetooth).
