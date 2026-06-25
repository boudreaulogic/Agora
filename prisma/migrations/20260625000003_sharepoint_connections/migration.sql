-- SharePoint per-list connection catalog (admin-curated) + Agora-level access.
-- End users only see the lists registered here that they are granted access to,
-- instead of every list in a whole-site app registration.

CREATE TABLE "sharepoint_list_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "siteUrl" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "listName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "visibleToAll" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "testStatus" TEXT NOT NULL DEFAULT 'unknown',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sharepoint_list_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sharepoint_list_connections_siteId_listId_key" ON "sharepoint_list_connections"("siteId", "listId");
CREATE INDEX "sharepoint_list_connections_createdById_idx" ON "sharepoint_list_connections"("createdById");

CREATE TABLE "sharepoint_connection_access" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "sharepoint_connection_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sharepoint_connection_access_connectionId_groupId_key" ON "sharepoint_connection_access"("connectionId", "groupId");
CREATE INDEX "sharepoint_connection_access_connectionId_idx" ON "sharepoint_connection_access"("connectionId");
CREATE INDEX "sharepoint_connection_access_groupId_idx" ON "sharepoint_connection_access"("groupId");

ALTER TABLE "sharepoint_connection_access" ADD CONSTRAINT "sharepoint_connection_access_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "sharepoint_list_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sharepoint_connection_access" ADD CONSTRAINT "sharepoint_connection_access_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
