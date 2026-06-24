import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getTablePermission } from '@/lib/tablePermissions';

const UPLOADS_DIR = '/app/uploads';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
];

// POST — upload a file
export async function POST(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const perm = await getTablePermission(session.user.id, params.id);
  if (!perm || perm === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const columnId = formData.get('columnId') as string;

    if (!file || !columnId) {
      return NextResponse.json({ error: 'File and columnId required' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed.' }, { status: 400 });
    }

    // Double-check extension matches — prevents MIME spoofing
    var BLOCKED_EXTENSIONS = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.php', '.py', '.sh', '.bat', '.cmd', '.exe', '.msi', '.scr'];
    var fileExt = path.extname(file.name).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(fileExt)) {
      return NextResponse.json({ error: 'File extension not allowed.' }, { status: 400 });
    }

    // Verify row exists and belongs to table
    const row = await db.agoraRow.findUnique({ where: { id: params.rowId } });
    if (!row || row.tableId !== params.id) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    // Create table-specific upload directory
    const tableDir = path.join(UPLOADS_DIR, params.id);
    if (!existsSync(tableDir)) {
      await mkdir(tableDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(file.name) || '';
    const uniqueName = crypto.randomUUID() + ext;
    const filePath = path.join(tableDir, uniqueName);
    const relativePath = `${params.id}/${uniqueName}`;

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Save metadata to database
    const attachment = await db.fileAttachment.create({
      data: {
        tableId: params.id,
        rowId: params.rowId,
        columnId,
        filename: uniqueName,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        path: relativePath,
        uploadedById: session.user.id,
      },
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// GET — list attachments for a row
export async function GET(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const permGet = await getTablePermission(session.user.id, params.id);
  if (!permGet) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rowCheckG = await db.agoraRow.findUnique({ where: { id: params.rowId }, select: { tableId: true } });
  if (!rowCheckG || rowCheckG.tableId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const columnId = searchParams.get('columnId');

  const where: any = { tableId: params.id, rowId: params.rowId };
  if (columnId) where.columnId = columnId;

  const attachments = await db.fileAttachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ attachments });
}

// DELETE — delete an attachment
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; rowId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const permDel = await getTablePermission(session.user.id, params.id);
  if (!permDel || permDel === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('attachmentId');

  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  }

  const attachment = await db.fileAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.tableId !== params.id) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Delete file from disk
  const filePath = path.join(UPLOADS_DIR, attachment.path);
  try {
    const { unlink } = await import('fs/promises');
    await unlink(filePath);
  } catch {}

  // Delete metadata
  await db.fileAttachment.delete({ where: { id: attachmentId } });

  return NextResponse.json({ success: true });
}