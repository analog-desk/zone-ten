#!/usr/bin/env python3
"""Generates src/data/film_catalog.json.

Editorial policy (see docs/FILM_CATALOG.md):
* Box speeds are the user-supplied specification values.
* Formats and reciprocity data were transcribed from manufacturer technical
  publications to the best of the editor's knowledge but have NOT yet been
  re-checked against the current datasheets, so every record carries
  lastVerified = null and a verificationNotes entry. Run the verification
  checklist before release and fill in lastVerified.
* Where no manufacturer reciprocity data is known, the record says
  "unpublished" -- the app never invents a curve.
"""
import json, pathlib

ILFORD_RECIP_SRC = "Ilford Photo / Harman technical information: reciprocity law failure compensation (Tc = Tm^p)"
PENDING = "Formats and reciprocity transcribed from manufacturer publications; pending re-verification against current datasheet."

def power(p, src=ILFORD_RECIP_SRC):
    return {"kind": "powerLaw", "exponent": p, "appliesAboveSeconds": 1, "source": src,
            "note": "Formula applies to metered times longer than 1 s."}

def table(points, upto, src, note=None):
    d = {"kind": "table", "points": [{"metered": m, "corrected": c} for m, c in points],
         "publishedUpToSeconds": upto, "source": src}
    if note: d["note"] = note
    return d

def none_to(upto, src):
    return table([(upto, upto)], upto, src,
                 "Manufacturer states no correction is required up to this time; longer exposures are not characterised — test or add a custom curve.")

UNPUB = {"kind": "unpublished"}

def stock(id, mfr, name, cat, process, box, fmts, recip=UNPUB, designation=None, default_ei=None,
          status="available", ref=None, notes=None, vnotes=PENDING):
    return {
        "id": id, "manufacturer": mfr, "name": name, "category": cat, "process": process,
        "boxSpeed": box, "speedDesignation": designation or f"ISO {box:g}",
        "defaultEI": default_ei or box, "formats": fmts, "reciprocity": recip, "status": status,
        "manufacturerReference": ref, "lastVerified": None, "verificationNotes": vnotes,
        "notes": notes, "isCustom": False,
    }

S35, M120, S45, S810 = "35mm", "120", "4x5", "8x10"
KODAK_NO_CORR = lambda ds: none_to(1, f"Kodak Professional technical data {ds}")

