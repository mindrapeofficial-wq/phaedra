# Phaedra Air

Efecto LV2 estéreo original para Phaedra. Dos bandas de realce dinámico de agudos, inspirado en el flujo de controles de Fresh Air. No utiliza código, recursos gráficos ni presets de Slate Digital.

## Controles

- **Mid Air**: realce dinámico desde aproximadamente 2,6 kHz.
- **High Air**: realce dinámico en la zona alta, alrededor de 9,5 kHz.
- **Link**: High Air sigue el valor de Mid Air mientras está activado.
- **Trim**: ganancia de salida de -18 a +6 dB.
- **Bypass**: salida directa sin procesamiento.

La implementación usa dos filtros de primer orden en paralelo, seguidores de envolvente con ataque de 5 ms y caída de 80 ms, y suavizado de controles de 10 ms. No introduce saturación armónica ni declara latencia. Es una aproximación funcional propia; no reproduce el algoritmo oculto de Fresh Air.

## Integración

El `wscript` de Phaedra incluye `libs/plugins/a-air.lv2`. El bundle instalado localmente se encuentra en `C:\Users\mindr\AppData\Local\Programs\Phaedra by Galante\lib\ardour8\LV2\a-air.lv2`.

Verificación: compilación x64 con GCC, descubrimiento por `lv2ls`/`lv2info`, `scan-result="0"` en el registro de Phaedra y prueba de audio en 200 Hz, 4 kHz y 12 kHz. La interfaz visual es la vista genérica de plugins LV2 de Phaedra.
