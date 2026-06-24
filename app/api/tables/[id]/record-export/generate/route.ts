import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getTablePermission } from '@/lib/tablePermissions';

const TEMPLATES_DIR = '/app/uploads/templates';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await request.json();
    const { templateId, rowIds } = body;

    if (!templateId || !rowIds?.length) {
      return NextResponse.json({ error: 'templateId and rowIds required' }, { status: 400 });
    }

    const template = await db.recordExportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.tableId !== params.id) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const table = await db.agoraTable.findUnique({
      where: { id: params.id },
      include: { columns: true },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const rows = await db.agoraRow.findMany({
      where: { id: { in: rowIds }, tableId: params.id },
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows found' }, { status: 404 });
    }

    const templatePath = path.join(TEMPLATES_DIR, template.templatePath);
    if (!existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template file missing' }, { status: 404 });
    }

    const templateBuffer = await readFile(templatePath);
    const fieldMappings = template.fieldMappings as any[];
    const columnMap = new Map(table.columns.map((c: any) => [c.id, c]));

    const mergedPdf = await PDFDocument.create();

    for (const row of rows) {
      const rowData = row.data as Record<string, any>;

      const pdfDoc = await PDFDocument.load(templateBuffer, { ignoreEncryption: true });

      let form: any;
      try {
        form = pdfDoc.getForm();
      } catch (e) {
        console.error('[PDF Export] Could not get form:', e);
        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
        continue;
      }

      const allFields = form.getFields();
      console.log(`[PDF Export] Template has ${allFields.length} form fields`);

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
          // First: check if this is a checkbox field
          let isCheckbox = false;
          try {
            const checkbox = form.getCheckBox(mapping.pdfFieldName);
            isCheckbox = true;

            // Smart checkbox logic:
            // If mapped column is a select/text, check the box if the value matches
            // part of the PDF field name (e.g., value "general" matches field "fund_general")
            const normalizedValue = String(value).toLowerCase().replace(/[^a-z0-9]/g, '_');
            const normalizedFieldName = mapping.pdfFieldName.toLowerCase();

            const shouldCheck =
              value === 'Yes' || value === 'true' || value === true ||
              normalizedFieldName.includes(normalizedValue) ||
              normalizedFieldName.endsWith(normalizedValue);

            if (shouldCheck) {
              checkbox.check();
            } else {
              checkbox.uncheck();
            }
            filledCount++;
            continue;
          } catch {}

          // Text field
          try {
            const textField = form.getTextField(mapping.pdfFieldName);
            textField.setText(String(value));
            filledCount++;
            continue;
          } catch {}

          // Dropdown
          try {
            const dropdown = form.getDropdown(mapping.pdfFieldName);
            dropdown.select(String(value));
            filledCount++;
            continue;
          } catch {}
        } catch (e: any) {
          console.warn(`[PDF Export] Error filling ${mapping.pdfFieldName}:`, e.message);
        }
      }

      console.log(`[PDF Export] Filled ${filledCount} of ${fieldMappings.filter((m: any) => m.columnId).length} mapped fields`);

      try {
        form.flatten();
      } catch (e) {
        console.warn('[PDF Export] Could not flatten form:', e);
      }

      if (template.includeAuditPage) {
        await appendAuditPage(pdfDoc, params.id, row, table, session.user);
      }

      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();

    // Build filename
    let filename: string;
    const safeName = table.name.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).replace(/\//g, '-');

    if (rows.length === 1) {
      let uniquePart = rows[0].id.slice(-6);
      if ((template as any).filenameColumnId) {
        const rowData = rows[0].data as Record<string, any>;
        const val = rowData[(template as any).filenameColumnId];
        if (val) {
          uniquePart = String(val).replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
        }
      }
      filename = `${safeName}_${uniquePart}_${dateStr}.pdf`;
    } else {
      filename = `${safeName}_export_${rows.length}records_${dateStr}.pdf`;
    }

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error: any) {
    console.error('[PDF Export] Record export error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}

async function appendAuditPage(pdfDoc: any, tableId: string, row: any, table: any, user: any) {
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
        x, y: yy,
        size: opts.size || 9,
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

    // ====== HEADER ======
    drawBox(40, y - 5, 532, 30, rgb(0.106, 0.161, 0.235));
    draw('DOCUMENT VERIFICATION REPORT', 50, y + 2, { size: 14, bold: true, color: rgb(1, 1, 1) });
    y -= 40;

    draw('Powered by Agora — Blockchain-style audit verification', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) });
    y -= 20;
    drawLine(y, rgb(0.106, 0.161, 0.235), 1.5);
    y -= 20;

    // ====== DOCUMENT INFO ======
    draw('DOCUMENT DETAILS', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 18;

    const infoLeft = [
      ['Table', table.name],
      ['Record ID', row.id.slice(-12).toUpperCase()],
      ['Full Row ID', row.id],
    ];
    const infoRight = [
      ['Exported', new Date().toLocaleString('en-US')],
      ['Exported By', `${user.name || ''} (${user.email || ''})`],
      ['Status', approvalRequest.status.toUpperCase()],
    ];

    for (let i = 0; i < Math.max(infoLeft.length, infoRight.length); i++) {
      if (infoLeft[i]) {
        draw(infoLeft[i][0] + ':', 50, y, { size: 7.5, bold: true });
        draw(infoLeft[i][1], 130, y, { size: 7.5 });
      }
      if (infoRight[i]) {
        draw(infoRight[i][0] + ':', 340, y, { size: 7.5, bold: true });
        draw(infoRight[i][1], 420, y, {
          size: 7.5,
          bold: infoRight[i][0] === 'Status',
          color: infoRight[i][0] === 'Status'
            ? (approvalRequest.status === 'approved' ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.2, 0.2))
            : rgb(0.2, 0.2, 0.2),
        });
      }
      y -= 13;
    }

    y -= 10;
    drawLine(y);
    y -= 20;

    // ====== APPROVAL CHAIN ======
    draw('APPROVAL CHAIN', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 5;

    draw('Submitted:', 50, y - 12, { size: 7.5, bold: true });
    draw(new Date(approvalRequest.createdAt).toLocaleString('en-US'), 120, y - 12, { size: 7.5 });
    draw('Completed:', 300, y - 12, { size: 7.5, bold: true });
    draw(new Date(approvalRequest.updatedAt).toLocaleString('en-US'), 370, y - 12, { size: 7.5 });
    y -= 28;

    drawBox(50, y - 2, 512, 14, rgb(0.94, 0.94, 0.94));
    draw('Stage', 55, y + 1, { size: 7, bold: true });
    draw('Action', 120, y + 1, { size: 7, bold: true });
    draw('Approver', 170, y + 1, { size: 7, bold: true });
    draw('Date & Time', 330, y + 1, { size: 7, bold: true });
    draw('Location', 430, y + 1, { size: 7, bold: true });
    y -= 16;

    for (const act of actions) {
      if (y < 200) break;
      const approver = userMap.get(act.userId) || { name: 'Unknown', email: '' };
      const stageName = stageMap.get(act.stageOrder) || stageMap.get(approvalRequest.currentStage) || 'Review';

      draw(stageName, 55, y, { size: 7 });
      draw(act.action === 'approve' ? 'APPROVED' : 'DENIED', 120, y, {
        size: 7, bold: true,
        color: act.action === 'approve' ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.2, 0.2),
      });
      draw(approver.name, 170, y, { size: 7, bold: true });
      draw(new Date(act.createdAt).toLocaleString('en-US'), 330, y, { size: 7 });
      draw(act.geoLocation || '', 430, y, { size: 6.5, color: rgb(0.4, 0.4, 0.4) });
      y -= 11;

      draw(approver.email, 170, y, { size: 6, color: rgb(0.4, 0.4, 0.4) });
      if (act.ipAddress) {
        draw('IP: ' + String(act.ipAddress), 330, y, { size: 5.5, color: rgb(0.5, 0.5, 0.5) });
      }
      y -= 11;

      if (act.reason) {
        draw('Reason: "' + String(act.reason) + '"', 170, y, { size: 6.5, color: rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }

      drawLine(y + 4, rgb(0.9, 0.9, 0.9));
      y -= 6;
    }

    y -= 10;
    drawLine(y);
    y -= 20;

    // ====== SHA-256 AUDIT LEDGER ======
    draw('SHA-256 CRYPTOGRAPHIC AUDIT LEDGER', 50, y, { size: 10, bold: true, color: rgb(0.106, 0.161, 0.235) });
    y -= 5;
    draw('Each entry is cryptographically linked to the previous, forming an immutable chain of custody.', 50, y - 8, { size: 6.5, color: rgb(0.5, 0.5, 0.5) });
    y -= 22;

    drawBox(50, y - 2, 512, 13, rgb(0.94, 0.94, 0.94));
    draw('#', 55, y, { size: 6.5, bold: true });
    draw('Event', 70, y, { size: 6.5, bold: true });
    draw('SHA-256 Hash', 145, y, { size: 6.5, bold: true });
    y -= 15;

    for (const entry of ledgerEntries) {
      if (y < 80) {
        draw('... continued on next page', 50, y, { size: 7, color: rgb(0.5, 0.5, 0.5) });
        break;
      }

      const seq = String(entry.sequenceNumber || '');
      const entryAction = String(entry.action || '');
      const hash = String(entry.hash || '');
      const prevHash = String(entry.previousHash || 'GENESIS');

      draw(seq, 55, y, { size: 6 });
      draw(entryAction, 70, y, { size: 6, bold: true });

      draw('Hash:', 145, y, { size: 5.5, bold: true, color: rgb(0.4, 0.4, 0.4) });
      draw(hash, 170, y, { size: 5, mono: true, color: rgb(0.2, 0.2, 0.2) });
      y -= 9;

      draw('Prev:', 145, y, { size: 5.5, bold: true, color: rgb(0.6, 0.6, 0.6) });
      draw(prevHash === 'GENESIS' ? 'GENESIS (first entry)' : prevHash, 170, y, { size: 5, mono: true, color: rgb(0.5, 0.5, 0.5) });
      y -= 9;

      if (entry !== ledgerEntries[ledgerEntries.length - 1]) {
        draw('|', 58, y + 2, { size: 7, color: rgb(0.7, 0.7, 0.7) });
      }
      y -= 5;
    }

    drawLine(62, rgb(0.106, 0.161, 0.235), 1);
    draw('This document was generated by Agora and verified against an immutable SHA-256 hash-chained audit ledger.', 50, 48, { size: 6.5, color: rgb(0.4, 0.4, 0.4) });
    draw('Any modification to this document or its approval chain can be detected by recalculating the hash chain.', 50, 38, { size: 6.5, color: rgb(0.5, 0.5, 0.5) });

  } catch (error) {
    console.error('Audit page generation error:', error);
  }
}