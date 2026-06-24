import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { APP_URL } from '@/lib/email';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimiter';

// GET /api/approvals/[token] — email-link entry point
// Validates the token exists and is still actionable, then redirects to the
// in-app approval page. Identity is established there via session auth.
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  var rl = checkRateLimit(request, 'read');
  if (!rl.allowed) return rateLimitResponse(rl);
  const approvalRequest = await db.approvalRequest.findUnique({
    where: { token: params.token },
  });

  if (!approvalRequest) return redirectWithMessage('Approval request not found');
  if (approvalRequest.status !== 'pending' && approvalRequest.status !== 'in_progress') {
    return redirectWithMessage(`This request has already been ${approvalRequest.status}`);
  }

  return Response.redirect(`${APP_URL}/approvals/${params.token}`, 302);
}

function redirectWithMessage(message: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agora</title></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
      <div style="background:white;border-radius:16px;padding:48px;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <p style="color:#374151;font-size:16px;">${message}</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:20px;color:#3b82f6;text-decoration:none;">Go to Agora →</a>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}
