export async function wsBroadcast(tableId: string, message: any) {
  try {
    var secret = process.env.BROADCAST_SECRET || process.env.NEXTAUTH_SECRET || '';
    console.log('[WS Broadcast] Sending ' + message.type + ' to table ' + tableId);
    var res = await fetch('http://ws-server:3001/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + secret,
      },
      body: JSON.stringify(Object.assign({}, message, { tableId: tableId })),
    });
    var data = await res.json();
    console.log('[WS Broadcast] Response:', data);
  } catch (err) {
    console.error('[WS Broadcast] Failed:', err);
  }
}