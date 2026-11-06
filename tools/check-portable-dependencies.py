"""Check PE import names against the portable package and this Windows host."""
from pathlib import Path
import os
import re
import subprocess
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "Phaedra-Portable").resolve()
objdump = Path(r"C:\msys64\ucrt64\bin\objdump.exe")
system = Path(os.environ["SystemRoot"]) / "System32"
modules = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in (".dll", ".exe", ".la", ".vst3")]
if not modules:
    raise SystemExit("No packaged PE modules found")
missing = []
for module in modules:
    result = subprocess.run([str(objdump), "-p", str(module)], capture_output=True, text=True)
    if result.returncode:
        missing.append(f"Cannot inspect PE: {module.relative_to(root)}")
        continue
    for name in re.findall(r"DLL Name:\s*(\S+)", result.stdout):
        # API-set contracts are resolved by Windows, not distributable DLL files.
        if name.lower().startswith(("api-ms-", "ext-ms-")):
            continue
        if not any((directory / name).is_file() for directory in (module.parent, root / "bin", system)):
            missing.append(f"{module.relative_to(root)} requires {name}")
report = root.parent / "build" / "portable-dependencies.log"
report.write_text("\n".join(missing) + ("\n" if missing else f"PASS: {len(modules)} PE modules checked against package and local Windows system DLLs.\n"), encoding="utf-8")
print(report.read_text(encoding="utf-8"), end="")
raise SystemExit(bool(missing))
