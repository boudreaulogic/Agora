import { db } from '@/lib/db';
import { sendEmail, notificationEmail, APP_URL } from '@/lib/email';

export async function createNotification({
  userId,
  type,
  title,
  message,
  tableId,
  rowId,
  metadata,
  sendEmailNotification = true,
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  tableId?: string;
  rowId?: string;
  metadata?: any;
  sendEmailNotification?: boolean;
}) {
  // Create the notification record
  const notification = await db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      tableId: tableId || null,
      rowId: rowId || null,
      metadata: metadata || null,
    },
  });

  // Check user's notification settings for this table
  if (sendEmailNotification && tableId) {
    const settings = await db.tableNotificationSetting.findUnique({
      where: { tableId_userId: { tableId, userId } },
    });

    // If no settings exist, default to email enabled for approvals only
    const shouldEmail = settings
      ? settings.emailEnabled && shouldSendForType(settings, type)
      : type.startsWith('approval');

    if (shouldEmail) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        // For approvals, get the public URL and link to the token-based page
        let publicUrl = APP_URL;
        try {
          const pubSetting = await db.systemSetting.findUnique({ where: { key: 'public_url' } });
          if (pubSetting?.value) publicUrl = pubSetting.value;
        } catch {}

        let viewUrl = tableId ? `${APP_URL}/tables/${tableId}` : undefined;
        let html: string;

        if (type === 'approval_requested' && metadata?.token) {
          const approvalPageUrl = `${publicUrl}/approvals/${metadata.token}`;
          html = notificationEmail({
            recipientName: user.name || 'there',
            title,
            message,
            viewUrl: approvalPageUrl,
          });
        } else {
          html = notificationEmail({
            recipientName: user.name || 'there',
            title,
            message,
            viewUrl,
          });
        }

        await sendEmail({ to: user.email, subject: title, html });
        await db.notification.update({
          where: { id: notification.id },
          data: { emailSent: true },
        });
      }
    }
  }

  return notification;
}

function shouldSendForType(settings: any, type: string): boolean {
  switch (type) {
    case 'row_created': return settings.onRowCreated;
    case 'row_updated': return settings.onRowUpdated;
    case 'row_deleted': return settings.onRowDeleted;
    case 'comment_added': return settings.onCommentAdded;
    case 'form_submitted': return settings.onFormSubmission;
    case 'approval_requested': return settings.onApprovalRequest;
    case 'approval_completed': return settings.onApprovalComplete;
    default: return false;
  }
}

export async function notifyTableSubscribers({
  tableId,
  type,
  title,
  message,
  rowId,
  metadata,
  excludeUserId,
}: {
  tableId: string;
  type: string;
  title: string;
  message: string;
  rowId?: string;
  metadata?: any;
  excludeUserId?: string;
}) {
  const typeToKey: Record<string, string> = {
    'row_created': 'onRowCreated',
    'row_updated': 'onRowUpdated',
    'row_deleted': 'onRowDeleted',
    'comment_added': 'onCommentAdded',
    'form_submitted': 'onFormSubmission',
    'approval_requested': 'onApprovalRequest',
    'approval_completed': 'onApprovalComplete',
  };
  const settingsKey = typeToKey[type];

  const userIdsToNotify = new Set<string>();

  // 1. Self-subscribed users (existing behavior)
  const settings = await db.tableNotificationSetting.findMany({
    where: { tableId },
  });
  for (const setting of settings) {
    if (setting.userId === excludeUserId) continue;
    if (!shouldSendForType(setting, type)) continue;
    userIdsToNotify.add(setting.userId);
  }

  // 2. Admin force-subscribed users/groups/roles
  if (settingsKey) {
    const table = await db.agoraTable.findUnique({
      where: { id: tableId },
      select: { notificationTargets: true },
    });
    const targets = (table?.notificationTargets as any) || {};
    const eventTargets = targets[settingsKey] || [];

    for (const target of eventTargets) {
      if (target.userId) {
        if (target.userId !== excludeUserId) userIdsToNotify.add(target.userId);
      } else if (target.groupId) {
        const members = await db.groupMember.findMany({
          where: { groupId: target.groupId },
          select: { userId: true },
        });
        members.forEach(m => { if (m.userId !== excludeUserId) userIdsToNotify.add(m.userId); });
      } else if (target.roleId) {
        const members = await db.userRole.findMany({
          where: { roleId: target.roleId },
          select: { userId: true },
        });
        members.forEach(m => { if (m.userId !== excludeUserId) userIdsToNotify.add(m.userId); });
      }
    }
  }

  // 3. Check for personal mutes
  const notifications = [];
  for (const userId of userIdsToNotify) {
    const userSetting = settings.find(s => s.userId === userId);
    if (userSetting && settingsKey && (userSetting as any)[settingsKey] === false) {
      continue;
    }
    notifications.push(
      createNotification({
        userId,
        type,
        title,
        message,
        tableId,
        rowId,
        metadata,
      })
    );
  }

  return Promise.all(notifications);
}