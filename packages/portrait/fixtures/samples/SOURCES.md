# Portrait sample sources

Ten photos used to exercise the pixel-portrait pipeline. Every one is public
domain or CC0, and every subject is a public figure or an anonymous portrait,
never a private individual. Retrieved 15 November 2026 from Wikimedia Commons.

Each file was cropped to a head-and-shoulders frame, resized so the long side is
at most 400 px (the size X serves profile images at), and re-encoded as JPEG at
quality 80-85, or PNG for the one grayscale sample. Crops and resizes only; no
retouching. Sizes are all under 100 KB.

| File | Subject | Source | License |
|---|---|---|---|
| `armstrong.jpg` | Neil Armstrong (NASA portrait) | https://commons.wikimedia.org/wiki/File:Neil_Armstrong_pose.jpg | Public domain (NASA, PD-USGov) |
| `barda.jpg` | Fricis Bārda | https://commons.wikimedia.org/wiki/File:B%C4%81rdaFricis.jpg | Public domain (PD-old-70-expired) |
| `boy-venezuela.jpg` | Anonymous boy, Venezuela (Wilfredor) | https://commons.wikimedia.org/wiki/File:Boy_Face_from_Venezuela.jpg | CC0 1.0 |
| `brunette-woman.jpg` | Anonymous portrait (Christopher Campbell, Unsplash) | https://commons.wikimedia.org/wiki/File:Brunette_woman_portrait_(Unsplash).jpg | CC0 1.0 |
| `douglass.jpg` | Frederick Douglass, c. 1879 (George Kendall Warren) | https://commons.wikimedia.org/wiki/File:Frederick_Douglass_(circa_1879).jpg | Public domain (PD-old-100-expired) |
| `einstein.jpg` | Albert Einstein, 1947 (Orren Jack Turner) | https://commons.wikimedia.org/wiki/File:Albert_Einstein_Head.jpg | Public domain (PD-old-50-1964) |
| `gandhi.jpg` | Mahatma Gandhi, 1931 | https://commons.wikimedia.org/wiki/File:Gandhi_portrait_1931.jpg | Public domain (PD-India, PD-1996) |
| `lincoln.jpg` | Abraham Lincoln, 1863 (Alexander Gardner) | https://commons.wikimedia.org/wiki/File:Abraham_Lincoln_O-77_matte_collodion_print.jpg | Public domain (PD-old-100-expired) |
| `obama.jpg` | Barack Obama, official portrait (Pete Souza) | https://commons.wikimedia.org/wiki/File:President_Barack_Obama.jpg | Public domain (White House photo, PD-USGov) |
| `tubman.png` | Harriet Tubman, c. 1885 (Horatio Seymour Squyer) | https://commons.wikimedia.org/wiki/File:Harriet_Tubman_(circa_1885).jpg | Public domain (PD-old-100-expired) |

What the set covers:

- Skin tones from very light (`lincoln`, `barda`) to deep (`tubman`, `douglass`, `gandhi`).
- Hair: white and grey (`einstein`), blond and curly (`barda`), long dark (`brunette-woman`), braided (`tubman`), short (`obama`), bald with a beard (`gandhi`).
- Glasses: `barda`, `gandhi`.
- Headwear: `tubman` (headwrap).
- Backgrounds: plain studio sweep (`lincoln`, `douglass`), busy foliage (`brunette-woman`), a flag-draped office (`obama`), high-key white (`gandhi`), near-black (`armstrong`).
- Non-square input: `barda` (200x230), `obama` (190x240), `boy-venezuela` (321x321 is square; the JPEG decoder path and PNG decoder path are both covered, `tubman.png` being the PNG).
- Monochrome: `douglass`, `einstein`, `gandhi`, `lincoln`, `tubman`, `barda` are black-and-white or sepia originals.
