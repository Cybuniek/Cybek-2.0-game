#!/usr/bin/env python3
"""Prepare Neura cutscene expression assets from generated strips."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "pets" / "neura" / "neura-miny.png"
TMP = ROOT / "tmp" / "neura-cutscene"
OUT = ROOT / "public" / "pets" / "neura" / "cutscene"
FRAME_WIDTH = 400
FRAME_SIZE = 512


@dataclass(frozen=True)
class Expression:
    name: str
    frames: int
    fps: int
    seed_frames: tuple[int, ...]
    prompt: str


EXPRESSIONS: tuple[Expression, ...] = (
    Expression(
        "calm",
        3,
        4,
        (0, 5, 0),
        "calm neutral presence, relaxed arms, tiny breathing motion, steady face",
    ),
    Expression(
        "curious",
        4,
        5,
        (1, 6, 1, 6),
        "curious attentive pose, slight head tilt, hands near chest, searching look",
    ),
    Expression(
        "tired",
        3,
        3,
        (5, 1, 5),
        "tired but composed pose, lowered shoulders, slow blink, restrained motion",
    ),
    Expression(
        "dry",
        3,
        4,
        (4, 9, 4),
        "dry sarcastic pose, crossed arms, unimpressed android confidence",
    ),
    Expression(
        "delighted",
        5,
        6,
        (3, 8, 2, 8, 3),
        "delighted success reaction, hands near face, small excited bounce, bright expression",
    ),
    Expression(
        "glitch",
        5,
        8,
        (4, 9, 5, 9, 4),
        "glitch instability, same pose family, subtle RGB split, corrupted edges, not horror",
    ),
)


def chroma_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            max_rb = max(r, b)
            excess = g - max_rb
            if g >= 80 and excess > 35:
                if excess >= 95:
                    pixels[x, y] = (r, g, b, 0)
                else:
                    alpha = int(round(255 * (95 - excess) / 60))
                    pixels[x, y] = (r, max_rb, b, min(a, max(0, alpha)))
            elif g > max_rb and a:
                pixels[x, y] = (r, int(round(max_rb + (g - max_rb) * 0.55)), b, a)
    return rgba


def is_border_background_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a <= 8:
        return True
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722)
    grayish = max_c - min_c <= 34
    green_screen = g >= 80 and g - max(r, b) > 35
    pale_checker = grayish and luminance >= 170
    pure_dark_backdrop = grayish and luminance <= 4
    return green_screen or pale_checker or pure_dark_backdrop


def remove_border_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    queue: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        if (x, y) in visited:
            continue
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        if not is_border_background_pixel(r, g, b, a):
            continue
        pixels[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))
    return rgba


def split_source() -> list[Image.Image]:
    source = Image.open(SOURCE).convert("RGBA")
    if source.width % FRAME_WIDTH != 0:
        raise SystemExit(f"{SOURCE} width must be divisible by {FRAME_WIDTH}.")
    frames = []
    for index in range(source.width // FRAME_WIDTH):
        frame = source.crop((index * FRAME_WIDTH, 0, (index + 1) * FRAME_WIDTH, source.height))
        frames.append(chroma_key(frame))
    return frames


def bbox(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return alpha.getbbox()


def compose_frame(content: Image.Image, max_w: int, max_h: int) -> Image.Image:
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    scale = min((FRAME_SIZE - 24) / max_w, (FRAME_SIZE - 12) / max_h)
    width = max(1, int(round(content.width * scale)))
    height = max(1, int(round(content.height * scale)))
    resized = content.resize((width, height), Image.Resampling.LANCZOS)
    left = (FRAME_SIZE - width) // 2
    top = FRAME_SIZE - height
    canvas.alpha_composite(resized, (left, top))
    return canvas


def crop_contents(frames: Iterable[Image.Image]) -> list[Image.Image]:
    contents = []
    for frame in frames:
        box = bbox(frame)
        if box is None:
            contents.append(Image.new("RGBA", (1, 1), (0, 0, 0, 0)))
        else:
            contents.append(frame.crop(box))
    return contents


def normalize_frames(frames: list[Image.Image]) -> list[Image.Image]:
    keyed = [chroma_key(remove_border_background(frame)) for frame in frames]
    contents = crop_contents(keyed)
    max_w = max(content.width for content in contents)
    max_h = max(content.height for content in contents)
    return [compose_frame(content, max_w, max_h) for content in contents]


def write_strip(frames: list[Image.Image], path: Path) -> None:
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path)


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)
    colors = ((239, 243, 246, 255), (220, 226, 232, 255))
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            color = colors[((x // tile) + (y // tile)) % 2]
            draw.rectangle((x, y, x + tile, y + tile), fill=color)
    return image


def write_preview(frames: list[Image.Image], path: Path) -> None:
    gap = 12
    width = len(frames) * FRAME_SIZE + (len(frames) - 1) * gap
    preview = checkerboard((width, FRAME_SIZE))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame, (index * (FRAME_SIZE + gap), 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(path)


def rgb_glitch(frame: Image.Image, offset: int) -> Image.Image:
    base = frame.convert("RGBA")
    r, g, b, a = base.split()
    canvas = Image.new("RGBA", base.size, (0, 0, 0, 0))
    red = Image.merge("RGBA", (r, Image.new("L", base.size, 0), Image.new("L", base.size, 0), a))
    cyan = Image.merge("RGBA", (Image.new("L", base.size, 0), g, b, a))
    canvas.alpha_composite(cyan, (-offset, 0))
    canvas.alpha_composite(red, (offset, 0))
    canvas.alpha_composite(base)
    draw = ImageDraw.Draw(canvas)
    for y in range(40, canvas.height, 96):
        draw.rectangle((0, y, canvas.width, y + 2), fill=(95, 255, 235, 70))
    return canvas


def fallback_raw() -> None:
    frames = split_source()
    raw_dir = TMP / "raw" / "high"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for exp in EXPRESSIONS:
        selected = [frames[index] for index in exp.seed_frames]
        if exp.name == "glitch":
            selected = [rgb_glitch(frame, offset=(index % 3 + 1) * 3) for index, frame in enumerate(selected)]
        strip = Image.new("RGBA", (FRAME_WIDTH * len(selected), frames[0].height), (0, 0, 0, 0))
        for index, frame in enumerate(selected):
            strip.alpha_composite(frame, (index * FRAME_WIDTH, 0))
        strip.save(raw_dir / f"{exp.name}.png")
    print(f"fallback raw strips written to {raw_dir.relative_to(ROOT)}")


def prepare() -> None:
    frames = split_source()
    seed_dir = TMP / "seed-frames"
    prompt_dir = TMP / "prompts"
    prompt_gpt2_dir = TMP / "prompts-gpt2"
    canvas_dir = TMP / "edit-canvases"
    draft_dir = TMP / "raw" / "low"
    high_dir = TMP / "raw" / "high"
    for directory in (seed_dir, prompt_dir, prompt_gpt2_dir, canvas_dir, draft_dir, high_dir):
        directory.mkdir(parents=True, exist_ok=True)

    for index, frame in enumerate(frames):
        frame.save(seed_dir / f"{index:02d}.png")

    board = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
    board_indices = (0, 2, 3, 4)
    slot_w = board.width // len(board_indices)
    for slot, frame_index in enumerate(board_indices):
        frame = frames[frame_index]
        content_box = bbox(frame)
        content = frame.crop(content_box) if content_box else frame
        scale = min((slot_w - 24) / content.width, 940 / content.height)
        resized = content.resize(
            (int(round(content.width * scale)), int(round(content.height * scale))),
            Image.Resampling.LANCZOS,
        )
        x = slot * slot_w + (slot_w - resized.width) // 2
        y = board.height - resized.height
        board.alpha_composite(resized, (x, y))
    board.save(TMP / "reference-board.png")

    audit = {
        "source": str(SOURCE.relative_to(ROOT)),
        "sourceWidth": Image.open(SOURCE).width,
        "sourceHeight": Image.open(SOURCE).height,
        "sourceFrames": len(frames),
        "sourceFrameWidth": FRAME_WIDTH,
        "referenceBoard": str((TMP / "reference-board.png").relative_to(ROOT)),
        "targetFrameWidth": FRAME_SIZE,
        "targetFrameHeight": FRAME_SIZE,
        "budget": {
            "hardStopUsd": 2.40,
            "absoluteLimitUsd": 3.00,
            "estimatedLowLandscapeUsd": 0.013,
            "estimatedHighLandscapeUsd": 0.20,
        },
        "expressions": [
            {"name": exp.name, "frames": exp.frames, "fps": exp.fps, "seedFrames": exp.seed_frames}
            for exp in EXPRESSIONS
        ],
    }
    (TMP / "audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")

    for exp in EXPRESSIONS:
        seed = frames[exp.seed_frames[0]]
        canvas = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
        slot_w = canvas.width / exp.frames
        content_box = bbox(seed)
        content = seed.crop(content_box) if content_box else seed
        scale = min((slot_w - 24) / content.width, 940 / content.height)
        resized = content.resize(
            (max(1, int(round(content.width * scale))), max(1, int(round(content.height * scale)))),
            Image.Resampling.LANCZOS,
        )
        canvas.alpha_composite(resized, ((int(round(slot_w)) - resized.width) // 2, canvas.height - resized.height))
        canvas.save(canvas_dir / f"{exp.name}.png")

        prompt = f"""Edit the provided Neura reference board into one production-ready 2D browser-game visual novel sprite strip.

Input images:
- image 1 is the identity reference board
- image 2 is the exact strip layout; the leftmost slot is the approved seed frame

Output requirements:
- exactly {exp.frames} equal-width frames in one horizontal row
- transparent background
- no labels, no text, no scenery, no UI, no poster composition
- keep the same single character only
- keep frame 1 visually matching the approved seed from image 2
- keep Neura's identity: saturated cyan-blue hair, bright pink heart-shaped eyes, black-and-blue cyber android outfit, round goggles on head, white synthetic skin, slim anime android proportions
- the eyes must remain simple bright pink heart symbols, not normal human eyes
- goggles must remain dark round goggles with blue glass highlights, not green lenses
- keep the same palette family and outfit proportions across every frame
- same facing direction, front three-quarter portrait/full-body framing suitable for visual novel cutscenes
- consistent scale and bottom-center anchor across frames

Animation beat:
{exp.prompt}.

Style:
polished visual novel game asset, clean readable silhouette, crisp edges, restrained cyber-anime finish, production asset tone.
Avoid: extra characters, green screen background, watermark, signature, text, cropped head, cut-off body, random costume changes, different face, photoreal human skin.
"""
        (prompt_dir / f"{exp.name}.txt").write_text(prompt, encoding="utf-8")

        gpt2_prompt = f"""Use image 2 as the exact production strip layout. Preserve the leftmost frame as the identity anchor.

Create a single horizontal {exp.frames}-frame PNG sprite strip for a visual novel browser game.

Critical identity lock:
- The character is Neura, an anime android girl.
- Keep saturated cyan-blue hair, bright pink heart-shaped eyes, round dark goggles with blue glass highlights, white synthetic skin, black-and-blue cyber outfit.
- The eyes must stay bright pink heart symbols in every frame. Do not turn them into normal human eyes, dots, blush marks, or closed eyes.
- Keep the same outfit silhouette, chest panel, belt, gloves, mechanical arms, hair length, and goggles.
- Keep frame 1 visually matching the provided leftmost seed from image 2.

Frame layout:
- exactly {exp.frames} equal-width frames in one row
- no scenery, no labels, no text, no UI
- consistent scale and bottom-center anchor

Animation:
{exp.prompt}.

Avoid: new character, normal eyes, green goggle lenses, gray studio background, painterly redesign, missing goggles, cropped head, cropped lower body, watermark, signature.
"""
        (prompt_gpt2_dir / f"{exp.name}.txt").write_text(gpt2_prompt, encoding="utf-8")

    print(json.dumps(audit, indent=2))


def load_raw_expression(exp: Expression) -> Image.Image:
    final = TMP / "raw" / "final" / f"{exp.name}.png"
    if final.exists():
        return Image.open(final).convert("RGBA")
    high = TMP / "raw" / "high" / f"{exp.name}.png"
    low = TMP / "raw" / "low" / f"{exp.name}.png"
    if high.exists():
        return Image.open(high).convert("RGBA")
    if low.exists():
        return Image.open(low).convert("RGBA")
    raise SystemExit(f"Missing generated strip for {exp.name}: {high}")


def postprocess() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    summary = []
    for exp in EXPRESSIONS:
        raw = load_raw_expression(exp)
        slots = []
        for index in range(exp.frames):
            left = int(round(index * raw.width / exp.frames))
            right = int(round((index + 1) * raw.width / exp.frames))
            slots.append(raw.crop((left, 0, right, raw.height)))
        normalized = normalize_frames(slots)

        exp_dir = OUT / exp.name
        frames_dir = exp_dir / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(normalized, start=1):
            frame.save(frames_dir / f"{index:02d}.png")
        write_strip(normalized, exp_dir / "strip.png")
        write_preview(normalized, exp_dir / "preview.png")

        manifest = {
            "name": exp.name,
            "frameWidth": FRAME_SIZE,
            "frameHeight": FRAME_SIZE,
            "frames": exp.frames,
            "fps": exp.fps,
            "loop": True,
            "anchor": "bottom-center",
            "strip": "strip.png",
            "framesDir": "frames",
            "preview": "preview.png",
            "source": "generated with gpt-image-1.5 from public/pets/neura/neura-miny.png reference board",
        }
        (exp_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        summary.append(manifest)

    index = {
        "character": "Neura",
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "anchor": "bottom-center",
        "expressions": [{k: item[k] for k in ("name", "frames", "fps")} for item in summary],
    }
    (OUT / "manifest.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(index, indent=2))


def validate() -> None:
    issues: list[str] = []
    for exp in EXPRESSIONS:
        manifest_path = OUT / exp.name / "manifest.json"
        if not manifest_path.exists():
            issues.append(f"missing manifest: {manifest_path}")
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        strip_path = manifest_path.parent / manifest["strip"]
        preview_path = manifest_path.parent / manifest["preview"]
        if not strip_path.exists():
            issues.append(f"missing strip: {strip_path}")
            continue
        strip = Image.open(strip_path).convert("RGBA")
        expected = (manifest["frameWidth"] * manifest["frames"], manifest["frameHeight"])
        if strip.size != expected:
            issues.append(f"{exp.name}: strip size {strip.size} != {expected}")
        alpha = strip.getchannel("A")
        if alpha.getextrema()[0] == 255:
            issues.append(f"{exp.name}: strip has no transparent pixels")
        green_pixels = 0
        pix = strip.load()
        for y in range(0, strip.height, 8):
            for x in range(0, strip.width, 8):
                r, g, b, a = pix[x, y]
                if a > 16 and g >= 100 and g - max(r, b) > 55:
                    green_pixels += 1
        if green_pixels:
            issues.append(f"{exp.name}: detected {green_pixels} sampled green-screen-like pixels")
        if not preview_path.exists():
            issues.append(f"missing preview: {preview_path}")
    if issues:
        raise SystemExit("\n".join(issues))
    print("neura-cutscene-assets: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "fallback-raw", "postprocess", "validate"))
    args = parser.parse_args()
    if args.command == "prepare":
        prepare()
    elif args.command == "fallback-raw":
        fallback_raw()
    elif args.command == "postprocess":
        postprocess()
    else:
        validate()


if __name__ == "__main__":
    main()
