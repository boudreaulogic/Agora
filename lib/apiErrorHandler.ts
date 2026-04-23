import { NextResponse } from 'next/server';

// Wraps an API handler to catch errors and return safe responses
// In production, never leak stack traces, Prisma error details, or file paths
export function withErrorHandler(handler: Function) {
  return async function(req: Request, ctx?: any) {
    try {
      return await handler(req, ctx);
    } catch (error: any) {
      var isDev = process.env.NODE_ENV !== 'production';

      // Log the full error server-side
      console.error('[API Error]', error);

      // Prisma-specific errors — return safe messages
      if (error?.code === 'P2025') {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }
      if (error?.code === 'P2002') {
        return NextResponse.json({ error: 'A record with this value already exists' }, { status: 409 });
      }
      if (error?.code === 'P2003') {
        return NextResponse.json({ error: 'Referenced record not found' }, { status: 400 });
      }

      // In development, return the actual error message
      if (isDev) {
        return NextResponse.json(
          { error: error.message || 'Internal server error', stack: error.stack },
          { status: 500 }
        );
      }

      // In production, return a generic message
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}