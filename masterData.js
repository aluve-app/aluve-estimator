/**
 * masterData.js — seed master pricing data, converted from the source
 * Excel workbook "RUMUS_ALUVE_KINBON_-_12_JULI_2026.xlsx" (Phase 1 SRS §13).
 *
 * This is the ONE-TIME SEED used by priceManager.js on first run only.
 * After the first load, priceManager.js persists its working copy to
 * LocalStorage (`aluve_master_prices`) and that copy — not this file —
 * becomes the source of truth, per the "price updates require only a
 * JSON/Price Manager edit, never a code change" architecture rule.
 *
 * DO NOT hardcode calculations against this file directly from UI code —
 * always go through priceManager.js's public API.
 */
window.ALUVE_MASTER_DATA = {
  "brand_tiers": {
    "ALUVE_RECTA": {
      "label": "ALUVE Recta (Premium/Optima line)",
      "groups": [
        {
          "code": "1.a",
          "name": "PINTU SWING ALUVE RECTA PB50 SERIES",
          "items": [
            {
              "name": "Kusen Pintu Swing PB50",
              "harga_modal": 545000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Pintu Swing PB50",
              "harga_modal": 950000,
              "uom": "meter_lari"
            },
            {
              "name": "Tiang Tengah Pintu Double Swing",
              "harga_modal": 510000,
              "uom": "meter_lari"
            },
            {
              "name": "Aksessories Profil Pintu Swing (Satuan)",
              "harga_modal": 740000,
              "uom": "unit"
            },
            {
              "name": "Panel Pintu (10CM) (m2)",
              "harga_modal": 1685000,
              "uom": "m2"
            },
            {
              "name": "Aksessories Pintu Single Swing",
              "harga_modal": 1445000,
              "uom": "unit"
            },
            {
              "name": "Aksessories Pintu Double Swing",
              "harga_modal": 1685000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.b",
          "name": "JENDELA SWING & JUNGKIT ALUVE RECTA PB50 SERIES",
          "items": [
            {
              "name": "Kusen Jendela Swing Dan Jungkit",
              "harga_modal": 545000,
              "uom": "meter_lari"
            },
            {
              "name": "Kusen Tiang Tengah Jendela Swing dan Jungkit",
              "harga_modal": 575000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Jendela Swing dan Jungkit",
              "harga_modal": 870000,
              "uom": "meter_lari"
            },
            {
              "name": "Aksessories Jendela Swing dan Jungkit (Satuan)",
              "harga_modal": 1605000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.c",
          "name": "KACA MATI PB50 ALUVE RECTA",
          "items": [
            {
              "name": "Kusen Kaca Mati",
              "harga_modal": 695000,
              "uom": "meter_lari"
            },
            {
              "name": "Tiang Tengah Kaca Mati",
              "harga_modal": 875000,
              "uom": "meter_lari"
            },
            {
              "name": "Aksessories Profil Kaca Mati (Satuan)",
              "harga_modal": 380000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.d",
          "name": "SLIDING XT90 SERIE",
          "items": [
            {
              "name": "Kusen 2 Track XT90",
              "harga_modal": 920000,
              "uom": "meter_lari"
            },
            {
              "name": "Kusen 3 Track XT90",
              "harga_modal": 1385000,
              "uom": "meter_lari"
            },
            {
              "name": "DAUN PINTU XT90",
              "harga_modal": 805000,
              "uom": "meter_lari"
            },
            {
              "name": "Handle Sliding Single",
              "harga_modal": 1045000,
              "uom": "unit"
            },
            {
              "name": "Handle Pop Up",
              "harga_modal": 315000,
              "uom": "unit"
            },
            {
              "name": "Handle Sliding Double (Buka Tengah)",
              "harga_modal": 1295000,
              "uom": "unit"
            },
            {
              "name": "Roda Sliding (1 daun)",
              "harga_modal": 145000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.e",
          "name": "SLIDING GKT155 SERIES DOUBLE GLASS ALUVE RECTA",
          "items": [
            {
              "name": "Kusen 2 Track GKT155",
              "harga_modal": 2350000,
              "uom": "meter_lari"
            },
            {
              "name": "DAUN PINTU GKT155 (TANPA SIRIP)",
              "harga_modal": 1150000,
              "uom": "meter_lari"
            },
            {
              "name": "DAUN PINTU GKT155 (PAKAI SIRIP)",
              "harga_modal": 1600000,
              "uom": "meter_lari"
            },
            {
              "name": "Handle Sliding PER PINTU",
              "harga_modal": 1750000,
              "uom": "unit"
            },
            {
              "name": "Roda Sliding (1 daun)",
              "harga_modal": 750000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.f",
          "name": "SLIDING ZBT160 ALUVE RECTA",
          "items": [
            {
              "name": "Kusen 3 Track ZBT160",
              "harga_modal": 1450000,
              "uom": "meter_lari"
            },
            {
              "name": "DAUN PINTU ZBT160",
              "harga_modal": 680000,
              "uom": "meter_lari"
            },
            {
              "name": "Aksessories teleskopic 3 daun (set)",
              "harga_modal": 4375000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.g",
          "name": "SLIDING ZBP45 ALUVE RECTA",
          "items": [
            {
              "name": "KUSEN",
              "harga_modal": 660000,
              "uom": "meter_lari"
            },
            {
              "name": "DAUN PINTU",
              "harga_modal": 515000,
              "uom": "meter_lari"
            },
            {
              "name": "AKSESSORIES PINTU PER DAUN",
              "harga_modal": 875000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "1.h",
          "name": "FOLDING ZD60 ALUVE RECTA",
          "items": [
            {
              "name": "Kusen Folding",
              "harga_modal": 1855000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Pintu Folding",
              "harga_modal": 965000,
              "uom": "meter_lari"
            },
            {
              "name": "ACC FOLDING (SATUAN) Max Beban 1 daun 60kg",
              "harga_modal": 2500000,
              "uom": "unit"
            }
          ]
        }
      ]
    },
    "ALUVE_NEXA": {
      "label": "ALUVE Nexa (Entry/Kinbon line)",
      "groups": [
        {
          "code": "2.a",
          "name": "PINTU SWING YN70 ALUVE NEXA",
          "items": [
            {
              "name": "Kusen Pintu dan Kaca Mati YN70",
              "harga_modal": 350000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Pintu YN70",
              "harga_modal": 410000,
              "uom": "meter_lari"
            },
            {
              "name": "Tiang Tengah Pintu Double Swing YN70",
              "harga_modal": 350000,
              "uom": "meter_lari"
            },
            {
              "name": "PANEL 10CM KINBON (M2)",
              "harga_modal": 1685000,
              "uom": "m2"
            },
            {
              "name": "Aksessories Pintu Single Swing",
              "harga_modal": 685000,
              "uom": "unit"
            },
            {
              "name": "Aksessories Pintu Double Swing",
              "harga_modal": 1000000,
              "uom": "unit"
            },
            {
              "name": "ACC FOLDING (SATUAN) Max Beban 1 daun 60kg",
              "harga_modal": 1700000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "2.b",
          "name": "JENDELA SWING YN70 ALUVE NEXA",
          "items": [
            {
              "name": "Kusen Jendela Swing dan Jungkit YN70",
              "harga_modal": 305000,
              "uom": "meter_lari"
            },
            {
              "name": "Kusen Tiang Tengah Jendela Swing Jungkit dan Kaca Mati",
              "harga_modal": 335000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Jendela Swing dan Jungkit YN70",
              "harga_modal": 325000,
              "uom": "meter_lari"
            },
            {
              "name": "Aksessories Jendela Swing dan Jungkit YN70 (Satuan)",
              "harga_modal": 540000,
              "uom": "unit"
            }
          ]
        },
        {
          "code": "2.c",
          "name": "SLIDING YN80 ALUVE NEXA",
          "items": [
            {
              "name": "Kusen 2 Track YN80",
              "harga_modal": 290000,
              "uom": "meter_lari"
            },
            {
              "name": "Kusen 3 TRack YN80",
              "harga_modal": 420000,
              "uom": "meter_lari"
            },
            {
              "name": "Daun Pintu Sliding YN80",
              "harga_modal": 320000,
              "uom": "meter_lari"
            },
            {
              "name": "Handle Sliding Single YN80",
              "harga_modal": 1005000,
              "uom": "unit"
            },
            {
              "name": "Handle Pop UP YN80",
              "harga_modal": 490000,
              "uom": "unit"
            },
            {
              "name": "Handle Sliding Double (Buka Tengah) YN80",
              "harga_modal": 1360000,
              "uom": "unit"
            },
            {
              "name": "Roda Sliding (1 daun) YN80",
              "harga_modal": 125000,
              "uom": "unit"
            }
          ]
        }
      ]
    }
  },
  "glass": {
    "items": [
      {
        "name": "6MM CLEAR STD",
        "harga_modal": 480000,
        "uom": "meter_lari"
      },
      {
        "name": "6MM CLEAR JUMBO",
        "harga_modal": 645000,
        "uom": "meter_lari"
      },
      {
        "name": "6MM TEMPERED STD",
        "harga_modal": 765000,
        "uom": "meter_lari"
      },
      {
        "name": "6MM TEMPERED JUMBO",
        "harga_modal": 1035000,
        "uom": "meter_lari"
      },
      {
        "name": "8MM CLEAR STD",
        "harga_modal": 560000,
        "uom": "meter_lari"
      },
      {
        "name": "8MM CLEAR JUMBO",
        "harga_modal": 760000,
        "uom": "meter_lari"
      },
      {
        "name": "8MM TEMPERED STD",
        "harga_modal": 1080000,
        "uom": "meter_lari"
      },
      {
        "name": "8MM TEMPERED JUMBO",
        "harga_modal": 1510000,
        "uom": "meter_lari"
      },
      {
        "name": "10MM CLEAR STD",
        "harga_modal": 800000,
        "uom": "meter_lari"
      },
      {
        "name": "10MM SINGLE JUMBO",
        "harga_modal": 1075000,
        "uom": "meter_lari"
      },
      {
        "name": "10MM TEMPERED STD",
        "harga_modal": 1240000,
        "uom": "meter_lari"
      },
      {
        "name": "10MM TEMPERED JUMBO",
        "harga_modal": 1755000,
        "uom": "meter_lari"
      },
      {
        "name": "6+AS12+6MM TEMPERED",
        "harga_modal": 2000000,
        "uom": "meter_lari"
      },
      {
        "name": "8+AS12+8MM TEMPERED",
        "harga_modal": 3050000,
        "uom": "meter_lari"
      },
      {
        "name": "KACA MORU 5mm tempered",
        "harga_modal": 680000,
        "uom": "meter_lari"
      },
      {
        "name": "KACA ES 5mm tempered",
        "harga_modal": 680000,
        "uom": "meter_lari"
      },
      {
        "name": "6MM TEMEPERED",
        "harga_modal": 1245000,
        "uom": "meter_lari"
      },
      {
        "name": "8MM TEMPERED",
        "harga_modal": 1510000,
        "uom": "meter_lari"
      },
      {
        "name": "10MM TEMEPERED",
        "harga_modal": 1755000,
        "uom": "meter_lari"
      },
      {
        "name": "12MM TEMPERED",
        "harga_modal": 2070000,
        "uom": "meter_lari"
      }
    ]
  },
  "other": {
    "items": [
      {
        "name": "ORNAMEN (Meter Lari)",
        "harga_modal": 150000,
        "uom": "meter_lari"
      }
    ]
  },
  "sealant": {
    "name": "SEALENT",
    "harga_modal": 50000,
    "uom": "tube_estimated",
    "legacy_excel_formula_note": "Original Excel computed sealant quantity as AVERAGE of ~22 unrelated line-item quantities divided by 7 (=(E10+E11+E18+...+E42+E45+E50)/7) — an unexplained legacy heuristic, not a real per-item measurement. New system requirement per business rule is per-ITEM sealant (Aluminium+Glass+Sealant+Discount+Notes per item), so this legacy global-average formula is NOT carried over and must be replaced by a per-item sealant qty input, pending confirmation from user of the actual sealant estimation rule (e.g. sealant per running meter of perimeter sealed)."
  },
  "meta": {
    "currency": "IDR",
    "harga_modal_definition": "Base cost price (modal/cost) per unit of measure, before markup multiplier M1 is applied",
    "formula_pattern": "harga_jual = harga_modal * qty_input (Excel column E/M1 = customer-facing quantity input; F = D*E)"
  },
  "known_data_quality_issue": {
    "grand_total_double_count": "Original Excel formula for GRAND TOTAL = SUM(F99:F104), where F102 (PROF+ACC) already includes F99 (Ornamen) and F100 (Sealant) added directly. Summing F99:F104 therefore double-counts Ornamen and Sealant. This appears to be a spreadsheet formula error inherited from the legacy file, not a real business rule. Flagged for confirmation before the new system's totals logic is finalized; new system will NOT replicate this double-count."
  }
};
