# PDF font

DejaVuSans.ttf is the unmodified DejaVu Sans font supplied with the bundled Poppler
runtime. Its redistribution terms are included in LICENSE.txt, retrieved from the
[official DejaVu repository](https://github.com/dejavu-fonts/dejavu-fonts/blob/master/LICENSE).

PDFKit embeds the glyphs used in each appointment record. This avoids depending on
fonts installed on the application host or requesting a font over the network.
DejaVu Sans supports accented Latin, Greek, Cyrillic, and many additional glyphs;
it is not a universal font for every writing system. Multilingual typesetting and
automatic font fallback remain outside the MVP.
