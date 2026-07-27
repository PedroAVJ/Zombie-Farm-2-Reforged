#!/usr/bin/env python3
"""Extract and organize the Zombie Farm 1 iOS asset bundle.

The raw app is preserved separately. Apple CgBI ("crushed") PNGs are decoded
into normal, portable PNGs in the organized asset tree.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import plistlib
import shutil
import struct
import zlib
from pathlib import Path
from typing import Any

from PIL import Image


GAMEPLAY = {
    "Attacks", "Drops", "Enemies", "FarmerSprites", "Gifts", "GiftSelection",
    "Market", "MutationCollection", "PlayerLevels", "Promos", "Quests",
    "ResourceRules", "TileProperties", "UnitStats", "ZombieNames",
}
SDK_PLISTS = {"AirshipConfig", "Entitlements", "Info", "LocalizationMetadata"}
MUSIC_HINTS = (
    "music", "theme", "bgm", "menu", "fight", "battle", "victory", "defeat",
    "farm", "circus", "pirate", "ninja", "robot", "beach", "alien",
)
AMBIENCE_HINTS = ("ambient", "ambience", "rain", "wind", "ocean", "wave", "birds")
TITLE_HINTS = ("mainmenu", "default", "logo", "splash", "loading", "title")
ABILITY_HINTS = (
    "ability", "attack", "bash", "heal", "stun", "telekinesis", "mindcontrol",
    "doordie", "regrowth", "insta",
)
ICON_HINTS = ("icon", "portrait", "avatar", "profile", "achievement", "badge")
RAID_HINTS = (
    "fightbg", "stage", "boss", "minion", "enemy", "projectile", "weapon",
    "invasion", "circus", "pirate", "ninja", "robot", "beach", "alien",
)
TERRAIN_HINTS = (
    "soil", "terrain", "ground", "tile", "grass", "dirt", "snow", "sand",
    "water", "road", "concrete",
)
SOCIAL_HINTS = ("facebook", "twitter", "promo", "invite", "friend", "gift")
UI_HINTS = (
    "button", "menu", "panel", "hud", "tab", "bar", "arrow", "dialog", "popup",
    "checkbox", "slider", "scroll", "window",
)
PET_HINTS = (
    "pet", "bunny", "duck", "dragon", "penguin", "polarbear", "pony", "poppy",
    "pterodactyl", "seal", "trex", "turkey", "wiggles",
)
PARTICLE_KEYS = {
    "maxParticles", "particleLifespan", "startParticleSize", "finishParticleSize",
    "blendFuncSource", "blendFuncDestination", "emitterType",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def rel_key(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def safe_destination(base: Path, source: Path, app: Path) -> Path:
    """Preserve nested bundle/localization paths and avoid basename collisions."""
    relative = source.relative_to(app)
    return base / relative if len(relative.parts) > 1 else base / source.name


def plist_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"$data_hex": value.hex()}
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): plist_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plist_value(v) for v in value]
    return value


def read_plist(path: Path) -> Any | None:
    try:
        with path.open("rb") as stream:
            return plistlib.load(stream)
    except Exception:
        return None


def plist_kind(path: Path, value: Any) -> str:
    stem = path.stem
    if stem in GAMEPLAY:
        return "gameplay"
    if stem in SDK_PLISTS or any(part.endswith(".bundle") for part in path.parts):
        return "sdk-metadata"
    if isinstance(value, dict) and PARTICLE_KEYS.intersection(value):
        return "particles"
    if isinstance(value, dict) and (
        "frames" in value
        or "metadata" in value
        or path.with_suffix(".png").exists()
        or stem.endswith(("StageSkeleton", "Skeleton"))
        or stem in {"ZombieSheet", "FarmStage", "FarmerSprites"}
    ):
        return "sprite-sheets"
    if any(hint in stem.lower() for hint in UI_HINTS):
        return "ui"
    return "misc"


def sheet_category(path: Path) -> str:
    name = path.stem.lower()
    if any(hint in name for hint in PET_HINTS):
        return "pets"
    if "zombie" in name:
        return "zombies"
    if any(hint in name for hint in ("stage", "fightbg", "alieninvader")):
        return "stages"
    if any(hint in name for hint in ("particle", "smoke", "fire", "laser", "heal",
                                      "stun", "strike", "telekinesis", "wormhole",
                                      "explosion", "boom", "bash")):
        return "particles"
    if any(hint in name for hint in UI_HINTS):
        return "ui"
    return "misc"


def standalone_category(path: Path) -> str:
    name = path.stem.lower()
    if any(hint in name for hint in TITLE_HINTS):
        return "title-loading"
    if any(hint in name for hint in ABILITY_HINTS):
        return "abilities"
    if any(hint in name for hint in ICON_HINTS):
        return "icons"
    if any(hint in name for hint in RAID_HINTS):
        return "raids"
    if any(hint in name for hint in TERRAIN_HINTS):
        return "terrain-tiles"
    if any(hint in name for hint in SOCIAL_HINTS):
        return "social-promos"
    if any(hint in name for hint in UI_HINTS):
        return "ui"
    return "misc"


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def unfilter(raw: bytes, width: int, height: int, channels: int) -> bytearray:
    stride = width * channels
    expected = height * (stride + 1)
    if len(raw) != expected:
        raise ValueError(f"unexpected raster size {len(raw)} (expected {expected})")
    output = bytearray(height * stride)
    src = 0
    for y in range(height):
        filter_type = raw[src]
        src += 1
        row_start = y * stride
        prior_start = (y - 1) * stride
        for x in range(stride):
            value = raw[src]
            src += 1
            left = output[row_start + x - channels] if x >= channels else 0
            above = output[prior_start + x] if y else 0
            upper_left = output[prior_start + x - channels] if y and x >= channels else 0
            if filter_type == 1:
                value = (value + left) & 0xFF
            elif filter_type == 2:
                value = (value + above) & 0xFF
            elif filter_type == 3:
                value = (value + ((left + above) >> 1)) & 0xFF
            elif filter_type == 4:
                value = (value + paeth(left, above, upper_left)) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            output[row_start + x] = value
    return output


def decode_cgbi(source: Path, destination: Path) -> bool:
    """Decode a CgBI PNG. Return False for an ordinary PNG."""
    blob = source.read_bytes()
    if not blob.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a PNG")
    cursor = 8
    chunks: list[tuple[bytes, bytes]] = []
    while cursor + 12 <= len(blob):
        length = struct.unpack(">I", blob[cursor:cursor + 4])[0]
        kind = blob[cursor + 4:cursor + 8]
        data = blob[cursor + 8:cursor + 8 + length]
        chunks.append((kind, data))
        cursor += 12 + length
        if kind == b"IEND":
            break
    if not any(kind == b"CgBI" for kind, _ in chunks):
        return False
    ihdr = next(data for kind, data in chunks if kind == b"IHDR")
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", ihdr
    )
    if depth != 8 or color_type not in (2, 6) or compression or filtering or interlace:
        raise ValueError(
            f"unsupported CgBI layout depth={depth}, color={color_type}, interlace={interlace}"
        )
    channels = 4 if color_type == 6 else 3
    compressed = b"".join(data for kind, data in chunks if kind == b"IDAT")
    pixels = unfilter(zlib.decompress(compressed, -15), width, height, channels)
    if channels == 4:
        for i in range(0, len(pixels), 4):
            b, g, r, a = pixels[i:i + 4]
            if a:
                r = min(255, (r * 255 + a // 2) // a)
                g = min(255, (g * 255 + a // 2) // a)
                b = min(255, (b * 255 + a // 2) // a)
            pixels[i:i + 4] = bytes((r, g, b, a))
        image = Image.frombytes("RGBA", (width, height), bytes(pixels))
    else:
        for i in range(0, len(pixels), 3):
            pixels[i], pixels[i + 2] = pixels[i + 2], pixels[i]
        image = Image.frombytes("RGB", (width, height), bytes(pixels))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", compress_level=6)
    return True


def copy_asset(source: Path, destination: Path) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix.lower() == ".png":
        try:
            if decode_cgbi(source, destination):
                return True
        except Exception as exc:
            raise RuntimeError(f"failed to decode {source}: {exc}") from exc
    shutil.copy2(source, destination)
    return False


def classify_internal(path: Path, app: Path, out: Path) -> Path:
    rel = path.relative_to(app)
    lowered = [part.lower() for part in rel.parts]
    name = path.name.lower()
    if path == app / "ZombieFarm":
        return out / "app-internals" / "executable" / path.name
    if "_codesignature" in lowered:
        return out / "app-internals" / "code-signing" / rel
    if name.endswith(".mobileprovision"):
        return out / "app-internals" / "provisioning" / path.name
    if any(part.endswith((".framework", ".dylib")) for part in lowered):
        return out / "app-internals" / "frameworks" / rel
    if any(part.endswith(".bundle") for part in lowered):
        return out / "app-internals" / "sdk-bundles" / rel
    if name in {"pkginfo", "codeResources".lower()} or "license" in name:
        return out / "app-internals" / "licenses" / rel
    return out / "app-internals" / "misc" / rel


def extract(app: Path, out: Path) -> dict[str, Any]:
    assets = out / "assets"
    data = out / "data"
    records: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    plist_cache: dict[Path, Any] = {}

    for path in app.rglob("*.plist"):
        value = read_plist(path)
        plist_cache[path] = value
        kind = plist_kind(path, value)
        original = safe_destination(data / "original-plists" / kind, path, app)
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, original)
        destinations = [original]
        if value is not None and kind not in {"sdk-metadata", "ui"}:
            json_kind = {
                "sprite-sheets": "sprites",
                "particles": "particles",
                "gameplay": "gameplay",
            }.get(kind, "misc")
            converted = safe_destination(data / "json" / json_kind, path, app).with_suffix(".json")
            converted.parent.mkdir(parents=True, exist_ok=True)
            converted.write_text(
                json.dumps(plist_value(value), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            destinations.append(converted)
        records.append({
            "source": rel_key(path, app),
            "sha256": sha256(path),
            "destinations": [rel_key(p, out) for p in destinations],
            "type": "plist",
        })

    paired_pngs: dict[Path, tuple[str, Path]] = {}
    for plist_path, value in plist_cache.items():
        png_path = plist_path.with_suffix(".png")
        if not png_path.exists():
            continue
        kind = plist_kind(plist_path, value)
        if kind == "particles":
            category = "particles"
        elif kind == "sprite-sheets":
            category = sheet_category(plist_path)
        else:
            continue
        paired_pngs[png_path] = (category, plist_path)

    for path in app.rglob("*"):
        if not path.is_file() or path.suffix.lower() == ".plist":
            continue
        ext = path.suffix.lower()
        destinations: list[Path] = []
        decoded = False
        if ext == ".png":
            if path in paired_pngs:
                category, plist_path = paired_pngs[path]
                base = assets / "spritesheets" / category
                image_destination = safe_destination(base, path, app)
                plist_destination = safe_destination(base, plist_path, app)
                decoded = copy_asset(path, image_destination)
                plist_destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(plist_path, plist_destination)
                destinations.extend((image_destination, plist_destination))
            else:
                category = standalone_category(path)
                destination = safe_destination(assets / "standalone-images" / category, path, app)
                decoded = copy_asset(path, destination)
                destinations.append(destination)
        elif ext in {".wav", ".m4a", ".mp3", ".caf", ".aif", ".aiff"}:
            name = path.stem.lower()
            category = (
                "ambience" if any(h in name for h in AMBIENCE_HINTS)
                else "music" if ext in {".m4a", ".mp3"} or any(h in name for h in MUSIC_HINTS)
                else "sfx"
            )
            destination = safe_destination(assets / "audio" / category, path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        elif ext in {".fnt", ".ttf", ".otf"}:
            destination = safe_destination(assets / "fonts", path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        elif ext == ".tmx":
            destination = safe_destination(assets / "maps", path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        elif ext in {".m4v", ".mp4", ".mov"}:
            destination = safe_destination(assets / "video", path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        elif ext in {".js", ".py", ".sh"}:
            destination = safe_destination(out / "tools" / "from-app", path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        elif ext in {".strings", ".nib", ".friend"}:
            destination = safe_destination(data / "localization-and-ui", path, app)
            copy_asset(path, destination)
            destinations.append(destination)
        else:
            destination = classify_internal(path, app, out)
            copy_asset(path, destination)
            destinations.append(destination)
        records.append({
            "source": rel_key(path, app),
            "sha256": sha256(path),
            "destinations": [rel_key(p, out) for p in destinations],
            "type": ext.lstrip(".") or "no-extension",
            "cgbi_decoded": decoded,
        })

    all_sources = {rel_key(p, app) for p in app.rglob("*") if p.is_file()}
    recorded_sources = {record["source"] for record in records}
    missing = sorted(all_sources - recorded_sources)
    if missing:
        errors.extend({"source": source, "error": "not indexed"} for source in missing)
    manifest = {
        "format_version": 1,
        "source_app": str(app),
        "source_file_count": len(all_sources),
        "indexed_source_count": len(recorded_sources),
        "cgbi_pngs_decoded": sum(bool(r.get("cgbi_decoded")) for r in records),
        "errors": errors,
        "files": sorted(records, key=lambda record: record["source"].lower()),
    }
    (out / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, required=True, help="Extracted ZombieFarm.app")
    parser.add_argument("--out", type=Path, required=True, help="ZF1_extracted root")
    args = parser.parse_args()
    app = args.app.resolve()
    out = args.out.resolve()
    if not (app / "ZombieFarm").is_file():
        raise SystemExit(f"ZombieFarm executable not found under {app}")
    out.mkdir(parents=True, exist_ok=True)
    manifest = extract(app, out)
    print(json.dumps({
        "source_file_count": manifest["source_file_count"],
        "indexed_source_count": manifest["indexed_source_count"],
        "cgbi_pngs_decoded": manifest["cgbi_pngs_decoded"],
        "errors": len(manifest["errors"]),
        "manifest": str(out / "MANIFEST.json"),
    }, indent=2))


if __name__ == "__main__":
    main()
