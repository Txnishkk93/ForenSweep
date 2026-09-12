from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from typing import Any


_DEVICE_PATH = re.compile(r"^/dev/[A-Za-z0-9._-]+$")
_COMMANDS = ("lsblk", "udevadm", "smartctl", "nvme")
_COMMAND_DIRECTORIES = {"/bin", "/usr/bin", "/sbin", "/usr/sbin"}
_PROBE_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True, slots=True)
class DeviceProfile:
    path: str
    model: str | None
    serial: str | None
    size: str | None
    mounted: bool
    removable: bool
    system_disk: bool
    rotational: bool | None
    transport: str
    supports_ata: bool
    supports_nvme: bool
    supports_sed: bool
    supports_crypto_erase: bool
    supports_secure_erase: bool
    responds_to_commands: bool
    capability_evidence: dict[str, Any]

    def as_payload(self) -> dict[str, Any]:
        return asdict(self)


def _command(name: str) -> str:
    if name not in _COMMANDS:
        raise ValueError("command is not allowlisted")
    path = shutil.which(name)
    if not path:
        raise FileNotFoundError(name)
    resolved = os.path.realpath(path)
    if os.path.dirname(resolved) not in _COMMAND_DIRECTORIES:
        raise PermissionError(f"{name} is outside the trusted command directories")
    return resolved


def _run_json(args: list[str], timeout: float = _PROBE_TIMEOUT_SECONDS) -> dict[str, Any]:
    if not args or os.path.basename(args[0]) not in _COMMANDS:
        raise ValueError("command is not allowlisted")
    result = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{os.path.basename(args[0])} failed")
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError("command returned an invalid JSON object")
    return value


def _lsblk() -> list[dict[str, Any]]:
    payload = _run_json(
        [
            _command("lsblk"),
            "--json",
            "--bytes",
            "--paths",
            "--output",
            "NAME,KNAME,PATH,TYPE,MODEL,SERIAL,SIZE,ROTA,RM,TRAN,MOUNTPOINTS,PKNAME",
        ],
        timeout=5.0,
    )
    blockdevices = payload.get("blockdevices")
    if not isinstance(blockdevices, list):
        raise ValueError("lsblk response has no blockdevices list")
    return [item for item in blockdevices if isinstance(item, dict)]


def _children(node: dict[str, Any]) -> list[dict[str, Any]]:
    children = node.get("children")
    return [item for item in children if isinstance(item, dict)] if isinstance(children, list) else []


def _mountpoints(node: dict[str, Any]) -> list[str]:
    values: list[str] = []
    mountpoints = node.get("mountpoints") or node.get("mountpoint")
    if isinstance(mountpoints, list):
        values.extend(str(value) for value in mountpoints if value)
    elif mountpoints:
        values.append(str(mountpoints))
    for child in _children(node):
        values.extend(_mountpoints(child))
    return values


