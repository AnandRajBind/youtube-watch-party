import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { initSocketServer } from '../src/sockets';
import { SOCKET_EVENTS } from '../src/sockets/socketTypes';
import { Role } from '../src/types/room.types';

async function runPlaybackSyncTests() {
  console.log('--- Starting Playback Synchronization & RBAC Tests ---');
  await connectDatabase();

  const httpServer = http.createServer(app);
  const ioServer = initSocketServer(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  let hostClient: ClientSocket | null = null;
  let modClient: ClientSocket | null = null;
  let participantClient: ClientSocket | null = null;
  let testRoomId = '';

  try {
    // ------------------------------------------------------------------------
    // SETUP: Create Room with Host (Alice), Moderator (Charlie), Participant (Bob)
    // ------------------------------------------------------------------------
    const hostUserId = 'user_alice_host';
    const modUserId = 'user_charlie_mod';
    const participantUserId = 'user_bob_participant';

    const { room } = await roomService.createRoom('AliceHost', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hostUserId);
    testRoomId = room.roomCode;

    // Register Charlie and promote to Moderator
    await roomService.joinRoom(testRoomId, modUserId, 'CharlieMod');
    await roomService.assignRole(testRoomId, hostUserId, modUserId, Role.MODERATOR);

    // Register Bob as Participant
    await roomService.joinRoom(testRoomId, participantUserId, 'BobParticipant');

    console.log(`[PASS] Setup complete for room '${testRoomId}' (Host: Alice, Mod: Charlie, Participant: Bob)`);

    // Connect all 3 sockets
    hostClient = Client(serverUrl, { transports: ['websocket'] });
    modClient = Client(serverUrl, { transports: ['websocket'] });
    participantClient = Client(serverUrl, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((resolve) => hostClient!.on('connect', resolve)),
      new Promise<void>((resolve) => modClient!.on('connect', resolve)),
      new Promise<void>((resolve) => participantClient!.on('connect', resolve)),
    ]);

    // All join room
    await new Promise<void>((resolve) => {
      hostClient!.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoomId, username: 'AliceHost', userId: hostUserId });
      hostClient!.once(SOCKET_EVENTS.SYNC_STATE, () => resolve());
    });

    await new Promise<void>((resolve) => {
      modClient!.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoomId, username: 'CharlieMod', userId: modUserId });
      modClient!.once(SOCKET_EVENTS.SYNC_STATE, () => resolve());
    });

    await new Promise<void>((resolve) => {
      participantClient!.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoomId, username: 'BobParticipant', userId: participantUserId });
      participantClient!.once(SOCKET_EVENTS.SYNC_STATE, () => resolve());
    });

    console.log('[PASS] All 3 clients authenticated and joined room channel');

    // ------------------------------------------------------------------------
    // TEST 1: Host Controls Playback (play, pause, seek, change_video)
    // ------------------------------------------------------------------------
    // Host emits 'play' -> Participant receives 'play', Host does NOT receive echo!
    let hostReceivedOwnPlay = false;
    hostClient.on(SOCKET_EVENTS.PLAY, () => { hostReceivedOwnPlay = true; });

    const participantPlayPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.PLAY, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.PLAY, {});
    const playData = await participantPlayPromise;

    if (hostReceivedOwnPlay) {
      throw new Error('Loop Prevention Failure: Host received its own play event back!');
    }
    if (playData.triggeredBy !== 'AliceHost') {
      throw new Error(`play event missing or wrong triggeredBy: ${JSON.stringify(playData)}`);
    }
    console.log('[PASS] Host emitted play: Participant received broadcast, Host did not receive duplicate echo (Loop prevented)');

    // Host emits 'pause'
    const participantPausePromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.PAUSE, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.PAUSE, {});
    const pauseData = await participantPausePromise;
    if (pauseData.triggeredBy !== 'AliceHost') {
      throw new Error('pause broadcast triggeredBy mismatch');
    }
    console.log('[PASS] Host emitted pause: Participant received broadcast');

    // Host emits 'seek' { time: 54.2 }
    const participantSeekPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.SEEK, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.SEEK, { time: 54.2 });
    const seekData = await participantSeekPromise;
    if (seekData.currentTime !== 54.2 || seekData.triggeredBy !== 'AliceHost') {
      throw new Error(`seek broadcast data mismatch: ${JSON.stringify(seekData)}`);
    }
    console.log(`[PASS] Host emitted seek(54.2s): Participant received broadcast with currentTime=54.2s`);

    // Host emits 'change_video' { videoId: 'kJQP7kiw5Fk' }
    const participantChangeVideoPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.CHANGE_VIDEO, resolve);
    });

    hostClient.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: 'kJQP7kiw5Fk' });
    const changeVideoData = await participantChangeVideoPromise;
    if (changeVideoData.videoId !== 'kJQP7kiw5Fk' || changeVideoData.playState !== 'paused' || changeVideoData.currentTime !== 0) {
      throw new Error(`change_video broadcast data mismatch: ${JSON.stringify(changeVideoData)}`);
    }
    console.log(`[PASS] Host emitted change_video: Broadcasted videoId=${changeVideoData.videoId}, state=paused, time=0`);

    // ------------------------------------------------------------------------
    // TEST 2: Moderator Controls Playback (Moderator has equal playback rights)
    // ------------------------------------------------------------------------
    const modPlayPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.PLAY, resolve);
    });

    modClient.emit(SOCKET_EVENTS.PLAY, {});
    const modPlayData = await modPlayPromise;
    if (modPlayData.triggeredBy !== 'CharlieMod') {
      throw new Error('Moderator play was not correctly broadcast');
    }
    console.log('[PASS] Moderator successfully triggered play action');

    const modSeekPromise = new Promise<any>((resolve) => {
      hostClient!.once(SOCKET_EVENTS.SEEK, resolve);
    });

    modClient.emit(SOCKET_EVENTS.SEEK, { time: 100 });
    const modSeekData = await modSeekPromise;
    if (modSeekData.currentTime !== 100 || modSeekData.triggeredBy !== 'CharlieMod') {
      throw new Error('Moderator seek was not correctly broadcast');
    }
    console.log('[PASS] Moderator successfully triggered seek(100s) action');

    // ------------------------------------------------------------------------
    // TEST 3: Participant Authorization Rejection (Security Validation)
    // ------------------------------------------------------------------------
    // Participant emits play -> Must reject with FORBIDDEN_PLAYBACK_CONTROL
    const participantPlayErrorPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    participantClient.emit(SOCKET_EVENTS.PLAY, {});
    const pPlayErr = await participantPlayErrorPromise;
    if (pPlayErr.code !== 'FORBIDDEN_PLAYBACK_CONTROL') {
      throw new Error(`Expected FORBIDDEN_PLAYBACK_CONTROL for participant play, got: ${JSON.stringify(pPlayErr)}`);
    }
    console.log('[PASS] Security: Participant play attempt rejected with FORBIDDEN_PLAYBACK_CONTROL');

    // Participant emits pause -> Must reject
    const participantPauseErrorPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    participantClient.emit(SOCKET_EVENTS.PAUSE, {});
    const pPauseErr = await participantPauseErrorPromise;
    if (pPauseErr.code !== 'FORBIDDEN_PLAYBACK_CONTROL') {
      throw new Error(`Expected FORBIDDEN_PLAYBACK_CONTROL for participant pause, got: ${JSON.stringify(pPauseErr)}`);
    }
    console.log('[PASS] Security: Participant pause attempt rejected with FORBIDDEN_PLAYBACK_CONTROL');

    // Participant emits seek -> Must reject
    const participantSeekErrorPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    participantClient.emit(SOCKET_EVENTS.SEEK, { time: 10 });
    const pSeekErr = await participantSeekErrorPromise;
    if (pSeekErr.code !== 'FORBIDDEN_PLAYBACK_CONTROL') {
      throw new Error(`Expected FORBIDDEN_PLAYBACK_CONTROL for participant seek, got: ${JSON.stringify(pSeekErr)}`);
    }
    console.log('[PASS] Security: Participant seek attempt rejected with FORBIDDEN_PLAYBACK_CONTROL');

    // Participant emits change_video -> Must reject
    const participantChangeVideoErrorPromise = new Promise<any>((resolve) => {
      participantClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    participantClient.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: 'dQw4w9WgXcQ' });
    const pChangeErr = await participantChangeVideoErrorPromise;
    if (pChangeErr.code !== 'FORBIDDEN_PLAYBACK_CONTROL') {
      throw new Error(`Expected FORBIDDEN_PLAYBACK_CONTROL for participant change_video, got: ${JSON.stringify(pChangeErr)}`);
    }
    console.log('[PASS] Security: Participant change_video attempt rejected with FORBIDDEN_PLAYBACK_CONTROL');

    // ------------------------------------------------------------------------
    // TEST 4: Invalid Seek Values (Negative time, NaN, Infinity, Non-numbers)
    // ------------------------------------------------------------------------
    const negativeSeekPromise = new Promise<any>((resolve) => {
      hostClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    hostClient.emit(SOCKET_EVENTS.SEEK, { time: -15 });
    const negErr = await negativeSeekPromise;
    if (negErr.code !== 'INVALID_SEEK_TIME') {
      throw new Error(`Negative seek time was not rejected: ${JSON.stringify(negErr)}`);
    }
    console.log('[PASS] Validation: Negative seek time (-15) rejected with INVALID_SEEK_TIME');

    const nanSeekPromise = new Promise<any>((resolve) => {
      hostClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    hostClient.emit(SOCKET_EVENTS.SEEK, { time: 'not-a-number' as any });
    const nanErr = await nanSeekPromise;
    if (nanErr.code !== 'INVALID_SEEK_TIME') {
      throw new Error(`NaN seek time was not rejected: ${JSON.stringify(nanErr)}`);
    }
    console.log('[PASS] Validation: NaN/string seek time rejected with INVALID_SEEK_TIME');

    // ------------------------------------------------------------------------
    // TEST 5: Invalid Video ID & Malicious XSS URL Handling
    // ------------------------------------------------------------------------
    const invalidVideoPromise = new Promise<any>((resolve) => {
      hostClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    hostClient.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: 'invalid_too_short' });
    const invalidVideoErr = await invalidVideoPromise;
    if (invalidVideoErr.code !== 'INVALID_VIDEO_ID') {
      throw new Error(`Invalid video ID was not rejected: ${JSON.stringify(invalidVideoErr)}`);
    }
    console.log('[PASS] Validation: Malformed video ID rejected with INVALID_VIDEO_ID');

    const xssVideoPromise = new Promise<any>((resolve) => {
      hostClient!.once(SOCKET_EVENTS.ERROR, resolve);
    });
    hostClient.emit(SOCKET_EVENTS.CHANGE_VIDEO, { videoId: '<script>alert("hack")</script>' });
    const xssErr = await xssVideoPromise;
    if (xssErr.code !== 'INVALID_VIDEO_ID') {
      throw new Error(`XSS video injection was not rejected: ${JSON.stringify(xssErr)}`);
    }
    console.log('[PASS] Validation: Malicious XSS video string rejected with INVALID_VIDEO_ID');

    console.log('--- ALL PLAYBACK SYNCHRONIZATION TESTS PASSED SUCCESSFULLY ---');
  } finally {
    if (testRoomId) {
      await RoomModel.deleteOne({ roomCode: testRoomId });
    }
    if (hostClient) hostClient.disconnect();
    if (modClient) modClient.disconnect();
    if (participantClient) participantClient.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    ioServer.close();
    httpServer.close();
    await disconnectDatabase();
  }
}

runPlaybackSyncTests().catch((err) => {
  console.error('Playback sync test failed:', err);
  process.exit(1);
});
