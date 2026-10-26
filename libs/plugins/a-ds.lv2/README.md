# Phaedra DS (LV2)

De-esser estereo original integrado entre los plugins LV2 incluidos de Phaedra. Usa el URI `https://phaedra.arcanumgames.es/plugins/ds` y aparece con la etiqueta `dyn:de-esser`.

## Controles

- **Detection**: Voice pondera la energia alta frente al nivel general; Allround usa el nivel alto filtrado.
- **Processing**: Wide reduce toda la senal; Split reduce solo la banda alta.
- **Threshold, Range, Frequency, Attack, Release, Lookahead, Stereo Link, Mix**.
- **Listen**: detector o senal retirada; **Bypass**; medidor de reduccion.
- La salida **Latency** comunica al anfitrion el retardo variable del lookahead en muestras.

El detector usa dos etapas de paso alto. El procesamiento Split separa y recombina las bandas con un filtro de primer orden. Se reserva memoria solo durante la creacion del plugin, no en el hilo de audio.

## Compilacion y prueba

El `wscript` principal incluye este bundle y Waf lo instala en `LV2DIR`. El empaquetador portable comprueba que existan `a-ds.dll`, `a-ds.ttl` y `manifest.ttl`.

En MSYS2 UCRT64:

```sh
gcc -std=c99 -O2 -Wall -Wextra -shared a-ds.c -o a-ds.dll -lm
gcc -std=c99 -O2 -Wall -Wextra a-ds.c test_ds.c -o test_ds.exe -lm
./test_ds.exe
```

La prueba comprueba atenuacion selectiva de una senal de 9 kHz frente a 500 Hz, limite de Range, reporte de latencia y bypass con lookahead. La interfaz en Phaedra es la vista generica LV2. No se ha hecho una prueba auditiva de produccion ni una comparacion de algoritmo con FabFilter.