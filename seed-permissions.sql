-- Table Management Permissions
INSERT INTO permissions (id, name, slug, category, description, "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'View Tables', 'tables.view', 'Tables', 'Can view tables', NOW(), NOW()),
(gen_random_uuid(), 'Create Tables', 'tables.create', 'Tables', 'Can create new tables', NOW(), NOW()),
(gen_random_uuid(), 'Edit Tables', 'tables.edit', 'Tables', 'Can edit tables', NOW(), NOW()),
(gen_random_uuid(), 'Delete Tables', 'tables.delete', 'Tables', 'Can delete tables', NOW(), NOW());

-- User Management Permissions
INSERT INTO permissions (id, name, slug, category, description, "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'View Users', 'users.view', 'Users', 'Can view users', NOW(), NOW()),
(gen_random_uuid(), 'Create Users', 'users.create', 'Users', 'Can create new users', NOW(), NOW()),
(gen_random_uuid(), 'Edit Users', 'users.edit', 'Users', 'Can edit users', NOW(), NOW()),
(gen_random_uuid(), 'Delete Users', 'users.delete', 'Users', 'Can delete users', NOW(), NOW());

-- Role Management Permissions
INSERT INTO permissions (id, name, slug, category, description, "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'View Roles', 'roles.view', 'Roles', 'Can view roles', NOW(), NOW()),
(gen_random_uuid(), 'Create Roles', 'roles.create', 'Roles', 'Can create new roles', NOW(), NOW()),
(gen_random_uuid(), 'Edit Roles', 'roles.edit', 'Roles', 'Can edit roles', NOW(), NOW()),
(gen_random_uuid(), 'Delete Roles', 'roles.delete', 'Roles', 'Can delete roles', NOW(), NOW());

-- Group Management Permissions
INSERT INTO permissions (id, name, slug, category, description, "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'View Groups', 'groups.view', 'Groups', 'Can view groups', NOW(), NOW()),
(gen_random_uuid(), 'Create Groups', 'groups.create', 'Groups', 'Can create new groups', NOW(), NOW()),
(gen_random_uuid(), 'Edit Groups', 'groups.edit', 'Groups', 'Can edit groups', NOW(), NOW()),
(gen_random_uuid(), 'Delete Groups', 'groups.delete', 'Groups', 'Can delete groups', NOW(), NOW());

-- Admin Permissions
INSERT INTO permissions (id, name, slug, category, description, "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'Access Admin Panel', 'admin.access', 'Admin', 'Can access admin panel', NOW(), NOW()),
(gen_random_uuid(), 'View Audit Logs', 'admin.audit_logs', 'Admin', 'Can view audit logs', NOW(), NOW());