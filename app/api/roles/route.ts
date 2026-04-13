import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await db.role.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ roles });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = await db.userRole.findMany({
    where: { userId: session.user.id },
    include: { 
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    },
  });
  const canCreateRoles = userRoles.some(ur => 
    ur.role.permissions.some(rp => rp.permission.slug === 'roles.create')
  );
  if (!canCreateRoles) {
    return NextResponse.json({ error: 'Forbidden - Missing roles.create permission' }, { status: 403 });
  }
  try {
    const { name, slug, description, permissionIds } = await request.json();
    const role = await db.role.create({
      data: {
        name,
        slug,
        description,
        isSystem: false,
      },
    });
    if (permissionIds && permissionIds.length > 0) {
      await db.rolePermission.createMany({
        data: permissionIds.map((permissionId: string) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }
    return NextResponse.json({ success: true, role });
  } catch (error: any) {
    console.error('Error creating role:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}