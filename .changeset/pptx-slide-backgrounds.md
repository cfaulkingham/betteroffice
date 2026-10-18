---
"@betteroffice/pptx": minor
"@betteroffice/rust-crates": minor
---

PPTX slides can declare their own background: solid or gradient `ShapeFill` values now write `p:bg` through `SlideWrite`, `DeckSession::set_slide_background` and the `setSlideBackground` batch step. Invalid fills are refused before they reach the save.
