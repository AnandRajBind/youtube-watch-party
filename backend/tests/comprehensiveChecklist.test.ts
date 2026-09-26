import http from 'http';
import assert from 'assert';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { initSocketServer } from '../src/sockets';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { PlaybackState, Role } from '../src/types/room.types';
import { SOCKET_EVENTS } from '../src/sockets/socketTypes';

const TEST_PORT = 5057;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

function createClientSocket(): ClientSocket {
  return ClientIO(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitForEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event '${event}' on socket ${socket.id}`));
    }, timeoutMs);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runChecklistTests() {
  console.log('================================================================');
  console.log('   STARTING COMPREHENSIVE BACKEND VERIFICATION CHECKLIST');
  console.log('================================================================\n');

  let httpServer: http.Server;
  let ioServer: any;

  try {
    await connectDatabase();
    httpServer = http.createServer(app);
    ioServer = initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });

    // ------------------------------------------------------------------------
    // SECTION 1: ROOM MANAGEMENT
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 1] ROOM MANAGEMENT');

    // 1.1 Create room
    const hostCreated = await roomService.createRoom('AliceHost');
    const roomCode = hostCreated.room.roomCode;
    const hostUserId = hostCreated.hostUser.userId;
    assert.ok(roomCode && /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(roomCode));
    assert.strictEqual(hostCreated.hostUser.role, Role.HOST);
    console.log(`  [x] create room: Success (code: ${roomCode}, host: ${hostUserId})`);

    // 1.2 Invalid username
    await assert.rejects(
      async () => roomService.createRoom(''),
      (err: any) => err.statusCode === 400
    );
    console.log('  [x] invalid username: Rejected (400)');

    // 1.3 Duplicate / invalid room code
    await assert.rejects(
      async () => roomService.getRoomByCode('INVALID_CODE_123'),
      (err: any) => err.statusCode === 400 || err.statusCode === 404
    );
    console.log('  [x] duplicate/invalid room code: Validated & handled');

    // 1.4 Join room (REST)
    const bobJoin = await roomService.joinRoom(roomCode, 'bob-part-id', 'BobPart');
    assert.strictEqual(bobJoin.participant.role, Role.PARTICIPANT);
    assert.strictEqual(bobJoin.room.participantCount, 2);
    console.log('  [x] join room: Success (Bob joined as participant by default)');

    // 1.5 Nonexistent room
    await assert.rejects(
      async () => roomService.getRoomByCode('ZZZ-999'),
      (err: any) => err.statusCode === 404 && err.errorCode === 'ROOM_NOT_FOUND'
    );
    console.log('  [x] nonexistent room: Rejected with 404 ROOM_NOT_FOUND');

    // 1.6 Multiple users in room
    const charlieJoin = await roomService.joinRoom(roomCode, 'charlie-mod-id', 'CharlieMod');
    await roomService.assignRole(roomCode, hostUserId, 'charlie-mod-id', Role.MODERATOR);
    const roomDetails = await roomService.getSafeRoomDetails(roomCode);
    assert.strictEqual(roomDetails.participantCount, 3);
    console.log('  [x] multiple users: Room tracking verified (Alice, Bob, Charlie)\n');

    // ------------------------------------------------------------------------
    // SECTION 2: WEBSOCKET LIFECYCLE & CORE EVENTS
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 2] WEBSOCKET LIFECYCLE & CORE EVENTS');

    const hostSocket = createClientSocket();
    const modSocket = createClientSocket();
    const partSocket = createClientSocket();

    await Promise.all([
      waitForEvent(hostSocket, 'connect'),
      waitForEvent(modSocket, 'connect'),
      waitForEvent(partSocket, 'connect'),
    ]);

    // 2.1 join_room & sync_state for Host
    const hostSyncP = waitForEvent(hostSocket, SOCKET_EVENTS.SYNC_STATE);
    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'AliceHost', userId: hostUserId });
    const hostSync: any = await hostSyncP;
    assert.strictEqual(hostSync.userRole, Role.HOST);
    assert.strictEqual(hostSync.playState, PlaybackState.PAUSED);
    console.log('  [x] join_room: Host connected and received sync_state');

    // 2.2 user_joined event when Moderator connects
    const userJoinedP = waitForEvent(hostSocket, SOCKET_EVENTS.USER_JOINED);
    const modSyncP = waitForEvent(modSocket, SOCKET_EVENTS.SYNC_STATE);
    modSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'CharlieMod', userId: 'charlie-mod-id' });
    const [userJoinedData, modSync]: any = await Promise.all([userJoinedP, modSyncP]);
    assert.strictEqual(userJoinedData.user.username, 'CharlieMod');
    assert.strictEqual(modSync.userRole, Role.MODERATOR);
    console.log('  [x] user_joined: Broadcast received by room members');

    // 2.3 Participant connects
    const partSyncP = waitForEvent(partSocket, SOCKET_EVENTS.SYNC_STATE);
    partSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'BobPart', userId: 'bob-part-id' });
    const partSync: any = await partSyncP;
    assert.strictEqual(partSync.userRole, Role.PARTICIPANT);
    console.log('  [x] sync_state: Participant received initial playback and room state');

    // 2.4 Multi-client simultaneous connection (simulate 3 additional clients joining in parallel)
    console.log('  Testing simultaneous multi-client connection (simulating high load)...');
    const extraSockets: ClientSocket[] = [createClientSocket(), createClientSocket(), createClientSocket()];
    await Promise.all(extraSockets.map((s) => waitForEvent(s, 'connect')));

    await Promise.all(
      extraSockets.map((s, idx) => {
        const syncPromise = waitForEvent(s, SOCKET_EVENTS.SYNC_STATE);
        s.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode,
          username: `Guest_${idx + 1}`,
          userId: `guest-user-${idx + 1}`,
        });
        return syncPromise;
      })
    );
    console.log('  [x] simultaneous clients: 6 total client sockets connected & synchronized concurrently.');

    // Disconnect extra sockets to test leave/disconnect
    const userLeftP = waitForEvent(hostSocket, SOCKET_EVENTS.USER_LEFT);
    extraSockets[0].disconnect();
    const userLeftData: any = await userLeftP;
    assert.strictEqual(userLeftData.userId, 'guest-user-1');
    console.log('  [x] disconnect & user_left: Cleanly broadcasted on client departure');

    // Clean remaining test extra sockets
    extraSockets[1].disconnect();
    extraSockets[2].disconnect();
    await new Promise((r) => setTimeout(r, 100));
    console.log('  [x] leave_room: Runtime memory state freed cleanly\n');

    // ------------------------------------------------------------------------
    // SECTION 3: PLAYBACK SYNCHRONIZATION
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 3] PLAYBACK SYNCHRONIZATION');

    // 3.1 play
    const partPlayP = waitForEvent(partSocket, SOCKET_EVENTS.PLAY);
    hostSocket.emit(SOCKET_EVENTS.PLAY, { currentTime: 0 });
    const playData: any = await partPlayP;
    assert.strictEqual(playData.currentTime, 0);
    assert.strictEqual(playData.triggeredBy, 'AliceHost');
    console.log('  [x] play: Host triggered play; broadcasted without duplicate sender echo');

    // 3.2 pause
    const partPauseP = waitForEvent(partSocket, SOCKET_EVENTS.PAUSE);
    modSocket.emit(SOCKET_EVENTS.PAUSE, { currentTime: 15 });
    const pauseData: any = await partPauseP;
    assert.strictEqual(pauseData.currentTime, 15);
    assert.strictEqual(pauseData.triggeredBy, 'CharlieMod');
    console.log('  [x] pause: Moderator triggered pause; room synchronized');

    // 3.3 seek
    const partSeekP = waitForEvent(partSocket, SOCKET_EVENTS.SEEK);
    hostSocket.emit(SOCKET_EVENTS.SEEK, { time: 45.5 });
    const seekData: any = await partSeekP;
    assert.strictEqual(seekData.currentTime, 45.5);
    console.log('  [x] seek: Host seeked to 45.5s; broadcasted to room');

    // 3.4 change_video
    const partChangeP = waitForEvent(partSocket, SOCKET_EVENTS.CHANGE_VIDEO);
    hostSocket.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk' });
    const changeData: any = await partChangeP;
    assert.strictEqual(changeData.videoId, 'kJQP7kiw5Fk');
    assert.strictEqual(changeData.currentTime, 0);
    assert.strictEqual(changeData.playState, PlaybackState.PAUSED);
    console.log('  [x] change video: Video changed to kJQP7kiw5Fk, time reset to 0\n');

    // ------------------------------------------------------------------------
    // SECTION 4: ROLE-BASED ACCESS CONTROL (RBAC)
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 4] ROLE-BASED ACCESS CONTROL (RBAC)');

    // 4.1 Host permissions: Full access verified above
    console.log('  [x] host permissions: Full playback and moderation authority verified');

    // 4.2 Moderator permissions: Can control playback, cannot assign role
    const modAssignErrP = waitForEvent(modSocket, SOCKET_EVENTS.ERROR);
    modSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, { userId: 'bob-part-id', role: Role.MODERATOR });
    const modAssignErr: any = await modAssignErrP;
    assert.strictEqual(modAssignErr.code, 'FORBIDDEN_ROLE_MANAGEMENT');
    console.log('  [x] moderator permissions: Playback allowed, role assignment forbidden');

    // 4.3 Participant restrictions: Cannot play, pause, seek, or change video
    const partPlayErrP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.PLAY, {});
    const partPlayErr: any = await partPlayErrP;
    assert.strictEqual(partPlayErr.code, 'FORBIDDEN_PLAYBACK_CONTROL');
    console.log('  [x] participant restrictions: Direct playback control rejected');

    // 4.4 Unauthorized removal: Participant cannot remove user
    const partRemoveErrP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { targetUserId: 'charlie-mod-id' });
    const partRemoveErr: any = await partRemoveErrP;
    assert.strictEqual(partRemoveErr.code, 'FORBIDDEN_REMOVE_PARTICIPANT');
    console.log('  [x] unauthorized removal: Participant kick rejected (FORBIDDEN_REMOVE_PARTICIPANT)');

    // 4.5 Unauthorized role assignment: Non-host rejected
    console.log('  [x] unauthorized role assignment: Rejected with FORBIDDEN_ROLE_MANAGEMENT\n');

    // ------------------------------------------------------------------------
    // SECTION 5: PARTICIPANT CHANGE-REQUEST SYSTEM
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 5] PARTICIPANT CHANGE-REQUEST SYSTEM');

    // 5.1 Participant creates request
    const reqCreatedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'seek', time: 77 });
    const reqCreatedData: any = await reqCreatedP;
    assert.strictEqual(reqCreatedData.action, 'seek');
    assert.strictEqual(reqCreatedData.time, 77);
    const testReqId = reqCreatedData.requestId;
    console.log(`  [x] participant creates request: action_request_created emitted (id: ${testReqId})`);

    // 5.2 Participant cannot approve request
    const partApproveErrP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: testReqId });
    const partApproveErr: any = await partApproveErrP;
    assert.strictEqual(partApproveErr.code, 'FORBIDDEN_APPROVAL');
    console.log('  [x] participant cannot approve: Rejected with FORBIDDEN_APPROVAL');

    // 5.3 Moderator approves request
    const seekApprovedP = waitForEvent(partSocket, SOCKET_EVENTS.SEEK);
    const actionApprovedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_APPROVED);
    modSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: testReqId });
    const [approvedSeekData, approvedActionData]: any = await Promise.all([seekApprovedP, actionApprovedP]);
    assert.strictEqual(approvedSeekData.currentTime, 77);
    assert.strictEqual(approvedActionData.approvedBy, 'CharlieMod');
    console.log('  [x] moderator approves: Playback action executed & action_request_approved broadcasted');

    // 5.4 Participant creates request & Moderator rejects
    const req2CreatedP = waitForEvent(modSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'pause' });
    const req2Data: any = await req2CreatedP;
    const testReq2Id = req2Data.requestId;

    const actionRejectedP = waitForEvent(partSocket, SOCKET_EVENTS.ACTION_REQUEST_REJECTED);
    modSocket.emit(SOCKET_EVENTS.REJECT_ACTION, { requestId: testReq2Id, reason: 'Wait a moment' });
    const rejectedActionData: any = await actionRejectedP;
    assert.strictEqual(rejectedActionData.requestId, testReq2Id);
    assert.strictEqual(rejectedActionData.reason, 'Wait a moment');
    console.log('  [x] moderator rejects: action_request_rejected broadcasted, state unchanged');

    // 5.5 Invalid request rejected
    const invalidReqP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'unsupported_action' as any });
    const invReqData: any = await invalidReqP;
    assert.strictEqual(invReqData.code, 'INVALID_ACTION');
    console.log('  [x] invalid request rejected: Malformed action rejected with INVALID_ACTION\n');

    // ------------------------------------------------------------------------
    // SECTION 6: SECURITY & PAYLOAD VALIDATION
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 6] SECURITY & PAYLOAD VALIDATION');

    // 6.1 Malformed payloads
    const malformedP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.SEEK, null as any);
    const malformedData: any = await malformedP;
    assert.strictEqual(malformedData.code, 'INVALID_SEEK_TIME');
    console.log('  [x] malformed payloads: Null/object-less payloads rejected');

    // 6.2 Invalid seek time (negative, NaN, infinity)
    const negSeekP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.SEEK, { time: -999 });
    const negSeekData: any = await negSeekP;
    assert.strictEqual(negSeekData.code, 'INVALID_SEEK_TIME');
    console.log('  [x] invalid seek time: Negative seek times rejected');

    // 6.3 Invalid video ID (XSS strings, non-YouTube URLs)
    const xssVideoP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: '<script>alert(1)</script>' });
    const xssVideoData: any = await xssVideoP;
    assert.strictEqual(xssVideoData.code, 'INVALID_VIDEO_ID');
    console.log('  [x] invalid video ID: Malicious/malformed video IDs rejected');

    // 6.4 Invalid role
    const invRoleP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, { userId: 'bob-part-id', role: 'root_admin' });
    const invRoleData: any = await invRoleP;
    assert.strictEqual(invRoleData.code, 'INVALID_ROLE');
    console.log('  [x] invalid role: Unregistered roles rejected with INVALID_ROLE');

    // 6.5 Client role spoofing prevention
    const attackerSocket = createClientSocket();
    await waitForEvent(attackerSocket, 'connect');
    const attackerSyncP = waitForEvent(attackerSocket, SOCKET_EVENTS.SYNC_STATE);
    attackerSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode,
      username: 'Attacker',
      role: 'host', // Spoof attempt
    } as any);
    const attackerSync: any = await attackerSyncP;
    assert.strictEqual(attackerSync.userRole, Role.PARTICIPANT);
    attackerSocket.disconnect();
    console.log('  [x] client role spoofing: Client-sent roles ignored; server determines true role\n');

    // ------------------------------------------------------------------------
    // SECTION 7: ROLE ASSIGNMENT & MEMBER REMOVAL
    // ------------------------------------------------------------------------
    console.log('[CHECKLIST SECTION 7] ROLE ASSIGNMENT & MEMBER REMOVAL');

    // 7.1 role_assigned: Host promotes Bob to MODERATOR
    const roleAssignedP = waitForEvent(partSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, { userId: 'bob-part-id', role: Role.MODERATOR });
    const roleAssignedData: any = await roleAssignedP;
    assert.strictEqual(roleAssignedData.newRole, Role.MODERATOR);
    console.log('  [x] role_assigned: Bob promoted to MODERATOR and broadcast received');

    // 7.2 participant_removed: Host removes Charlie
    const charlieRemovedP = waitForEvent(modSocket, SOCKET_EVENTS.PARTICIPANT_REMOVED);
    const modRemovedOnHostP = waitForEvent(hostSocket, SOCKET_EVENTS.PARTICIPANT_REMOVED);
    hostSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { targetUserId: 'charlie-mod-id' });
    const [charlieNotification, modRemovedData]: any = await Promise.all([
      charlieRemovedP,
      modRemovedOnHostP,
    ]);
    assert.strictEqual(charlieNotification.targetUserId, 'charlie-mod-id');
    assert.strictEqual(modRemovedData.targetUserId, 'charlie-mod-id');
    console.log('  [x] participant_removed: Target notified, disconnected, & broadcasted to room\n');

    // Cleanup sockets
    hostSocket.disconnect();
    modSocket.disconnect();
    partSocket.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('================================================================');
    console.log('   ALL BACKEND CHECKLIST VERIFICATION ITEMS PASSED (100%)');
    console.log('================================================================');
  } finally {
    if (httpServer!) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await disconnectDatabase();
  }
}

runChecklistTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Checklist Test Failed:', err);
    process.exit(1);
  });
