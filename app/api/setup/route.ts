import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';

// POST /api/setup — first-run setup: create admin + seed permissions
export async function POST(request: Request) {
  // CRITICAL: Only works when NO users exist
  const userCount = await db.user.count();
  if (userCount > 0) {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
  }

  const { name, email, password } = await request.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(', ') }, { status: 400 });
  }

  try {
    // ================================================================
    // STEP 1: Seed all permissions
    // ================================================================
    const permissionsData = [
      { name: 'View Users', slug: 'users.view', category: 'users', description: 'Can view user list' },
      { name: 'Create Users', slug: 'users.create', category: 'users', description: 'Can create new users' },
      { name: 'Edit Users', slug: 'users.edit', category: 'users', description: 'Can edit user details' },
      { name: 'Delete Users', slug: 'users.delete', category: 'users', description: 'Can delete users' },
      { name: 'Manage User Roles', slug: 'users.manage_roles', category: 'users', description: 'Can assign roles to users' },
      { name: 'View Roles', slug: 'roles.view', category: 'roles', description: 'Can view roles' },
      { name: 'Create Roles', slug: 'roles.create', category: 'roles', description: 'Can create custom roles' },
      { name: 'Edit Roles', slug: 'roles.edit', category: 'roles', description: 'Can edit roles' },
      { name: 'Delete Roles', slug: 'roles.delete', category: 'roles', description: 'Can delete custom roles' },
      { name: 'View Groups', slug: 'groups.view', category: 'groups', description: 'Can view groups' },
      { name: 'Create Groups', slug: 'groups.create', category: 'groups', description: 'Can create groups' },
      { name: 'Edit Groups', slug: 'groups.edit', category: 'groups', description: 'Can edit groups' },
      { name: 'Delete Groups', slug: 'groups.delete', category: 'groups', description: 'Can delete groups' },
      { name: 'Manage Group Members', slug: 'groups.manage_members', category: 'groups', description: 'Can add/remove group members' },
      { name: 'View Audit Logs', slug: 'system.view_audit_logs', category: 'system', description: 'Can view audit logs' },
      { name: 'Manage Settings', slug: 'system.manage_settings', category: 'system', description: 'Can manage system settings' },
      { name: 'Admin Panel Access', slug: 'admin.access', category: 'system', description: 'Access the admin panel' },
    ];

    for (const perm of permissionsData) {
      await db.permission.upsert({
        where: { slug: perm.slug },
        update: perm,
        create: perm,
      });
    }

    // ================================================================
    // STEP 2: Create roles
    // ================================================================
    const superAdminRole = await db.role.upsert({
      where: { slug: 'super_admin' },
      update: {},
      create: { name: 'Super Admin', slug: 'super_admin', description: 'Full system access', isSystem: true },
    });

    const adminRole = await db.role.upsert({
      where: { slug: 'admin' },
      update: {},
      create: { name: 'Admin', slug: 'admin', description: 'Administrative access', isSystem: true },
    });

    const moderatorRole = await db.role.upsert({
      where: { slug: 'moderator' },
      update: {},
      create: { name: 'Moderator', slug: 'moderator', description: 'Can manage users and groups', isSystem: true },
    });

    const userRole = await db.role.upsert({
      where: { slug: 'user' },
      update: {},
      create: { name: 'User', slug: 'user', description: 'Standard user', isSystem: true },
    });

    // ================================================================
    // STEP 3: Assign permissions to roles
    // ================================================================
    const allPermissions = await db.permission.findMany();

    // Super Admin gets everything
    for (const perm of allPermissions) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: superAdminRole.id, permissionId: perm.id },
      });
    }

    // Admin gets everything except system settings
    const adminPerms = allPermissions.filter(p => p.slug !== 'system.manage_settings');
    for (const perm of adminPerms) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: perm.id },
      });
    }

    // Moderator gets user and group management
    const modPerms = allPermissions.filter(p => p.category === 'users' || p.category === 'groups');
    for (const perm of modPerms) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: moderatorRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: moderatorRole.id, permissionId: perm.id },
      });
    }

    // User gets view permissions
    const viewPerms = allPermissions.filter(p => p.slug.includes('.view'));
    for (const perm of viewPerms) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: userRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: userRole.id, permissionId: perm.id },
      });
    }

    // ================================================================
    // STEP 4: Create the admin user
    // ================================================================
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: email.trim(),
        name: name.trim(),
        passwordHash,
        isActive: true,
        isEmailVerified: true,
      },
    });

    // Assign Super Admin role
    await db.userRole.create({
      data: { userId: user.id, roleId: superAdminRole.id },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'SYSTEM_SETUP',
        metadata: { email: user.email, setupComplete: true },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Setup complete! You can now sign in.',
    });
  } catch (error: any) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}