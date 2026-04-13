import { auth } from '@/lib/auth';
import { authenticateApiRequest, hasTableAccess, hasPermission } from '@/lib/apiAuth';
import { NextResponse } from 'next/server';
import type { ApiAuthResult } from '@/lib/apiAuth';

export interface AuthContext {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  source: 'session' | 'apikey';
  apiKeyAuth?: ApiAuthResult;
}

/**
 * Authenticate a request using either session (browser) or API key (scripts).
 * Tries session first, falls back to API key.
 * 
 * For API key auth, also checks table scope and permission level.
 * 
 * Returns AuthContext on success, or NextResponse error on failure.
 */
export async function authenticateRequest(
  request: Request,
  tableId: string,
  requiredPermission: 'read' | 'write'
): Promise<AuthContext | NextResponse> {
  // Try session auth first (browser requests)
  var session = await auth();
  if (session?.user) {
    return {
      userId: session.user.id,
      userName: session.user.name || null,
      userEmail: session.user.email || null,
      source: 'session',
    };
  }

  // Try API key auth (script/external requests)
  var authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer agora_live_')) {
    var apiResult = await authenticateApiRequest(request);

    // If authenticateApiRequest returned a NextResponse, it's an error
    if (apiResult instanceof NextResponse) {
      return apiResult;
    }

    // Check table scope
    if (!hasTableAccess(apiResult, tableId)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'API key does not have access to this table' } },
        { status: 403 }
      );
    }

    // Check permission level
    var action = requiredPermission === 'write' ? 'write' as const : 'read' as const;
    if (!hasPermission(apiResult, action)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'API key does not have ' + requiredPermission + ' permission' } },
        { status: 403 }
      );
    }

    return {
      userId: apiResult.userId,
      userName: null,
      userEmail: null,
      source: 'apikey',
      apiKeyAuth: apiResult,
    };
  }

  // Neither session nor API key
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}