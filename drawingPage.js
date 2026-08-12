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

  var panelConfigs = [];
  var activePanelIndex = 0;

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

  function renderPanel(p, idx, cfg, color) {
    var label = (cfg.panelType === 'kaca' || cfg.panelType === 'kaca_nako') ? cfg.glass : '';
    var s = drawPanelContent(p.x, p.y, p.w, p.h, cfg.panelType, label, color);
    if (cfg.insect && (cfg.panelType === 'kaca' || cfg.panelType === 'kaca_nako')) {
      s += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="url(#meshGrid)"/>';
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
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="#c7cbd4"/>';
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
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="#c7cbd4"/>';
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
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="#c7cbd4"/>';
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
      s += '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h + '" fill="#c7cbd4"/>';
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

  function generateFrontView(data) {
    var VB_W = FRONT_VB_W, VB_H = FRONT_VB_H;
    var maxW = 300, maxH = 260;
    var scale = fitScale(data.width, data.height, maxW, maxH);
    var drawW = data.width * scale, drawH = data.height * scale;
    var originX = 105, originY = 45;

    var svg = '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" xmlns="http://www.w3.org/2000/svg">';
    svg += drawDefs();

    var noBottomFrame = data.product === 'swing_door';
    svg += noBottomFrame
      ? drawFrame3Sides(originX, originY, drawW, drawH, data.color)
      : drawFrame(originX, originY, drawW, drawH, data.color);

    var result;
    if (data.product === 'swing_door' || data.product === 'swing_window') {
      result = frontSwing(originX, originY, drawW, drawH, data.panels, data.color);
    } else if (data.product === 'swing_jungkit_window') {
      result = frontSwingJungkit(originX, originY, drawW, drawH, data.panels, data.color);
    } else if (data.product === 'jungkit_window') {
      result = frontJungkit(originX, originY, drawW, drawH, data.panels, data.color);
    } else if (data.product === 'sliding_door') {
      result = frontSliding(originX, originY, drawW, drawH, data.panels, data.color);
    } else {
      result = frontFolding(originX, originY, drawW, drawH, data.panels, data.color);
    }
    svg += result.svg;

    var bottomY = originY + drawH;
    var hasMultiplePanels = result.panels.length > 1;
    var row1Y = bottomY + 24;
    var row2Y = hasMultiplePanels ? bottomY + 50 : bottomY + 24;

    if (hasMultiplePanels) {
      var evenWidthMM = Math.round(data.width / result.panels.length);
      svg += buildPanelDimRow(result.panels, evenWidthMM, row1Y);
    }

    svg += extensionLine(originX, bottomY, originX, row2Y - 8);
    svg += extensionLine(originX + drawW, bottomY, originX + drawW, row2Y - 8);
    svg += drawDimension(originX, row2Y, originX + drawW, row2Y, data.width + ' mm', 'h');

    svg += extensionLine(originX, originY, originX - 40, originY);
    svg += extensionLine(originX, originY + drawH, originX - 40, originY + drawH);
    svg += drawDimension(originX - 32, originY, originX - 32, originY + drawH, data.height + ' mm', 'v');

    svg += '</svg>';
    return svg;
  }

  /* ============================================================
     SECTION GENERATORS
     ============================================================ */

  function layeredSection(labels, color) {
    var VB_W = 480, VB_H = 210;
    var x = 60, y = 70, h = 90;
    var fillMap = { Frame: '#c7cbd4', Sash: '#9fb0c9', Glass: GLASS_FILL, Seal: '#4a5568', Rubber: '#4a5568', Track: '#7d828c' };
    var svg = '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" xmlns="http://www.w3.org/2000/svg">';
    var legend = [];

    labels.forEach(function (label, i) {
      var w = label === 'Glass' ? 28 : ((label === 'Seal' || label === 'Rubber') ? 12 : 46);
      var fill = fillMap[label] || '#ccc';

      if (label === 'Frame' || label === 'Sash' || label === 'Track') {
        svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
          '" fill="' + fill + '" stroke="' + color + '" stroke-width="1"/>';
        svg += '<rect x="' + (x + 6) + '" y="' + (y + 10) + '" width="' + Math.max(4, w - 12) +
          '" height="' + (h - 20) + '" fill="#f4f5f7" stroke="' + color + '" stroke-width="0.5"/>';
      } else if (label === 'Glass') {
        svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
          '" fill="' + fill + '" stroke="' + GLASS_STROKE + '" stroke-width="1"/>';
      } else {
        svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>';
      }

      var num = i + 1;
      svg += '<circle cx="' + (x + w / 2) + '" cy="' + (y - 16) + '" r="8" fill="#fff" stroke="' + LEADER_STROKE + '" stroke-width="1"/>';
      svg += '<text x="' + (x + w / 2) + '" y="' + (y - 16) + '" text-anchor="middle" dominant-baseline="central" font-size="9" fill="' + DIM_STROKE + '">' + num + '</text>';
      svg += '<line x1="' + (x + w / 2) + '" y1="' + (y - 8) + '" x2="' + (x + w / 2) + '" y2="' + y + '" stroke="' + LEADER_STROKE + '" stroke-width="0.5"/>';

      legend.push('<span class="dg-legend-item"><span class="dg-legend-swatch" style="background:' + fill + '"></span>' + num + '. ' + label + '</span>');
      x += w + 10;
    });

    svg += '</svg>';
    return { svg: svg, legend: '<div class="dg-legend">' + legend.join('') + '</div>' };
  }

  function generateHorizontalSection(data) {
    return layeredSection(['Frame', 'Sash', 'Glass', 'Seal', 'Track'], data.color);
  }

  function generateVerticalSection(data) {
    return layeredSection(['Frame', 'Sash', 'Glass', 'Rubber', 'Seal'], data.color);
  }

  /* ============================================================
     PER-PANEL CONFIG STATE
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
      fixGlass: false
    };
  }

  function syncPanelConfigsLength() {
    var product = val('f-product');
    var count = Math.max(1, parseInt(val('f-panel'), 10) || 1);
    var validValues = getDirectionOptionsSingle(product).map(function (o) { return o.value; });

    while (panelConfigs.length < count) panelConfigs.push(defaultPanelConfig(product));
    panelConfigs.length = count;

    panelConfigs.forEach(function (cfg) {
      if (validValues.indexOf(cfg.direction) === -1) cfg.direction = validValues[0];
    });
    if (activePanelIndex >= count) activePanelIndex = count - 1;
  }

  function renderPanelTabs() {
    var wrap = document.getElementById('panel-tabs');
    if (panelConfigs.length <= 1) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = panelConfigs.map(function (cfg, i) {
      return '<button type="button" class="dg-panel-tab-btn' + (i === activePanelIndex ? ' active' : '') +
        '" data-idx="' + i + '">Panel ' + (i + 1) + '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('.dg-panel-tab-btn'), function (btn) {
      btn.addEventListener('click', function () {
        saveActivePanelConfig();
        activePanelIndex = parseInt(btn.getAttribute('data-idx'), 10);
        renderPanelTabs();
        loadPanelConfigIntoForm();
      });
    });
  }

  function loadPanelConfigIntoForm() {
    var product = val('f-product');
    var cfg = panelConfigs[activePanelIndex];
    if (!cfg) return;

    var dirSelect = document.getElementById('pc-direction');
    var opts = getDirectionOptionsSingle(product);
    dirSelect.innerHTML = opts.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('');
    dirSelect.value = cfg.direction;

    document.getElementById('pc-panel-type').value = cfg.panelType;
    document.getElementById('pc-glass').value = cfg.glass;
    document.getElementById('pc-insect').checked = cfg.insect;
    document.getElementById('pc-fixglass').checked = cfg.fixGlass;

    updatePcVisibility();
  }

  function updatePcVisibility() {
    var product = val('f-product');
    var fixGlass = document.getElementById('pc-fixglass').checked;
    document.getElementById('pc-direction-wrap').style.display = fixGlass ? 'none' : 'block';
    document.getElementById('pc-insect-wrap').style.display = insectAllowed(product) ? 'flex' : 'none';
    document.getElementById('pc-glass-wrap').style.display = (val('pc-panel-type') === 'kaca') ? 'block' : 'none';
  }

  function saveActivePanelConfig() {
    if (!panelConfigs[activePanelIndex]) return;
    panelConfigs[activePanelIndex] = {
      direction: val('pc-direction'),
      panelType: val('pc-panel-type'),
      glass: val('pc-glass'),
      insect: document.getElementById('pc-insect').checked,
      fixGlass: document.getElementById('pc-fixglass').checked
    };
  }

  function onProductOrPanelCountChange() {
    saveActivePanelConfig();
    syncPanelConfigsLength();
    renderPanelTabs();
    loadPanelConfigIntoForm();
  }

  /* ============================================================
     FORM READ / INFO TABLE
     ============================================================ */

  function readForm() {
    saveActivePanelConfig();
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
      product: val('f-product'),
      width: parseInt(val('f-width'), 10) || 100,
      height: parseInt(val('f-height'), 10) || 100,
      color: val('f-color'),
      colorLabel: document.getElementById('f-color').selectedOptions[0].text,
      panels: panelConfigs.map(function (c) {
        return { direction: c.direction, panelType: c.panelType, glass: c.glass, insect: c.insect, fixGlass: c.fixGlass };
      })
    };
  }

  function buildInfoRows(data) {
    var areaM2 = ((data.width / 1000) * (data.height / 1000)).toFixed(2);
    var rows = [
      ['Produk', PRODUCT_LABELS[data.product]],
      ['Ukuran', data.width + ' x ' + data.height + ' mm'],
      ['Jumlah panel', data.panels.length],
      ['Profil aluminium', data.colorLabel],
      ['Luas panel (estimasi)', areaM2 + ' m&sup2;']
    ];
    data.panels.forEach(function (cfg, i) {
      var parts = [];
      parts.push(cfg.fixGlass ? 'Fix (tidak buka)' : directionLabelFor(data.product, cfg.direction));
      parts.push(PANEL_TYPE_LABELS[cfg.panelType] + (cfg.panelType === 'kaca' ? ' — ' + cfg.glass : ''));
      if (insectAllowed(data.product) && cfg.insect) parts.push('+ insect screen');
      rows.push(['Panel ' + (i + 1), parts.join(' &bull; ')]);
    });
    return rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function renderDrawing() {
    var data = readForm();

    document.getElementById('view-front').innerHTML = generateFrontView(data);

    var hSec = generateHorizontalSection(data);
    document.getElementById('view-horizontal').innerHTML = hSec.svg;
    document.getElementById('legend-horizontal').innerHTML = hSec.legend;

    var vSec = generateVerticalSection(data);
    document.getElementById('view-vertical').innerHTML = vSec.svg;
    document.getElementById('legend-vertical').innerHTML = vSec.legend;

    document.getElementById('info-table').innerHTML = buildInfoRows(data);

    document.getElementById('r-title').textContent = PRODUCT_LABELS[data.product] + ' — ' + data.width + ' \u00d7 ' + data.height + ' mm';
    document.getElementById('r-meta').textContent = data.customer + ' \u2022 ' + data.ref;
  }

  function buildDrawingCardsHTML(data, mode) {
    var frontSvg = generateFrontView(data);
    var hSec = generateHorizontalSection(data);
    var vSec = generateVerticalSection(data);
    var infoRows = buildInfoRows(data);
    return '<div class="dg-drawing-grid">' +
      '<div class="dg-card"><h3>Tampak depan</h3><div class="dg-svg-holder">' + frontSvg + '</div></div>' +
      '<div class="dg-card"><h3>Potongan horizontal</h3><div class="dg-svg-holder">' + hSec.svg + '</div>' + hSec.legend + '</div>' +
      '<div class="dg-card"><h3>Potongan vertikal</h3><div class="dg-svg-holder">' + vSec.svg + '</div>' + vSec.legend + '</div>' +
      '<div class="dg-card dg-info-card"><h3>Informasi produk</h3><table>' + infoRows + '</table></div>' +
      '</div>';
  }

  function buildFinishingSummary(data) {
    var areaM2 = ((data.width / 1000) * (data.height / 1000)).toFixed(2);
    var lines = [];
    lines.push(PRODUCT_LABELS[data.product] + ' — ' + data.width + ' x ' + data.height + ' mm');
    lines.push(data.panels.length + ' panel — ' + data.colorLabel);
    lines.push('Luas ' + areaM2 + ' m&sup2;');
    data.panels.forEach(function (cfg, i) {
      var d = cfg.fixGlass ? 'Fix' : directionLabelFor(data.product, cfg.direction);
      var t = PANEL_TYPE_LABELS[cfg.panelType] + (cfg.panelType === 'kaca' ? ' ' + cfg.glass : '');
      lines.push('P' + (i + 1) + ': ' + d + ' — ' + t);
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
    var brandLabel = BRAND_LABELS[data.brand] || 'PRIMA';
    var finishing = buildFinishingSummary(data);
    var frontSvg = generateFrontView(data);
    var revisionRows = buildRevisionRowsHtml(data);

    return '<div class="tb-page"' + (pageBreakBefore ? ' style="page-break-before:always;"' : '') + '>' +
      '<div class="tb-sidebar">' +
      '<div class="tb-brand">ALUVE<br><strong>' + brandLabel + '</strong></div>' +
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
      '<div class="tb-product-title">' + PRODUCT_LABELS[data.product] + '</div>' +
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
    document.getElementById('f-product').value = 'swing_door';
    document.getElementById('f-width').value = 900;
    document.getElementById('f-height').value = 2100;
    document.getElementById('f-panel').value = 1;
    document.getElementById('f-item-code').value = '';
    document.getElementById('f-has-revision').checked = false;
    document.getElementById('f-rev-no').value = '';
    document.getElementById('f-rev-desc').value = '';
    document.getElementById('f-rev-date').value = '';
    document.getElementById('revision-fields-wrap').style.display = 'none';
    panelConfigs = [];
    activePanelIndex = 0;
    onProductOrPanelCountChange();
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
      var title = PRODUCT_LABELS[item.product] + ' — ' + item.width + '\u00d7' + item.height + ' mm';
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
    svgStringToPngDownload(svgString, 'tampak-depan-' + slugify(PRODUCT_LABELS[data.product]) + '.png', FRONT_VB_W, FRONT_VB_H);
  }

  function downloadAllPng() {
    var allData = getSavedDrawings().slice().reverse();
    if (allData.length === 0) return;
    allData.forEach(function (d, idx) {
      setTimeout(function () {
        var svgString = generateFrontView(d);
        var fname = 'tampak-depan-' + (idx + 1) + '-' + slugify(PRODUCT_LABELS[d.product]) + '.png';
        svgStringToPngDownload(svgString, fname, FRONT_VB_W, FRONT_VB_H);
      }, idx * 400);
    });
  }

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);

    document.getElementById('f-has-revision').addEventListener('change', function () {
      document.getElementById('revision-fields-wrap').style.display = this.checked ? 'block' : 'none';
    });

    document.getElementById('f-product').addEventListener('change', onProductOrPanelCountChange);
    document.getElementById('f-panel').addEventListener('input', onProductOrPanelCountChange);

    document.getElementById('pc-direction').addEventListener('change', function () { saveActivePanelConfig(); });
    document.getElementById('pc-panel-type').addEventListener('change', function () { saveActivePanelConfig(); updatePcVisibility(); });
    document.getElementById('pc-glass').addEventListener('change', function () { saveActivePanelConfig(); });
    document.getElementById('pc-insect').addEventListener('change', function () { saveActivePanelConfig(); });
    document.getElementById('pc-fixglass').addEventListener('change', function () { saveActivePanelConfig(); updatePcVisibility(); });

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

    syncPanelConfigsLength();
    renderPanelTabs();
    loadPanelConfigIntoForm();
    renderHistory();
    renderDrawing();
  }


  return { init: init };
})();
