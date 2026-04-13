export async function wsBroadcast(tableId: string, message: any) {
  try {
    console.log(`[WS Broadcast] Sending ${message.type} to table ${tableId}`);
    const res = await fetch('http://ws-server:3001/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, tableId }),
    });
    const data = await res.json();
    console.log(`[WS Broadcast] Response:`, data);
  } catch (err) {
    console.error('[WS Broadcast] Failed:', err);
  }
}