import { db } from '@/lib/db';

async function addSharingPermissions() {
  console.log('🔐 Adding table sharing permissions...');

  const permissions = [
    {
      name: 'Share Tables',
      slug: 'tables.share',
      category: 'tables',
      description: 'Can share tables with other users, roles, or groups',
    },
    {
      name: 'View Shared Tables',
      slug: 'tables.view_shared',
      category: 'tables',
      description: 'Can view tables that have been shared with them',
    },
    {
      name: 'Edit Shared Tables',
      slug: 'tables.edit_shared',
      category: 'tables',
      description: 'Can edit tables that have been shared with them',
    },
    {
      name: 'Manage Shared Tables',
      slug: 'tables.manage_shared',
      category: 'tables',
      description: 'Can manage sharing settings on tables shared with them',
    },
  ];

  for (const perm of permissions) {
    const existing = await db.permission.findUnique({
      where: { slug: perm.slug },
    });

    if (!existing) {
      await db.permission.create({ data: perm });
      console.log(`✅ Created permission: ${perm.slug}`);
    } else {
      console.log(`⏭️  Permission already exists: ${perm.slug}`);
    }
  }

  // Add all new permissions to Ogiima role
  const ogiima = await db.role.findUnique({
    where: { slug: 'ogiima' },
    include: { permissions: true },
  });

  if (ogiima) {
    for (const perm of permissions) {
      const permission = await db.permission.findUnique({
        where: { slug: perm.slug },
      });

      if (permission) {
        const hasPermission = ogiima.permissions.some(
          (rp) => rp.permissionId === permission.id
        );

        if (!hasPermission) {
          await db.rolePermission.create({
            data: {
              roleId: ogiima.id,
              permissionId: permission.id,
            },
          });
          console.log(`✅ Added ${perm.slug} to Ogiima role`);
        }
      }
    }
  }

  console.log('✅ All sharing permissions added!');
}

addSharingPermissions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });