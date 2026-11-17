"""Generate the original dotted SVG artwork for the landing page.

Run: python3 scripts/gen-landing-art.py   (writes into public/landing/)
Deterministic (fixed seed) so diffs stay readable. Each hero layer is its own file so it can be swapped.
"""

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "landing"
BRAND, INK, MINT, LINE, MUTED = "#17644f", "#183d35", "#7fd1ae", "#b9cfc3", "#5a6e67"
rng = random.Random(7)


def svg(w, h, body, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'aria-hidden="true">{body}</svg>\n'
    )


def write(name, content):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    print(f"{p.relative_to(OUT.parent.parent)}  {len(content) / 1024:.1f} KB")


# ---------- human silhouette as a point-in-shape test (figure space 200 x 440) ----------
def _capsule(px, py, ax, ay, bx, by, r):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def inside_body(x, y):
    if (x - 100) ** 2 + (y - 44) ** 2 <= 29 ** 2:  # head
        return True
    if 88 <= x <= 112 and 68 <= y <= 92:  # neck
        return True
    if 92 <= y <= 250:  # torso: shoulders taper to waist then hips
        t = (y - 92) / 158
        half = 58 - 22 * math.sin(min(t, 0.75) / 0.75 * math.pi / 2) + (8 * (t - 0.75) / 0.25 if t > 0.75 else 0)
        if y < 108:  # rounded shoulders
            half -= (108 - y) * 0.9
        if abs(x - 100) <= half:
            return True
    arms = [(48, 112, 30, 250, 13), (152, 112, 170, 250, 13)]
    legs = [(80, 240, 76, 428, 17), (120, 240, 124, 428, 17)]
    return any(_capsule(x, y, *seg) for seg in arms + legs)


def body_dots(scale, step, color, highlight=None, jitter=0.6):
    """Dots on a grid inside the silhouette. highlight=(cx, cy, r) brightens a region."""
    out = []
    y = 0.0
    while y <= 440:
        x = 0.0
        while x <= 200:
            jx, jy = x + rng.uniform(-jitter, jitter), y + rng.uniform(-jitter, jitter)
            if inside_body(jx, jy):
                op = 0.5 + 0.4 * rng.random()
                r = 1.3 + 0.6 * rng.random()
                if highlight:
                    hx, hy, hr = highlight
                    d = math.hypot(jx - hx, jy - hy)
                    if d < hr:
                        op = min(1, op + 0.5 * (1 - d / hr))
                        r += 0.5 * (1 - d / hr)
                out.append(f'<circle cx="{jx * scale:.1f}" cy="{jy * scale:.1f}" r="{r * scale / 2:.2f}" opacity="{op:.2f}"/>')
            x += step
        y += step
    return f'<g fill="{color}">{"".join(out)}</g>'


# ---------- hero layers (shared 600 x 600 canvas so they stack exactly) ----------
S = 600


def hero_dot_field():
    dots = []
    for gy in range(0, S + 1, 18):
        for gx in range(0, S + 1, 18):
            d = math.hypot(gx - S / 2, gy - S / 2) / (S / 2)
            if d > 1:
                continue
            op = (1 - d) ** 1.4 * 0.9
            if op < 0.05:
                continue
            dots.append(f'<circle cx="{gx}" cy="{gy}" r="1.6" opacity="{op:.2f}"/>')
    return svg(S, S, f'<g fill="{LINE}">{"".join(dots)}</g>', "")


def hero_network():
    nodes = [(rng.uniform(60, 540), rng.uniform(60, 540)) for _ in range(26)]
    lines, circles = [], []
    for i, (x, y) in enumerate(nodes):
        near = sorted(range(len(nodes)), key=lambda j: math.hypot(nodes[j][0] - x, nodes[j][1] - y))[1:3]
        for j in near:
            if j > i or i not in sorted(range(len(nodes)), key=lambda k: math.hypot(nodes[k][0] - nodes[j][0], nodes[k][1] - nodes[j][1]))[1:3]:
                lines.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{nodes[j][0]:.0f}" y2="{nodes[j][1]:.0f}"/>')
        r = rng.choice([2.5, 3, 4, 5])
        filled = rng.random() < 0.4
        circles.append(
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" ' + (f'fill="{BRAND}" opacity="0.55"' if filled else f'fill="none" stroke="{INK}" stroke-opacity="0.35"') + "/>"
        )
    body = f'<g stroke="{INK}" stroke-opacity="0.18" stroke-width="1">{"".join(lines)}</g>{"".join(circles)}'
    return svg(S, S, body, "")


