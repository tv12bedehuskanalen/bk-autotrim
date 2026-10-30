# BK Autotrim

Desktop-app for å klippe programopptak og lage MOV med og uten BK-logo, med norsk grensesnitt. Kildeopptaket endres aldri.

## Bruk

Velg opptak og la appen søke gjennom opptaket etter nesten heldekkende grønnmarkører. Innpunktet settes ti sekunder etter første grønne bilde når én markør finnes. Flere treff må velges og kontrolleres. Uten treff settes klippet manuelt. Utpunktet er ett sekund før filslutt, eksklusivt: forhåndsvisningen viser siste bilde som blir med.

Kontroller bildene, spill av rundt klippepunktene og juster ett bilde om gangen. Velg målmappe, filnavn og eksport med logo, uten logo eller begge. Logoeksporten kjøres først. Den medfølgende `bk-logo.png` er en transparent 1920×1080-overlay som legges i original størrelse ved 0,0. Den skaleres eller flyttes ikke. Andre videoformater krever en overlay med nøyaktig samme bildeflate.

Eksportene bruker to-pass EBU-normalisering til −23 LUFS med −1 dBTP tak og lineær gain når det er mulig. Lyd beholdes som 48 kHz / 24-bit stereo PCM. Ett stereospor kreves. Begge eksportene beholder oppløsning, bildefrekvens og fargetagger. Branded bruker 8-bit H.264, med maskinvareenkoder når den virker og programvarefallback. Uten logo forsøkes H.264-kopiering når innpunktet er et nøkkelbilde. Antall dekodede bilder, varighet og begge grensebilder kontrolleres mot kilden. Dersom kontrollen feiler eller innpunktet ligger mellom nøkkelbilder, omkodes videoen med kildepikselformatet.

Først rendres det lokalt, så kopieres resultatet til en eksklusiv `.partial`-fil i målmappen før navnet endres. Eksisterende utdata avvises. Avbrudd og kopieringsfeil bevarer lokal eksport; feilmeldingen viser hvor filene finnes. «Kopier bevart eksport» prøver levering på nytt uten ny rendering. Ledig plass kontrolleres med et konservativt estimat, men ukjent NAS-kvote eller endret ledig plass kan fortsatt gi feil. En kort prøveeksport beregner separate maskintilpassede estimater for begge jobber. Rendering og kopiering har separate fremdriftsvisninger og løpende estimat.

## Utvikling og installasjoner

Node.js 22+ og native byggeverktøy kreves for utvikling. Vanlige brukere får FFmpeg, FFprobe og nødvendige statisk lenkede mediebiblioteker med installasjonen.

```sh
npm ci
npm run build:media
npm run check
npm test
npm run test:media
npm start
```

Mac og Windows x64-installasjoner bygges på native GitHub-runnere. Manuell workflow lager testinstallasjoner; versjonstagger lager offentlige utgivelser etter at alle bygg består. Se [utgivelsesrutinen](docs/RELEASE.md) og [tredjepartslisenser](THIRD_PARTY_NOTICES.md).

## Verifiseringsstatus

Dette er en utviklingsversjon. Se utgivelsesrutinen for kontroller som må utføres på målmaskiner før produksjon. Automatisk installasjon av oppdateringer er ikke implementert. Appen laster ned og tilbyr å åpne riktig offentlig installasjon ved oppdatering. Et helt program og målplattformene iTX/Vimeo OTT må fortsatt valideres av operatør.
