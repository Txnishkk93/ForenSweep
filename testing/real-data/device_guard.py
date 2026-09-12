"""Hard safety gates for real-device test-harness operations."""
from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

MAX_DEFAULT_SIZE_BYTES = 64 * 1024**3


@dataclass(frozen=True)
class DeviceInfo:
    path: str
    size_bytes: int
    model: str
    serial: str
    system_serial: str | None
    mount_path: str

    @property
    def matches_system_disk(self) -> bool:
        return bool(self.system_serial and self.serial and self.serial == self.system_serial)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _run(command: list[str]) -> str:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return completed.stdout.strip()


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _powershell_json(script: str) -> Any:
    return json.loads(_run(["powershell", "-NoProfile", "-Command", script]))


def _windows_device(mount: Path) -> DeviceInfo:
    raw = str(mount)
    drive = mount.drive.rstrip("\\") if mount.exists() else ""
    volume_selector = (
        f"$volume = Get-Volume -DriveLetter '{drive.rstrip(':')}'"
        if drive
        else f"$volume = Get-Volume -FileSystemLabel '{raw.replace("'", "''")}' | Select-Object -First 1"
    )
    script = f"""
{volume_selector}
$partition = if ($volume) {{ Get-Partition -DriveLetter $volume.DriveLetter }}
$disk = if ($partition) {{ Get-Disk -Number $partition.DiskNumber }}
$systemDrive = (Get-CimInstance Win32_OperatingSystem).SystemDrive.TrimEnd(':')
$systemPartition = Get-Partition -DriveLetter $systemDrive
$systemDisk = if ($systemPartition) {{ Get-Disk -Number $systemPartition.DiskNumber }}
[pscustomobject]@{{ volume=$volume; disk=$disk; system=$systemDisk }} | ConvertTo-Json -Depth 5
"""
    data = _powershell_json(script)
    disk = data.get("disk") or {}
    volume = data.get("volume") or {}
    system = data.get("system") or {}
    path = _clean(disk.get("DeviceID"))
    serial = _clean(disk.get("SerialNumber"))
    if not path or not serial:
        raise RuntimeError(f"Could not resolve a physical disk and serial behind {mount}")
    return DeviceInfo(
        path=path,
        size_bytes=int(disk.get("Size") or volume.get("Size") or 0),
        model=_clean(disk.get("Model")),
        serial=serial,
        system_serial=_clean(system.get("SerialNumber")) or None,
        mount_path=str(mount),
    )


def _linux_device(mount: Path) -> DeviceInfo:
    rows = json.loads(_run(["lsblk", "-J", "-b", "-o", "NAME,PATH,SIZE,MODEL,SERIAL,MOUNTPOINT,FSTYPE"]))
    target = str(mount.resolve())

    def walk(items: list[dict[str, Any]]) -> dict[str, Any] | None:
        for item in items:
            if _clean(item.get("mountpoint")) == target:
                return item
            found = walk(item.get("children") or [])
            if found:
                return found
        return None

    item = walk(rows.get("blockdevices") or [])
    if not item or not _clean(item.get("path")) or not _clean(item.get("serial")):
        raise RuntimeError(f"Could not resolve a physical block device and serial behind {mount}")
    system_serial = None
    try:
        root_item = walk(json.loads(_run(["lsblk", "-J", "-b", "-o", "NAME,PATH,SERIAL,MOUNTPOINT"])).get("blockdevices") or [])
        system_serial = _clean(root_item.get("serial")) if root_item else None
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        pass
    return DeviceInfo(
        path=_clean(item.get("path")),
        size_bytes=int(item.get("size") or 0),
        model=_clean(item.get("model")),
        serial=_clean(item.get("serial")),
        system_serial=system_serial,
        mount_path=str(mount),
    )


