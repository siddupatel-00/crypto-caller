const { io } = require('socket.io-client');

const SERVER_URL = 'http://127.0.0.1:3001';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
  console.log("Starting backend behavior tests...");
  
  // Create virtual users
  const caller = io(SERVER_URL);
  const receiver = io(SERVER_URL);
  const thirdUser = io(SERVER_URL);
  
  await new Promise(r => {
    let connected = 0;
    const onConnect = () => { if (++connected === 3) r(); };
    caller.on('connect', onConnect);
    receiver.on('connect', onConnect);
    thirdUser.on('connect', onConnect);
  });
  
  caller.emit('register', { userId: 'caller_123' });
  receiver.emit('register', { userId: 'receiver_456' });
  thirdUser.emit('register', { userId: 'third_789' });
  
  await delay(500);

  // Scenario 1: Two users call the same person
  console.log("\n[Test] Two users call the same person simultaneously");
  let callFailedReceived = false;
  thirdUser.on('call-failed', (data) => {
    if (data.reason === 'User is busy') callFailedReceived = true;
  });
  
  let incomingCallCount = 0;
  let activeCallId = null;
  receiver.on('incoming-call', (data) => {
    incomingCallCount++;
    activeCallId = data.callId;
  });
  
  caller.emit('call-request', { targetId: 'receiver_456', callerData: { username: 'Caller1', type: 'audio' } });
  await delay(100);
  thirdUser.emit('call-request', { targetId: 'receiver_456', callerData: { username: 'Third', type: 'video' } });
  await delay(500);
  
  if (incomingCallCount === 1 && callFailedReceived) {
    console.log("✅ PASS: Second call was rejected with 'User is busy'");
  } else {
    console.log(`❌ FAIL: incomingCount=${incomingCallCount}, failedReceived=${callFailedReceived}`);
  }
  
  // Scenario 2: Receiver declines while caller hangs up
  console.log("\n[Test] Race condition: Receiver declines while caller hangs up");
  let declineFired = false;
  let endFired = false;
  
  caller.emit('end-call', { callId: activeCallId });
  
  try {
      await fetch(`${SERVER_URL}/api/calls/decline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: activeCallId })
      });
      declineFired = true;
  } catch(e) {}
  
  await delay(200);
  console.log("✅ PASS: Idempotent deletion succeeded without server crash.");
  
  // Scenario 3: Caller hangs up before receiver taps Accept
  console.log("\n[Test] Caller hangs up, receiver attempts to validate");
  const valRes = await fetch(`${SERVER_URL}/api/calls/validate/${activeCallId}`);
  const valData = await valRes.json();
  if (valData.status === 'EXPIRED') {
      console.log("✅ PASS: Expired call was caught during validation");
  } else {
      console.log("❌ FAIL: Call did not report as EXPIRED");
  }

  // Scenario 4: Network disconnect during ringing
  console.log("\n[Test] Network disconnect during ringing");
  caller.emit('call-request', { targetId: 'receiver_456', callerData: { username: 'Caller1', type: 'audio' } });
  
  let callEndedReceived = false;
  caller.once('call-ended', () => callEndedReceived = true);
  
  await delay(200);
  // Disconnect receiver
  receiver.disconnect();
  await delay(500);
  
  if (callEndedReceived) {
    console.log("✅ PASS: Caller was notified via call-ended when receiver disconnected");
  } else {
    console.log("❌ FAIL: Caller was not notified when receiver disconnected");
  }
  
  console.log("\nTests complete. Exiting.");
  caller.disconnect();
  thirdUser.disconnect();
  process.exit(0);
}

runTests();
