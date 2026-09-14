import type { TemplateBlocks, TemplateField } from "./types";

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  pageFormat: "A4" | "A5";
  blocks: TemplateBlocks;
  fields: TemplateField[];
  html: string;
}

/**
 * Built-in starter templates. Modeled on real Indian bill-book invoices:
 * - "classic": serif letterhead bill book page (no logo, signature, no GST)
 * - "gst": tax invoice with logo, GSTIN, HSN, CGST/SGST/IGST box
 * - "modern": clean A4 invoice with accent color + bank block
 * - "blank": minimal skeleton for building your own
 */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "classic",
    name: "Classic Bill Book",
    description: "Traditional bill-book page like R.K. Mould Diamond Works — serif letterhead, Bill No. & M/s lines, PARTICULARS table, Rupees-in-words, Proprietor signature. A5.",
    pageFormat: "A5",
    blocks: { hasLogo: false, hasSignature: true, hasGST: false, hasBank: false, hasAmountWords: true, hasHSN: false },
    fields: [
      { key: "orderNo", label: "Your Order No.", type: "text" },
      { key: "orderDate", label: "Order Date", type: "date" },
    ],
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 148mm 210mm; margin: 9mm 9mm 7mm 9mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2e6b; font-size: 10pt; line-height: 1.35; }
  .head { text-align: center; }
  .biz { font-size: 19pt; font-weight: bold; letter-spacing: 0.5mm; color: #1d3f94; }
  .tag { font-style: italic; font-weight: bold; margin-top: 1.5mm; font-size: 9.5pt; }
  .addr { font-size: 8.5pt; margin-top: 1.5mm; }
  .row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4mm; font-size: 10pt; }
  .fill { display: inline-block; border-bottom: 0.35mm solid #1c2e6b; min-width: 28mm; padding: 0 2mm; }
  .ms { margin-top: 3.5mm; font-size: 10pt; }
  .ms .line { border-bottom: 0.35mm solid #1c2e6b; min-height: 6.5mm; padding: 0 2mm 0.5mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 4mm; table-layout: fixed; }
  th, td { border: 0.3mm solid #1c2e6b; padding: 1.5mm; font-size: 9pt; vertical-align: top; word-wrap: break-word; }
  th { text-align: center; font-weight: bold; }
  .c { text-align: center; } .r { text-align: right; }
  tbody td { height: 7.5mm; }
  .total-row td { font-weight: bold; font-size: 9.5pt; }
  .words { margin-top: 4mm; font-size: 9.5pt; }
  .smallprint { font-size: 7.5pt; line-height: 1.45; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 7mm; }
  .sign { text-align: center; font-size: 9.5pt; min-width: 45mm; }
  .imglogo { height: 14mm; float: left; margin-right: 3mm; object-fit: contain; }
  .imgsig { height: 12mm; object-fit: contain; }
</style>
</head>
<body>
  <div class="head">
    {{#if hasLogo}}<img class="imglogo" src="{{logoUrl}}" />{{/if}}
    <div class="biz">{{upper seller.name}}</div>
    {{#if seller.tagline}}<div class="tag">Specialist in : {{upper seller.tagline}}</div>{{/if}}
    <div class="addr">
      {{seller.address}}{{#if seller.phone}}<br />Tel. : {{seller.phone}}{{/if}}{{#if seller.gstin}}<br />GSTIN : {{seller.gstin}}{{/if}}
    </div>
    <div style="clear: both;"></div>
  </div>

  <div class="row">
    <div><b>BILL No.:</b> <span class="fill">{{billNo}}</span></div>
    <div><b>Date :</b> <span class="fill">{{billDate}}</span></div>
  </div>

  <div class="ms">
    <b>M/s.</b>
    <div class="line">{{client.name}}</div>
    {{#if client.address}}<div class="line">{{client.address}}</div>{{/if}}
  </div>

  {{#if extra.orderNo}}
  <div class="row">
    <div><b>Your Order No.:</b> <span class="fill">{{extra.orderNo}}</span></div>
    <div>{{#if extra.orderDate}}<b>Date :</b> <span class="fill">{{extra.orderDate}}</span>{{/if}}</div>
  </div>
  {{/if}}

  <table>
    <colgroup>
      <col style="width: 9%" /><col style="width: 46%" /><col style="width: 15%" /><col style="width: 14%" /><col style="width: 16%" />
    </colgroup>
    <thead>
      <tr><th>Sr.<br />No.</th><th>PARTICULARS</th><th>Quantity</th><th>Rate</th><th>AMOUNT<br />Rs. &nbsp;&nbsp; P.</th></tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td class="c">{{sr}}</td>
        <td>{{description}}</td>
        <td class="r">{{qtyDisplay}}</td>
        <td class="r">{{rateFmt}}</td>
        <td class="r">{{amountFmt}}</td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr class="total-row"><td colspan="4" class="r">Total</td><td class="r">{{totals.totalFmt}}</td></tr>
    </tfoot>
  </table>

  {{#if notes}}<div class="smallprint" style="margin-top: 4mm; max-width: 60%;">{{notes}}</div>{{/if}}

  {{#if hasAmountWords}}
  <div class="words"><b>Rupees :</b> {{totals.totalInWords}}</div>
  {{/if}}

  {{#if hasBank}}
  <div class="smallprint" style="margin-top: 3mm;">
    <b>Bank :</b> {{bank.bankName}} &nbsp;|&nbsp; A/c No. : {{bank.accountNo}} &nbsp;|&nbsp; IFSC : {{bank.ifsc}}{{#if bank.upiId}} &nbsp;|&nbsp; UPI : {{bank.upiId}}{{/if}}{{#if chequeNo}} &nbsp;|&nbsp; Cheque No. : {{chequeNo}}{{/if}}
  </div>
  {{/if}}

  <div class="foot">
    <div class="smallprint">E. &amp; O. E.</div>
    <div class="sign">
      For <b>{{seller.name}}</b><br /><br />
      {{#if hasSignature}}<img class="imgsig" src="{{signatureUrl}}" />{{/if}}
      <div>Proprietor</div>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: "gst",
    name: "GST Tax Invoice",
    description: "Tax invoice like Krishna Engineering Works — TAX INVOICE badge, logo, GSTIN, HSN codes, party box, CGST/SGST/IGST summary, signature. A5.",
    pageFormat: "A5",
    blocks: { hasLogo: true, hasSignature: true, hasGST: true, hasBank: false, hasAmountWords: true, hasHSN: true },
    fields: [{ key: "partyGstin", label: "Party's GST", type: "text" }],
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 148mm 210mm; margin: 7mm 8mm 6mm 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #16181d; font-size: 9pt; }
  .badge { text-align: center; }
  .badge span { display: inline-block; border: 0.35mm solid #333; padding: 0.7mm 7mm; font-size: 9pt; font-weight: bold; letter-spacing: 0.4mm; }
  .lh { display: flex; gap: 3mm; margin-top: 2.5mm; align-items: center; }
  .imglogo { width: 15mm; max-height: 15mm; object-fit: contain; }
  .lh-main { flex: 1; text-align: center; }
  .biz { font-size: 15pt; font-weight: bold; color: #1f3277; letter-spacing: 0.2mm; }
  .tag { font-size: 7.8pt; font-weight: bold; margin-top: 0.8mm; }
  .addr { font-size: 7.3pt; margin-top: 1mm; line-height: 1.5; }
  .gstin { font-size: 8pt; font-weight: bold; margin-top: 0.8mm; }
  .partybox { display: flex; margin-top: 3mm; border: 0.3mm solid #333; }
  .party { flex: 1.9; padding: 2mm; font-size: 8.5pt; border-right: 0.3mm solid #333; min-height: 21mm; }
  .party .name { font-size: 9.5pt; font-weight: bold; color: #1f3277; }
  .party .line { border-bottom: 0.25mm solid #999; min-height: 5.5mm; margin-top: 1mm; }
  .invmeta { flex: 1; display: flex; flex-direction: column; }
  .invmeta .cell { padding: 1.6mm 2mm; font-size: 8.5pt; border-bottom: 0.3mm solid #333; display: flex; justify-content: space-between; gap: 2mm; align-items: baseline; }
  .invmeta .cell:last-child { border-bottom: none; }
  .invmeta .num { font-size: 10pt; font-weight: bold; }
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items th, .items td { border: 0.3mm solid #333; padding: 1.4mm; font-size: 8pt; vertical-align: top; word-wrap: break-word; }
  .items th { text-align: center; font-size: 7.8pt; }
  .items .c { text-align: center; } .items .r { text-align: right; }
  .items tbody td { height: 6.8mm; }
  .hsn { font-size: 6.8pt; color: #333; }
  .bottom { display: flex; gap: 3mm; margin-top: 3mm; align-items: stretch; }
  .words { flex: 1.7; border: 0.3mm solid #333; padding: 2mm; font-size: 8.5pt; }
  .taxbox { flex: 1; border: 0.3mm solid #333; font-size: 8pt; }
  .taxbox .trow { display: flex; justify-content: space-between; padding: 1.3mm 2mm; border-bottom: 0.25mm solid #333; }
  .taxbox .trow:last-child { border-bottom: none; font-weight: bold; font-size: 9pt; }
  .taxbox .lbl { min-width: 60%; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4.5mm; }
  .smallprint { font-size: 6.8pt; line-height: 1.5; }
  .sign { text-align: center; font-size: 8.5pt; min-width: 45mm; }
  .imgsig { height: 11mm; object-fit: contain; }
</style>
</head>
<body>
  <div class="badge"><span>TAX INVOICE</span></div>

  <div class="lh">
    {{#if hasLogo}}<img class="imglogo" src="{{logoUrl}}" />{{/if}}
    <div class="lh-main">
      <div class="biz">{{upper seller.name}}</div>
      {{#if seller.tagline}}<div class="tag">Specialist in : {{upper seller.tagline}}</div>{{/if}}
      <div class="addr">{{seller.address}}{{#if seller.phone}}<br />Mob. : {{seller.phone}}{{/if}}</div>
      {{#if seller.gstin}}<div class="gstin">GSTIN No. : {{seller.gstin}}</div>{{/if}}
    </div>
  </div>

  <div class="partybox">
    <div class="party">
      <b>M/s.</b>
      <div class="name">{{client.name}}</div>
      {{#if client.address}}<div style="margin-top:1mm; font-size:8pt;">{{client.address}}</div>{{/if}}
      {{#if extra.partyGstin}}<div style="margin-top:1.5mm; font-size:8pt;">Party's GST : {{extra.partyGstin}}</div>{{/if}}
    </div>
    <div class="invmeta">
      <div class="cell"><span>Invoice No. :</span><span class="num">{{billNo}}</span></div>
      <div class="cell"><span>Date :</span><span>{{billDate}}</span></div>
    </div>
  </div>

  <table class="items">
    <colgroup>
      <col style="width: 8%" /><col style="width: 44%" /><col style="width: 13%" /><col style="width: 17%" /><col style="width: 18%" />
    </colgroup>
    <thead>
      <tr><th>Sr. No.</th><th>Description of Goods</th><th>Quantity</th><th>Rate per<br />Rs.</th><th>Amount<br />Rs. &nbsp;&nbsp; P.</th></tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td class="c">{{sr}}</td>
        <td>
          {{description}}
          {{#if hsn}}<div class="hsn">HSN CODE : {{hsn}}</div>{{/if}}
        </td>
        <td class="r">{{qtyDisplay}}</td>
        <td class="r">{{rateFmt}}</td>
        <td class="r">{{amountFmt}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="bottom">
    {{#if hasAmountWords}}
    <div class="words"><b>Rupees :</b> {{totals.totalInWords}}</div>
    {{else}}
    <div class="words"></div>
    {{/if}}
    <div class="taxbox">
      <div class="trow"><span class="lbl">GROSS AMT.</span><span>{{totals.subtotalFmt}}</span></div>
      {{#if hasGST}}
      <div class="trow"><span class="lbl">CGST {{tax.cgstRate}}%</span><span>{{totals.cgstFmt}}</span></div>
      <div class="trow"><span class="lbl">SGST {{tax.sgstRate}}%</span><span>{{totals.sgstFmt}}</span></div>
      <div class="trow"><span class="lbl">IGST</span><span>{{totals.igstFmt}}</span></div>
      {{/if}}
      <div class="trow"><span class="lbl">TOTAL</span><span>{{totals.totalFmt}}</span></div>
    </div>
  </div>

  {{#if hasBank}}
  <div class="smallprint" style="margin-top: 2.5mm;">
    <b>Bank :</b> {{bank.bankName}} &nbsp;|&nbsp; A/c No. : {{bank.accountNo}} &nbsp;|&nbsp; IFSC : {{bank.ifsc}}{{#if bank.upiId}} &nbsp;|&nbsp; UPI : {{bank.upiId}}{{/if}}
  </div>
  {{/if}}

  <div class="foot">
    <div class="smallprint">
      SUBJECT TO MUMBAI JURISDICTION<br />E. &amp; O. E.{{#if notes}}<br />{{notes}}{{/if}}
    </div>
    <div class="sign">
      For <b>{{seller.name}}</b><br /><br />
      {{#if hasSignature}}<img class="imgsig" src="{{signatureUrl}}" />{{/if}}
      <div>Proprietor</div>
    </div>
  </div>
</body>
</html>`,
  },
  {
    id: "modern",
    name: "Modern Minimal (A4)",
    description: "Clean A4 invoice with indigo accents, zebra item rows, totals box, optional bank details block and digital signature area. Good for printing or emailing.",
    pageFormat: "A4",
    blocks: { hasLogo: true, hasSignature: true, hasGST: true, hasBank: true, hasAmountWords: true, hasHSN: false },
    fields: [{ key: "poNo", label: "PO Number", type: "text" }],
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 210mm 297mm; margin: 13mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1e293b; font-size: 10pt; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
  .brand { display: flex; gap: 4mm; align-items: center; }
  .imglogo { width: 18mm; max-height: 18mm; object-fit: contain; }
  .biz { font-size: 17pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.1mm; }
  .tag { font-size: 8.5pt; color: #475569; margin-top: 0.5mm; }
  .addr { font-size: 8.5pt; color: #475569; margin-top: 1.5mm; line-height: 1.55; }
  .right { text-align: right; font-size: 8.5pt; color: #475569; line-height: 1.55; }
  .doctitle { font-size: 21pt; font-weight: 800; color: #2563eb; letter-spacing: 1.5mm; }
  .hr { height: 1.1mm; background: #2563eb; margin: 5mm 0; border-radius: 1mm; }
  .meta { display: flex; gap: 5mm; margin-top: 2mm; }
  .card { border: 0.3mm solid #dbe3ee; border-radius: 2mm; padding: 3mm 4mm; }
  .billto { flex: 1.6; }
  .invoicedetails { flex: 1; }
  .card h4 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4mm; color: #64748b; margin-bottom: 1.5mm; }
  .card .name { font-size: 11pt; font-weight: 700; color: #0f172a; }
  .card .sub { font-size: 8.8pt; color: #475569; margin-top: 0.8mm; line-height: 1.5; }
  .drow { display: flex; justify-content: space-between; font-size: 9pt; padding: 0.9mm 0; }
  .drow .k { color: #64748b; } .drow .v { font-weight: 600; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6mm; table-layout: fixed; }
  .items th { background: #eff6ff; color: #1e3a8a; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.2mm; text-align: left; padding: 2.5mm 3mm; border-bottom: 0.4mm solid #2563eb; }
  .items td { font-size: 9.5pt; padding: 2.6mm 3mm; border-bottom: 0.25mm solid #e2e8f0; vertical-align: top; }
  .items tbody tr:nth-child(even) td { background: #f8fafc; }
  .items .c { text-align: center; } .items .r { text-align: right; }
  .totals { margin-top: 5mm; display: flex; justify-content: flex-end; }
  .totals .box { width: 78mm; }
  .totals .trow { display: flex; justify-content: space-between; padding: 1.8mm 3mm; font-size: 9.5pt; }
  .totals .trow .k { color: #64748b; }
  .totals .grand { background: #1e3a8a; color: #ffffff; border-radius: 1.5mm; font-size: 12pt; font-weight: 700; padding: 3mm; margin-top: 1.5mm; display: flex; justify-content: space-between; }
  .words { margin-top: 4.5mm; font-size: 9pt; color: #475569; }
  .words b { color: #0f172a; }
  .bank { margin-top: 5mm; border: 0.3mm solid #dbe3ee; border-radius: 2mm; padding: 3mm 4mm; font-size: 8.8pt; color: #334155; line-height: 1.6; background: #f8fafc; }
  .notes { margin-top: 4mm; font-size: 8.5pt; color: #475569; line-height: 1.5; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12mm; }
  .thanks { font-size: 9pt; color: #64748b; }
  .sign { text-align: center; }
  .imgsig { height: 13mm; object-fit: contain; }
  .signline { border-top: 0.3mm solid #94a3b8; margin-top: 1.5mm; padding-top: 1mm; font-size: 8.5pt; color: #475569; min-width: 50mm; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">
        {{#if hasLogo}}<img class="imglogo" src="{{logoUrl}}" />{{/if}}
        <div>
          <div class="biz">{{seller.name}}</div>
          {{#if seller.tagline}}<div class="tag">{{seller.tagline}}</div>{{/if}}
        </div>
      </div>
      <div class="addr">{{seller.address}}{{#if seller.phone}}<br />Phone : {{seller.phone}}{{/if}}{{#if seller.gstin}}<br />GSTIN : {{seller.gstin}}{{/if}}</div>
    </div>
    <div class="right">
      <div class="doctitle">INVOICE</div>
    </div>
  </div>
  <div class="hr"></div>

  <div class="meta">
    <div class="card billto">
      <h4>Bill To</h4>
      <div class="name">{{client.name}}</div>
      {{#if client.address}}<div class="sub">{{client.address}}</div>{{/if}}
      {{#if client.gstin}}<div class="sub">GSTIN : {{client.gstin}}</div>{{/if}}
    </div>
    <div class="card invoicedetails">
      <h4>Invoice Details</h4>
      <div class="drow"><span class="k">Bill No.</span><span class="v">{{billNo}}</span></div>
      <div class="drow"><span class="k">Bill Date</span><span class="v">{{billDate}}</span></div>
      {{#if dueDate}}<div class="drow"><span class="k">Due Date</span><span class="v">{{dueDate}}</span></div>{{/if}}
      {{#if extra.poNo}}<div class="drow"><span class="k">PO No.</span><span class="v">{{extra.poNo}}</span></div>{{/if}}
    </div>
  </div>

  <table class="items">
    <colgroup>
      <col style="width: 7%" /><col style="width: 43%" />{{#if hasHSN}}<col style="width: 13%" />{{/if}}<col style="width: 11%" /><col style="width: 14%" /><col style="width: 15%" />
    </colgroup>
    <thead>
      <tr>
        <th class="c">#</th><th>Description</th>{{#if hasHSN}}<th>HSN</th>{{/if}}<th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td class="c">{{sr}}</td>
        <td>{{description}}</td>
        {{#if ../hasHSN}}<td>{{hsn}}</td>{{/if}}
        <td class="r">{{qtyDisplay}}</td>
        <td class="r">{{rateFmt}}</td>
        <td class="r">{{amountFmt}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <div class="box">
      <div class="trow"><span class="k">Subtotal</span><span>{{totals.subtotalFmt}}</span></div>
      {{#if hasGST}}
      <div class="trow"><span class="k">CGST ({{tax.cgstRate}}%)</span><span>{{totals.cgstFmt}}</span></div>
      <div class="trow"><span class="k">SGST ({{tax.sgstRate}}%)</span><span>{{totals.sgstFmt}}</span></div>
      <div class="trow"><span class="k">IGST ({{tax.igstRate}}%)</span><span>{{totals.igstFmt}}</span></div>
      {{/if}}
      <div class="grand"><span>Total</span><span>Rs. {{totals.totalFmt}}</span></div>
    </div>
  </div>

  {{#if hasAmountWords}}
  <div class="words"><b>Amount in words :</b> {{totals.totalInWords}}</div>
  {{/if}}

  {{#if hasBank}}
  <div class="bank">
    <b>Bank Details</b> &nbsp;—&nbsp; {{bank.bankName}} &nbsp;|&nbsp; A/c No. : {{bank.accountNo}} &nbsp;|&nbsp; IFSC : {{bank.ifsc}}{{#if bank.upiId}} &nbsp;|&nbsp; UPI : {{bank.upiId}}{{/if}}{{#if chequeNo}} &nbsp;|&nbsp; Cheque No. : {{chequeNo}}{{/if}}
  </div>
  {{/if}}

  {{#if notes}}<div class="notes"><b>Notes :</b> {{notes}}</div>{{/if}}

  <div class="foot">
    <div class="thanks">Thank you for your business!</div>
    {{#if hasSignature}}
    <div class="sign">
      {{#if signatureUrl}}<img class="imgsig" src="{{signatureUrl}}" />{{/if}}
      <div class="signline">For {{seller.name}} — Authorised Signatory</div>
    </div>
    {{/if}}
  </div>
</body>
</html>`,
  },
  {
    id: "blank",
    name: "Blank Starter",
    description: "Minimal skeleton with the standard placeholders — best if you want to paste/import your own HTML or build a layout from scratch in the editor.",
    pageFormat: "A4",
    blocks: { hasLogo: false, hasSignature: false, hasGST: false, hasBank: false, hasAmountWords: true, hasHSN: false },
    fields: [],
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 210mm 297mm; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; }
  h1 { font-size: 16pt; }
  .muted { color: #555; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 8mm; }
  th, td { border: 0.3mm solid #444; padding: 2mm; font-size: 9.5pt; text-align: left; }
  .r { text-align: right; }
  .total { margin-top: 4mm; text-align: right; font-weight: bold; font-size: 11pt; }
</style>
</head>
<body>
  <h1>{{seller.name}}</h1>
  <div class="muted">{{seller.address}}{{#if seller.phone}} — {{seller.phone}}{{/if}}</div>

  <p style="margin-top: 6mm;">
    <b>Bill No. :</b> {{billNo}} &nbsp;&nbsp; <b>Date :</b> {{billDate}}<br />
    <b>Bill To :</b> {{client.name}}{{#if client.address}}, {{client.address}}{{/if}}
  </p>

  <table>
    <thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr><td>{{sr}}</td><td>{{description}}</td><td class="r">{{qtyDisplay}}</td><td class="r">{{rateFmt}}</td><td class="r">{{amountFmt}}</td></tr>
      {{/each}}
    </tbody>
  </table>
  <div class="total">Total : Rs. {{totals.totalFmt}}</div>

  {{#if hasAmountWords}}<p class="muted">Rupees {{totals.totalInWords}}</p>{{/if}}
  {{#if hasBank}}<p class="muted">Bank : {{bank.bankName}} | A/c : {{bank.accountNo}} | IFSC : {{bank.ifsc}} | UPI : {{bank.upiId}}</p>{{/if}}
  {{#if notes}}<p class="muted">{{notes}}</p>{{/if}}

  {{#if hasSignature}}
  <p style="margin-top: 16mm; text-align: right;">
    {{#if signatureUrl}}<img src="{{signatureUrl}}" style="height: 13mm;" />{{/if}}<br />
    For {{seller.name}}
  </p>
  {{/if}}
</body>
</html>`,
  },
];

export function getBuiltin(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
