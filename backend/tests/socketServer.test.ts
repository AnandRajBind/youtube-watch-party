import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { initSocketServer, getOnlineParticipantsInRoom, isUserOnlineInRoom } from '../src/sockets';
import { SOCKET_EVENTS } from '../src/sockets/socketTypes';

async function runSocketServerTests() {
  console.log('--- Starting Socket.IO Room Events & Lifecycle Tests ---');
  await connectDatabase();

  const httpServer = http.createServer(app);
  const ioServer = initSocketServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  let hostClient: ClientSocket | null = null;
  let participantClient: ClientSocket | null = null;
  let duplicateTabClient: ClientSocket | null = null;
  let testRoomId = '';

  try {
    // 1. Setup: Create room with Alice as Host in MongoDB
    const creatorUserId = 'user_alice_host';
    const { room: createdRoom } = await roomService.createRoom(
      'AliceHost',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      creatorUserId
    );
    testRoomId = createdRoom.roomCode;
    console.log(`[PASS] Setup: Created test room '${testRoomId}' with host '${creatorUserId}'`);

    // 2. Connect Client 1 (Alice - Host)
    hostClient = Client(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => hostClient!.on('connect', resolve));
    console.log(`[PASS] Host socket connected [id=${hostClient.id}]`);

    // 3. Alice emits 'join_room' with { roomId, username, userId }
    const hostSyncStatePromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.SYNC_STATE, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: testRoomId,
      username: 'AliceHost',
      userId: creatorUserId,
    });

    const hostSync = await hostSyncStatePromise;

    // Check required sync_state fields: playState, currentTime, videoId
    if (
      !hostSync.playState ||
      typeof hostSync.currentTime !== 'number' ||
      !hostSync.videoId ||
      hostSync.userRole !== 'host'
    ) {
      throw new Error(`sync_state does not contain required playState, currentTime, or videoId: ${JSON.stringify(hostSync)}`);
    }
    console.log(`[PASS] Host received sync_state: playState=${hostSync.playState}, currentTime=${hostSync.currentTime}, videoId=${hostSync.videoId}`);

    // 4. Connect Client 2 (Bob - Participant sending { roomId, username } with role spoof attempt)
    const bobUserId = 'user_bob_participant';
    participantClient = Client(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => participantClient!.on('connect', resolve));

    // Listeners on Host for broadcasts
    const userJoinedPromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.USER_JOINED, resolve);
    });
    const participantUpdatePromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.PARTICIPANT_UPDATE, resolve);
    });
    const bobSyncStatePromise = new Promise<any>((resolve) => {
      participantClient!.on(SOCKET_EVENTS.SYNC_STATE, resolve);
    });

    // Bob emits join_room with client-supplied fake role: "host"
    participantClient.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: testRoomId,
      username: 'BobParticipant',
      userId: bobUserId,
      role: 'host', // Malicious attempt to claim host!
    } as any);

    const bobSync = await bobSyncStatePromise;

    // Verify Server-Side Role Enforcement (Must be 'participant')
    if (bobSync.userRole !== 'participant') {
      throw new Error(`Security violation: Server trusted client-provided role! Got: ${bobSync.userRole}`);
    }
    console.log(`[PASS] Server-Side Role Enforcement: Client spoofed role was ignored. Server resolved actual role as '${bobSync.userRole}'`);

    // Verify Host received user_joined and participant_update
    const joinedPayload = await userJoinedPromise;
    if (joinedPayload.user.username !== 'BobParticipant' || joinedPayload.user.role !== 'participant') {
      throw new Error('Host did not receive valid user_joined broadcast');
    }
    console.log(`[PASS] Host received 'user_joined' broadcast for '${joinedPayload.user.username}' (role: ${joinedPayload.user.role})`);

    const updatePayload = await participantUpdatePromise;
    if (updatePayload.participantCount !== 2) {
      throw new Error(`Expected 2 participants in participant_update, got ${updatePayload.participantCount}`);
    }
    console.log(`[PASS] Broadcast updated participant list verified (${updatePayload.participantCount} online)`);

    // 5. Test Duplicate Connection Graceful Handling (Bob opens a second tab)
    duplicateTabClient = Client(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => duplicateTabClient!.on('connect', resolve));

    const duplicateSyncStatePromise = new Promise<any>((resolve) => {
      duplicateTabClient!.on(SOCKET_EVENTS.SYNC_STATE, resolve);
    });

    duplicateTabClient.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomId: testRoomId,
      username: 'BobParticipant',
      userId: bobUserId,
    });

    const duplicateSync = await duplicateSyncStatePromise;
    if (duplicateSync.videoId !== hostSync.videoId) {
      throw new Error('Duplicate tab failed to receive sync_state');
    }
    console.log('[PASS] Duplicate connection handled gracefully: Second tab connected and received sync_state');

    // 6. Test Tab 1 Disconnect while Tab 2 is still open (Should NOT emit user_left)
    let userLeftEmittedOnHost = false;
    const unexpectedUserLeftHandler = () => {
      userLeftEmittedOnHost = true;
    };
    hostClient.on(SOCKET_EVENTS.USER_LEFT, unexpectedUserLeftHandler);

    participantClient.disconnect();
    // Wait brief moment to confirm no jitter
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (userLeftEmittedOnHost) {
      throw new Error('user_left was emitted prematurely while user still had another active tab open!');
    }
    console.log('[PASS] Multi-tab graceful handling: Tab 1 disconnected without emitting user_left because Tab 2 is active');
    hostClient.off(SOCKET_EVENTS.USER_LEFT, unexpectedUserLeftHandler);

    // 7. Test leave_room from duplicate tab (Final tab leaves)
    const finalUserLeftPromise = new Promise<any>((resolve) => {
      hostClient!.on(SOCKET_EVENTS.USER_LEFT, resolve);
    });

    duplicateTabClient.emit(SOCKET_EVENTS.LEAVE_ROOM, {
      roomId: testRoomId,
    });

    const leftPayload = await finalUserLeftPromise;
    if (leftPayload.userId !== bobUserId) {
      throw new Error('Host did not receive user_left after final tab left');
    }
    console.log(`[PASS] leave_room cleanly removed participant and broadcasted 'user_left' for ${leftPayload.username}`);

    // Verify Bob is now completely offline in runtime memory
    if (isUserOnlineInRoom(testRoomId, bobUserId)) {
      throw new Error('Bob still marked online after all tabs left');
    }
    console.log('[PASS] Runtime memory cleanly freed after participant left room');

    console.log('--- ALL SOCKET.IO EVENT TESTS PASSED SUCCESSFULLY ---');
  } finally {
    if (hostClient) hostClient.disconnect();
    if (participantClient) participantClient.disconnect();
    if (duplicateTabClient) duplicateTabClient.disconnect();
    ioServer.close();
    httpServer.close();
    if (testRoomId) {
      await RoomModel.deleteOne({ roomCode: testRoomId });
    }
    await disconnectDatabase();
  }
}

runSocketServerTests().catch((err) => {
  console.error('Socket.IO event test failed:', err);
  process.exit(1);
});
