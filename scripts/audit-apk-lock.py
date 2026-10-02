import subprocess
import sys
from pathlib import Path


before = set(Path(sys.argv[1]).read_text().splitlines())
lock = Path(sys.argv[2]).read_text().splitlines()
if not lock or any(line.count("=") != 1 for line in lock) or len(lock) != len(set(lock)):
    raise SystemExit("Invalid APK lock; exact unique name=version entries required")
expected = {line.replace("=", "-", 1) for line in lock}
after = set(subprocess.check_output(["apk", "info", "-v"], text=True).splitlines())
if after - before != expected - before or not expected <= after:
    raise SystemExit("APK resolver added/changed an unlocked dependency or missed an exact pin")
locked_names = {line.split("=", 1)[0] for line in lock}
for removed in before - after:
    if not any(removed.startswith(name + "-") for name in locked_names):
        raise SystemExit("APK resolver removed an unlocked base package")
print(f"APK lock verified: all {len(after - before)} added/changed runtime packages exactly pinned")
