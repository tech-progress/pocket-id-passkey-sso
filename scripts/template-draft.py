import copy
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
NAME = "Pocket ID"


def load(path):
    return json.loads(Path(path).read_text())


def configuration(document):
    if "data" in document:
        return document["data"]["template"]["serializedConfig"]
    if "serializedConfig" in document:
        return document["serializedConfig"]
    return document


def desired():
    rendered = subprocess.run(["node", "scripts/render.mjs"], cwd=ROOT, check=True,
                              capture_output=True, text=True)
    return json.loads(rendered.stdout)["configuration"]["services"][NAME]


def target(config):
    services = config.get("services")
    if isinstance(services, list) and len(services) == 1:
        service = services[0]
        actual_name = service.get("name")
    elif isinstance(services, dict) and len(services) == 1:
        binding, service = next(iter(services.items()))
        actual_name = service.get("name", binding)
    else:
        raise ValueError("Expected exactly one Pocket ID service in a list or mapping")
    if actual_name != NAME:
        raise ValueError("Expected exactly one actual Pocket ID draft service; retain its IDs")
    mounts = service.get("volumeMounts", {})
    if not isinstance(mounts, dict) or len(mounts) != 1:
        raise ValueError("Expected one existing draft volume binding; do not fabricate a volume ID")
    return service


def restore(document):
    result = copy.deepcopy(document)
    config = configuration(result)
    service = target(config)
    expected = desired()
    defaults = load(ROOT / "template-defaults.json")[NAME]
    descriptions = load(ROOT / "template-descriptions.json")[NAME]
    volume = load(ROOT / "template-volumes.json")[NAME]
    service["source"] = expected["source"]
    service["build"] = expected["build"]
    service["deploy"] = expected["deploy"]
    service["variables"] = {
        key: {"defaultValue": value, "description": descriptions[key], "isOptional": False}
        for key, value in defaults.items()
    }
    binding = next(iter(service["volumeMounts"]))
    service["volumeMounts"] = {binding: volume}
    service["networking"] = {"serviceDomains": {"<hasDomain>": {"port": 8080}}}
    return result


def audit(document):
    config = configuration(document)
    service = target(config)
    expected = desired()
    for key in ("source", "build", "deploy"):
        if service.get(key) != expected.get(key):
            raise ValueError(f"Draft {key} differs from the local rendered contract")
    defaults = load(ROOT / "template-defaults.json")[NAME]
    descriptions = load(ROOT / "template-descriptions.json")[NAME]
    if set(service.get("variables", {})) != set(defaults):
        raise ValueError("Draft has missing or unexpected variables")
    for key, value in defaults.items():
        actual = service["variables"][key]
        if actual.get("value") is not None or actual.get("encryptedValue") is not None:
            raise ValueError(f"Draft contains a resolved variable instead of template defaults: {key}")
        if (actual.get("defaultValue") != value or actual.get("description") != descriptions[key] or
                actual.get("isOptional") is not False):
            raise ValueError(f"Draft variable contract differs: {key}")
    mount = next(iter(service["volumeMounts"].values()))
    if mount != load(ROOT / "template-volumes.json")[NAME]:
        raise ValueError("Draft volume path/size differs")
    if service.get("networking") != {"serviceDomains": {"<hasDomain>": {"port": 8080}}}:
        raise ValueError("Draft must expose only the gate, with no TCP proxy or backend domain")
    if set(config) - {"services", "name", "description", "version"}:
        raise ValueError("Unexpected top-level serialized resources require manual review")


def main():
    action, filename, *rest = sys.argv[1:]
    document = load(filename)
    if action == "restore" and len(rest) == 1:
        destination = Path(rest[0])
        if destination.resolve() == Path(filename).resolve():
            raise ValueError("Use a new output file; retain the actual exported draft")
        result = restore(document)
        audit(result)
        with destination.open("x") as output:
            os.chmod(destination, 0o600)
            json.dump(result, output, indent=2)
            output.write("\n")
        print("Offline draft restored and audited; no network calls or platform mutations")
    elif action == "audit" and not rest:
        audit(document)
        print("Offline draft source/rootDirectory, Dockerfile, start, secrets, single volume and gate-only networking passed")
    else:
        raise ValueError("Usage: template-draft.py restore INPUT OUTPUT | audit INPUT")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Draft refused: {error}", file=sys.stderr)
        sys.exit(1)