stocks = [
    # --- Kodak colour negative
    stock("kodak-portra-160", "Kodak", "Portra 160", "colorNegative", "C-41", 160, [S35, M120, S45, S810],
          KODAK_NO_CORR("E-4051"), ref="Kodak technical data E-4051"),
    stock("kodak-portra-400", "Kodak", "Portra 400", "colorNegative", "C-41", 400, [S35, M120, S45, S810],
          KODAK_NO_CORR("E-4050"), ref="Kodak technical data E-4050"),
    stock("kodak-portra-800", "Kodak", "Portra 800", "colorNegative", "C-41", 800, [S35, M120],
          ref="Kodak technical data E-4040"),
    stock("kodak-gold-200", "Kodak", "Gold 200", "colorNegative", "C-41", 200, [S35, M120]),
    stock("kodak-colorplus-200", "Kodak", "ColorPlus 200", "colorNegative", "C-41", 200, [S35]),
    stock("kodak-ultramax-400", "Kodak", "UltraMax 400", "colorNegative", "C-41", 400, [S35]),
    stock("kodak-ektar-100", "Kodak", "Ektar 100", "colorNegative", "C-41", 100, [S35, M120, S45, S810],
          KODAK_NO_CORR("E-4046"), ref="Kodak technical data E-4046"),
    # --- Kodak reversal
    stock("kodak-ektachrome-e100", "Kodak", "Ektachrome E100", "colorReversal", "E-6", 100, [S35, M120, S45, S810],
          ref="Kodak technical data E-4000"),
    # --- Kodak B&W
    stock("kodak-tri-x-400", "Kodak", "Tri-X 400", "bwNegative", "B&W", 400, [S35, M120],
          table([(0.1, 0.1), (1, 2), (10, 50), (100, 1200)], 100, "Kodak technical data F-4017",
                "Kodak also recommends reduced development for long exposures (see datasheet)."),
          ref="Kodak technical data F-4017"),
    stock("kodak-t-max-100", "Kodak", "T-Max 100", "bwNegative", "B&W", 100, [S35, M120, S45, S810],
          table([(0.1, 0.1), (1, 1.26), (10, 15), (100, 200)], 100, "Kodak technical data F-4016"),
          ref="Kodak technical data F-4016"),
    stock("kodak-t-max-400", "Kodak", "T-Max 400", "bwNegative", "B&W", 400, [S35, M120, S45, S810],
          table([(0.1, 0.1), (1, 1.26), (10, 15), (100, 300)], 100, "Kodak technical data F-4043"),
          ref="Kodak technical data F-4043"),
    stock("kodak-t-max-p3200", "Kodak", "T-Max P3200", "bwNegative", "B&W", None, [S35],
          designation="P3200", default_ei=3200,
          notes="Multi-speed film designed for push processing; the P3200 designation is not its ISO box speed. Exposure differences are expressed relative to EI 3200 — consult the Kodak datasheet."),
    # --- Fujifilm
    stock("fujifilm-fujicolor-200", "Fujifilm", "Fujicolor 200", "colorNegative", "C-41", 200, [S35]),
    stock("fujifilm-400", "Fujifilm", "Fujifilm 400", "colorNegative", "C-41", 400, [S35]),
    stock("fujifilm-provia-100f", "Fujifilm", "Provia 100F", "colorReversal", "E-6", 100, [S35, M120],
          table([(128, 128), (240, 302)], 240, "Fujifilm Provia 100F data sheet",
                "No correction up to 128 s; +⅓ stop at 4 min. Longer exposures not characterised."),
          ref="Fujifilm Provia 100F data sheet"),
    stock("fujifilm-velvia-50", "Fujifilm", "Velvia 50", "colorReversal", "E-6", 50, [S35, M120]),
    stock("fujifilm-velvia-100", "Fujifilm", "Velvia 100", "colorReversal", "E-6", 100, [S35, M120]),
    # --- Ilford
    stock("ilford-hp5-plus", "Ilford", "HP5 Plus", "bwNegative", "B&W", 400, [S35, M120, S45, S810], power(1.31)),
    stock("ilford-fp4-plus", "Ilford", "FP4 Plus", "bwNegative", "B&W", 125, [S35, M120, S45, S810], power(1.26)),
    stock("ilford-pan-f-plus", "Ilford", "Pan F Plus", "bwNegative", "B&W", 50, [S35, M120], power(1.33)),
    stock("ilford-delta-100", "Ilford", "Delta 100", "bwNegative", "B&W", 100, [S35, M120, S45, S810], power(1.26)),
    stock("ilford-delta-400", "Ilford", "Delta 400", "bwNegative", "B&W", 400, [S35, M120], power(1.41)),
    stock("ilford-delta-3200", "Ilford", "Delta 3200", "bwNegative", "B&W", None, [S35, M120], power(1.33),
          designation="3200", default_ei=3200,
          notes="Ilford gives Delta 3200 an ISO speed of 1000 under standard development; the 3200 designation assumes push processing. Exposure differences are expressed relative to EI 3200."),
    stock("ilford-ortho-plus", "Ilford", "Ortho Plus", "specialty", "B&W", 80, [S35, M120, S45, S810], power(1.25),
          notes="Orthochromatic: insensitive to red light. Box speed is the daylight rating."),
    stock("ilford-sfx-200", "Ilford", "SFX 200", "specialty", "B&W", 200, [S35, M120], power(1.43),
          notes="Extended red sensitivity; with a deep red filter it gives an infrared-like effect."),
    stock("ilford-xp2-super", "Ilford", "XP2 Super", "bwNegative", "C-41", 400, [S35, M120], power(1.31),
          notes="Chromogenic black & white film processed in C-41."),
    # --- CineStill
    stock("cinestill-50d", "CineStill", "50D", "colorNegative", "C-41", 50, [S35, M120, S45],
          notes="Daylight balanced."),
    stock("cinestill-400d", "CineStill", "400D", "colorNegative", "C-41", 400, [S35, M120],
          notes="Daylight balanced."),
    stock("cinestill-800t", "CineStill", "800T", "colorNegative", "C-41", 800, [S35, M120, S45],
          notes="Tungsten balanced (3200K)."),
    # --- Lomography
    stock("lomography-cn-100", "Lomography", "Color Negative 100", "colorNegative", "C-41", 100, [S35, M120]),
    stock("lomography-cn-400", "Lomography", "Color Negative 400", "colorNegative", "C-41", 400, [S35, M120]),
    stock("lomography-cn-800", "Lomography", "Color Negative 800", "colorNegative", "C-41", 800, [S35, M120]),
    # --- Kentmere (Harman)
    stock("kentmere-pan-100", "Kentmere", "Pan 100", "bwNegative", "B&W", 100, [S35], power(1.26)),
    stock("kentmere-pan-400", "Kentmere", "Pan 400", "bwNegative", "B&W", 400, [S35], power(1.30)),
    stock("kentmere-pan-800", "Kentmere", "Pan 800", "bwNegative", "B&W", 800, [S35], status="unverified",
          vnotes="Included at the speed given in the product specification. Product availability, formats and reciprocity have not been confirmed against a Harman publication."),
    # --- Foma
    stock("foma-fomapan-100", "Foma", "Fomapan 100", "bwNegative", "B&W", 100, [S35, M120, S45, S810]),
    stock("foma-fomapan-200", "Foma", "Fomapan 200", "bwNegative", "B&W", 200, [S35, M120, S45]),
    stock("foma-fomapan-400", "Foma", "Fomapan 400", "bwNegative", "B&W", 400, [S35, M120, S45]),
]

manufacturers = [
    {"id": "kodak", "name": "Kodak", "website": "https://www.kodak.com/en/motion/page/film-stocks"},
    {"id": "fujifilm", "name": "Fujifilm", "website": "https://www.fujifilm.com"},
    {"id": "ilford", "name": "Ilford", "website": "https://www.ilfordphoto.com"},
    {"id": "cinestill", "name": "CineStill", "website": "https://cinestillfilm.com"},
    {"id": "lomography", "name": "Lomography", "website": "https://www.lomography.com"},
    {"id": "kentmere", "name": "Kentmere", "website": "https://www.ilfordphoto.com"},
    {"id": "foma", "name": "Foma", "website": "https://www.foma.cz"},
    # Expandable categories: populated only with verified records via catalog updates.
    {"id": "rollei", "name": "Rollei", "notes": "Awaiting verified records."},
    {"id": "adox", "name": "Adox", "notes": "Awaiting verified records."},
    {"id": "orwo", "name": "ORWO", "notes": "Awaiting verified records."},
    {"id": "harman", "name": "Harman", "notes": "Awaiting verified records."},
    {"id": "other", "name": "Other", "notes": "Custom and community stocks."},
]

for m in manufacturers:
    m.setdefault("website", None); m.setdefault("notes", None)

catalog = {"schemaVersion": 1, "catalogVersion": 1, "publishedAt": "2026-11-16",
           "manufacturers": manufacturers, "stocks": stocks}
out = pathlib.Path(__file__).resolve().parent.parent / "src/data/film_catalog.json"
out.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(stocks)} stocks -> {out}")
