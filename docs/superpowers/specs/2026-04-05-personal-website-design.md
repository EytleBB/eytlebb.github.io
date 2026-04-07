# Personal Website Design Spec
**Date:** 2026-04-05  
**Domain:** eytle.cn  
**Owner:** 3ytle / 3e

---

## Overview

A comprehensive personal website hosted on GitHub Pages. Combines personal branding, project showcase, tools hub, blog placeholder, and file downloads. Visual language follows Apple's design system: clean white backgrounds, generous whitespace, glass-morphism navbar, subtle scroll animations.

No frameworks. Pure HTML / CSS / JS. Zero build step.

---

## File Structure

```
index.html          # Main page (all sections)
mc-calc.html        # MC Stronghold Finder (existing, kept as-is)
css/
  style.css         # Global styles
js/
  main.js           # Scroll animations, navbar highlight, typewriter
files/
  730.zip           # Existing
images/
  Eye_of_Ender.png  # Existing
docs/
  superpowers/specs/  # Design docs
```

---

## Visual Language

| Token | Value |
|---|---|
| Background primary | `#ffffff` |
| Background secondary | `#f5f5f7` |
| Text primary | `#1d1d1f` |
| Text secondary | `#6e6e73` |
| Accent gradient | `linear-gradient(135deg, #2196f3, #9c27b0)` — used sparingly |
| Border radius (card) | `18px` |
| Card shadow | `0 4px 24px rgba(0,0,0,0.08)` |
| Font stack | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif` |
| Navbar blur | `backdrop-filter: blur(20px); background: rgba(255,255,255,0.72)` |

Accent gradient appears only on: CTA buttons, icon backgrounds, tags, active nav indicator. Never as a large background fill.

---

## Sections (top to bottom)

### 1. Hero
- Full viewport height, content vertically centered
- Large `h1` displaying `3ytle`, subtitle placeholder text below
- Typewriter animation on subtitle: plays once, does not loop
- Scroll-down indicator at bottom center (animated chevron)

### 2. About
- Two-column layout: left = circular avatar placeholder; right = name, bio placeholder, social icon links
- Social links: GitHub, Bilibili, others — all `href="#"` placeholder until filled
- Background: white

### 3. Projects
- Section background: `#f5f5f7`
- 2-column card grid (1-column on mobile)
- Each card: grey image placeholder, project name, one-line description, tag chips
- 2–3 placeholder cards on launch

### 4. Tools
- Section background: white
- Same card grid style as Projects, but cards have a left-side icon
- Card 1: **MC Stronghold Finder** — Eye of Ender icon, links to `mc-calc.html`, opens in same tab
- Cards 2–3: "Coming Soon" placeholder cards

### 5. Blog
- Section background: `#f5f5f7`
- Centered large placeholder block with text "即将上线 · Coming Soon"
- Decorative blurred gradient orb behind text (low opacity, not distracting)

### 6. Downloads
- Section background: white
- Existing three resources re-rendered as Apple-style cards
- Card: file icon + file name + metadata + right-side arrow icon
- No gradient border; use shadow + hover lift instead
- Resources:
  - Minecraft 1.21.8 生存存档 → external URL (Baidu pan placeholder)
  - 730 文件夹 → `./files/730.zip`
  - 简单测眼 → `./mc-calc.html` (Eye of Ender icon)

---

## Navigation Bar

- Fixed top, full width
- Left: logo text `3ytle` (links to `#hero`)
- Right: text links — About / Projects / Tools / Blog / Downloads
- Glass background: `backdrop-filter: blur(20px)`
- Active section detection via `IntersectionObserver`; active link gets accent-gradient underline
- On mobile: hamburger menu (CSS-only toggle or minimal JS)

---

## Interactions & Animation

| Element | Behavior |
|---|---|
| Section entry | `opacity: 0 → 1` + `translateY(20px → 0)`, triggered by `IntersectionObserver` |
| Cards hover | `translateY(-4px)` + shadow deepens, `transition: 0.25s ease` |
| Nav links hover | Underline slides in from left |
| Hero typewriter | Types subtitle once at page load, cursor blinks then fades |
| Scroll indicator | Bouncing chevron, disappears after first scroll |

---

## Responsive Breakpoints

| Breakpoint | Layout change |
|---|---|
| `> 768px` | 2-column card grids, full nav |
| `≤ 768px` | 1-column cards, hamburger nav, reduced font sizes |

---

## Constraints & Non-Goals

- No server-side code, no build tools, no npm
- Blog content intentionally deferred — section is placeholder only
- About and Projects content are placeholders; user fills in later
- `mc-calc.html` is not restyled in this iteration
- No dark mode in this iteration
