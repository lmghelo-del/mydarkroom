# MyDarkroom — tava personīgā foto editora app

Šī ir pilnvērtīga Lightroom-stila foto rediģēšanas PWA (Progressive Web App):
Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint,
Vibrance, Saturation, Clarity, Sharpness, Vignette, Grain — un sava preset
sistēma (saglabā, nosauc, pielieto jebkuram foto, dzēš).

Viss darbojas **tikai tavā telefonā, lokāli** — nekas netiek sūtīts uz
serveri, foto neatstāj ierīci, preseti glabājas telefona pārlūkā.

---

## 1. solis — izvieto failus internetā (vajadzīgs, lai iPhone tos atvērtu)

✅ **Jau gatavs!** Šie faili jau ir augšupielādēti GitHub Pages.

**Tava app ir pieejama:**
```
https://lmghelo-del.github.io/mydarkroom/
```

## 2. solis — pievieno iPhone sākuma ekrānam

1. Atver to saiti **Safari** pārlūkā telefonā (obligāti Safari, ne Chrome)
2. Nospied "Share" (kvadrātiņš ar bultu uz augšu)
3. "Add to Home Screen" / "Pievienot sākuma ekrānam"
4. Gatavs — appai būs sava ikona, atveras pilnekrānā bez Safari adrešu joslas

## 3. solis — lieto

- **"Foto"** poga apakšā → izvēlies no galerijas VAI uzņem jaunu foto
  (iOS pati piedāvās abas opcijas)
- **"Regulēt"** cilne — visi slīdņi reālam laikā rāda izmaiņas
- **"⇄"** poga augšā — turi nospiestu, lai redzētu oriģinālu
- **"↺"** — atiestata visus regulējumus uz nulli
- **"⇩"** — apstrādā un lejupielādē pilnas izšķirtspējas JPG (saglabājas
  telefona "Files" / lejupielādēs, no kurienes vari to pārsūtīt uz Photos)
- **"Preseti"** cilne — saglabā pašreizējos slīdņu iestatījumus ar nosaukumu,
  vēlāk pielieto tos jebkuram citam foto vienā klikšķī

## Piezīmes

- Preseti glabājas telefona pārlūka atmiņā (localStorage). Ja iztīrīsi Safari
  datus/vēsturi, preseti pazudīs — regulāri izdari export/backup, ja tie tev
  svarīgi (var pievienot funkciju eksportēt presetus kā failu, ja vajag).
- Lielām bildēm (piem., 48MP) apstrāde eksportējot var aizņemt pāris sekundes
  — tas ir normāli, notiek viss telefonā.
- Šis nav Adobe produkts un nav savienots ar Adobe Lightroom kontu vai mākoni
  — tas ir pilnībā savs, neatkarīgs rīks.