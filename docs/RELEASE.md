# Utgivelser

Kildekode og installasjoner ligger i samme offentlige repository. Oppdateringer bruker offentlige GitHub-adresser, uten pålogging fra appen.

## Bygg og kontroller

1. Installer Node.js 22+, Git, C/C++-verktøy, Make, NASM og pkg-config. Windows-bygget bruker MSYS2/MINGW64. Se workflowen for pakkelisten.
2. Kjør `npm ci`, `npm run build:media`, `node scripts/verify-media.cjs`, `npm run check`, `npm test`, `npm run test:media`.
3. Kjør `npm run dist:mac` eller `npm run dist:win` på riktig plattform. Bygg hver arkitektur på en tilsvarende maskin; ikke gjenbruk medieverktøy fra en annen arkitektur.
4. Kontroller installerens filnavn med `node scripts/verify-artifact.cjs darwin arm64` eller den aktuelle plattformen/arkitekturen.

Workflowen «Build installers» kan startes manuelt for å lage nedlastbare testinstallasjoner uten offentlig utgivelse. Den bygger Apple Silicon, Intel Mac og Windows x64. Alle bygg må lykkes før en tag-utgivelse publiseres.

For en utgivelse: oppdater package.json og låsefilen, commit, og push en tag lik `v` + versjonen. Versjonen kontrolleres før bygging. Installatører og mediekilder publiseres først etter at alle plattformer har bestått testene. Oppdateringsklienten krever stabile vX.Y.Z-tagger.

## Må verifiseres før produksjon

- Installer på Mac og Windows, også uten FFmpeg i PATH.
- Kontroller begge klippepunkter, logo, synk, fargetagger, LUFS og true peak på et helt program.
- Spill av MOV-eksporten i iTX og publiser en prøve i Vimeo OTT.
- Test kopiering av video ved nøkkelbilde og omkoding ved andre innpunkter.
- Test NVIDIA-maskin og programvarefallback på Windows.
- Test full NAS-kopiering, plassmangel og avbrudd.

Automatiske eksporttester er teknisk validering, ikke redaksjonell godkjenning eller iTX/Vimeo-sertifisering. Installerne er foreløpig usignerte; Apple Developer-notarisering og Windows-signering krever organisasjonens sertifikater før ordinær distribusjon. Ikke legg private sertifikater eller passord i repoet.
