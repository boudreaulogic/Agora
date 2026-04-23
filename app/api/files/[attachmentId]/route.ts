import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

var UPLOADS_DIR = '/app/uploads';

// GET — serve a file by attachment ID (with table permission check)
export async function GET(
  request: Request,
  { params }: { params: { attachmentId: string } }
) {
  var session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  var attachment = await db.fileAttachment.findUnique({
    where: { id: params.attachmentId },
  });

  if (!attachment) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // SECURITY FIX: Verify user has access to the table this file belongs to
  var { getTablePermission } = await import('@/lib/tablePermissions');
  var permission = await getTablePermission(session.user.id, attachment.tableId);
  if (!permission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  var filePath = path.join(UPLOADS_DIR, attachment.path);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File missing from storage' }, { status: 404 });
  }

  var buffer = await readFile(filePath);

  var { searchParams } = new URL(request.url);
  var download = searchParams.get('download') === 'true';

  return new Response(buffer, {
    headers: {
      'Content-Type': (attachment.mimeType === 'image/svg+xml' || attachment.mimeType === 'text/html' || attachment.mimeType === 'application/xhtml+xml' || attachment.mimeType === 'text/xml' || attachment.mimeType === 'application/xml') ? 'application/octet-stream' : attachment.mimeType,
      'Content-Length': String(attachment.size),
      'Content-Disposition': download
        ? 'attachment; filename="' + attachment.originalName + '"'
        : 'inline; filename="' + attachment.originalName + '"',
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}