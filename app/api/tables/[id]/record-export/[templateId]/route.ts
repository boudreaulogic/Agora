import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const TEMPLATES_DIR = '/app/uploads/templates';

// GET — get template details + extracted fields
export async function GET(
  request: Request,
  { params }: { params: { id: string; templateId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const template = await db.recordExportTemplate.findUnique({
    where: { id: params.templateId },
  });

  if (!template || template.tableId !== params.id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Re-extract fields from PDF
  let extractedFields: any[] = [];
  const filePath = path.join(TEMPLATES_DIR, template.templatePath);
  if (existsSync(filePath)) {
    try {
      const buffer = await readFile(filePath);
      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      extractedFields = fields.map(field => ({
        name: field.getName(),
        type: field.constructor.name.replace('PDF', '').replace('Field', '').toLowerCase(),
      }));
    } catch {}
  }

  return NextResponse.json({ template, extractedFields });
}

// PATCH — update field mappings and settings
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; templateId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const template = await db.recordExportTemplate.findUnique({
    where: { id: params.templateId },
  });

  if (!template || template.tableId !== params.id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, fieldMappings, includeAuditPage, filenameColumnId } = body;

  const updated = await db.recordExportTemplate.update({
    where: { id: params.templateId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(fieldMappings !== undefined && { fieldMappings }),
      ...(includeAuditPage !== undefined && { includeAuditPage }),
      ...(filenameColumnId !== undefined && { filenameColumnId }),
    },
  });

  return NextResponse.json({ template: updated });
}

// DELETE — remove template and file
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; templateId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const template = await db.recordExportTemplate.findUnique({
    where: { id: params.templateId },
  });

  if (!template || template.tableId !== params.id) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Delete file
  const filePath = path.join(TEMPLATES_DIR, template.templatePath);
  try { await unlink(filePath); } catch {}

  // Delete record
  await db.recordExportTemplate.delete({ where: { id: params.templateId } });

  return NextResponse.json({ success: true });
}