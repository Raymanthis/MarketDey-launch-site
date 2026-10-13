# Mobile audit (phones and tablets)

Captured with Playwright (Chromium, `isMobile`, `hasTouch`) against the dev server, after the
"Scroll up" hint, stepping through the whole page. Viewports: 390x844 (all steps), 360x740,
430x932, 768x1024. No section produces page-level horizontal scroll (`scrollWidth == innerWidth`),
but several sections clip their own content at the right/left edge instead.

## Hero (wordmark intro, h1, banner, phone mock-ups)
- Nav wraps into two rows; "Privacy" and the download button drop under the logo and the rope crosses them.
- h1 does not scale for phones: 6 lines, "comot" wraps and runs under the next block.
- Lime banner is hidden during the intro (by design) and, once dropped, is wider than the screen: clipped at the right edge.
- The two phone mock-ups at the bottom are cropped at both edges; the hanging ropes cross the copy.
- Store buttons are fine (>= 44 px).

## Audiences (sticky, scroll-driven, 4 groups)
- The photo card is laid over the body text, so paragraph text sits on top of the picture and is hard to read.
- The group label ("MARKET-DAY SHOPPERS", "BARGAIN SEEKERS") collides with the heading / runs over the photo.
- The side progress rail is clipped at the right edge.
- Result card (date chip) overlaps the label text of other layers.

## Alerts (two phones)
- Both phones are cropped by the screen edge, notification text is cut ("Central Market runs tomorrow" body).
- Decorative, but the content of the notification is unreadable.

## How it counts
- The week strip scrolls off the right edge (no affordance); fine as a scroller but needs edge fade / snap.
- Body text 15-16 px: OK. Replay button 40 px high: below 44 px.

## Roads / Offline / privacy cards
- Cards are fine. Phone mock-ups below are cropped at both edges.

## Explore (MarketSearch, 720vh sticky, WebGL)
- Goods chips overflow the panel and are clipped ("Livesto", "Elect"); they only scroll programmatically, no touch affordance.
- Market names are truncated with an ellipsis ("Ogwashi-Uku ce...").
- Panel + results card together cover the whole map; the intro paragraph is dropped on narrow screens.
- Distance pills wrap to two rows and are 30 px tall (tap target / visual noise).
- 100vh sticky stage: jumps when the mobile browser chrome collapses.
- WebGL canvas pixel ratio is already capped at 1.25 on small screens.

## Find a market (circular reveal, school-day map)
- Left column text is clipped by the left edge ("is / kt / t day?"), the phone mock-up is pushed off the right edge.
- Sample-schedule chips are cut.

## Landmarks journey (1800vh)
- Live 2D map and the first card are fine.
- Floating text cards on the map clip against the right edge ("Traders restock...").
- Street frames: in-scene landmark signboard is cut off by the right edge.
- "Check I'm here" phone mock-up (LandmarkPhone) is missing entirely on phones.
- 100vh stage.

## Contributors
- The phone pair is cropped at both edges.
- "Try it" card fits; point rows OK; tier chips wrap awkwardly.
- Follow animation card (Central Market / Following): chip overlaps the market name.

## FAQ / footer
- FAQ list fine; numbering column OK.
- Footer clouds overlap link text; footer link columns are single column and long but legible.
- Legal link row wraps; tap targets of footer links are about 38 px high.

## Global
- Several `100vh` sticky stages (Explore, Landmarks, Audiences) jump with the mobile URL bar: switch to `svh`/`dvh`.
- Hover-only interactions: only style-hover colour changes (no functional hover found).
- Tap targets under 44 px: nav links, footer links, Replay, goods chips, distance pills.
- No console errors during the crawl.

## Status after the fixes (phones and tablets)

All sections above were reworked behind `@media (max-width: 899px)` (or `innerWidth` branches); desktop at
1440x900 compared pixel for pixel before/after: identical except live-animated content (Explore particles,
the pulsing landmark pin, footer skyline traffic; at most 1.1 % of a frame).

- Hero: nav reflows (logo + download button, links on their own row), headline `clamp()`, banner and phones scaled; banner drag uses `touch-action: pan-y` so it no longer traps scrolling.
- Audiences: text sits in a bottom card, vertical scrim, progress rail is bars only with a larger tap area.
- Alerts / Roads / Contributors / Offline: phone pairs scaled by breakpoint and overlapped; text first.
- How it counts: the strip follows the day being counted (auto-scroll), edge snap.
- Explore: compact panel, five distance steps in one row, names wrap, faded goods strip, one result row on short phones.
- Find a market: card widened by 1/scale so it fills the screen, 48 px controls, larger usable stage.
- Landmarks: bottom sheet with the full "Check I'm here" content (also 900-1099 px), signboards stand nearer the road in portrait.
- FAQ: the answer opens under the tapped question on phones; footer links >= 44 px.
- `svh` stages for Audiences, Explore, Find a market, Landmarks.
- No horizontal scroll at 320, 360, 390, 430, 768 (scrollWidth == innerWidth at every sampled step).

Known limits: footer clouds (cityLife) still pass behind link columns; the Landmarks sheet buttons are display-only like the desktop mock-up.
