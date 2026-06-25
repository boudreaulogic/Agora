import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { evaluateFormula } from '@/lib/formula';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; columnId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, type, settings, width, order, formula, linkedTableId, linkedDisplayColumnId, required, showInNewRow, lookupLinkedColumnId, lookupFieldId, rollupLinkedColumnId, rollupFieldId, rollupFunction } = body;

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const column = await db.agoraColumn.findUnique({
    where: { id: params.columnId },
    include: { table: true },
  });

  if (!column || column.tableId !== params.id) {
    return NextResponse.json({ error: 'Column not found' }, { status: 404 });
  }

  // Validate formula if changing to formula type
  if (type === 'formula') {
    if (!formula || !formula.trim()) {
      return NextResponse.json({ error: 'Formula is required for formula columns' }, { status: 400 });
    }

    // Test parse the formula to validate syntax
    try {
      // Get table columns to validate column references
      const columns = await db.agoraColumn.findMany({
        where: { tableId: params.id },
        select: { id: true, name: true, type: true },
      });

      // Try to evaluate with empty row data to check for syntax errors
      const testResult = evaluateFormula(formula, {}, columns);
      
      if (!testResult.success) {
        return NextResponse.json({ 
          error: `Invalid formula: ${testResult.error}` 
        }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json({ 
        error: `Formula validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, { status: 400 });
    }
  }

  // Validate linked table if changing to linked_record type
  if (type === 'linked_record') {
    if (!linkedTableId || !linkedTableId.trim()) {
      return NextResponse.json({ error: 'Linked table is required for linked record columns' }, { status: 400 });
    }

    // Verify the linked table exists
    const linkedTable = await db.agoraTable.findUnique({
      where: { id: linkedTableId },
    });

    if (!linkedTable) {
      return NextResponse.json({ error: 'Linked table not found' }, { status: 404 });
    }

    // If changing linked table, delete all existing links
    if (column.linkedTableId && column.linkedTableId !== linkedTableId) {
      await db.linkedRecord.deleteMany({
        where: { columnId: params.columnId },
      });
    }
  }
  
  // Block editing system columns
  if (column.type === 'approval_status') {
    // Only allow width and position changes on approval columns
    var allowed: any = {};
    if (width !== undefined) allowed.width = width;
    if (order !== undefined) allowed.order = order;
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'The Approval Status column cannot be modified' }, { status: 403 });
    }
    var updated = await db.agoraColumn.update({ where: { id: params.columnId }, data: allowed });
    return NextResponse.json(updated);
  }
  if (column.type === 'attachment') {
    var allowed2: any = {};
    if (width !== undefined) allowed2.width = width;
    if (order !== undefined) allowed2.order = order;
    if (Object.keys(allowed2).length === 0) {
      return NextResponse.json({ error: 'The system Attachments column cannot be modified' }, { status: 403 });
    }
    var updated2 = await db.agoraColumn.update({ where: { id: params.columnId }, data: allowed2 });
    return NextResponse.json(updated2);
  }

  // Build update object with only provided fields
  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (type !== undefined) updateData.type = type;
  if (settings !== undefined) updateData.settings = settings;
  if (width !== undefined) updateData.width = width;
  if (order !== undefined) updateData.order = order;
  if (required !== undefined) updateData.required = required;
  if (showInNewRow !== undefined) updateData.showInNewRow = showInNewRow;
  if (body.agoraOnly !== undefined) {
    var existingSpConfig = column.sharePointConfig as any || {};
    updateData.sharePointConfig = Object.assign({}, existingSpConfig, { agoraOnly: body.agoraOnly });
  }
  
  // Handle formula field
  if (type === 'formula') {
    updateData.formula = formula;
  } else if (type !== undefined && type !== 'formula') {
    // Clear formula if changing away from formula type
    updateData.formula = null;
  }

  // Handle linkedTableId field
  if (type === 'linked_record') {
    updateData.linkedTableId = linkedTableId;
    if (linkedDisplayColumnId !== undefined) updateData.linkedDisplayColumnId = linkedDisplayColumnId;
  } else if (type !== undefined && type !== 'linked_record') {
    updateData.linkedTableId = null;
    if (column.type === 'linked_record') {
      await db.linkedRecord.deleteMany({
        where: { columnId: params.columnId },
      });
    }
  }

  // Handle lookup fields
  if (type === 'lookup') {
    if (lookupLinkedColumnId !== undefined) updateData.lookupLinkedColumnId = lookupLinkedColumnId;
    if (lookupFieldId !== undefined) updateData.lookupFieldId = lookupFieldId;
  } else if (type !== undefined && type !== 'lookup') {
    updateData.lookupLinkedColumnId = null;
    updateData.lookupFieldId = null;
  }

  // Handle rollup fields
  if (type === 'rollup') {
    if (rollupLinkedColumnId !== undefined) updateData.rollupLinkedColumnId = rollupLinkedColumnId;
    if (rollupFieldId !== undefined) updateData.rollupFieldId = rollupFieldId;
    if (rollupFunction !== undefined) updateData.rollupFunction = rollupFunction;
  } else if (type !== undefined && type !== 'rollup') {
    updateData.rollupLinkedColumnId = null;
    updateData.rollupFieldId = null;
    updateData.rollupFunction = null;
  }

  const updatedColumn = await db.agoraColumn.update({
    where: { id: params.columnId },
    data: updateData,
  });

  return NextResponse.json(updatedColumn);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; columnId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { getTablePermission } = await import('@/lib/tablePermissions');
  const permission = await getTablePermission(session.user.id, params.id);
  if (!permission || permission === 'viewer' || permission === 'editor') {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const column = await db.agoraColumn.findUnique({
    where: { id: params.columnId },
    include: { table: true },
  });

  if (!column || column.tableId !== params.id) {
    return NextResponse.json({ error: 'Column not found' }, { status: 404 });
  }

  // Prevent deletion of system columns
  if (column.type === 'attachment') {
    return NextResponse.json({ error: 'Cannot delete the Attachments column' }, { status: 403 });
  }

  // Prevent deletion of approval column
  if (column.type === 'approval_status') {
    return NextResponse.json({ error: 'Cannot delete the Approval Status column. Delete the approval workflow to remove it.' }, { status: 403 });
  }

  // Prevent deletion of booking system columns
  if ((column.settings as any)?.bookingRole && (column.settings as any)?.isSystem) {
    return NextResponse.json({ error: 'This column is part of the Booking System and cannot be deleted. Uninstall the Booking System from the Marketplace to remove it.' }, { status: 403 });
  }

  // Delete all linked records associated with this column
  if (column.type === 'linked_record') {
    await db.linkedRecord.deleteMany({
      where: { columnId: params.columnId },
    });
  }

  await db.agoraColumn.delete({
    where: { id: params.columnId },
  });

  return NextResponse.json({ success: true });
}