def hero_body():
    # Figure is 200x440 in its own space; place it centred, 1.25x.
    sc = 1.25
    ox, oy = (S - 200 * sc) / 2, (S - 440 * sc) / 2
    dots = body_dots(sc, 5.2, BRAND, highlight=(100, 150, 46))
    # Target ring over the chest: "your record lives here".
    ring = (
        f'<g transform="translate({ox + 100 * sc:.1f} {oy + 150 * sc:.1f})" fill="none" stroke="{BRAND}">'
        f'<circle r="22" stroke-width="1.5" opacity="0.9"/><circle r="34" stroke-width="1" opacity="0.4" stroke-dasharray="3 5"/>'
        f'<circle r="5" fill="{BRAND}" stroke="none"/></g>'
    )
    return svg(S, S, f'<g transform="translate({ox:.1f} {oy:.1f})">{dots}</g>{ring}', "")


def pin(x, y, s=1.0):
    return (
        f'<g transform="translate({x} {y}) scale({s})">'
        f'<path d="M0 0c-9-12-16-19-16-28a16 16 0 0 1 32 0c0 9-7 16-16 28z" fill="{BRAND}"/>'
        f'<path d="M-1.8-34h3.6v4.2h4.2v3.6h-4.2v4.2h-3.6v-4.2h-4.2v-3.6h4.2z" fill="#fff"/></g>'
    )


def hero_facility_nodes():
    pins = [(470, 170, 1.0), (505, 330, 0.8), (110, 230, 0.85), (445, 470, 0.7)]
    # Dashed arcs from the chest target out to each facility (a recommendation, not a transfer).
    cx, cy = 300, 300 - 440 * 1.25 / 2 + 150 * 1.25
    arcs = "".join(
        f'<path d="M{cx:.0f} {cy:.0f} Q{(cx + x) / 2:.0f} {min(cy, y) - 60:.0f} {x} {y - 30 * s:.0f}" />' for x, y, s in pins
    )
    body = f'<g fill="none" stroke="{BRAND}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="2 5">{arcs}</g>'
    body += "".join(pin(x, y, s) for x, y, s in pins)
    return svg(S, S, body, "")


def hero_code_ring():
    # A ring of digits standing for patient/temporary codes. Digits cycle 0-9: no realistic code.
    r, n = 262, 64
    items = []
    for i in range(n):
        a = 2 * math.pi * i / n - math.pi / 2
        x, y = S / 2 + r * math.cos(a), S / 2 + r * math.sin(a)
        deg = math.degrees(a) + 90
        op = 0.25 + 0.5 * (0.5 + 0.5 * math.cos(a * 3))
        items.append(
            f'<text x="{x:.1f}" y="{y:.1f}" transform="rotate({deg:.1f} {x:.1f} {y:.1f})" opacity="{op:.2f}">{i % 10}</text>'
        )
    body = (
        f'<circle cx="{S / 2}" cy="{S / 2}" r="{r - 16}" fill="none" stroke="{LINE}" stroke-dasharray="1 7"/>'
        f'<g font-family="ui-monospace,monospace" font-size="11" fill="{MUTED}" text-anchor="middle" dominant-baseline="middle">{"".join(items)}</g>'
    )
    return svg(S, S, body, "")


# ---------- body map (dark section) ----------
def body_map():
    sc = 1.0
    return svg(200, 440, body_dots(sc, 4.2, MINT, jitter=0.4), "")


# ---------- dotted landscape for the footer ----------
def landscape():
    W, H = 1440, 360
    rows_svg = []
    rows = 30
    for row in range(rows):
        depth = row / (rows - 1)  # 0 = far, 1 = near
        base = 60 + depth ** 1.5 * 300
        spacing = 7 + depth * 11
        r = 0.6 + depth * 1.8
        dots = []
        x = rng.uniform(0, spacing)
        while x < W:
            h = (
                38 * math.sin(x / 210 + row * 0.35)
                + 22 * math.sin(x / 97 - row * 0.6)
                + 12 * math.sin(x / 43 + row)
            ) * (0.4 + depth * 0.8)
            y = base - h
            if 0 <= y <= H:
                dots.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}"/>')
            x += spacing * rng.uniform(0.8, 1.2)
        rows_svg.append(f'<g opacity="{0.25 + depth * 0.6:.2f}">{"".join(dots)}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g fill="{MINT}">{"".join(rows_svg)}</g></svg>\n'


if __name__ == "__main__":
    write("hero/dot-field.svg", hero_dot_field())
    write("hero/network.svg", hero_network())
    write("hero/body.svg", hero_body())
    write("hero/facility-nodes.svg", hero_facility_nodes())
    write("hero/code-ring.svg", hero_code_ring())
    write("body-map.svg", body_map())
    write("landscape.svg", landscape())
