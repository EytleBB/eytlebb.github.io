# Pictures At An Exhibition — Global Rename Design

**Date:** 2026-07-11

**Goal:** Replace the public-facing Gallery / 画廊 / Museum naming with one
consistent trilingual exhibition title while preserving existing routes, data,
and repository links.

## Canonical names

| Language | Display name |
| --- | --- |
| Chinese | 图画展览会 |
| English | Pictures At An Exhibition |
| Korean | 전람회의 그림 |

The capitalization of the English title is intentional and must remain exactly
`Pictures At An Exhibition`.

## User-facing scope

Update the canonical name everywhere the feature is presented to a visitor:

- main navigation in all three languages;
- home-page exhibition preview heading;
- fallback grid heading and empty state;
- 3D exhibition document title, entry/pause overlay, and in-world title;
- 3D exhibition load-failure message;
- the former `Museum` sub-project beneath `This is Eytle`;
- current maintenance documentation that describes this feature.

The sub-project uses localized `name`, `nameEn`, and `nameKo` fields so every
language shows the corresponding canonical name. Its existing GitHub URL remains
unchanged.

## Compatibility boundary

Do not rename implementation identifiers or stable paths. In particular, retain:

- the `gallery` section/hash and navigation `data-section` value;
- `images/gallery/`, its generated index, gallery-related function names, cache
  keys, and CSS classes;
- `museum.html`, `js/museum.js`, `css/museum.css`, and the
  `EytleBB/Eytle-Museum` repository URL;
- historical design specs and implementation plans, which describe the names in
  use at the time they were written.

This keeps bookmarks, generated data, caches, and external links compatible.

## Long-title layout

The new English title is substantially longer than the old labels.

- Desktop rail: allow the navigation label to wrap naturally inside the existing
  248px rail; retain the active marker and comfortable line height.
- Mobile navigation: keep each navigation item unshrunk and on one line within the
  existing horizontal scroller, so the title is discoverable without truncation.
- Main-stage headings: permit safe wrapping and prevent overflow in narrow
  viewports.
- Project sub-project rows: allow the title to wrap while keeping the external-link
  arrow aligned and visible.
- 3D entry/pause overlay: render only the active language's canonical title, center
  it within a constrained width, and allow balanced wrapping. Do not show a second
  English subtitle beside Chinese or Korean.
- In-world top-left title: allow a bounded width and wrapping or responsive sizing
  so it cannot collide with the exit control.

## Language and runtime behavior

The main site continues using its existing `t()` / `pick()` localization flow.
The standalone 3D page continues reading the persisted language and uses its
existing `T()` helper. No routing, capability detection, image loading, or overlay
behavior changes as part of this rename.

## Verification

Verify the following after implementation:

1. Static searches find no remaining visitor-facing `画廊`, `Gallery`, `갤러리`,
   `Museum`, or `뮤지엄` labels outside intentionally preserved historical docs,
   internal identifiers, paths, and repository names.
2. The main navigation and headings show the exact canonical name for Chinese,
   English, and Korean.
3. The `This is Eytle` sub-project shows the localized canonical name and still
   links to `https://github.com/EytleBB/Eytle-Museum`.
4. The 3D entry/pause overlay and in-world title update correctly for every stored
   language.
5. Desktop and narrow mobile layouts show the long English title without clipping,
   unintended overlap, or loss of navigation access.
6. Gallery loading, the fallback grid/lightbox, and capable-desktop routing to
   `museum.html` continue to work.
