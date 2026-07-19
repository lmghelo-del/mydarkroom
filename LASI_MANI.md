# Aperture — profesionāls RAW &amp; foto redaktors (PWA)

Pilnvērtīgs Lightroom-stila redaktors, kas darbojas **tikai tavā iPhone**, bez
App Store, bez konta, bez mākoņa. Foto neatstāj ierīci.

## Kas iekšā

**Dzinējs:** GPU-paātrināts (WebGL2) — pat lielas bildes un RAW rediģējas reālā
laikā, ne lēni pikselis-pa-pikselim.

**Gaisma:** Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Brightness, Dehaze
**Krāsa:** Temperature, Tint, Vibrance, Saturation
**Līknes (Curves):** RGB + atsevišķi R / G / B kanāli, ar interaktīviem punktiem
**HSL:** 8 krāsu joslas × (nokrāsa / piesātinājums / gaišums)
**Color Grading:** 3 krāsu riteņi (ēnas / vidustoņi / gaišie) + intensitāte
**Detaļas:** Clarity, Texture, Sharpness, Noise Reduction
**Efekti:** Vignette (ar feather), Grain, Fade (matte)
**Kadrs:** rotācija 90°, spoguļošana H/V, iztaisnošana, crop
**Papildus:** dzīvs histogram, salīdzināšana ar oriģinālu (tur pogu), undo/redo,
savi preseti ar saglabāšanu/importu/eksportu, 4 iebūvēti looki

**RAW:** mēģina dekodēt RAW (.CR2/.CR3/.NEF/.ARW/.DNG u.c.) tieši pārlūkā ar
LibRaw; ja neizdodas — automātiski izvelk RAW iegulto pilnizmēra JPEG
priekšskatījumu; DNG/JPEG/HEIC/PNG strādā natīvi un ātri.

---

## 1. solis — izvieto internetā (bezmaksas)

**Vienkāršākais: Netlify Drop**
1. Ej uz app.netlify.com/drop
2. Ievelc visu šo mapi (ar visiem failiem) pārlūka logā
3. Uzreiz saņem saiti, piem. `https://random-name.netlify.app`

**Vai GitHub Pages**
1. github.com → izveido repozitoriju, augšupielādē visus failus
2. Settings → Pages → Source: `main` / root → Save
3. Saite: `https://tavsvards.github.io/repo/`

> Svarīgi: appai jābūt uz **https** (ne file://), citādi RAW dekodētājs un
> service worker nestrādās. Netlify/GitHub Pages abi dod https automātiski.

## 2. solis — pievieno iPhone

1. Atver saiti **Safari** (obligāti Safari)
2. Share → **Add to Home Screen**
3. Atveras pilnekrānā, ar savu ikonu, strādā offline

## 3. solis — lieto

- **Atvērt attēlu** → galerija vai kamera (RAW arī no Files)
- Apakšā rīku josla: Gaisma / Krāsa / Līknes / HSL / Grading / Detaļas / Efekti / Kadrs / Preseti
- **◑** poga augšā — tur nospiestu, redzi oriģinālu
- **↶ ↷** — undo / redo
- **Saglabāt** — eksportē pilnā izšķirtspējā JPG (nonāk Files/lejupielādēs)
- **Preseti** cilne — saglabā savu looku, pielieto citam foto, eksportē kā .json backup

## Piezīmes

- RAW dekodēšanai pirmajā reizē vajag internetu (ielādē LibRaw). Pēc tam
  JPEG/DNG/HEIC strādā pilnīgi offline.
- Ļoti liels RAW (40–60MP) var pāris sekundes dekodēt — tas ir normāli.
- Preseti glabājas Safari atmiņā. Regulāri spied "Eksportēt presetus", ja negribi
  tos pazaudēt (piem., ja tīri Safari datus).
- Šis nav Adobe produkts un nav saistīts ar Adobe kontu — pilnībā tavs, neatkarīgs rīks.
- Ja ierīce neatbalsta WebGL2 (ļoti veci iPhone), redaktors nedarbosies — bet
  visi mūsdienu iPhone (2017+) to atbalsta.

## Failu struktūra

- `index.html` — saskarne
- `style.css` — dizains
- `app.js` — galvenā loģika
- `engine.js` — WebGL2 apstrādes dzinējs (shaderi)
- `widgets.js` — līkņu redaktors, krāsu riteņi, histogram
- `state.js` — iestatījumi, preseti, undo/redo
- `raw.js` — RAW dekodēšana ar fallback
- `manifest.json`, `service-worker.js`, ikonas — PWA lietas
