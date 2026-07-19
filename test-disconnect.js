const { io } = require('socket.io-client');

const SERVER_URL = 'http://127.0.0.1:3001';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
  const caller = io(SERVER_URL);
  const receiver = io(SERVER_URL);
  
  await new Promise(r => {
    let connected = 0;
    const onConnect = () => { if (++connected === 2) r(); };
    caller.on('connect', onConnect);
    receiver.on('connect', onConnect);
  });
  
  caller.emit('register', { userId: 'caller_123' });
  receiver.emit('register', { userId: 'receiver_456' });
  
  await delay(500);

  console.log("\n[Test] Network disconnect during ringing");
  caller.emit('call-request', { targetId: 'receiver_456', callerData: { username: 'Caller1', type: 'audio' } });
  
  let callEndedReceived = false;
  caller.once('call-ended', () => callEndedReceived = true);
  
  await delay(500);
  console.log("Disconnecting receiver");
  receiver.disconnect();
  await delay(1000);
  
  if (callEndedReceived) {
    console.log("✅ PASS: Caller was notified via call-ended when receiver disconnected");
  } else {
    console.log("❌ FAIL: Caller was not notified when receiver disconnected");
  }
  
  caller.disconnect();
}

runTests();
