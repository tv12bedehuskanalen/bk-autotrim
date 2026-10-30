# Teknisk validering – 30. oktober 2026

Lokalt kontrollert på Apple Silicon:

- 11 enhetstester for klippegrenser, filnavn, sikker levering/avbrudd og offentlige oppdateringer med kontrollsummer.
- 5 integrasjonstester med de medfølgende, egenbygde medieverktøyene: nøyaktig antall bilder og bildegrenser, pikselformat, fargetagger, lydnivå, kopiert video, 48-bilders markører, ugyldige PNG-overlays og avvisning av ufullstendige lokale filer ved gjenoppretting.
- Appvinduet åpnes med BK-design. Ett-bildes justering og avspillbar forhåndsvisning er testet mot det virkelige opptaket via appens egne knapper.
- Pakket FFmpeg og FFprobe starter med tom PATH, og den pakkede PNG-logoen er identisk med originalfilen. PNG-dekoding og alfakanal fungerer i pakken.
- Den virkelige logoen er 1920×1080 med synlig grafikk og transparent bakgrunn. Overlay legges ved 0,0 uten skalering.
- Søk gjennom hele det virkelige opptaket fant nøyaktig én kvalifisert markør, med første grønne bilde ved 48.200 s etter finjustering. Klippeforslag: inn 58.200 s, eksklusivt ut 3512.400 s, varighet 3454.200 s. Stillbildene viser programleder ved innpunktet og sluttplakat ved siste bilde.
- Fem sekunders eksport fra dette opptaket lyktes med begge varianter, 250 bilder, 1920×1080 / 50 fps, PCM 24-bit / 48 kHz stereo. Branded er yuv420p, uten logo er yuv422p10le. En separat kontroll etter korrigert lydtrimming målte −23.00 LUFS og −9.50 dBTP på femsekundersklippet.

Programvarereserven er bekreftet når VideoToolbox ikke kan starte i denne økten. Dette dokumenterer ikke maskinvarehastighet på vanlige Mac-/Windows-maskiner.

Dette er ikke redaksjonell godkjenning. Hele programmet er ikke eksportert eller kontrollert i iTX/Vimeo OTT. Full NAS-levering og avspilling på målmaskinene må fortsatt kontrolleres av operatør. Installerne er foreløpig usignerte. GitHub-workflowens resultater dokumenterer hvilke native bygg som har bestått; se Actions og den tilhørende utgivelsen.
