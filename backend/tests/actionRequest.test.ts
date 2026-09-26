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

const TEST_PORT = 5056;
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

async function runActionRequestTests() {
  console.log('--- Starting Participant Change-Request System Tests ---');
  let httpServer: http.Server;
  let ioServer: any;

  try {
    await connectDatabase();
    httpServer = http.createServer(app);
    ioServer = initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });

    // 1. Setup Room with Host (Alice), Moderator (Charlie), and Participant (Bob)
    const hostCreated = await roomService.createRoom('AliceHost');
    const roomCode = hostCreated.room.roomCode;
    const hostUserId = hostCreated.hostUser.userId;

    const modJoin = await roomService.joinRoom(roomCode, 'mod-charlie-id', 'CharlieMod');
    const modUserId = modJoin.participant.userId;
    await roomService.assignRole(roomCode, hostUserId, modUserId, Role.MODERATOR);

    const partJoin = await roomService.joinRoom(roomCode, 'part-bob-id', 'BobParticipant');
    const partUserId = partJoin.participant.userId;

    // Connect 3 sockets
    const hostSocket = createClientSocket();
    const modSocket = createClientSocket();
    const partSocket = createClientSocket();

    await Promise.all([
      waitForEvent(hostSocket, 'connect'),
      waitForEvent(modSocket, 'connect'),
      waitForEvent(partSocket, 'connect'),
    ]);

    // Join room
    const hostSyncP = waitForEvent(hostSocket, SOCKET_EVENTS.SYNC_STATE);
    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'AliceHost', userId: hostUserId });
    await hostSyncP;

    const modSyncP = waitForEvent(modSocket, SOCKET_EVENTS.SYNC_STATE);
    modSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'CharlieMod', userId: modUserId });
    await modSyncP;

    const partSyncP = waitForEvent(partSocket, SOCKET_EVENTS.SYNC_STATE);
    partSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'BobParticipant', userId: partUserId });
    await partSyncP;

    console.log(`[PASS] Room '${roomCode}' established with Host, Moderator, and Participant connected.`);

    // 2. Direct playback mutation attempt by Participant -> REJECTED
    console.log('[TEST 2] Verifying Participant direct playback action is blocked...');
    const partDirectPlayErrorP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.PLAY, {});
    const directError: any = await partDirectPlayErrorP;
    assert.strictEqual(directError.code, 'FORBIDDEN_PLAYBACK_CONTROL');
    console.log('[PASS] Participant cannot directly mutate playback.');

    // 3. Payload validation for request_action
    console.log('[TEST 3] Testing request_action payload validation...');
    // 3a. Invalid action
    const invalidActionP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'delete_room' as any });
    const invActionErr: any = await invalidActionP;
    assert.strictEqual(invActionErr.code, 'INVALID_ACTION');

    // 3b. Invalid seek time
    const invalidSeekP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'seek', time: -25 });
    const invSeekErr: any = await invalidSeekP;
    assert.strictEqual(invSeekErr.code, 'INVALID_SEEK_TIME');

    // 3c. Invalid video ID
    const invalidVideoP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, {
      action: 'change_video',
      videoId: 'https://vimeo.com/not-a-youtube-video',
    });
    const invVideoErr: any = await invalidVideoP;
    assert.strictEqual(invVideoErr.code, 'INVALID_VIDEO_ID');
    console.log('[PASS] Malformed action requests safely rejected by backend validation.');

    // 4. Participant creates valid request_action: "play"
    console.log('[TEST 4] Participant submits request_action { action: "play" }...');
    const hostCreatedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    const modCreatedP = waitForEvent(modSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    const partCreatedP = waitForEvent(partSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);

    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'play' });

    const [hostReqData, modReqData, partReqData]: any = await Promise.all([
      hostCreatedP,
      modCreatedP,
      partCreatedP,
    ]);

    assert.strictEqual(hostReqData.action, 'play');
    assert.strictEqual(hostReqData.requesterUserId, partUserId);
    assert.strictEqual(hostReqData.requesterUsername, 'BobParticipant');
    assert.ok(hostReqData.requestId.startsWith('req_'));
    const playRequestId = hostReqData.requestId;
    console.log(`[PASS] action_request_created received by all room members with requestId '${playRequestId}'.`);

    // 5. Authorization: Participant cannot approve or reject action requests!
    console.log('[TEST 5] Participant attempts approve_action -> REJECTED...');
    const partApproveErrorP = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: playRequestId });
    const partApproveErr: any = await partApproveErrorP;
    assert.strictEqual(partApproveErr.code, 'FORBIDDEN_APPROVAL');
    console.log('[PASS] Participant cannot approve actions (rejected with FORBIDDEN_APPROVAL).');

    // 6. Moderator approves the "play" request
    console.log('[TEST 6] Moderator approves the "play" request...');
    const hostPlayP = waitForEvent(hostSocket, SOCKET_EVENTS.PLAY);
    const partPlayP = waitForEvent(partSocket, SOCKET_EVENTS.PLAY);
    const hostApprovedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_APPROVED);

    modSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: playRequestId });

    const [hostPlayData, partPlayData, approvedData]: any = await Promise.all([
      hostPlayP,
      partPlayP,
      hostApprovedP,
    ]);

    assert.ok(hostPlayData.triggeredBy.includes('Approved by CharlieMod'));
    assert.strictEqual(approvedData.requestId, playRequestId);
    assert.strictEqual(approvedData.approvedBy, 'CharlieMod');

    // Verify MongoDB playbackState updated to PLAYING
    const roomAfterPlay = await RoomModel.findOne({ roomCode });
    assert.strictEqual(roomAfterPlay?.playbackState, PlaybackState.PLAYING);
    console.log('[PASS] Action executed upon approval: PLAY broadcasted to room & persisted in MongoDB.');

    // 7. Duplicate prevention: Approving an already approved request is rejected
    console.log('[TEST 7] Duplicate approval attempt on same requestId...');
    const dupApproveP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: playRequestId });
    const dupErr: any = await dupApproveP;
    assert.strictEqual(dupErr.code, 'REQUEST_ALREADY_PROCESSED');
    console.log('[PASS] Duplicate execution prevented: REQUEST_ALREADY_PROCESSED.');

    // 8. Participant requests "seek" to 120s -> Host approves
    console.log('[TEST 8] Participant submits request_action { action: "seek", time: 120 }...');
    const seekReqCreatedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, { action: 'seek', time: 120 });
    const seekReqData: any = await seekReqCreatedP;
    assert.strictEqual(seekReqData.action, 'seek');
    assert.strictEqual(seekReqData.time, 120);
    const seekRequestId = seekReqData.requestId;

    const partSeekP = waitForEvent(partSocket, SOCKET_EVENTS.SEEK);
    const hostSeekApprovedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_APPROVED);
    hostSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: seekRequestId });

    const [partSeekData, seekApprovedData]: any = await Promise.all([
      partSeekP,
      hostSeekApprovedP,
    ]);

    assert.strictEqual(partSeekData.currentTime, 120);
    assert.strictEqual(seekApprovedData.approvedBy, 'AliceHost');
    const roomAfterSeek = await RoomModel.findOne({ roomCode });
    assert.strictEqual(roomAfterSeek?.playbackTime, 120);
    console.log('[PASS] Host approved seek(120s): Room synchronized and MongoDB updated.');

    // 9. Participant requests "change_video" -> Moderator REJECTS
    console.log('[TEST 9] Participant submits request_action { action: "change_video" } -> Moderator rejects...');
    const changeVideoCreatedP = waitForEvent(modSocket, SOCKET_EVENTS.ACTION_REQUEST_CREATED);
    partSocket.emit(SOCKET_EVENTS.REQUEST_ACTION, {
      action: 'change_video',
      videoId: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    });
    const changeReqData: any = await changeVideoCreatedP;
    assert.strictEqual(changeReqData.action, 'change_video');
    assert.strictEqual(changeReqData.videoId, 'kJQP7kiw5Fk');
    const changeRequestId = changeReqData.requestId;

    // Moderator rejects
    const partRejectedP = waitForEvent(partSocket, SOCKET_EVENTS.ACTION_REQUEST_REJECTED);
    const hostRejectedP = waitForEvent(hostSocket, SOCKET_EVENTS.ACTION_REQUEST_REJECTED);

    modSocket.emit(SOCKET_EVENTS.REJECT_ACTION, {
      requestId: changeRequestId,
      reason: 'We are currently watching this video, please wait.',
    });

    const [partRejData, hostRejData]: any = await Promise.all([
      partRejectedP,
      hostRejectedP,
    ]);

    assert.strictEqual(partRejData.requestId, changeRequestId);
    assert.strictEqual(partRejData.rejectedBy, 'CharlieMod');
    assert.strictEqual(partRejData.reason, 'We are currently watching this video, please wait.');

    // Video should NOT have changed in MongoDB
    const roomAfterReject = await RoomModel.findOne({ roomCode });
    assert.notStrictEqual(roomAfterReject?.currentVideoId, 'kJQP7kiw5Fk');
    console.log('[PASS] Rejection handled cleanly: action_request_rejected broadcasted, playback unaltered.');

    // 10. Attempting to approve an already rejected request -> REJECTED
    console.log('[TEST 10] Attempting to approve rejected request...');
    const approveAfterRejP = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.APPROVE_ACTION, { requestId: changeRequestId });
    const appAfterRejErr: any = await approveAfterRejP;
    assert.strictEqual(appAfterRejErr.code, 'REQUEST_ALREADY_PROCESSED');
    console.log('[PASS] Cannot approve previously rejected request.');

    // Disconnect sockets cleanly
    hostSocket.disconnect();
    modSocket.disconnect();
    partSocket.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('--- ALL PARTICIPANT CHANGE-REQUEST TESTS PASSED SUCCESSFULLY ---');
  } finally {
    if (httpServer!) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await disconnectDatabase();
  }
}

runActionRequestTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Action Request Test Failed:', err);
    process.exit(1);
  });
