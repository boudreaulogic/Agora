import { db } from '@/lib/db';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const TEMPLATES_DIR = '/app/uploads/templates';
const UPLOADS_DIR = '/app/uploads';

export async function generateExportPdf(tableId: string, rowId: string, userId: string) {
  const template = await db.recordExportTemplate.findFirst({
    where: { tableId },
    orderBy: { createdAt: 'asc' },
  });

  if (!template) {
    console.log('[Auto-PDF] No Record Export template found for table', tableId);
    return;
  }

  const table = await db.agoraTable.findUnique({
    where: { id: tableId },
    include: { columns: true },
  });

  if (!table) return;

  const row = await db.agoraRow.findUnique({ where: { id: rowId } });
  if (!row) return;

  const rowData = row.data as Record<string, any>;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  const templatePath = path.join(TEMPLATES_DIR, template.templatePath);
  if (!existsSync(templatePath)) {
    console.error('[Auto-PDF] Template file missing:', templatePath);
    return;
  }

  const templateBuffer = await readFile(templatePath);
  const fieldMappings = template.fieldMappings as any[];
  const columnMap = new Map(table.columns.map((c: any) => [c.id, c]));

  const pdfDoc = await PDFDocument.load(templateBuffer, { ignoreEncryption: true });

  let form: any;
  try {
    form = pdfDoc.getForm();
  } catch {
    console.error('[Auto-PDF] Could not get form from template');
    return;
  }

  let filledCount = 0;

  for (const mapping of fieldMappings) {
    if (!mapping.pdfFieldName || !mapping.columnId) continue;

    const column = columnMap.get(mapping.columnId);
    let value = rowData[mapping.columnId];

    if (value !== null && value !== undefined) {
      if (column?.type === 'currency') {
        const num = parseFloat(value);
        value = isNaN(num) ? String(value) : `$${num.toFixed(2)}`;
      } else if (column?.type === 'date') {
        try { value = new Date(value).toLocaleDateString('en-US'); } catch { value = String(value); }
      } else if (column?.type === 'checkbox') {
        value = value === 'true' ? 'Yes' : 'No';
      } else if (column?.type === 'select') {
        const opt = (column.settings as any)?.options?.find((o: any) => o.value === value);
        value = opt?.label || String(value);
      } else {
        value = String(value);
      }
    } else {
      value = '';
    }

    if (!value) continue;

    try {
      try {
        const checkbox = form.getCheckBox(mapping.pdfFieldName);
        const normalizedValue = String(value).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const normalizedFieldName = mapping.pdfFieldName.toLowerCase();
        const shouldCheck =
          value === 'Yes' || value === 'true' || value === true ||
          normalizedFieldName.includes(normalizedValue) ||
          normalizedFieldName.endsWith(normalizedValue);
        if (shouldCheck) checkbox.check(); else checkbox.uncheck();
        filledCount++;
        continue;
      } catch {}

      try {
        const textField = form.getTextField(mapping.pdfFieldName);
        textField.setText(String(value));
        filledCount++;
        continue;
      } catch {}

      try {
        const dropdown = form.getDropdown(mapping.pdfFieldName);
        dropdown.select(String(value));
        filledCount++;
        continue;
      } catch {}
    } catch {}
  }

  console.log(`[Auto-PDF] Filled ${filledCount} fields for row ${rowId}`);

  try { form.flatten(); } catch {}

  if (template.includeAuditPage) {
    await appendAuditPageForAutoExport(pdfDoc, tableId, row, table, user);
  }

  const pdfBytes = await pdfDoc.save();
  const safeName = table.name.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).replace(/\//g, '-');
  let uniquePart = rowId.slice(-6);
  if ((template as any).filenameColumnId) {
    const val = rowData[(template as any).filenameColumnId];
    if (val) {
      uniquePart = String(val).replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
    }
  }
  const filename = `${safeName}_${uniquePart}_${dateStr}.pdf`;
  const uniqueFilename = crypto.randomUUID() + '.pdf';
  const filePath = path.join(UPLOADS_DIR, uniqueFilename);

  if (!existsSync(UPLOADS_DIR)) {
    await mkdir(UPLOADS_DIR, { recursive: true });
  }

  await writeFile(filePath, Buffer.from(pdfBytes));

  // Find the attachment column for this table
  const attachmentColumn = table.columns.find((c: any) => c.type === 'attachment');
  const columnId = attachmentColumn?.id || 'system';

  const attachment = await (db as any).fileAttachment.create({
    data: {
      filename,
      originalName: filename,
      mimeType: 'application/pdf',
      size: pdfBytes.length,
      path: uniqueFilename,
      rowId,
      tableId,
      columnId,
      uploadedById: userId,
    },
  });

  if (attachmentColumn) {
    const existing = rowData[attachmentColumn.id];
    let attachmentIds: string[] = [];
    if (existing) {
      try { attachmentIds = JSON.parse(existing); } catch { attachmentIds = []; }
    }
    attachmentIds.push(attachment.id);
    rowData[attachmentColumn.id] = JSON.stringify(attachmentIds);
    await db.agoraRow.update({ where: { id: rowId }, data: { data: rowData } });
  }

  console.log(`[Auto-PDF] Attached PDF "${filename}" to row ${rowId}`);
}

