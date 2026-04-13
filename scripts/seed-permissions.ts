#!/usr/bin/env tsx

import { db } from '../src/lib/db';

async function main() {
  console.log('🌱 Seeding roles and permissions...\n');

  // ========================================
  // CREATE PERMISSIONS
  // ========================================
  
  const permissionsData = [
    // User Management
    { name: 'View Users', slug: 'users.view', category: 'users', description: 'Can view user list' },
    { name: 'Create Users', slug: 'users.create', category: 'users', description: 'Can create new users' },
    { name: 'Edit Users', slug: 'users.edit', category: 'users', description: 'Can edit user details' },
    { name: 'Delete Users', slug: 'users.delete', category: 'users', description: 'Can delete users' },
    { name: 'Manage User Roles', slug: 'users.manage_roles', category: 'users', description: 'Can assign roles to users' },
    
    // Role Management
    { name: 'View Roles', slug: 'roles.view', category: 'roles', description: 'Can view roles' },
    { name: 'Create Roles', slug: 'roles.create', category: 'roles', description: 'Can create custom roles' },
    { name: 'Edit Roles', slug: 'roles.edit', category: 'roles', description: 'Can edit roles' },
    { name: 'Delete Roles', slug: 'roles.delete', category: 'roles', description: 'Can delete custom roles' },
    
    // Group Management
    { name: 'View Groups', slug: 'groups.view', category: 'groups', description: 'Can view groups' },
    { name: 'Create Groups', slug: 'groups.create', category: 'groups', description: 'Can create groups' },
    { name: 'Edit Groups', slug: 'groups.edit', category: 'groups', description: 'Can edit groups' },
    { name: 'Delete Groups', slug: 'groups.delete', category: 'groups', description: 'Can delete groups' },
    { name: 'Manage Group Members', slug: 'groups.manage_members', category: 'groups', description: 'Can add/remove group members' },
    
    // System
    { name: 'View Audit Logs', slug: 'system.view_audit_logs', category: 'system', description: 'Can view audit logs' },
    { name: 'Manage Settings', slug: 'system.manage_settings', category: 'system', description: 'Can manage system settings' },
  ];

  console.log('Creating permissions...');
  for (const perm of permissionsData) {
    await db.permission.upsert({
      where: { slug: perm.slug },
      update: perm,
      create: perm,
    });
    console.log(`  ✓ ${perm.name}`);
  }

  // ========================================
  // CREATE ROLES
  // ========================================
  
  console.log('\nCreating roles...');

  // Super Admin - Has EVERYTHING
  const superAdminRole = await db.role.upsert({
    where: { slug: 'super_admin' },
    update: {},
    create: {
      name: 'Super Admin',
      slug: 'super_admin',
      description: 'Full system access - can do everything',
      isSystem: true,
    },
  });
  console.log('  ✓ Super Admin');

  // Moderator - User management + view others
  const moderatorRole = await db.role.upsert({
    where: { slug: 'moderator' },
    update: {},
    create: {
      name: 'Moderator',
      slug: 'moderator',
      description: 'Can manage users and groups',
      isSystem: true,
    },
  });
  console.log('  ✓ Moderator');

  // User - Basic permissions
  const userRole = await db.role.upsert({
    where: { slug: 'user' },
    update: {},
    create: {
      name: 'User',
      slug: 'user',
      description: 'Standard user with basic permissions',
      isSystem: true,
    },
  });
  console.log('  ✓ User');

  // ========================================
  // ASSIGN PERMISSIONS TO ROLES
  // ========================================
  
  console.log('\nAssigning permissions to roles...');

  // Get all permissions
  const allPermissions = await db.permission.findMany();

  // Super Admin gets EVERYTHING
  console.log('  → Super Admin: ALL permissions');
  for (const perm of allPermissions) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Moderator gets user and group management
  const moderatorPerms = allPermissions.filter(p => 
    p.category === 'users' || p.category === 'groups'
  );
  console.log(`  → Moderator: ${moderatorPerms.length} permissions`);
  for (const perm of moderatorPerms) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: moderatorRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: moderatorRole.id,
        permissionId: perm.id,
      },
    });
  }

  // User gets basic view permissions
  const userPerms = allPermissions.filter(p => p.slug.includes('.view'));
  console.log(`  → User: ${userPerms.length} permissions`);
  for (const perm of userPerms) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: userRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: userRole.id,
        permissionId: perm.id,
      },
    });
  }

  console.log('\n✅ Seeding complete!\n');
  
  await db.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});