def _flatten(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [node, *[item for child in _children(node) for item in _flatten(child)]]


def _safe_device_path(value: Any) -> str | None:
    path = str(value or "")
    return path if _DEVICE_PATH.fullmatch(path) else None


def _probe_udev(path: str) -> dict[str, str]:
    try:
        result = subprocess.run(
            [_command("udevadm"), "info", "--query=property", "--name", path],
            check=False,
            capture_output=True,
            text=True,
            timeout=_PROBE_TIMEOUT_SECONDS,
            shell=False,
        )
    except (FileNotFoundError, OSError, TimeoutError):
        return {}
    if result.returncode != 0:
        return {}
    properties: dict[str, str] = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition("=")
        if separator and key.isupper() and len(key) <= 80:
            properties[key] = value[:500]
    return properties


def _probe_smartctl(path: str) -> dict[str, Any]:
    try:
        return _run_json([_command("smartctl"), "--json", "--info", path])
    except (FileNotFoundError, OSError, RuntimeError, TimeoutError, ValueError, json.JSONDecodeError):
        return {}


def _probe_nvme(path: str) -> dict[str, Any]:
    try:
        return _run_json([_command("nvme"), "id-ctrl", "--output-format=json", path])
    except (FileNotFoundError, OSError, RuntimeError, TimeoutError, ValueError, json.JSONDecodeError):
        return {}


def _profile(node: dict[str, Any]) -> DeviceProfile | None:
    path = _safe_device_path(node.get("path"))
    if not path or node.get("type") != "disk":
        return None

    transport = str(node.get("tran") or "").lower()
    children = _flatten(node)
    mountpoints = [mount for item in children for mount in _mountpoints(item)]
    mountpoints = sorted(set(mountpoints))
    rotational_value = node.get("rota")
    rotational = rotational_value if isinstance(rotational_value, bool) else None
    if isinstance(rotational_value, int):
        rotational = rotational_value != 0

    udev = _probe_udev(path)
    smart = _probe_smartctl(path) if transport in {"sata", "ata", "usb", "scsi"} else {}
    nvme = _probe_nvme(path) if transport == "nvme" or path.startswith("/dev/nvme") else {}
    ata_evidence = {
        "transport": transport,
        "udevIdAta": udev.get("ID_ATA") == "1",
        "smartctlAvailable": bool(smart),
    }
    nvme_evidence = {
        "transport": transport,
        "udevIdNvme": udev.get("ID_NVME") == "1",
        "identifyController": bool(nvme),
    }
    sed_evidence = {
        "udevOpal": udev.get("ID_ATA_OPAL") == "1",
        "smartctlExplicitSed": smart.get("sed") is True,
    }
    supports_crypto_erase = bool(sed_evidence["udevOpal"] or sed_evidence["smartctlExplicitSed"])
    supports_secure_erase = bool(
        smart.get("security_supported") is True
        or smart.get("ata_security")
        or (nvme.get("sanicap") not in (None, 0, "0"))
    )
    responds_to_commands = bool(smart or nvme or udev)
    ssd_identity = (
        transport in {"sata", "nvme"}
        or udev.get("ID_NVME") == "1"
        or any(marker in str(node.get("model") or "").upper() for marker in ("SSD", "NVME"))
    )
    return DeviceProfile(
        path=path,
        model=str(node.get("model") or "").strip() or None,
        serial=str(node.get("serial") or "").strip() or None,
        size=str(node.get("size")) if node.get("size") is not None else None,
        mounted=bool(mountpoints),
        removable=bool(node.get("rm") is True or node.get("rm") == 1),
        system_disk="/" in mountpoints,
        rotational=rotational,
        transport=transport or "unknown",
        supports_ata=bool(ata_evidence["udevIdAta"] or smart.get("ata_version")),
        supports_nvme=bool(nvme_evidence["udevIdNvme"] or nvme),
        supports_sed=supports_crypto_erase,
        supports_crypto_erase=supports_crypto_erase,
        supports_secure_erase=supports_secure_erase,
        responds_to_commands=responds_to_commands,
        capability_evidence={
            "udev": udev,
            "smartctl": smart,
            "nvme": nvme,
            "mountpoints": mountpoints,
            "transport": transport or "unknown",
            "removable": bool(node.get("rm") is True or node.get("rm") == 1),
            "rotational": rotational,
            "ssd": transport in {"sata", "nvme"} or rotational is False,
            "ssdIdentity": ssd_identity,
            "supportsCryptoErase": supports_crypto_erase,
            "supportsSecureErase": supports_secure_erase,
            "respondsToCommands": responds_to_commands,
            "probesAreReadOnly": True,
        },
    )


def discover_devices() -> list[dict[str, Any]]:
    """Discover whole block devices without executing any mutating command."""
    if sys.platform != "linux":
        raise RuntimeError("device discovery is supported only on Linux")
    profiles = [_profile(node) for node in _lsblk()]
    return [profile.as_payload() for profile in profiles if profile is not None]