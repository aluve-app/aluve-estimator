/**
 * ============================================================
 * DRAWINGPAGE.JS
 * ============================================================
 * Halaman "Generate Drawing" — membuat ilustrasi teknik sederhana
 * (tampak depan + potongan horizontal/vertikal) untuk pintu/jendela
 * aluminium, berdasarkan input manual (BUKAN diambil dari data
 * project/Item Estimator — halaman ini sengaja berdiri sendiri, lihat
 * catatan di README/RANGKUMAN soal keputusan ini).
 *
 * PENTING — ini BUKAN pengganti AutoCAD/gambar kerja produksi.
 * Semua ukuran & proporsi murni ilustratif untuk visualisasi
 * penawaran ke customer.
 *
 * Riwayat gambar disimpan lewat window.ALUVE.Storage.getDrawings/
 * saveDrawing/deleteDrawing — LocalStorage saja untuk versi ini
 * (belum disambungkan ke Firestore/server, keputusan sadar per sesi
 * integrasi awal supaya cepat jalan; lihat komentar di storage.js).
 *
 * Public API: window.ALUVE.DrawingPage
 * ============================================================ */
window.ALUVE = window.ALUVE || {};

window.ALUVE.DrawingPage = (function () {
  'use strict';

  var Helper = window.ALUVE.Helper;
  var UiFeedback = window.ALUVE.UiFeedback;

  function notify(message, variant) {
    if (UiFeedback && UiFeedback.showToast) UiFeedback.showToast(message, variant);
  }


  /* ============================================================
     CONSTANTS
     ============================================================ */
  var GLASS_FILL = '#cfe0f5';
  var GLASS_STROKE = '#8fb3dd';
  var DIM_STROKE = '#5b6270';
  var LEADER_STROKE = '#9aa0ac';
  var DIAG_STROKE = '#3d5a80';
  var FRONT_VB_W = 420, FRONT_VB_H = 400;

  var PRODUCT_LABELS = {
    swing_door: 'Pintu swing',
    swing_window: 'Jendela swing',
    jungkit_window: 'Jendela jungkit',
    swing_jungkit_window: 'Jendela swing & jungkit',
    sliding_door: 'Pintu sliding',
    folding_door: 'Pintu folding'
  };

  var PANEL_TYPE_LABELS = {
    kaca: 'Kaca',
    jalusi: 'Jalusi aluminium',
    kaca_nako: 'Kaca nako',
    panel_acp: 'Panel ACP',
    panel_acp_bergaris: 'Panel ACP bergaris'
  };

  var BRAND_LABELS = {
    optima: 'OPTIMA',
    prima: 'PRIMA',
    recta: 'RECTA',
    nexa: 'NEXA'
  };

  var BRAND_LOGOS = {
    optima: 'assets/aluve-optima.png',
    prima: 'assets/aluve-prima.png',
    recta: 'assets/aluve-recta.png',
    nexa: 'assets/aluve-nexa.png'
  };

  function preloadBrandLogos() {
    // Tanpa ini, klik "Print" sebelum browser selesai load <img> logo
    // (baru pertama kali dipakai) bikin PDF pertama tercetak tanpa logo —
    // generate/print kedua baru muncul karena sudah ke-cache browser.
    Object.keys(BRAND_LOGOS).forEach(function (key) {
      var img = new Image();
      img.src = BRAND_LOGOS[key];
    });
  }

  var sectionPanelConfigs = [];
  var sectionActivePanelIndex = [];
  var sectionMeta = [];

  /* ============================================================
     LOW-LEVEL DRAW HELPERS
     ============================================================ */

  function drawArrow() {
    return '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" ' +
      'orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="' + DIM_STROKE +
      '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></marker>';
  }

  function drawMeshDefs() {
    return '<pattern id="meshGrid" width="5" height="5" patternUnits="userSpaceOnUse">' +
      '<path d="M0 0H5M0 0V5" stroke="' + LEADER_STROKE + '" stroke-width="0.5" opacity="0.55"/></pattern>';
  }

  function drawDefs() {
    return '<defs>' + drawArrow() + drawMeshDefs() + '</defs>';
  }

  function drawFrame(x, y, w, h, color) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="none" stroke="' + color + '" stroke-width="4" rx="2"/>';
  }

  function drawFrame3Sides(x, y, w, h, color) {
    return '<path d="M ' + x + ' ' + (y + h) + ' L ' + x + ' ' + y + ' L ' + (x + w) + ' ' + y +
      ' L ' + (x + w) + ' ' + (y + h) + '" fill="none" stroke="' + color +
      '" stroke-width="4" stroke-linejoin="round"/>';
  }

  function wrapTwoLines(text) {
    var words = text.split(' ');
    if (words.length <= 1) return [text];
    var mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  function drawGlass(x, y, w, h, label) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="' + GLASS_FILL + '" stroke="' + GLASS_STROKE + '" stroke-width="1"/>';
    if (label && w > 40 && h > 30) {
      var lines = wrapTwoLines(label);
      var maxLen = Math.max.apply(null, lines.map(function (l) { return l.length; }));
      var bw = Math.min(w - 6, maxLen * 3.1 + 8);
      var lineH = 11;
      var boxH = lines.length * lineH + 6;
      var cx = x + w / 2;
      var topY = y + h * 0.18;
      s += '<rect x="' + (cx - bw / 2) + '" y="' + (topY - 5) + '" width="' + bw +
        '" height="' + boxH + '" fill="' + GLASS_FILL + '" opacity="0.85"/>';
      s += '<text x="' + cx + '" y="' + topY + '" text-anchor="middle" font-size="10" fill="#3d5a80">';
      lines.forEach(function (line, i) {
        s += '<tspan x="' + cx + '" dy="' + (i === 0 ? 0 : lineH) + '">' + line + '</tspan>';
      });
      s += '</text>';
    }
    return s;
  }

  function drawLouvers(x, y, w, h, fillColor, isGlass) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="#f5f6f8" stroke="' + LEADER_STROKE + '" stroke-width="0.5"/>';
    var slatH = Math.max(3, h / 26), gap = 1.5, sy = y + 2;
    while (sy < y + h - 2) {
      var thisH = Math.min(slatH, y + h - 2 - sy);
      s += '<rect x="' + (x + 2) + '" y="' + sy + '" width="' + (w - 4) + '" height="' + thisH +
        '" fill="' + fillColor + '" stroke="' + (isGlass ? GLASS_STROKE : 'rgba(0,0,0,0.25)') +
        '" stroke-width="0.4" opacity="' + (isGlass ? 0.8 : 1) + '"/>';
      sy += slatH + gap;
    }
    return s;
  }

  function drawPanelContent(x, y, w, h, panelType, label, color) {
    if (panelType === 'jalusi') return drawLouvers(x, y, w, h, color || '#8a8f98', false);
    if (panelType === 'kaca_nako') return drawLouvers(x, y, w, h, GLASS_FILL, true);
    if (panelType === 'panel_acp') {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="#e3e1da" stroke="#b9b6ac" stroke-width="1"/>';
    }
    if (panelType === 'panel_acp_bergaris') {
      var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="#e3e1da" stroke="#b9b6ac" stroke-width="1"/>';
      var lineY = y + 8;
      while (lineY < y + h - 4) {
        s += '<line x1="' + (x + 2) + '" y1="' + lineY + '" x2="' + (x + w - 2) + '" y2="' + lineY +
          '" stroke="#c9c6bc" stroke-width="0.8"/>';
        lineY += 8;
      }
      return s;
    }
    return drawGlass(x, y, w, h, label);
  }

  function drawOrnamentLines(x, y, w, h, vCount, hCount) {
    var s = '';
    var vn = parseInt(vCount, 10) || 0;
    var hn = parseInt(hCount, 10) || 0;
    for (var i = 1; i <= vn; i++) {
      var lx = x + (w * i) / (vn + 1);
      s += '<line x1="' + lx + '" y1="' + y + '" x2="' + lx + '" y2="' + (y + h) +
        '" stroke="' + DIM_STROKE + '" stroke-width="0.8" opacity="0.55"/>';
    }
    for (var j = 1; j <= hn; j++) {
      var ly = y + (h * j) / (hn + 1);
      s += '<line x1="' + x + '" y1="' + ly + '" x2="' + (x + w) + '" y2="' + ly +
        '" stroke="' + DIM_STROKE + '" stroke-width="0.8" opacity="0.55"/>';
    }
    return s;
  }

  function renderPanel(p, idx, cfg, color) {
    var label = (cfg.panelType === 'kaca' || cfg.panelType === 'kaca_nako') ? cfg.glass : '';
    var s = drawPanelContent(p.x, p.y, p.w, p.h, cfg.panelType, label, color);
    if (cfg.insect && (cfg.panelType === 'kaca' || cfg.panelType === 'kaca_nako')) {
      s += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="url(#meshGrid)"/>';
    }
    if (cfg.ornamentV || cfg.ornamentH) {
      s += drawOrnamentLines(p.x, p.y, p.w, p.h, cfg.ornamentV, cfg.ornamentH);
    }
    if (cfg.fixGlass && p.w > 40 && p.h > 24) {
      s += '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h - 10) +
        '" text-anchor="middle" font-size="9" fill="' + DIAG_STROKE + '">FIX</text>';
    }
    return s;
  }

  function drawDimension(x1, y1, x2, y2, label, orientation) {
    var s = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + DIM_STROKE + '" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>';
    if (orientation === 'h') {
      s += '<text x="' + ((x1 + x2) / 2) + '" y="' + (y1 - 6) +
        '" text-anchor="middle" font-size="11" fill="' + DIM_STROKE + '">' + label + '</text>';
    } else {
      s += '<text x="' + (x1 - 8) + '" y="' + ((y1 + y2) / 2) +
        '" text-anchor="end" dominant-baseline="central" font-size="11" fill="' + DIM_STROKE + '">' + label + '</text>';
    }
    return s;
  }

  function extensionLine(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + LEADER_STROKE + '" stroke-width="0.5" opacity="0.6"/>';
  }

  function buildPanelDimRow(panels, evenWidthMM, y) {
    if (panels.length <= 1) return '';
    var s = '';
    panels.forEach(function (p) {
      s += '<line x1="' + p.x + '" y1="' + y + '" x2="' + (p.x + p.w) + '" y2="' + y +
        '" stroke="' + DIM_STROKE + '" stroke-width="0.6" marker-start="url(#arrow)" marker-end="url(#arrow)"/>';
      s += '<text x="' + (p.x + p.w / 2) + '" y="' + (y - 4) +
        '" text-anchor="middle" font-size="9" fill="' + DIM_STROKE + '">' + evenWidthMM + '</text>';
    });
    return s;
  }

  function drawPostMark(m, midY) {
    var cx = m.x + m.w / 2;
    return '<line x1="' + (cx - 5) + '" y1="' + midY + '" x2="' + (cx + 5) + '" y2="' + midY +
      '" stroke="' + DIM_STROKE + '" stroke-width="1"/>' +
      '<line x1="' + cx + '" y1="' + (midY - 5) + '" x2="' + cx + '" y2="' + (midY + 5) +
      '" stroke="' + DIM_STROKE + '" stroke-width="1"/>';
  }

  function triangleOpenIndicator(apexX, apexY, tx, topY, bottomY) {
    return '<path d="M ' + apexX + ' ' + apexY + ' L ' + tx + ' ' + topY +
      ' M ' + apexX + ' ' + apexY + ' L ' + tx + ' ' + bottomY +
      '" fill="none" stroke="' + DIAG_STROKE + '" stroke-width="1.2" stroke-dasharray="5 3"/>';
  }

  function triangleOpenIndicatorH(apexX, apexY, ty, leftX, rightX) {
    return '<path d="M ' + apexX + ' ' + apexY + ' L ' + leftX + ' ' + ty +
      ' M ' + apexX + ' ' + apexY + ' L ' + rightX + ' ' + ty +
      '" fill="none" stroke="' + DIAG_STROKE + '" stroke-width="1.2" stroke-dasharray="5 3"/>';
  }

  function arrowHeadRight(x, y) {
    return '<polygon points="' + x + ',' + y + ' ' + (x - 7) + ',' + (y - 4) + ' ' + (x - 7) + ',' + (y + 4) +
      '" fill="' + DIAG_STROKE + '"/>';
  }

  function arrowHeadLeft(x, y) {
    return '<polygon points="' + x + ',' + y + ' ' + (x + 7) + ',' + (y - 4) + ' ' + (x + 7) + ',' + (y + 4) +
      '" fill="' + DIAG_STROKE + '"/>';
  }

  function drawPanelArrow(p, dir, midY) {
    var margin = 8;
    var x1 = p.x + margin, x2 = p.x + p.w - margin;
    if (x2 <= x1) return '';
    var line = '<line x1="' + x1 + '" y1="' + midY + '" x2="' + x2 + '" y2="' + midY +
      '" stroke="' + DIAG_STROKE + '" stroke-width="1.3"/>';
    if (dir === 'both') {
      return line + arrowHeadLeft(x1, midY) + arrowHeadRight(x2, midY);
    }
    if (dir === 'kiri') {
      return line + arrowHeadLeft(x1, midY);
    }
    return line + arrowHeadRight(x2, midY);
  }

  /* ============================================================
     GEOMETRY
     ============================================================ */

  function fitScale(widthMM, heightMM, maxW, maxH) {
    return Math.min(maxW / widthMM, maxH / heightMM);
  }

  function splitPanels(x, y, w, h, count, inset) {
    var mullion = 6;
    var innerW = w - inset * 2 - mullion * (count - 1);
    var panelW = innerW / count;
    var panels = [], mullionRects = [];
    var cx = x + inset;
    for (var i = 0; i < count; i++) {
      panels.push({ x: cx, y: y + inset, w: panelW, h: h - inset * 2 });
      cx += panelW;
      if (i < count - 1) {
        mullionRects.push({ x: cx, y: y + inset, w: mullion, h: h - inset * 2 });
        cx += mullion;
      }
    }
    return { panels: panels, mullionRects: mullionRects };
  }

  function insectAllowed(product) {
    return ['swing_door', 'swing_window', 'jungkit_window', 'swing_jungkit_window', 'sliding_door'].indexOf(product) !== -1;
  }

  /* ============================================================
     FRONT VIEW GENERATORS — each returns { svg, panels }
     ============================================================ */

  function frontSwing(x, y, w, h, configs, color) {
    var split = splitPanels(x, y, w, h, configs.length, 6);
    var s = '';
    split.mullionRects.forEach(function (m) {
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="' + color + '"/>';
    });
    split.panels.forEach(function (p, idx) {
      var cfg = configs[idx];
      s += renderPanel(p, idx, cfg, color);
      if (!cfg.fixGlass) {
        var hingeLeft = cfg.direction === 'kiri';
        var hx = hingeLeft ? p.x : p.x + p.w, tx = hingeLeft ? p.x + p.w : p.x;
        s += triangleOpenIndicator(hx, p.y + p.h / 2, tx, p.y, p.y + p.h);
      }
    });
    return { svg: s, panels: split.panels };
  }

  function frontJungkit(x, y, w, h, configs, color) {
    var split = splitPanels(x, y, w, h, configs.length, 6);
    var s = '';
    split.mullionRects.forEach(function (m) {
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="' + color + '"/>';
    });
    split.panels.forEach(function (p, idx) {
      var cfg = configs[idx];
      s += renderPanel(p, idx, cfg, color);
      if (!cfg.fixGlass) {
        var midx = p.x + p.w / 2;
        if (cfg.direction === 'bawah') {
          s += triangleOpenIndicatorH(midx, p.y, p.y + p.h, p.x, p.x + p.w);
        } else {
          s += triangleOpenIndicatorH(midx, p.y + p.h, p.y, p.x, p.x + p.w);
        }
      }
    });
    return { svg: s, panels: split.panels };
  }

  function frontSwingJungkit(x, y, w, h, configs, color) {
    var split = splitPanels(x, y, w, h, configs.length, 6);
    var s = '';
    split.mullionRects.forEach(function (m) {
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="' + color + '"/>';
    });
    split.panels.forEach(function (p, idx) {
      var cfg = configs[idx];
      s += renderPanel(p, idx, cfg, color);
      if (!cfg.fixGlass) {
        var hingeLeft = cfg.direction === 'kiri';
        var hx = hingeLeft ? p.x : p.x + p.w, tx = hingeLeft ? p.x + p.w : p.x;
        s += triangleOpenIndicator(hx, p.y + p.h / 2, tx, p.y, p.y + p.h);
        var midx = p.x + p.w / 2, tiltY = p.y + p.h * 0.22;
        s += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + midx + '" y2="' + tiltY +
          '" stroke="' + DIAG_STROKE + '" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.8"/>';
        s += '<line x1="' + (p.x + p.w) + '" y1="' + p.y + '" x2="' + midx + '" y2="' + tiltY +
          '" stroke="' + DIAG_STROKE + '" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.8"/>';
      }
    });
    return { svg: s, panels: split.panels };
  }

  function frontSliding(x, y, w, h, configs, color) {
    var split = splitPanels(x, y, w, h, configs.length, 6);
    var s = '';
    var midY = y + h / 2;
    split.mullionRects.forEach(function (m) {
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="' + color + '"/>';
      s += drawPostMark(m, midY);
    });
    split.panels.forEach(function (p, idx) {
      s += renderPanel(p, idx, configs[idx], color);
    });
    split.panels.forEach(function (p, idx) {
      var cfg = configs[idx];
      if (!cfg.fixGlass) s += drawPanelArrow(p, cfg.direction, midY);
    });
    return { svg: s, panels: split.panels };
  }

  function frontFolding(x, y, w, h, configs, color) {
    var split = splitPanels(x, y, w, h, configs.length, 6);
    var s = '';
    split.mullionRects.forEach(function (m) {
      s += '<circle cx="' + (m.x + m.w / 2) + '" cy="' + (m.y + 10) + '" r="2.5" fill="' + DIM_STROKE + '"/>';
      s += '<circle cx="' + (m.x + m.w / 2) + '" cy="' + (m.y + m.h - 10) + '" r="2.5" fill="' + DIM_STROKE + '"/>';
    });
    split.panels.forEach(function (p, idx) {
      s += renderPanel(p, idx, configs[idx], color);
    });
    split.panels.forEach(function (p, idx) {
      var cfg = configs[idx];
      if (cfg.fixGlass) return;
      var toRight = cfg.direction === 'kanan';
      var ax = toRight ? p.x : p.x + p.w;
      var tx = toRight ? p.x + p.w : p.x;
      s += triangleOpenIndicator(ax, p.y + p.h / 2, tx, p.y, p.y + p.h);
    });
    return { svg: s, panels: split.panels };
  }

  function callFrontGenerator(product, x, y, w, h, panels, color) {
    if (product === 'swing_door' || product === 'swing_window') return frontSwing(x, y, w, h, panels, color);
    if (product === 'swing_jungkit_window') return frontSwingJungkit(x, y, w, h, panels, color);
    if (product === 'jungkit_window') return frontJungkit(x, y, w, h, panels, color);
    if (product === 'sliding_door') return frontSliding(x, y, w, h, panels, color);
    return frontFolding(x, y, w, h, panels, color);
  }

  function buildSectionDimColumn(sectionPixelInfo, originX, originY, drawH) {
    var xInner = originX - 24, xOuter = originX - 50;
    var s = '';
    sectionPixelInfo.forEach(function (info) {
      s += extensionLine(originX, info.y, xInner - 6, info.y);
    });
    s += extensionLine(originX, originY + drawH, xInner - 6, originY + drawH);
    sectionPixelInfo.forEach(function (info) {
      s += '<line x1="' + xInner + '" y1="' + info.y + '" x2="' + xInner + '" y2="' + (info.y + info.h) +
        '" stroke="' + DIM_STROKE + '" stroke-width="0.6" marker-start="url(#arrow)" marker-end="url(#arrow)"/>';
      s += '<text x="' + (xInner - 4) + '" y="' + (info.y + info.h / 2) +
        '" text-anchor="end" dominant-baseline="central" font-size="9" fill="' + DIM_STROKE + '">' + info.heightMM + '</text>';
    });
    var totalMM = sectionPixelInfo.reduce(function (sum, i) { return sum + i.heightMM; }, 0);
    s += extensionLine(originX, originY, xOuter - 8, originY);
    s += extensionLine(originX, originY + drawH, xOuter - 8, originY + drawH);
    s += drawDimension(xOuter, originY, xOuter, originY + drawH, totalMM + ' mm', 'v');
    return s;
  }

  function generateFrontView(data) {
    var VB_W = FRONT_VB_W, VB_H = FRONT_VB_H;
    var isMulti = data.sections.length > 1;
    var maxW = isMulti ? 260 : 300, maxH = 260;
    var scale = fitScale(data.width, data.height, maxW, maxH);
    var drawW = data.width * scale, drawH = data.height * scale;
    var originX = isMulti ? 130 : 105, originY = 45;

    var svg = '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" xmlns="http://www.w3.org/2000/svg">';
    svg += drawDefs();

    var lastSection = data.sections[data.sections.length - 1];
    var noBottomFrame = lastSection.product === 'swing_door';
    svg += noBottomFrame
      ? drawFrame3Sides(originX, originY, drawW, drawH, data.color)
      : drawFrame(originX, originY, drawW, drawH, data.color);

    var cumY = originY;
    var sectionPixelInfo = [];
    data.sections.forEach(function (sec, idx) {
      var secH = (sec.heightMM / data.height) * drawH;
      var result = callFrontGenerator(sec.product, originX, cumY, drawW, secH, sec.panels, data.color);
      svg += result.svg;
      sectionPixelInfo.push({ y: cumY, h: secH, heightMM: sec.heightMM, panels: result.panels });

      if (idx < data.sections.length - 1) {
        svg += '<rect x="' + originX + '" y="' + (cumY + secH - 3) + '" width="' + drawW +
          '" height="6" fill="' + data.color + '"/>';
      }
      cumY += secH;
    });

    var bottomY = originY + drawH;
    if (!isMulti && sectionPixelInfo[0].panels.length > 1) {
      var row1Y = bottomY + 24;
      var row2Y = bottomY + 50;
      var evenWidthMM = Math.round(data.width / sectionPixelInfo[0].panels.length);
      svg += buildPanelDimRow(sectionPixelInfo[0].panels, evenWidthMM, row1Y);
      svg += extensionLine(originX, bottomY, originX, row2Y - 8);
      svg += extensionLine(originX + drawW, bottomY, originX + drawW, row2Y - 8);
      svg += drawDimension(originX, row2Y, originX + drawW, row2Y, data.width + ' mm', 'h');
    } else {
      var rowY = bottomY + 24;
      svg += extensionLine(originX, bottomY, originX, rowY - 8);
      svg += extensionLine(originX + drawW, bottomY, originX + drawW, rowY - 8);
      svg += drawDimension(originX, rowY, originX + drawW, rowY, data.width + ' mm', 'h');
    }

    if (isMulti) {
      svg += buildSectionDimColumn(sectionPixelInfo, originX, originY, drawH);
    } else {
      svg += extensionLine(originX, originY, originX - 40, originY);
      svg += extensionLine(originX, originY + drawH, originX - 40, originY + drawH);
      svg += drawDimension(originX - 32, originY, originX - 32, originY + drawH, data.height + ' mm', 'v');
    }

    svg += '</svg>';
    return svg;
  }

  /* ============================================================
     PER-PANEL CONFIG STATE (per section)
     ============================================================ */

  function val(id) { return document.getElementById(id).value; }

  function getDirectionOptionsSingle(product) {
    if (product === 'jungkit_window') return [{ value: 'atas', label: 'Atas' }, { value: 'bawah', label: 'Bawah' }];
    if (product === 'sliding_door') return [{ value: 'kanan', label: 'Kanan' }, { value: 'kiri', label: 'Kiri' }, { value: 'both', label: 'Dua arah' }];
    if (product === 'folding_door') return [{ value: 'kanan', label: 'Kanan' }, { value: 'kiri', label: 'Kiri' }];
    return [{ value: 'kanan', label: 'Kanan' }, { value: 'kiri', label: 'Kiri' }];
  }

  function directionLabelFor(product, value) {
    var found = getDirectionOptionsSingle(product).filter(function (o) { return o.value === value; })[0];
    return found ? found.label : value;
  }

  function defaultPanelConfig(product) {
    return {
      direction: getDirectionOptionsSingle(product)[0].value,
      panelType: 'kaca',
      glass: 'Kaca clear 8mm',
      insect: false,
      fixGlass: false,
      ornamentV: 0,
      ornamentH: 0
    };
  }

  function syncSectionPanelConfigs(idx) {
    var product = val('sec' + idx + '-product');
    var count = Math.max(1, parseInt(val('sec' + idx + '-panel-count'), 10) || 1);
    var validValues = getDirectionOptionsSingle(product).map(function (o) { return o.value; });
    var arr = sectionPanelConfigs[idx];

    while (arr.length < count) arr.push(defaultPanelConfig(product));
    arr.length = count;

    arr.forEach(function (cfg) {
      if (validValues.indexOf(cfg.direction) === -1) cfg.direction = validValues[0];
    });
    if (sectionActivePanelIndex[idx] >= count) sectionActivePanelIndex[idx] = count - 1;
  }

  function renderSectionPanelTabs(idx) {
    var wrap = document.getElementById('sec' + idx + '-panel-tabs');
    var arr = sectionPanelConfigs[idx];
    if (arr.length <= 1) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = arr.map(function (cfg, i) {
      return '<button type="button" class="dg-panel-tab-btn' + (i === sectionActivePanelIndex[idx] ? ' active' : '') +
        '" data-idx="' + i + '">Panel ' + (i + 1) + '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('.dg-panel-tab-btn'), function (btn) {
      btn.addEventListener('click', function () {
        saveActiveSectionPanelConfig(idx);
        sectionActivePanelIndex[idx] = parseInt(btn.getAttribute('data-idx'), 10);
        renderSectionPanelTabs(idx);
        loadSectionPanelConfigIntoForm(idx);
      });
    });
  }

  function loadSectionPanelConfigIntoForm(idx) {
    var product = val('sec' + idx + '-product');
    var cfg = sectionPanelConfigs[idx][sectionActivePanelIndex[idx]];
    if (!cfg) return;

    var dirSelect = document.getElementById('sec' + idx + '-pc-direction');
    var opts = getDirectionOptionsSingle(product);
    dirSelect.innerHTML = opts.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('');
    dirSelect.value = cfg.direction;

    document.getElementById('sec' + idx + '-pc-panel-type').value = cfg.panelType;
    document.getElementById('sec' + idx + '-pc-glass').value = cfg.glass;
    document.getElementById('sec' + idx + '-pc-insect').checked = cfg.insect;
    document.getElementById('sec' + idx + '-pc-fixglass').checked = cfg.fixGlass;
    document.getElementById('sec' + idx + '-pc-ornament-v').value = cfg.ornamentV || 0;
    document.getElementById('sec' + idx + '-pc-ornament-h').value = cfg.ornamentH || 0;

    updateSectionPcVisibility(idx);
  }

  function updateSectionPcVisibility(idx) {
    var product = val('sec' + idx + '-product');
    var fixGlass = document.getElementById('sec' + idx + '-pc-fixglass').checked;
    document.getElementById('sec' + idx + '-pc-direction-wrap').style.display = fixGlass ? 'none' : 'block';
    document.getElementById('sec' + idx + '-pc-insect-wrap').style.display = insectAllowed(product) ? 'flex' : 'none';
    document.getElementById('sec' + idx + '-pc-glass-wrap').style.display = (val('sec' + idx + '-pc-panel-type') === 'kaca') ? 'block' : 'none';
  }

  function saveActiveSectionPanelConfig(idx) {
    var arr = sectionPanelConfigs[idx];
    var ai = sectionActivePanelIndex[idx];
    if (!arr[ai]) return;
    arr[ai] = {
      direction: val('sec' + idx + '-pc-direction'),
      panelType: val('sec' + idx + '-pc-panel-type'),
      glass: val('sec' + idx + '-pc-glass'),
      insect: document.getElementById('sec' + idx + '-pc-insect').checked,
      fixGlass: document.getElementById('sec' + idx + '-pc-fixglass').checked,
      ornamentV: parseInt(val('sec' + idx + '-pc-ornament-v'), 10) || 0,
      ornamentH: parseInt(val('sec' + idx + '-pc-ornament-h'), 10) || 0
    };
  }

  function onSectionProductOrCountChange(idx) {
    saveActiveSectionPanelConfig(idx);
    syncSectionPanelConfigs(idx);
    renderSectionPanelTabs(idx);
    loadSectionPanelConfigIntoForm(idx);
  }

  /* ----------------------------------------------------------
     Jumlah section & pembagian tinggi — section terakhir SELALU
     otomatis (sisa dari tinggi total dikurangi section-section
     manual sebelumnya), sesuai keputusan Anto. Jumlah section
     tidak dibatasi (Anto minta "open aja").
  ---------------------------------------------------------- */

  function getSectionCount() {
    return Math.max(1, parseInt(val('f-section-count'), 10) || 1);
  }

  function recomputeSectionHeights() {
    var n = getSectionCount();
    var total = parseInt(val('f-height'), 10) || 0;
    var sum = 0;
    for (var i = 0; i < n - 1; i++) sum += parseInt(val('sec' + i + '-height'), 10) || 0;
    var lastH = total - sum;
    var lastInput = document.getElementById('sec' + (n - 1) + '-height');
    if (lastInput) lastInput.value = Math.max(0, lastH);
    if (sectionMeta[n - 1]) sectionMeta[n - 1].heightMM = Math.max(0, lastH);
    var warn = document.getElementById('section-height-warning');
    if (warn) warn.style.display = (lastH <= 0 && n > 1) ? 'block' : 'none';
  }

  var PRODUCT_OPTIONS_HTML = '<option value="swing_door">Pintu swing</option>' +
    '<option value="swing_window">Jendela swing</option>' +
    '<option value="jungkit_window">Jendela jungkit</option>' +
    '<option value="swing_jungkit_window">Jendela swing &amp; jungkit</option>' +
    '<option value="sliding_door">Pintu sliding</option>' +
    '<option value="folding_door">Pintu folding</option>';

  function buildSectionBlockHTML(idx, isLast) {
    var m = sectionMeta[idx];
    var tag = idx === 0 ? '(atas)' : (isLast ? '(otomatis, sisa tinggi)' : '');
    var heightAttr = m.heightMM ? ' value="' + m.heightMM + '"' : '';
    var panelCountAttr = m.panelCount ? ' value="' + m.panelCount + '"' : ' value="1"';
    var productOptions = PRODUCT_OPTIONS_HTML.replace(
      'value="' + m.product + '"', 'value="' + m.product + '" selected'
    );
    return '' +
      '<div class="dg-section-block" id="sec' + idx + '-block">' +
        '<div class="dg-section-title">Section ' + (idx + 1) + ' ' + tag + '</div>' +
        '<div class="dg-field-grid">' +
          '<div><label class="form-label" for="sec' + idx + '-height">Tinggi section (mm)</label>' +
          '<input class="form-control" id="sec' + idx + '-height" type="number" min="0" step="10" placeholder="Contoh: 2100"' + heightAttr + '></div>' +
          '<div><label class="form-label" for="sec' + idx + '-product">Jenis produk</label>' +
          '<select class="form-select" id="sec' + idx + '-product">' + productOptions + '</select></div>' +
          '<div><label class="form-label" for="sec' + idx + '-panel-count">Jumlah panel</label>' +
          '<input class="form-control" id="sec' + idx + '-panel-count" type="number" min="1" max="20" step="1"' + panelCountAttr + '></div>' +
        '</div>' +
        '<div id="sec' + idx + '-panel-tabs" class="dg-panel-tabs"></div>' +
        '<div class="dg-panel-config-box"><div class="dg-field-grid">' +
          '<div id="sec' + idx + '-pc-direction-wrap"><label class="form-label" for="sec' + idx + '-pc-direction">Arah bukaan</label>' +
          '<select class="form-select" id="sec' + idx + '-pc-direction"></select></div>' +
          '<div><label class="form-label" for="sec' + idx + '-pc-panel-type">Jenis panel</label>' +
          '<select class="form-select" id="sec' + idx + '-pc-panel-type">' +
            '<option value="kaca" selected>Kaca</option>' +
            '<option value="jalusi">Jalusi aluminium</option>' +
            '<option value="kaca_nako">Kaca nako</option>' +
            '<option value="panel_acp">Panel ACP</option>' +
            '<option value="panel_acp_bergaris">Panel ACP bergaris</option>' +
          '</select></div>' +
          '<div id="sec' + idx + '-pc-glass-wrap"><label class="form-label" for="sec' + idx + '-pc-glass">Jenis kaca</label>' +
          '<select class="form-select" id="sec' + idx + '-pc-glass">' +
            '<option>Kaca clear 5mm</option><option selected>Kaca clear 8mm</option>' +
            '<option>Kaca buram 5mm</option><option>Kaca tempered 10mm</option>' +
          '</select></div>' +
          '<div id="sec' + idx + '-pc-insect-wrap" class="dg-checkbox-row">' +
          '<input type="checkbox" class="form-check-input" id="sec' + idx + '-pc-insect">' +
          '<label class="form-check-label" for="sec' + idx + '-pc-insect">Tambah insect screen</label></div>' +
          '<div><label class="form-label" for="sec' + idx + '-pc-ornament-v">Ornamen vertikal (garis)</label>' +
          '<input class="form-control" id="sec' + idx + '-pc-ornament-v" type="number" min="0" max="12" step="1" placeholder="Contoh: 0"></div>' +
          '<div><label class="form-label" for="sec' + idx + '-pc-ornament-h">Ornamen horizontal (garis)</label>' +
          '<input class="form-control" id="sec' + idx + '-pc-ornament-h" type="number" min="0" max="12" step="1" placeholder="Contoh: 0"></div>' +
          '<div class="dg-checkbox-row"><input type="checkbox" class="form-check-input" id="sec' + idx + '-pc-fixglass">' +
          '<label class="form-check-label" for="sec' + idx + '-pc-fixglass">Kaca mati (fix glass)</label></div>' +
        '</div></div>' +
      '</div>';
  }

  function saveSectionMetaFromDOM(n) {
    for (var i = 0; i < n; i++) {
      if (!document.getElementById('sec' + i + '-height')) continue;
      sectionMeta[i].heightMM = val('sec' + i + '-height');
      sectionMeta[i].product = val('sec' + i + '-product');
      sectionMeta[i].panelCount = val('sec' + i + '-panel-count');
    }
  }

  function wireSectionBlock(idx) {
    document.getElementById('sec' + idx + '-height').addEventListener('input', recomputeSectionHeights);
    document.getElementById('sec' + idx + '-product').addEventListener('change', function () { onSectionProductOrCountChange(idx); });
    document.getElementById('sec' + idx + '-panel-count').addEventListener('input', function () { onSectionProductOrCountChange(idx); });
    document.getElementById('sec' + idx + '-pc-direction').addEventListener('change', function () { saveActiveSectionPanelConfig(idx); });
    document.getElementById('sec' + idx + '-pc-panel-type').addEventListener('change', function () { saveActiveSectionPanelConfig(idx); updateSectionPcVisibility(idx); });
    document.getElementById('sec' + idx + '-pc-glass').addEventListener('change', function () { saveActiveSectionPanelConfig(idx); });
    document.getElementById('sec' + idx + '-pc-insect').addEventListener('change', function () { saveActiveSectionPanelConfig(idx); });
    document.getElementById('sec' + idx + '-pc-fixglass').addEventListener('change', function () { saveActiveSectionPanelConfig(idx); updateSectionPcVisibility(idx); });
    document.getElementById('sec' + idx + '-pc-ornament-v').addEventListener('input', function () { saveActiveSectionPanelConfig(idx); });
    document.getElementById('sec' + idx + '-pc-ornament-h').addEventListener('input', function () { saveActiveSectionPanelConfig(idx); });
  }

  function ensureSectionMeta(idx) {
    while (sectionMeta.length <= idx) {
      sectionMeta.push({ heightMM: '', product: 'swing_door', panelCount: '' });
      sectionPanelConfigs.push([]);
      sectionActivePanelIndex.push(0);
    }
  }

  function renderSectionsUI() {
    var n = getSectionCount();
    saveSectionMetaFromDOM(Math.min(n, sectionMeta.length));
    for (var i = 0; i < n; i++) ensureSectionMeta(i);

    var html = '';
    for (var b = 0; b < n; b++) html += buildSectionBlockHTML(b, b === n - 1);
    document.getElementById('sections-container').innerHTML = html;

    for (var j = 0; j < n; j++) {
      wireSectionBlock(j);
      syncSectionPanelConfigs(j);
      renderSectionPanelTabs(j);
      loadSectionPanelConfigIntoForm(j);
    }
    recomputeSectionHeights();
  }

  /* ============================================================
     FORM READ / INFO TABLE
     ============================================================ */

  function combinedProductLabel(data) {
    var labels = data.sections.map(function (s) { return PRODUCT_LABELS[s.product]; });
    var unique = labels.filter(function (v, i, a) { return a.indexOf(v) === i; });
    return unique.join(' + ');
  }

  function readForm() {
    var n = getSectionCount();
    for (var i = 0; i < n; i++) saveActiveSectionPanelConfig(i);

    var sections = [];
    for (var s = 0; s < n; s++) {
      sections.push({
        heightMM: parseInt(val('sec' + s + '-height'), 10) || 0,
        product: val('sec' + s + '-product'),
        panels: sectionPanelConfigs[s].map(function (c) {
          return { direction: c.direction, panelType: c.panelType, glass: c.glass, insect: c.insect, fixGlass: c.fixGlass, ornamentV: c.ornamentV || 0, ornamentH: c.ornamentH || 0 };
        })
      });
    }

    return {
      brand: val('f-brand'),
      customer: val('f-customer') || '-',
      ref: val('f-ref') || '-',
      date: val('f-date') || '-',
      itemCode: val('f-item-code') || '-',
      hasRevision: document.getElementById('f-has-revision').checked,
      revNo: val('f-rev-no'),
      revDesc: val('f-rev-desc'),
      revDate: val('f-rev-date'),
      width: parseInt(val('f-width'), 10) || 100,
      height: parseInt(val('f-height'), 10) || 100,
      color: val('f-color'),
      colorLabel: document.getElementById('f-color').selectedOptions[0].text,
      sections: sections
    };
  }

  function buildInfoRows(data) {
    var areaM2 = ((data.width / 1000) * (data.height / 1000)).toFixed(2);
    var rows = [
      ['Produk', combinedProductLabel(data)],
      ['Ukuran total', data.width + ' x ' + data.height + ' mm'],
      ['Jumlah section', data.sections.length],
      ['Profil aluminium', data.colorLabel],
      ['Luas total (estimasi)', areaM2 + ' m&sup2;']
    ];
    data.sections.forEach(function (sec, si) {
      rows.push(['Section ' + (si + 1), PRODUCT_LABELS[sec.product] + ' — ' + sec.heightMM + ' mm — ' + sec.panels.length + ' panel']);
      sec.panels.forEach(function (cfg, pi) {
        var parts = [];
        parts.push(cfg.fixGlass ? 'Fix (tidak buka)' : directionLabelFor(sec.product, cfg.direction));
        parts.push(PANEL_TYPE_LABELS[cfg.panelType] + (cfg.panelType === 'kaca' ? ' — ' + cfg.glass : ''));
        if (insectAllowed(sec.product) && cfg.insect) parts.push('+ insect screen');
        rows.push(['&nbsp;&nbsp;Panel ' + (pi + 1), parts.join(' &bull; ')]);
      });
    });
    return rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function renderDrawing() {
    var data = readForm();

    document.getElementById('view-front').innerHTML = generateFrontView(data);

    document.getElementById('info-table').innerHTML = buildInfoRows(data);

    document.getElementById('r-title').textContent = combinedProductLabel(data) + ' — ' + data.width + ' \u00d7 ' + data.height + ' mm';
    document.getElementById('r-meta').textContent = data.customer + ' \u2022 ' + data.ref;
  }

  function buildDrawingCardsHTML(data, mode) {
    var frontSvg = generateFrontView(data);
    var infoRows = buildInfoRows(data);
    return '<div class="dg-drawing-grid">' +
      '<div class="dg-card"><h3>Tampak depan</h3><div class="dg-svg-holder">' + frontSvg + '</div></div>' +
      '<div class="dg-card dg-info-card"><h3>Informasi produk</h3><table>' + infoRows + '</table></div>' +
      '</div>';
  }

  function buildFinishingSummary(data) {
    var areaM2 = ((data.width / 1000) * (data.height / 1000)).toFixed(2);
    var lines = [];
    lines.push(combinedProductLabel(data) + ' — ' + data.width + ' x ' + data.height + ' mm');
    lines.push(data.sections.length + ' section — ' + data.colorLabel);
    lines.push('Luas ' + areaM2 + ' m&sup2;');
    data.sections.forEach(function (sec, si) {
      lines.push('Sec' + (si + 1) + ' (' + sec.heightMM + 'mm): ' + PRODUCT_LABELS[sec.product]);
      sec.panels.forEach(function (cfg, pi) {
        var d = cfg.fixGlass ? 'Fix' : directionLabelFor(sec.product, cfg.direction);
        var t = PANEL_TYPE_LABELS[cfg.panelType] + (cfg.panelType === 'kaca' ? ' ' + cfg.glass : '');
        lines.push('&nbsp;&nbsp;P' + (pi + 1) + ': ' + d + ' — ' + t);
      });
    });
    return lines.map(function (l) { return '<div>' + l + '</div>'; }).join('');
  }

  function buildRevisionRowsHtml(data) {
    var rows = '';
    if (data.hasRevision) {
      rows += '<tr><td>' + Helper.escapeHtml(data.revNo || '1') + '</td><td>' + Helper.escapeHtml(data.revDesc || '-') +
        '</td><td>' + Helper.escapeHtml(data.revDate || '-') + '</td></tr>';
    }
    var blankCount = data.hasRevision ? 3 : 4;
    for (var i = 0; i < blankCount; i++) rows += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    return rows;
  }

  function buildTitleBlockPage(data, pageBreakBefore) {
    var logoSrc = BRAND_LOGOS[data.brand] || BRAND_LOGOS.prima;
    var brandLabel = BRAND_LABELS[data.brand] || 'PRIMA';
    var finishing = buildFinishingSummary(data);
    var frontSvg = generateFrontView(data);
    var revisionRows = buildRevisionRowsHtml(data);

    return '<div class="tb-page"' + (pageBreakBefore ? ' style="page-break-before:always;"' : '') + '>' +
      '<div class="tb-sidebar">' +
      '<div class="tb-brand"><img src="' + logoSrc + '" alt="ALUVE ' + brandLabel + '" class="tb-logo"></div>' +
      '<div class="tb-field"><div class="tb-label">PROJECT:</div><div class="tb-value">' + Helper.escapeHtml(data.customer) + '</div></div>' +
      '<div class="tb-field"><div class="tb-label">ADDRESS:</div><div class="tb-value">' + Helper.escapeHtml(data.ref) + '</div></div>' +
      '<div class="tb-field"><div class="tb-label">DATE:</div><div class="tb-value">' + Helper.escapeHtml(data.date || '-') + '</div></div>' +
      '<div class="tb-field"><div class="tb-label">ITEM:</div><div class="tb-value">' + Helper.escapeHtml(data.itemCode) + '</div></div>' +
      '<div class="tb-field tb-finishing"><div class="tb-label">FINISHING:</div><div class="tb-value tb-finishing-list">' + finishing + '</div></div>' +
      '<div class="tb-field tb-split">' +
      '<div><div class="tb-label">PROPOSED BY:</div><div class="tb-sign"></div></div>' +
      '<div><div class="tb-label">APPROVED BY:</div><div class="tb-sign"></div></div>' +
      '</div>' +
      '<table class="tb-revtable"><tr><th>NO</th><th>REVISION</th><th>DATE</th></tr>' + revisionRows + '</table>' +
      '</div>' +
      '<div class="tb-drawing">' +
      '<div class="tb-svg-holder">' + frontSvg + '</div>' +
      '<div class="tb-product-title">' + Helper.escapeHtml(combinedProductLabel(data)) + '</div>' +
      '</div>' +
      '</div>';
  }

  function buildPrintAreaSingle(data) {
    document.getElementById('drawingPrintContainer').innerHTML = buildTitleBlockPage(data, false);
  }

  function buildPrintAreaAll() {
    var allData = getSavedDrawings().slice().reverse();
    var html = allData.map(function (d, idx) { return buildTitleBlockPage(d, idx > 0); }).join('');
    document.getElementById('drawingPrintContainer').innerHTML = html;
  }

  function printCurrent() {
    buildPrintAreaSingle(readForm());
    window.print();
  }

  function printAllDrawings() {
    if (getSavedDrawings().length === 0) return;
    buildPrintAreaAll();
    window.print();
  }

  /* ============================================================
     HISTORY (multi-drawing per client)
     ============================================================ */

  function toggleFormPanel(forceCollapsed) {
    var body = document.getElementById('form-panel-body');
    var btn = document.getElementById('btn-toggle-form');
    var collapsed = (typeof forceCollapsed === 'boolean') ? forceCollapsed : body.style.display !== 'none';
    body.style.display = collapsed ? 'none' : 'block';
    btn.textContent = collapsed ? 'Tampilkan' : 'Sembunyikan';
  }

  function toggleSegment(btn) {
    var target = document.getElementById(btn.getAttribute('data-target'));
    var collapsed = target.style.display !== 'none';
    target.style.display = collapsed ? 'none' : '';
    btn.textContent = collapsed ? 'Tampilkan' : 'Sembunyikan';
  }

  function wireSegmentToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('.dg-segment-toggle'), function (btn) {
      btn.addEventListener('click', function () { toggleSegment(btn); });
    });
  }

  function addNewDrawing() {
    renderDrawing();
    var data = readForm();
    var result = window.ALUVE.Storage.saveDrawing(data);
    if (result.success) {
      notify('Gambar disimpan ke riwayat.', 'success');
    } else {
      notify('Gagal menyimpan gambar ke riwayat (penyimpanan browser penuh/diblokir).', 'danger');
    }
    renderHistory();
    resetFormForNext();
    renderDrawing();
    toggleFormPanel(false);
  }

  function resetFormForNext() {
    document.getElementById('f-width').value = '';
    document.getElementById('f-height').value = '';
    document.getElementById('f-section-count').value = 1;
    document.getElementById('f-item-code').value = '';
    document.getElementById('f-has-revision').checked = false;
    document.getElementById('f-rev-no').value = '';
    document.getElementById('f-rev-desc').value = '';
    document.getElementById('f-rev-date').value = '';
    document.getElementById('revision-fields-wrap').style.display = 'none';

    sectionMeta = [];
    sectionPanelConfigs = [];
    sectionActivePanelIndex = [];
    renderSectionsUI();
  }

  function getSavedDrawings() {
    // Storage.getDrawings() balikin terbaru-dulu; riwayat di layar juga
    // ditampilkan terbaru-dulu (lebih enak dibaca sales), sementara
    // export PDF/PNG "semua" membalik urutan jadi kronologis (lihat
    // printAllDrawings/downloadAllPng di bawah).
    return window.ALUVE.Storage.getDrawings();
  }

  function renderHistory() {
    var panel = document.getElementById('history-panel');
    var list = document.getElementById('history-list');
    var drawings = getSavedDrawings();
    if (drawings.length === 0) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    document.getElementById('history-client-name').textContent = Helper.escapeHtml(val('f-customer') || '-');

    list.innerHTML = drawings.map(function (item, idx) {
      var title = combinedProductLabel(item) + ' — ' + item.width + '\u00d7' + item.height + ' mm';
      return '<div class="dg-history-item">' +
        '<div class="dg-history-header" data-idx="' + idx + '">' +
        '<span>' + (idx + 1) + '. ' + Helper.escapeHtml(title) + '</span>' +
        '<button class="dg-history-remove" data-remove="' + Helper.escapeHtml(item.id) + '" type="button">Hapus</button>' +
        '</div>' +
        '<div class="dg-history-body" id="history-body-' + idx + '">' + buildDrawingCardsHTML(item, 'screen') + '</div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.dg-history-header'), function (header) {
      header.addEventListener('click', function (e) {
        if (e.target && e.target.hasAttribute('data-remove')) return;
        var idx = header.getAttribute('data-idx');
        document.getElementById('history-body-' + idx).classList.toggle('open');
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll('[data-remove]'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var confirmed = window.confirm('Hapus gambar ini dari riwayat? Tidak bisa dibatalkan.');
        if (!confirmed) return;
        window.ALUVE.Storage.deleteDrawing(btn.getAttribute('data-remove'));
        renderHistory();
        notify('Gambar dihapus dari riwayat.', 'success');
      });
    });
  }

  /* ============================================================
     EXPORT: PNG
     ============================================================ */

  function svgStringToPngDownload(svgString, filename, vbWidth, vbHeight) {
    var scaleFactor = 2;
    var canvas = document.createElement('canvas');
    canvas.width = vbWidth * scaleFactor;
    canvas.height = vbHeight * scaleFactor;
    var ctx = canvas.getContext('2d');

    var svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);

    var img = new Image();
    img.onload = function () {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      var pngUrl = canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      a.click();
    };
    img.src = url;
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function downloadPng() {
    var data = readForm();
    var svgString = generateFrontView(data);
    svgStringToPngDownload(svgString, 'tampak-depan-' + slugify(combinedProductLabel(data)) + '.png', FRONT_VB_W, FRONT_VB_H);
  }

  function downloadAllPng() {
    var allData = getSavedDrawings().slice().reverse();
    if (allData.length === 0) return;
    allData.forEach(function (d, idx) {
      setTimeout(function () {
        var svgString = generateFrontView(d);
        var fname = 'tampak-depan-' + (idx + 1) + '-' + slugify(combinedProductLabel(d)) + '.png';
        svgStringToPngDownload(svgString, fname, FRONT_VB_W, FRONT_VB_H);
      }, idx * 400);
    });
  }

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    preloadBrandLogos();
    document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);

    document.getElementById('f-has-revision').addEventListener('change', function () {
      document.getElementById('revision-fields-wrap').style.display = this.checked ? 'block' : 'none';
    });

    document.getElementById('f-section-count').addEventListener('input', renderSectionsUI);
    document.getElementById('f-height').addEventListener('input', recomputeSectionHeights);

    document.getElementById('btn-toggle-form').addEventListener('click', function () { toggleFormPanel(); });
    wireSegmentToggles();

    document.getElementById('btn-generate').addEventListener('click', function () { renderDrawing(); toggleFormPanel(true); });
    document.getElementById('btn-regenerate').addEventListener('click', renderDrawing);
    document.getElementById('btn-add-new').addEventListener('click', addNewDrawing);
    document.getElementById('btn-png').addEventListener('click', downloadPng);
    document.getElementById('btn-pdf').addEventListener('click', printCurrent);
    document.getElementById('btn-print').addEventListener('click', printCurrent);
    document.getElementById('btn-download-all-pdf').addEventListener('click', printAllDrawings);
    document.getElementById('btn-download-all-png').addEventListener('click', downloadAllPng);

    renderSectionsUI();
    renderHistory();
    renderDrawing();
  }


  return { init: init };
})();
