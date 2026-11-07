# Compilación y comprobación local

Entorno usado: Windows, MSYS2 UCRT64, Python de UCRT64, GCC y .NET SDK 8.
Ejecutar los comandos de bash desde la raíz del repositorio dentro de UCRT64.

Antes de empaquetar, preparar los instrumentos desde PowerShell:

```powershell
./tools/stage-instruments.ps1 -Source 'C:\Users\mindr\Desktop\PHAEDRA LITE\phaedra-instruments\dist\Phaedra Instruments'
```

El preparador verifica los hashes originales y conserva las licencias y las
fuentes modificadas. Los tres binarios exportan VST3 de forma nativa.

```sh
python waf configure --with-backends=portaudio,dummy --no-phone-home --dist-target=mingw --optimize --program-name=Phaedra
python waf build -j6 -k
PHAEDRA_DEVELOPMENT_BUILD=1 bash make_portable.sh
python tools/check-portable-dependencies.py
python tools/create-lite-port-fixtures.py
```

No volver a configurar para cada compilación incremental. `-k` permite recopilar
errores de tareas independientes sin abandonar inmediatamente las demás.
Reducir a `-j4` si falta memoria. El empaquetador exige `build/pulse-bundle` con
Pulse, su licencia GPL y su archivo de fuentes modificadas; no descarga otro
visualizador ni sustituye un directorio Phaedra-Portable ya existente.

`PHAEDRA_DEVELOPMENT_BUILD=1` marca el paquete para impedir que el actualizador
lo sustituya por una release pública. No es una publicación de versión.

Desde PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File phaedra_updater/test-update-policy.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File phaedra_updater/test-install-package.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/start-lite-port-qa.ps1
```

El último comando abre el ejecutable de audio del paquete con un perfil propio
en `build/lite-port-qa/config` y otro perfil de Pulse en
`build/lite-port-qa/pulse-profile`. Omite el actualizador para esta prueba.
Los archivos de audio y MIDI de prueba están en `build/lite-port-qa/fixtures`.

La comprobación de dependencias compara las importaciones PE con los archivos
del paquete y las DLL de este Windows. No sustituye una prueba en otra máquina
ni certifica compatibilidad con otras versiones de Windows.

Estado y resultados reales: `README.md` y `validation-20261103.json`.
