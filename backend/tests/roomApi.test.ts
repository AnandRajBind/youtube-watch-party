import http from 'http';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { RoomModel } from '../src/models/Room';

async function request(
  server: http.Server,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const postData = body ? JSON.stringify(body) : '';

    const req = http.request(
      {
        host: 'localhost',
        port: addr.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: rawData, headers: res.headers });
          }
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runRoomApiTests() {
  console.log('--- Starting Room Management REST API Tests ---');
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const createdRoomCodes: string[] = [];

  try {
    // ----------------------------------------------------
    // TEST 1: POST /api/rooms (Successful room creation)
    // ----------------------------------------------------
    const createRes = await request(server, 'POST', '/api/rooms', {
      username: 'AliceHost',
      initialVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });

    if (createRes.status !== 201) {
      throw new Error(`Expected 201 Created but got ${createRes.status}: ${JSON.stringify(createRes.body)}`);
    }

    const { room, hostUser } = createRes.body.data;
    createdRoomCodes.push(room.roomCode);

    if (!room.roomCode || hostUser.role !== 'host') {
      throw new Error('Room creation did not assign host role or return room code');
    }

    // Verify no MongoDB internal leak
    if ((room as any)._id || (room as any).__v || (room as any).expiresAt) {
      throw new Error('Sensitive MongoDB internals leaked in POST /api/rooms response!');
    }
    console.log(`[PASS] POST /api/rooms successfully created room '${room.roomCode}' with host '${hostUser.username}'`);

    // ----------------------------------------------------
    // TEST 2: POST /api/rooms (Input validation failures)
    // ----------------------------------------------------
    const emptyUserRes = await request(server, 'POST', '/api/rooms', {
      username: ' ',
    });
    if (emptyUserRes.status !== 400 || emptyUserRes.body.error.code !== 'VALIDATION_ERROR') {
      throw new Error('Failed to reject whitespace username with 400 VALIDATION_ERROR');
    }
    console.log('[PASS] POST /api/rooms rejected empty username with 400 VALIDATION_ERROR');

    const invalidCharRes = await request(server, 'POST', '/api/rooms', {
      username: '<script>alert("hack")</script>',
    });
    if (invalidCharRes.status !== 400) {
      throw new Error('Failed to reject XSS injection in username');
    }
    console.log('[PASS] POST /api/rooms sanitized & rejected malicious characters in username');

    // ----------------------------------------------------
    // TEST 3: GET /api/rooms/:roomCode (Fetch safe room details)
    // ----------------------------------------------------
    const getRes = await request(server, 'GET', `/api/rooms/${room.roomCode}`);
    if (getRes.status !== 200) {
      throw new Error(`Expected 200 OK from GET /api/rooms/:roomCode, got ${getRes.status}`);
    }

    const fetchedRoom = getRes.body.data;
    if (
      fetchedRoom.roomCode !== room.roomCode ||
      (fetchedRoom as any)._id ||
      (fetchedRoom as any).__v ||
      (fetchedRoom as any).expiresAt
    ) {
      throw new Error('GET /api/rooms/:roomCode leaked MongoDB internals or returned wrong room');
    }
    console.log(`[PASS] GET /api/rooms/${room.roomCode} returned safe room details without DB internals`);

    // ----------------------------------------------------
    // TEST 4: GET /api/rooms/:roomCode (Invalid roomCode & 404)
    // ----------------------------------------------------
    const invalidFormatRes = await request(server, 'GET', '/api/rooms/invalid_code_123');
    if (invalidFormatRes.status !== 400) {
      throw new Error('GET with malformed room code did not return 400');
    }
    console.log('[PASS] GET /api/rooms/:roomCode rejected malformed roomCode with 400');

    const notFoundRes = await request(server, 'GET', '/api/rooms/ZZZ-999');
    if (notFoundRes.status !== 404 || notFoundRes.body.error.code !== 'ROOM_NOT_FOUND') {
      throw new Error('GET non-existent room did not return 404 ROOM_NOT_FOUND');
    }
    console.log('[PASS] GET /api/rooms/ZZZ-999 returned 404 ROOM_NOT_FOUND');

    // ----------------------------------------------------
    // TEST 5: POST /api/rooms/:roomCode/join (Join room via REST)
    // ----------------------------------------------------
    const joinRes = await request(server, 'POST', `/api/rooms/${room.roomCode}/join`, {
      username: 'BobParticipant',
    });

    if (joinRes.status !== 200) {
      throw new Error(`Expected 200 OK from join endpoint, got ${joinRes.status}: ${JSON.stringify(joinRes.body)}`);
    }

    const { participant, session, room: joinedRoom } = joinRes.body.data;
    if (participant.role !== 'participant' || session.role !== 'participant') {
      throw new Error('New joining user was not assigned participant role');
    }
    if (!session.userId || session.roomCode !== room.roomCode) {
      throw new Error('Join response did not include complete session metadata');
    }
    if ((joinedRoom as any)._id || (joinedRoom as any).__v) {
      throw new Error('Join response leaked MongoDB internal fields');
    }
    console.log(`[PASS] POST /api/rooms/${room.roomCode}/join joined 'BobParticipant' with role '${participant.role}' and valid session`);

    // ----------------------------------------------------
    // TEST 6: POST /api/rooms/:roomCode/join (Host Reconnect)
    // ----------------------------------------------------
    const hostReconnectRes = await request(server, 'POST', `/api/rooms/${room.roomCode}/join`, {
      username: 'AliceHost',
      userId: hostUser.userId,
    });
    if (hostReconnectRes.body.data.participant.role !== 'host') {
      throw new Error('Reconnecting host lost host role');
    }
    console.log('[PASS] POST /api/rooms/:roomCode/join preserved host role on host reconnect');

    console.log('--- ALL ROOM MANAGEMENT REST API TESTS PASSED ---');
  } finally {
    // Cleanup created rooms
    if (createdRoomCodes.length > 0) {
      await RoomModel.deleteMany({ roomCode: { $in: createdRoomCodes } });
    }
    server.close();
    await disconnectDatabase();
  }
}

runRoomApiTests().catch((err) => {
  console.error('REST API tests failed:', err);
  process.exit(1);
});
