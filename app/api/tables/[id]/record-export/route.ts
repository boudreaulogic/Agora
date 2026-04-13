import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';

const TEMPLATES_DIR = '/app/uploads/templates';

// GET — list templates for a table
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templates = await db.recordExportTemplate.findMany({
    where: { tableId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ templates });
}

// POST — upload a new template PDF and extract fields
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = (formData.get('name') as string) || 'Default Template';
    const description = formData.get('description') as string || null;

    if (!file) {
      return NextResponse.json({ error: 'PDF file required' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    // Create templates directory
    if (!existsSync(TEMPLATES_DIR)) {
      await mkdir(TEMPLATES_DIR, { recursive: true });
    }

    // Save PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const uniqueName = crypto.randomUUID() + '.pdf';
    const filePath = path.join(TEMPLATES_DIR, uniqueName);
    await writeFile(filePath, buffer);

    // Extract form fields from PDF
    const pdfDoc = await PDFDocument.load(buffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const extractedFields = fields.map(field => ({
      name: field.getName(),
      type: field.constructor.name.replace('PDF', '').replace('Field', '').toLowerCase(),
    }));

    // Create template record
    const template = await db.recordExportTemplate.create({
      data: {
        tableId: params.id,
        name,
        description,
        templatePath: uniqueName,
        originalFilename: file.name,
        fieldMappings: [],
        includeAuditPage: true,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({
      template,
      extractedFields,
    });
  } catch (error: any) {
    console.error('Template upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}