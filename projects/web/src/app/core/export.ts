import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { toCsv } from './csv';

/** Browser-side file saving: CSV download and a printable table for "Save as PDF". */
@Service()
export class Exporter {
  private readonly document = inject(DOCUMENT);

  downloadCsv(filename: string, rows: (string | number)[][]): void {
    this.saveBlob(filename, new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  }

  /** Saves a file the browser already holds, such as a CSV from the API. */
  saveBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  printTable(title: string, rows: (string | number)[][]): void {
    const win = this.document.defaultView?.open('', '_blank');
    if (!win) return;
    const esc = (v: string | number) =>
      String(v).replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
      );
    const [head, ...body] = rows;
    win.document
      .write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font:14px/1.5 system-ui,sans-serif;color:#10121c;margin:32px}h1{font-size:20px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #5f6479;padding:6px 10px;text-align:left}
      th{background:#eef0f7}</style></head><body><h1>${esc(title)}</h1><table><thead><tr>${head
        .map((h) => `<th scope="col">${esc(h)}</th>`)
        .join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }
}