def _mac_device(mount: Path) -> DeviceInfo:
    info = json.loads(_run(["diskutil", "info", "-plist", str(mount)]))
    path = _clean(info.get("ParentWholeDisk"))
    if path and not path.startswith("/dev/"):
        path = "/dev/" + path
    serial = _clean(info.get("DeviceSerialNumber") or info.get("DeviceIdentifier"))
    if not path or not serial:
        raise RuntimeError(f"Could not resolve a physical disk and serial behind {mount}")
    disk = json.loads(_run(["diskutil", "info", "-plist", path]))
    boot = json.loads(_run(["diskutil", "info", "-plist", "/"]))
    boot_parent = _clean(boot.get("ParentWholeDisk"))
    boot_disk = json.loads(_run(["diskutil", "info", "-plist", "/dev/" + boot_parent])) if boot_parent else {}
    return DeviceInfo(
        path=path,
        size_bytes=int(disk.get("TotalSize") or info.get("TotalSize") or 0),
        model=_clean(disk.get("DeviceModel")),
        serial=serial,
        system_serial=_clean(boot_disk.get("DeviceSerialNumber") or boot_disk.get("DeviceIdentifier")) or None,
        mount_path=str(mount),
    )


def resolve_block_device(mount_path_or_label: str | os.PathLike[str]) -> DeviceInfo:
    """Resolve a mounted volume to its physical disk; folders are never accepted."""
    raw = str(mount_path_or_label).strip()
    if not raw:
        raise ValueError("A mounted volume path or volume label is required")
    mount = Path(raw)
    if not mount.exists() or not mount.is_dir():
        raise RuntimeError(f"Volume mount path does not exist or is not a directory: {raw}")
    system = platform.system()
    if system == "Windows":
        return _windows_device(mount)
    if system == "Linux":
        return _linux_device(mount)
    if system == "Darwin":
        return _mac_device(mount)
    raise RuntimeError(f"Unsupported operating system for physical-device resolution: {system}")


def format_bytes(value: int) -> str:
    amount = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if amount < 1024 or unit == "TiB":
            return f"{amount:.1f} {unit}"
        amount /= 1024
    return f"{value} B"


def describe_device(device: DeviceInfo) -> str:
    return (
        f"device={device.path}\n"
        f"size={format_bytes(device.size_bytes)} ({device.size_bytes} bytes)\n"
        f"model={device.model or '<unknown>'}\n"
        f"serial={device.serial}\n"
        f"system_serial={device.system_serial or '<unknown>'}"
    )


def assert_safe_to_wipe(
    device_info: DeviceInfo,
    expected_serial: str | None,
    max_size_bytes: int = MAX_DEFAULT_SIZE_BYTES,
) -> None:
    """Reject oversized, system, or unexpectedly identified devices."""
    if device_info.size_bytes > max_size_bytes:
        raise RuntimeError(
            f"Safety gate refused device: size {format_bytes(device_info.size_bytes)} exceeds "
            f"maximum {format_bytes(max_size_bytes)}"
        )
    if device_info.matches_system_disk:
        raise RuntimeError("Safety gate refused device: serial matches the system/boot disk")
    if expected_serial is not None and expected_serial != device_info.serial:
        raise RuntimeError(
            f"Safety gate refused device: expected serial {expected_serial!r}, "
            f"resolved {device_info.serial!r}"
        )


def _logger(results_dir: Path) -> logging.Logger:
    results_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("forensweep.device_guard")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.FileHandler(results_dir / "run.log", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
    return logger


def require_device_gate(
    target: str,
    expected_serial: str | None,
    results_dir: Path,
    max_size_bytes: int = MAX_DEFAULT_SIZE_BYTES,
) -> DeviceInfo:
    """Resolve, display, and explicitly authorize a real volume before touching it."""
    logger = _logger(results_dir)
    try:
        device = resolve_block_device(target)
        print("Resolved test device:")
        print(describe_device(device))
        logger.info("safety_gate device=%s decision=resolved info=%s", device.path, json.dumps(device.as_dict()))
        assert_safe_to_wipe(device, expected_serial, max_size_bytes)
        if expected_serial is None:
            if not __import__("sys").stdin.isatty():
                raise RuntimeError("--i-am-sure SERIAL is required when no interactive TTY is attached")
            typed = input("Type the exact device serial to authorize this operation: ").strip()
            if typed != device.serial:
                raise RuntimeError("Safety gate refused device: typed serial does not match")
        logger.info("safety_gate device=%s decision=passed info=%s", device.path, json.dumps(device.as_dict()))
        print("Safety gate passed.")
        return device
    except Exception as exc:
        logger.error("safety_gate target=%s decision=failed error=%s", target, exc)
        print(f"Safety gate FAILED: {exc}")
        raise
