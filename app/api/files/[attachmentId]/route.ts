import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOADS_DIR = '/app/uploads';

// GET — serve a file by attachment ID
export async function GET(
  request: Request,
  { params }: { params: { attachmentId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const attachment = await db.fileAttachment.findUnique({
    where: { id: params.attachmentId },
  });

  if (!attachment) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const filePath = path.join(UPLOADS_DIR, attachment.path);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File missing from storage' }, { status: 404 });
  }

  const buffer = await readFile(filePath);

  const { searchParams } = new URL(request.url);
  const download = searchParams.get('download') === 'true';

  return new Response(buffer, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'Content-Disposition': download
        ? `attachment; filename="${attachment.originalName}"`
        : `inline; filename="${attachment.originalName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}