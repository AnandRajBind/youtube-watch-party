import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { initSocketServer, getOnlineParticipantsInRoom, isUserOnlineInRoom } from '../src/sockets';
import { SOCKET_EVENTS } from '../src/sockets/socketTypes';

async function runSocketServerTests() {
  console.log('--- Starting Socket.IO Server Lifecycle Tests ---');
  await connectDatabase();

  const httpServer = http.createServer(app);
  const ioServer = initSocketServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  let hostClient: ClientSocket | null = null;
  let participantClient: ClientSocket | null = null;
  let testRoomCode = '';

  try {
    // 1. Create a test room in MongoDB with Alice as Host
    const creatorUserId = 'user_alice_host';
    const { room: createdRoom } = await roomService.createRoom(
      'AliceHost',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      creatorUserId
    );
    testRoomCode = createdRoom.roomCode;
    console.log(`[PASS] Setup: Created test room '${testRoomCode}' with host '${creatorUserId}'`);

    // 2. Connect Client 1 (Alice - Host)
    hostClient = Client(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => hostClient!.on('connect', resolve));
    console.log(`[PASS] Host socket connected [id=${hostClient.id}]`);

    // 3. Alice emits 'join_room'
    const hostSyncStatePromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.SYNC_STATE, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      userId: creatorUserId,
      username: 'AliceHost',
    });

    const hostSyncState = await hostSyncStatePromise;
    if (hostSyncState.roomCode !== testRoomCode || hostSyncState.userRole !== 'host') {
      throw new Error(`Host sync_state verification failed: role=${hostSyncState.userRole}`);
    }
    console.log(`[PASS] Step 1-6: Host verified, role determined as '${hostSyncState.userRole}', received sync_state`);

    // 4. Verify Runtime Memory for Host
    const onlineParticipants = getOnlineParticipantsInRoom(testRoomCode);
    if (onlineParticipants.length !== 1 || !isUserOnlineInRoom(testRoomCode, creatorUserId)) {
      throw new Error('Host not found in runtime memory store');
    }
    console.log('[PASS] Runtime memory correctly tracking active socket connection and host participant');

    // 5. Connect Client 2 (Bob - Participant attempting to spoof role as 'host')
    const bobUserId = 'user_bob_participant';
    participantClient = Client(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => participantClient!.on('connect', resolve));
    console.log(`[PASS] Participant socket connected [id=${participantClient.id}]`);

    // Set up listeners on Host to verify broadcasts
    const userJoinedPromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.USER_JOINED, resolve);
    });
    const participantUpdatePromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.PARTICIPANT_UPDATE, resolve);
    });
    const bobSyncStatePromise = new Promise<any>((resolve) => {
      participantClient!.on(SOCKET_EVENTS.SYNC_STATE, resolve);
    });

    // Bob attempts to send role: "host" (spoofing attempt!)
    participantClient.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      userId: bobUserId,
      username: 'Bob',
      role: 'host', // Malicious attempt to claim host
    } as any);

    const bobSyncState = await bobSyncStatePromise;
    // 6. Verify Server-Side Role Enforcement (Must be 'participant')
    if (bobSyncState.userRole !== 'participant') {
      throw new Error(`Security Failure: Server accepted client-provided role! Got: ${bobSyncState.userRole}`);
    }
    console.log("[PASS] Security Check: Client spoofed role was ignored. Server resolved actual role as 'participant'");

    // 7. Verify Host received user_joined and participant_update broadcasts
    const joinedPayload = await userJoinedPromise;
    if (joinedPayload.user.userId !== bobUserId || joinedPayload.user.role !== 'participant') {
      throw new Error('Host did not receive valid user_joined broadcast');
    }
    console.log(`[PASS] Step 7: Host received 'user_joined' broadcast for Bob (online count: ${joinedPayload.participantCount})`);

    const updatePayload = await participantUpdatePromise;
    if (updatePayload.participantCount !== 2) {
      throw new Error(`Expected 2 online participants in participant_update, got ${updatePayload.participantCount}`);
    }
    console.log('[PASS] Step 7: Host received refreshed participant list update (2 online)');

    // 8. Test Disconnection & Runtime Cleanup
    const userLeftPromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.USER_LEFT, resolve);
    });

    participantClient.disconnect();

    const leftPayload = await userLeftPromise;
    if (leftPayload.userId !== bobUserId) {
      throw new Error('Host did not receive user_left broadcast for Bob');
    }
    console.log(`[PASS] Disconnect Handling: Host received 'user_left' broadcast for ${leftPayload.userId}`);

    // Verify Bob is no longer online in runtime memory
    if (isUserOnlineInRoom(testRoomCode, bobUserId)) {
      throw new Error('Bob still marked online in runtime memory after disconnect');
    }
    console.log('[PASS] Runtime memory cleanly removed disconnected socket');

    console.log('--- ALL SOCKET.IO SERVER TESTS PASSED SUCCESSFULLY ---');
  } finally {
    if (hostClient) hostClient.disconnect();
    if (participantClient) participantClient.disconnect();
    ioServer.close();
    httpServer.close();
    if (testRoomCode) {
      await RoomModel.deleteOne({ roomCode: testRoomCode });
    }
    await disconnectDatabase();
  }
}

runSocketServerTests().catch((err) => {
  console.error('Socket.IO test failed:', err);
  process.exit(1);
});
