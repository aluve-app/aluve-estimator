/**
 * exportEngine.js — turns a finalized Project object into three output
 * formats: a printable browser view (window.print), a downloadable PDF,
 * and a downloadable Excel workbook. This module contains NO pricing
 * math of its own — every number it displays comes from
 * ALUVE.Calculator, so the exported document can never disagree with
 * what the app showed on screen.
 *
 * Customer-facing format (confirmed by Anto, matches the PT. Bangun Rupa
 * Indah reference quotation): the internal cost breakdown (Aluminium /
 * Sealant / Lain-lain subtotals) is HIDDEN from the customer — each item
 * shows as one row with one total. The one exception is the Kaca (glass)
 * column, which IS always shown explicitly, since it's a spec detail the
 * customer needs to see, not a cost breakdown.
 *
 * External libraries (loaded via CDN in index.html, used only here):
 *   - jsPDF + jsPDF-AutoTable -> native, vector-based PDF (see the bug
 *     history note on exportToPdf for why this replaced an HTML/canvas
 *     screenshot approach)
 *   - SheetJS (xlsx)          -> builds real, formula-capable .xlsx files
 *
 * Public API: window.ALUVE.ExportEngine
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.ExportEngine = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Calculator = window.ALUVE.Calculator;
  const Validation = window.ALUVE.Validation;
  const PriceManager = window.ALUVE.PriceManager;

  /** Brand blue sampled directly from the PT. Bangun Rupa Indah reference quotation's logo icon (#0D6EFD), confirmed by Anto as the accent color to use. */
  const BRAND_BLUE = [13, 110, 253];

  /**
   * jsPDF's addImage needs an explicit format ('PNG'/'JPEG'/'WEBP') — it
   * does not reliably auto-detect this from a data URL. Derives it from
   * the data URL's MIME type instead of assuming PNG, since Settings
   * accepts any image/* upload.
   * @param {string} dataUrl
   * @returns {string}
   */
  function getImageFormatFromDataUrl(dataUrl) {
    const match = /^data:image\/(\w+);/.exec(dataUrl || '');
    if (!match) return 'PNG';
    const ext = match[1].toUpperCase();
    return ext === 'JPG' ? 'JPEG' : ext;
  }

  /**
   * Builds a human-readable quotation number from a project, e.g.
   * "EST-20260716-A1B2" — stable for a given project (derived from its id
   * and creation date), not random on every export.
   * @param {Object} project
   * @returns {string}
   */
  function buildQuotationNumber(project) {
    const created = project.createdAt ? new Date(project.createdAt) : new Date();
    const y = created.getFullYear();
    const m = String(created.getMonth() + 1).padStart(2, '0');
    const d = String(created.getDate()).padStart(2, '0');
    const suffix = (project.projectId || 'XXXX').slice(-4).toUpperCase();
    return 'EST-' + y + m + d + '-' + suffix;
  }

  /**
   * Splits a Settings.termsAndConditions block (one condition per line)
   * into a clean, numbered array — trims blank lines so an accidental
   * extra newline doesn't produce an empty numbered bullet.
   * @param {string} termsText
   * @returns {string[]}
   */
  function splitTermsIntoLines(termsText) {
    return (termsText || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  }

  /**
   * Assembles the single customer-facing row for one Item — this is the
   * ONE shared source of truth for both the Print/HTML path and the PDF
   * path, so the two can never drift apart or disagree on what a
   * customer sees. Cost breakdown is deliberately absent here (per
   * Anto's confirmation); only Kaca (glass) is always named explicitly.
   * @param {Object} item
   * @param {number} index
   * @returns {{no:number, label:string, seriesLabel:string, kacaLabel:string, sizeLabel:string, photoDataUrl:string|null, qty:number, unitPrice:number, jumlah:number}}
   */
  function getCustomerFacingRow(item, index) {
    const totals = Calculator.calcItemTotals(item);
    const firstAluSku = item.aluminiumLines[0] && PriceManager.getItemById(item.aluminiumLines[0].skuId);
    const seriesLabel = firstAluSku
      ? [firstAluSku.tierLabel, firstAluSku.groupName].filter(Boolean).join(' — ')
      : '-';
    const kacaLabel = item.glassLines[0] ? item.glassLines[0].skuName : 'FRAME ONLY';
    const sizeLabel = (item.widthMm && item.heightMm) ? (item.widthMm + ' x ' + item.heightMm + ' mm') : '-';

    return {
      no: index + 1,
      label: item.label || ('Item ' + (index + 1)),
      seriesLabel: seriesLabel,
      kacaLabel: kacaLabel,
      sizeLabel: sizeLabel,
      photoDataUrl: item.photoDataUrl || null,
      qty: totals.qty,
      unitPrice: totals.perUnitTotal, // price for ONE unit
      jumlah: totals.itemTotal // perUnitTotal × qty
    };
  }

  /**
   * Builds the full quotation document as an HTML string, structured as
   * a single <table> whose <thead> (letterhead) and <tfoot> (totals,
   * bank info, terms & signature) the browser automatically repeats on
   * every printed page.
   * @param {Object} project
   * @param {Object} settings - from Storage.getSettings()
   * @returns {string} HTML markup, ready to inject into #printQuotationContainer
   */
  function buildQuotationHtml(project, settings) {
    const quotationNumber = project.quotationNumber || '-';
    const todayLabel = Helper.formatDate(project.projectDate || project.createdAt);
    const summary = Calculator.calcProjectSummary(project.items, project.projectDiscount);
    const termsLines = splitTermsIntoLines(settings.termsAndConditions);

    const logoHtml = settings.logoDataUrl
      ? '<img src="' + settings.logoDataUrl + '" alt="Logo" class="print-doc__logo">'
      : '<div class="print-doc__logo print-doc__logo--placeholder">ALUVE</div>';

    const itemRows = (project.items || []).map(function (item, index) {
      const row = getCustomerFacingRow(item, index);
      const photoHtml = row.photoDataUrl
        ? '<img src="' + row.photoDataUrl + '" alt="" class="print-doc__thumb">'
        : '<div class="print-doc__thumb print-doc__thumb--empty"></div>';

      return (
        '<tr>' +
          '<td class="print-doc__col-no">' + row.no + '</td>' +
          '<td class="print-doc__col-photo">' + photoHtml + '</td>' +
          '<td><strong>' + Helper.escapeHtml(row.label) + '</strong><div class="print-doc__line-detail">' + Helper.escapeHtml(row.seriesLabel) + '</div></td>' +
          '<td>' + Helper.escapeHtml(row.kacaLabel) + '</td>' +
          '<td class="print-doc__col-num">' + Helper.escapeHtml(row.sizeLabel) + '</td>' +
          '<td class="print-doc__col-num">' + row.qty + ' UNIT</td>' +
          '<td class="print-doc__col-num mono">' + Helper.formatCurrency(row.unitPrice) + '</td>' +
          '<td class="print-doc__col-num mono"><strong>' + Helper.formatCurrency(row.jumlah) + '</strong></td>' +
        '</tr>'
      );
    }).join('');

    const paymentTermsHtml = settings.paymentTerms
      ? '<div class="print-doc__payment-terms"><strong>Pembayaran:</strong> ' + Helper.escapeHtml(settings.paymentTerms) + '</div>'
      : '';

    const bankInfoHtml = settings.bankAccountInfo
      ? '<div class="print-doc__bank-info">' + Helper.escapeHtml(settings.bankAccountInfo) + '</div>'
      : '';

    const termsHtml = termsLines.length
      ? '<div class="print-doc__terms"><strong>Catatan:</strong><ol>' +
          termsLines.map(function (line) { return '<li>' + Helper.escapeHtml(line) + '</li>'; }).join('') +
        '</ol></div>'
      : '';

    // QA FIX (item #5, per Anto): this used to auto-append "Harga berlaku
    // N hari..." as an extra numbered point, generated from the separate
    // "Masa Berlaku Penawaran (hari)" setting — duplicating the near-
    // identical sentence Anto already types himself into the free-text
    // Syarat & Ketentuan field. Removed so there's one source of truth;
    // Anto controls this wording entirely via Settings > Syarat & Ketentuan.

    return (
      '<table class="print-doc">' +
        '<thead>' +
          '<tr><th colspan="8">' +
            '<div class="print-doc__header">' +
              logoHtml +
              '<div class="print-doc__company">' +
                '<h1>' + Helper.escapeHtml(settings.companyName || '') + '</h1>' +
                '<p>' + Helper.escapeHtml(settings.companyAddress || '') + '</p>' +
                '<p>' + Helper.escapeHtml(settings.companyPhone || '') + '</p>' +
              '</div>' +
              '<div class="print-doc__doc-meta">' +
                '<h2>SURAT PENAWARAN HARGA</h2>' +
                '<p>No: ' + quotationNumber + '</p>' +
                '<p>Tanggal: ' + todayLabel + '</p>' +
              '</div>' +
            '</div>' +
            '<div class="print-doc__client">' +
              '<div><span>Kepada Yth.</span><strong>' + Helper.escapeHtml(project.clientName || '-') + '</strong></div>' +
              '<div><span>Telepon</span><strong>' + Helper.escapeHtml(project.customerPhone || '-') + '</strong></div>' +
              '<div><span>Project</span><strong>' + Helper.escapeHtml(project.projectName || '-') + '</strong></div>' +
              '<div><span>Lokasi</span><strong>' + Helper.escapeHtml(project.location || '-') + '</strong></div>' +
              '<div><span>Sales Rep</span><strong>' + Helper.escapeHtml(project.salesRep || '-') + '</strong></div>' +
            '</div>' +
            paymentTermsHtml +
            '<div class="print-doc__table-head-row print-doc__table-head-row--wide">' +
              '<span class="print-doc__col-no">No</span>' +
              '<span class="print-doc__col-photo">Foto</span>' +
              '<span>Type / Series</span>' +
              '<span>Kaca</span>' +
              '<span class="print-doc__col-num">Ukuran</span>' +
              '<span class="print-doc__col-num">Qty</span>' +
              '<span class="print-doc__col-num">Harga/Unit</span>' +
              '<span class="print-doc__col-num">Jumlah</span>' +
            '</div>' +
          '</th></tr>' +
        '</thead>' +
        '<tbody>' + itemRows + '</tbody>' +
      '</table>' +
      // QA FIX (item #5): this block used to live inside <tfoot>, which
      // browsers repeat on EVERY printed page — fine for a running page
      // footer, but wrong for the grand total / signature / terms, which
      // must appear exactly once. Moving it after </table> means it
      // simply flows onto whichever page the item rows actually end on,
      // instead of duplicating onto every page of a multi-page quotation.
      '<div class="print-doc__end-block">' +
        '<div class="print-doc__summary">' +
          '<div><span>Grand Total Normal</span><span class="mono">' + Helper.formatCurrency(summary.grandTotalNormal) + '</span></div>' +
          '<div><span>Total Diskon</span><span class="mono">- ' + Helper.formatCurrency(summary.totalDiscount) + '</span></div>' +
          '<div class="print-doc__summary-grand"><span>Grand Total</span><span class="mono">' + Helper.formatCurrency(summary.grandTotalAfterDiscount) + '</span></div>' +
        '</div>' +
        bankInfoHtml +
        termsHtml +
        '<div class="print-doc__signature">' +
          '<div><p>Hormat kami,</p><div class="print-doc__sign-space"></div><strong>' + Helper.escapeHtml(settings.companyName || '') + '</strong></div>' +
          '<div><p>Disetujui oleh,</p><div class="print-doc__sign-space"></div><strong>' + Helper.escapeHtml(project.clientName || '') + '</strong></div>' +
        '</div>' +
        '<div class="print-doc__footer">' +
          '<div class="print-doc__footer-company">' +
            '<span>' + Helper.escapeHtml(settings.companyName || '') + '</span>' +
            '<span>' + Helper.escapeHtml(settings.companyAddress || '') + '</span>' +
          '</div>' +
          '<span class="print-doc__page-number"></span>' +
        '</div>' +
      '</div>'
    );
  }

  /**
   * Injects the quotation HTML into the hidden print container that
   * lives in index.html (#printQuotationContainer), which only becomes
   * visible under `@media print` (see css/print.css).
   * @param {Object} project
   * @param {Object} settings
   * @returns {HTMLElement} the populated container element
   */
  function renderIntoPrintContainer(project, settings) {
    const container = document.getElementById('printQuotationContainer');
    if (!container) {
      throw new Error('exportEngine: #printQuotationContainer not found in the DOM.');
    }
    container.innerHTML = buildQuotationHtml(project, settings);
    return container;
  }

  /**
   * Opens the browser's native print dialog with the quotation rendered
   * in the professional print layout.
   * @param {Object} project
   * @param {Object} settings
   */
  function printQuotation(project, settings) {
    const blockers = Validation.collectExportBlockers(project);
    if (blockers.length > 0) {
      return { success: false, message: blockers.join(' ') };
    }
    if (!Validation.isNonEmptyString(project.quotationNumber)) {
      return { success: false, message: 'Nomor Quotation wajib diisi sebelum Print. Klik ikon pensil di sebelah "No. Quotation" pada halaman project.' };
    }
    const container = renderIntoPrintContainer(project, settings);
    window.print();

    const cleanup = function () {
      container.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    return { success: true, message: '' };
  }

  /**
   * Generates a downloadable PDF using jsPDF's NATIVE drawing API
   * (text + jsPDF-AutoTable for the item table) — not an HTML/canvas
   * screenshot.
   *
   * BUG HISTORY: the previous implementation used jsPDF's `.html()`
   * method (backed by html2canvas) to screenshot the print-layout HTML,
   * which was found to produce blank, ~200MB PDF files in real-world use
   * (root cause: print.css only applies under real `media="print"`, so
   * none of its styling ever took effect during an html2canvas capture
   * running in the normal screen context). Native drawing sidesteps this
   * entire class of bug.
   * @param {Object} project
   * @param {Object} settings
   * @returns {Promise<{success:boolean, message:string}>}
   */
  function exportToPdf(project, settings) {
    const blockers = Validation.collectExportBlockers(project);
    if (blockers.length > 0) {
      return Promise.resolve({ success: false, message: blockers.join(' ') });
    }
    if (!Validation.isNonEmptyString(project.quotationNumber)) {
      return Promise.resolve({ success: false, message: 'Nomor Quotation wajib diisi sebelum export PDF. Klik ikon pensil di sebelah "No. Quotation" pada halaman project.' });
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return Promise.resolve({ success: false, message: 'Library PDF belum termuat. Periksa koneksi internet lalu coba lagi.' });
    }

    try {
      const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      const summary = Calculator.calcProjectSummary(project.items, project.projectDiscount);
      const termsLines = splitTermsIntoLines(settings.termsAndConditions);

      /* ---- Letterhead ---- */
      let cursorY = margin;
      const textStartX = settings.logoDataUrl ? margin + 72 : margin;

      if (settings.logoDataUrl) {
        try {
          // BUG FIX: previously called as addImage(dataUrl, cursorY, cursorY, 60, 36, ...) —
          // the format argument was missing entirely, shifting every
          // subsequent argument one slot to the left (x became the format
          // string, y became x, width became y, etc.), so the logo failed
          // to embed. Format is now derived from the actual file, and
          // x/y/width/height are in their correct positions.
          const format = getImageFormatFromDataUrl(settings.logoDataUrl);
          doc.addImage(settings.logoDataUrl, format, margin, cursorY, 60, 36);
        } catch (imgErr) {
          console.warn('[ExportEngine] Logo could not be embedded in PDF:', imgErr);
        }
      }

      // BUG FIX: company name/address/phone were previously drawn as a
      // single unwrapped line each — a long address ran straight into the
      // right-side "No/Tanggal" block with no word-wrap or width limit.
      // Both columns now respect a fixed max width (half the page), and
      // cursorY advances based on how many lines the address actually
      // wrapped to, instead of a fixed offset.
      const leftColumnMaxWidth = (pageWidth / 2) - textStartX - 10;
      const rightColumnX = pageWidth - margin;
      const rightColumnMaxWidth = (pageWidth / 2) - margin - 10;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(27, 34, 40);
      doc.text(settings.companyName || '', textStartX, cursorY + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 96, 102);
      let leftY = cursorY + 26;
      const addressLines = doc.splitTextToSize(settings.companyAddress || '', leftColumnMaxWidth);
      doc.text(addressLines, textStartX, leftY);
      leftY += addressLines.length * 10;
      if (settings.companyPhone) {
        doc.text(settings.companyPhone, textStartX, leftY);
        leftY += 10;
      }

      doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('SURAT PENAWARAN HARGA', rightColumnX, cursorY + 12, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 96, 102);
      let rightY = cursorY + 26;
      const quotationNumberLines = doc.splitTextToSize('No: ' + project.quotationNumber, rightColumnMaxWidth);
      doc.text(quotationNumberLines, rightColumnX, rightY, { align: 'right' });
      rightY += quotationNumberLines.length * 10;
      doc.text('Tanggal: ' + Helper.formatDate(project.projectDate || project.createdAt), rightColumnX, rightY, { align: 'right' });
      rightY += 10;

      cursorY = Math.max(leftY, rightY) + 10;
      doc.setDrawColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
      doc.setLineWidth(1.5);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 16;

      /* ---- Client info (now includes phone, per Anto's revision) ---- */
      doc.setFontSize(9.5);
      doc.setTextColor(27, 34, 40);
      const clientRows = [
        ['Kepada Yth.', project.clientName || '-'],
        ['Telepon', project.customerPhone || '-'],
        ['Project', project.projectName || '-'],
        ['Lokasi', project.location || '-'],
        ['Sales Rep', project.salesRep || '-']
      ];
      clientRows.forEach(function (row, i) {
        const colX = i % 2 === 0 ? margin : pageWidth / 2 + 10;
        const rowY = cursorY + Math.floor(i / 2) * 14;
        doc.setTextColor(90, 96, 102);
        doc.text(row[0] + ':', colX, rowY);
        doc.setTextColor(27, 34, 40);
        doc.text(row[1], colX + 60, rowY);
      });
      cursorY += Math.ceil(clientRows.length / 2) * 14 + 8;

      if (settings.paymentTerms) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Pembayaran: ' + settings.paymentTerms, margin, cursorY);
        cursorY += 16;
      }

      /* ---- Item table: customer-facing rows only — cost breakdown hidden,
         Kaca (glass) always shown explicitly, per Anto's confirmation.
         Photo thumbnails are drawn into the "Foto" column via didDrawCell,
         at 2x their previous size (per Anto's request) — the taller row
         this produces is why valign:'middle' below matters: with a big
         thumbnail forcing extra row height, the shorter text needs to be
         explicitly vertically centered or it reads as sitting at the top. ---- */
      const rows = project.items.map(function (item, index) { return getCustomerFacingRow(item, index); });
      const PHOTO_COL_INDEX = 1;
      const PHOTO_CELL_SIZE = 80; // was 40 — doubled per Anto's request

      /**
       * Draws the running footer (blue line + company info + page number)
       * on whichever page is currently active via doc.setPage(). Called
       * once per page in a final pass after ALL content is laid out (see
       * bottom of this function) rather than only from autoTable's
       * didDrawPage — that hook only fires for pages generated while the
       * item table itself paginates, so any later page added for the
       * totals/bank-info/terms/signature block was previously left with
       * no footer at all whenever a quotation ran long (item #5).
       * @param {number} pageNumber
       * @param {number} totalPages
       */
      /**
       * Draws the running footer on whichever page is currently active via
       * doc.setPage(). Called once per page in a final pass after ALL
       * content is laid out (see bottom of this function) rather than only
       * from autoTable's didDrawPage — that hook only fires for pages
       * generated while the item table itself paginates, so any later page
       * added for the totals/bank-info/terms/signature block was
       * previously left with no footer at all whenever a quotation ran
       * long (item #5).
       *
       * Two left-aligned lines — company name, then address — instead of
       * one combined "Name · Address" line (per Anto's request); the page
       * number stays on the right, vertically centered against both lines.
       * @param {number} pageNumber
       * @param {number} totalPages
       */
      function drawPdfFooter(pageNumber, totalPages) {
        const addressY = doc.internal.pageSize.getHeight() - 24;
        const nameY = addressY - 9;
        const lineY = nameY - 8;
        const availableWidth = pageWidth - margin * 2;

        doc.setDrawColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
        doc.setLineWidth(0.75);
        doc.line(margin, lineY, pageWidth - margin, lineY);

        doc.setFontSize(7.5);
        doc.setTextColor(90, 96, 102);

        doc.setFont('helvetica', 'bold');
        let nameLine = settings.companyName || '';
        while (doc.getTextWidth(nameLine) > availableWidth - 90 && nameLine.length > 1) {
          nameLine = nameLine.slice(0, -1);
        }
        doc.text(nameLine, margin, nameY);

        doc.setFont('helvetica', 'normal');
        let addressLine = settings.companyAddress || '';
        while (doc.getTextWidth(addressLine) > availableWidth - 90 && addressLine.length > 1) {
          addressLine = addressLine.slice(0, -1);
        }
        if (addressLine !== (settings.companyAddress || '')) {
          addressLine = addressLine.replace(/\s+$/, '') + '\u2026';
        }
        doc.text(addressLine, margin, addressY);

        const pageLabel = 'Halaman ' + pageNumber + ' dari ' + totalPages;
        doc.text(pageLabel, pageWidth - margin, (nameY + addressY) / 2 + 2, { align: 'right' });
      }

      doc.autoTable({
        startY: cursorY,
        margin: { left: margin, right: margin },
        head: [['No', 'Foto', 'Type / Series', 'Kaca', 'Ukuran', 'Qty', 'Harga/Unit', 'Jumlah']],
        body: rows.map(function (row) {
          return [
            String(row.no),
            '', // photo drawn manually in didDrawCell — this cell is left blank as a placeholder
            row.label + '\n' + row.seriesLabel,
            row.kacaLabel,
            row.sizeLabel,
            row.qty + ' UNIT',
            Helper.formatCurrency(row.unitPrice),
            Helper.formatCurrency(row.jumlah)
          ];
        }),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, valign: 'middle', textColor: [27, 34, 40] },
        headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, minCellHeight: 0 },
        // QA FIX: minCellHeight was previously on the shared `styles` object,
        // which AutoTable applies to the head row too — forcing the blue
        // header row (just text labels, no photo) to be just as tall as a
        // body row with an 80pt photo thumbnail. Scoped to bodyStyles only.
        bodyStyles: { minCellHeight: PHOTO_CELL_SIZE + 8 },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: PHOTO_CELL_SIZE + 6 },
          4: { cellWidth: 55, halign: 'center' },
          5: { cellWidth: 32, halign: 'center' },
          6: { cellWidth: 70, halign: 'right' },
          7: { cellWidth: 70, halign: 'right' }
        },
        didDrawCell: function (data) {
          if (data.column.index !== PHOTO_COL_INDEX || data.section !== 'body') return;
          const rowData = rows[data.row.index];
          if (!rowData || !rowData.photoDataUrl) return;
          try {
            // BUG FIX: same missing-format-argument bug as the logo — was
            // addImage(dataUrl, x, y, size, size, undefined, 'FAST'),
            // shifting every argument one slot left.
            const format = getImageFormatFromDataUrl(rowData.photoDataUrl);
            const pad = 4;
            const size = Math.min(data.cell.height - pad * 2, data.cell.width - pad * 2);
            const centeredX = data.cell.x + (data.cell.width - size) / 2;
            const centeredY = data.cell.y + (data.cell.height - size) / 2;
            doc.addImage(rowData.photoDataUrl, format, centeredX, centeredY, size, size);
          } catch (imgErr) {
            console.warn('[ExportEngine] Item photo could not be embedded in PDF:', imgErr);
          }
        }
      });

      /* ---- Totals block ---- */
      const pageHeight = doc.internal.pageSize.getHeight();
      let cursorAfterTable = doc.lastAutoTable.finalY + 20;
      if (cursorAfterTable > pageHeight - 180) { doc.addPage(); cursorAfterTable = margin; }

      const summaryX = pageWidth - margin - 220;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(90, 96, 102);
      doc.text('Grand Total Normal', summaryX, cursorAfterTable);
      doc.text(Helper.formatCurrency(summary.grandTotalNormal), pageWidth - margin, cursorAfterTable, { align: 'right' });
      cursorAfterTable += 14;
      doc.text('Total Diskon', summaryX, cursorAfterTable);
      doc.text('- ' + Helper.formatCurrency(summary.totalDiscount), pageWidth - margin, cursorAfterTable, { align: 'right' });
      cursorAfterTable += 10;
      doc.setDrawColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
      doc.line(summaryX, cursorAfterTable, pageWidth - margin, cursorAfterTable);
      cursorAfterTable += 16;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]);
      doc.text('Grand Total', summaryX, cursorAfterTable);
      doc.text(Helper.formatCurrency(summary.grandTotalAfterDiscount), pageWidth - margin, cursorAfterTable, { align: 'right' });
      cursorAfterTable += 28;

      /* ---- Bank info ---- */
      if (settings.bankAccountInfo) {
        if (cursorAfterTable > pageHeight - 140) { doc.addPage(); cursorAfterTable = margin; }
        doc.setFillColor(230, 235, 240);
        doc.rect(margin, cursorAfterTable - 12, pageWidth - margin * 2, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(27, 34, 40);
        doc.text(settings.bankAccountInfo, margin + 6, cursorAfterTable + 2);
        cursorAfterTable += 30;
      }

      /* ---- Terms & Conditions (from Settings, numbered automatically) ----
         QA FIX (item #5, per Anto): no longer auto-appends "Harga berlaku
         N hari..." here — see the matching note in buildQuotationHtml for
         why (it duplicated a sentence Anto already types himself). ---- */
      const allTerms = termsLines.slice();
      if (allTerms.length) {
        if (cursorAfterTable > pageHeight - 100) { doc.addPage(); cursorAfterTable = margin; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(27, 34, 40);
        doc.text('Catatan:', margin, cursorAfterTable);
        cursorAfterTable += 14;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        allTerms.forEach(function (term, i) {
          if (cursorAfterTable > pageHeight - 60) { doc.addPage(); cursorAfterTable = margin; }
          const wrapped = doc.splitTextToSize((i + 1) + '. ' + term, pageWidth - margin * 2);
          doc.text(wrapped, margin, cursorAfterTable);
          cursorAfterTable += wrapped.length * 11;
        });
        cursorAfterTable += 20;
      }

      /* ---- Signature blocks ---- */
      if (cursorAfterTable > pageHeight - 90) { doc.addPage(); cursorAfterTable = margin; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(27, 34, 40);
      doc.text('Penjual,', margin, cursorAfterTable);
      doc.text('Pembeli,', pageWidth / 2 + 10, cursorAfterTable);
      doc.text(settings.companyName || '', margin, cursorAfterTable + 50);
      doc.text(project.clientName || '', pageWidth / 2 + 10, cursorAfterTable + 50);

      // Draw the footer on every page now that the final page count is
      // known — see drawPdfFooter's comment above for why this can't be
      // done earlier via autoTable's didDrawPage alone.
      const totalPages = doc.internal.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        doc.setPage(pageNumber);
        drawPdfFooter(pageNumber, totalPages);
      }

      const safeQuotationNumber = project.quotationNumber.replace(/[\/\\:*?"<>|]/g, '-');
      const filename = 'Quotation_' + (project.clientName || 'Project').replace(/[^\w\- ]/g, '') + '_' + safeQuotationNumber + '.pdf';
      doc.save(filename);
      return Promise.resolve({ success: true, message: 'PDF berhasil diunduh.' });
    } catch (err) {
      console.error('[ExportEngine] PDF generation failed:', err);
      return Promise.resolve({ success: false, message: 'Gagal membuat PDF. Coba gunakan Print/Excel sebagai alternatif.' });
    }
  }

  /**
   * Generates a downloadable Excel workbook via SheetJS for ONE project.
   * Unlike the customer-facing PDF, this internal version keeps the full
   * cost breakdown and live SUM formulas — it's the "editable internal
   * version" from Phase 1 FR8, not something handed to a customer.
   * @param {Object} project
   * @param {Object} settings
   * @returns {{success:boolean, message:string}}
   */
  function exportToExcel(project, settings) {
    const blockers = Validation.collectExportBlockers(project);
    if (blockers.length > 0) {
      return { success: false, message: blockers.join(' ') };
    }
    if (!window.XLSX) {
      return { success: false, message: 'Library Excel belum termuat. Periksa koneksi internet lalu coba lagi.' };
    }

    const rows = [];
    rows.push([settings.companyName || '']);
    rows.push([settings.companyAddress || '']);
    rows.push(['No Quotation', project.quotationNumber || buildQuotationNumber(project)]);
    rows.push(['Klien', project.clientName || '-']);
    rows.push(['Telepon', project.customerPhone || '-']);
    rows.push(['Project', project.projectName || '-']);
    rows.push(['Lokasi', project.location || '-']);
    rows.push(['Sales Rep', project.salesRep || '-']);
    rows.push([]);
    rows.push(['No', 'Deskripsi Item', 'Qty', 'Subtotal (Rp)', 'Diskon', 'Total Item (Rp)']);

    const firstDataRow = rows.length + 1;
    (project.items || []).forEach(function (item, index) {
      const totals = Calculator.calcItemTotals(item);
      const discountLabel = Calculator.formatDiscountLabel(item.discount) || 0;
      rows.push([index + 1, (item.label || 'Item ' + (index + 1)), totals.qty, totals.subtotalBeforeDiscount, discountLabel, totals.itemTotal]);
    });
    const lastDataRow = rows.length;

    rows.push([]);
    rows.push(['', '', '', '', 'Grand Total Normal', { f: 'SUM(D' + firstDataRow + ':D' + lastDataRow + ')' }]);
    rows.push(['', '', '', '', 'Grand Total Setelah Diskon', { f: 'SUM(F' + firstDataRow + ':F' + lastDataRow + ')' }]);

    const worksheet = window.XLSX.utils.aoa_to_sheet(rows.map(function (row) {
      return row.map(function (cell) { return (cell && typeof cell === 'object' && cell.f) ? { t: 'n', f: cell.f } : cell; });
    }));
    worksheet['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 16 }];

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Quotation');

    const excelSafeNumber = (project.quotationNumber || buildQuotationNumber(project)).replace(/[\/\\:*?"<>|]/g, '-');
    const filename = 'Quotation_' + (project.clientName || 'Project').replace(/[^\w\- ]/g, '') + '_' + excelSafeNumber + '.xlsx';
    window.XLSX.writeFile(workbook, filename);

    return { success: true, message: 'Excel berhasil diunduh.' };
  }

  /**
   * Exports EVERY saved project to a single Excel workbook — the manual
   * backup mechanism confirmed with Anto (a true silent/periodic
   * auto-backup to a specific folder like My Documents is not something
   * a browser-based app can do; see the conversation this was decided
   * in). Produces two sheets: a one-row-per-project summary for a fast
   * overview, and a full item-level detail sheet so the backup is
   * actually reconstructable, not just a set of totals.
   * @param {Array<Object>} projects - typically Project.getAllProjects()
   * @returns {{success:boolean, message:string}}
   */
  function exportAllProjectsToExcel(projects) {
    if (!window.XLSX) {
      return { success: false, message: 'Library Excel belum termuat. Periksa koneksi internet lalu coba lagi.' };
    }
    if (!Array.isArray(projects) || projects.length === 0) {
      return { success: false, message: 'Belum ada project untuk di-export.' };
    }

    /* ---- Sheet 1: one row per project ---- */
    const summaryRows = [['Klien', 'Project', 'Lokasi', 'Telepon', 'Sales Rep', 'Asal Leads', 'Status', 'Jumlah Item', 'Grand Total', 'Dibuat', 'Diperbarui']];
    projects.forEach(function (project) {
      const summary = Calculator.calcProjectSummary(project.items, project.projectDiscount);
      summaryRows.push([
        project.clientName || '-',
        project.projectName || '-',
        project.location || '-',
        project.customerPhone || '-',
        project.salesRep || '-',
        Helper.formatLeadSource(project),
        project.status || 'draft',
        project.items.length,
        summary.grandTotalAfterDiscount,
        Helper.formatDate(project.createdAt),
        Helper.formatDate(project.updatedAt)
      ]);
    });
    const summarySheet = window.XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];

    /* ---- Sheet 2: every item across every project, full detail (a real, reconstructable backup) ---- */
    const detailRows = [['Klien', 'Project', 'Item', 'Qty', 'Aluminium (Rp)', 'Kaca (Rp)', 'Lain-lain (Rp)', 'Sealant (Rp)', 'Diskon (Rp)', 'Total Item (Rp)']];
    projects.forEach(function (project) {
      (project.items || []).forEach(function (item) {
        const totals = Calculator.calcItemTotals(item);
        detailRows.push([
          project.clientName || '-',
          project.projectName || '-',
          item.label || '-',
          totals.qty,
          totals.aluminiumTotal,
          totals.glassTotal,
          totals.otherTotal,
          totals.sealantTotal,
          totals.discountAmount,
          totals.itemTotal
        ]);
      });
    });
    const detailSheet = window.XLSX.utils.aoa_to_sheet(detailRows);
    detailSheet['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 28 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, summarySheet, 'Semua Project');
    window.XLSX.utils.book_append_sheet(workbook, detailSheet, 'Semua Item');

    const filename = 'ALUVE_Backup_Semua_Project_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    window.XLSX.writeFile(workbook, filename);

    return { success: true, message: 'Backup ' + projects.length + ' project berhasil diunduh sebagai Excel.' };
  }

  return {
    buildQuotationNumber: buildQuotationNumber,
    buildQuotationHtml: buildQuotationHtml,
    printQuotation: printQuotation,
    exportToPdf: exportToPdf,
    exportToExcel: exportToExcel,
    exportAllProjectsToExcel: exportAllProjectsToExcel
  };
})();