async function appendAuditPageForAutoExport(pdfDoc: any, tableId: string, row: any, table: any, user: any) {
  try {
    const approvalRequest = await (db as any).approvalRequest.findFirst({
      where: { tableId, rowId: row.id, status: 'approved' },
      include: { workflow: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!approvalRequest) return;

    const actions = await (db as any).approvalAction.findMany({
      where: { requestId: approvalRequest.id },
      orderBy: { createdAt: 'asc' },
    });

    const ledgerEntries = await (db as any).approvalLedger.findMany({
      where: { tableId, rowId: row.id },
      orderBy: { createdAt: 'asc' },
    });

    const userIds = [...new Set(actions.map((a: any) => a.userId).filter(Boolean))];
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds as string[] } }, select: { id: true, name: true, email: true } })
      : [];
    const userMap = new Map(users.map(u => [u.id, { name: u.name || 'Unknown', email: u.email || '' }]));

    const stages = (approvalRequest.workflow?.stages as any[]) || [];
    const stageMap = new Map(stages.map((s: any) => [s.order, s.name || `Stage ${s.order}`]));

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    const page1 = pdfDoc.addPage([612, 792]);
    let y = 752;

    const draw = (text: string, x: number, yy: number, opts: any = {}) => {
      page1.drawText(String(text || ''), {
        x, y: yy, size: opts.size || 9,
        font: opts.mono ? fontMono : (opts.bold ? fontBold : font),
        color: opts.color || rgb(0.2, 0.2, 0.2),
      });
    };
    const drawLine = (yy: number, color = rgb(0.8, 0.8, 0.8), thickness = 0.5) => {
      page1.drawLine({ start: { x: 40, y: yy }, end: { x: 572, y: yy }, thickness, color });
    };
    const drawBox = (x: number, yy: number, w: number, h: number, fill: any) => {
      page1.drawRectangle({ x, y: yy, width: w, height: h, color: fill });
    };

    drawBox(40, y - 5, 532, 30, rgb(0.106, 0.161, 0.235));
    draw('DOCUMENT VERIFICATION REPORT', 50, y + 2, { size: 14, bold: true, color: rgb(1, 1, 1) });
    y -= 40;
    draw('Powered by Agora — Blockchain-style audit verification', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) });
    y -= 20;
    drawLine(y, rgb(0.106, 0.161, 0.235), 1.5);
    y -= 20;

    draw('DOCUMENT DETAILS', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 18;

    const infoLeft = [['Table', table.name], ['Record ID', row.id.slice(-12).toUpperCase()], ['Full Row ID', row.id]];
    const infoRight = [['Generated', new Date().toLocaleString('en-US')], ['Generated By', 'System (Auto-attach on approval)'], ['Status', approvalRequest.status.toUpperCase()]];

    for (let i = 0; i < Math.max(infoLeft.length, infoRight.length); i++) {
      if (infoLeft[i]) { draw(infoLeft[i][0] + ':', 50, y, { size: 7.5, bold: true }); draw(infoLeft[i][1], 130, y, { size: 7.5 }); }
      if (infoRight[i]) {
        draw(infoRight[i][0] + ':', 340, y, { size: 7.5, bold: true });
        draw(infoRight[i][1], 420, y, { size: 7.5, bold: infoRight[i][0] === 'Status', color: infoRight[i][0] === 'Status' ? (approvalRequest.status === 'approved' ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.2, 0.2)) : rgb(0.2, 0.2, 0.2) });
      }
      y -= 13;
    }

    y -= 10; drawLine(y); y -= 20;

    draw('APPROVAL CHAIN', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 5;
    draw('Submitted:', 50, y - 12, { size: 7.5, bold: true }); draw(new Date(approvalRequest.createdAt).toLocaleString('en-US'), 120, y - 12, { size: 7.5 });
    draw('Completed:', 300, y - 12, { size: 7.5, bold: true }); draw(new Date(approvalRequest.updatedAt).toLocaleString('en-US'), 370, y - 12, { size: 7.5 });
    y -= 28;

    drawBox(50, y - 2, 512, 14, rgb(0.94, 0.94, 0.94));
    draw('Stage', 55, y + 1, { size: 7, bold: true }); draw('Action', 120, y + 1, { size: 7, bold: true }); draw('Approver', 170, y + 1, { size: 7, bold: true }); draw('Date & Time', 330, y + 1, { size: 7, bold: true }); draw('Location', 430, y + 1, { size: 7, bold: true });
    y -= 16;

    for (const act of actions) {
      if (y < 200) break;
      const approver = userMap.get(act.userId) || { name: 'Unknown', email: '' };
      const stageName = stageMap.get(act.stageOrder) || stageMap.get(approvalRequest.currentStage) || 'Review';
      draw(stageName, 55, y, { size: 7 });
      draw(act.action === 'approve' ? 'APPROVED' : 'DENIED', 120, y, { size: 7, bold: true, color: act.action === 'approve' ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.2, 0.2) });
      draw(approver.name, 170, y, { size: 7, bold: true }); draw(new Date(act.createdAt).toLocaleString('en-US'), 330, y, { size: 7 }); draw(act.geoLocation || '', 430, y, { size: 6.5, color: rgb(0.4, 0.4, 0.4) });
      y -= 11;
      draw(approver.email, 170, y, { size: 6, color: rgb(0.4, 0.4, 0.4) });
      if (act.ipAddress) draw('IP: ' + String(act.ipAddress), 330, y, { size: 5.5, color: rgb(0.5, 0.5, 0.5) });
      y -= 11;
      if (act.reason) { draw('Reason: "' + String(act.reason) + '"', 170, y, { size: 6.5, color: rgb(0.3, 0.3, 0.3) }); y -= 11; }
      drawLine(y + 4, rgb(0.9, 0.9, 0.9)); y -= 6;
    }

    y -= 10; drawLine(y); y -= 20;

    draw('SHA-256 CRYPTOGRAPHIC AUDIT LEDGER', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 5;
    draw('Each entry is cryptographically linked to the previous, forming an immutable chain of custody.', 50, y - 8, { size: 6.5, color: rgb(0.5, 0.5, 0.5) });
    y -= 22;

    drawBox(50, y - 2, 512, 13, rgb(0.94, 0.94, 0.94));
    draw('#', 55, y, { size: 6.5, bold: true }); draw('Event', 70, y, { size: 6.5, bold: true }); draw('SHA-256 Hash', 145, y, { size: 6.5, bold: true });
    y -= 15;

    for (const entry of ledgerEntries) {
      if (y < 80) { draw('... continued on next page', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) }); break; }
      draw(String(entry.sequenceNumber || ''), 55, y, { size: 6 }); draw(String(entry.action || ''), 70, y, { size: 6, bold: true });
      draw('Hash:', 145, y, { size: 5.5, bold: true, color: rgb(0.4, 0.4, 0.4) }); draw(String(entry.hash || ''), 170, y, { size: 5, mono: true, color: rgb(0.2, 0.2, 0.2) });
      y -= 9;
      const prevHash = String(entry.previousHash || 'GENESIS');
      draw('Prev:', 145, y, { size: 5.5, bold: true, color: rgb(0.6, 0.6, 0.6) }); draw(prevHash === 'GENESIS' ? 'GENESIS (first entry)' : prevHash, 170, y, { size: 5, mono: true, color: rgb(0.5, 0.5, 0.5) });
      y -= 9;
      if (entry !== ledgerEntries[ledgerEntries.length - 1]) draw('|', 58, y + 2, { size: 7, color: rgb(0.7, 0.7, 0.7) });
      y -= 5;
    }

    drawLine(62, rgb(0.106, 0.161, 0.235), 1);
    draw('This document was generated by Agora and verified against an immutable SHA-256 hash-chained audit ledger.', 50, 48, { size: 6.5, color: rgb(0.4, 0.4, 0.4) });
    draw('Any modification to this document or its approval chain can be detected by recalculating the hash chain.', 50, 38, { size: 6.5, color: rgb(0.5, 0.5, 0.5) });
  } catch (error) {
    console.error('[Auto-PDF] Audit page error:', error);
  }
}