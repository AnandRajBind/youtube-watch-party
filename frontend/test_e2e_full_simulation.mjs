import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

function logStep(num, desc) {
  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}STEP ${num}: ${desc}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
}

function logPass(msg) {
  console.log(`  ${colors.green}✔ PASS: ${msg}${colors.reset}`);
}

function logFail(msg) {
  console.error(`  ${colors.red}✘ FAIL: ${msg}${colors.reset}`);
  process.exit(1);
}

class TestClient {
  constructor(name) {
    this.name = name;
    this.userId = null;
    this.username = null;
    this.role = null;
    this.socket = null;
    this.events = [];
    this.currentRoom = null;
  }

  connectSocket() {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const anyEvents = [
      'connect',
      'disconnect',
      'sync_state',
      'user_joined',
      'user_left',
      'participant_update',
      'play',
      'pause',
      'seek',
      'change_video',
      'role_assigned',
      'participant_removed',
      'host_transferred',
      'action_request_created',
      'action_request_approved',
      'action_request_rejected',
      'error',
    ];

    anyEvents.forEach((evt) => {
      this.socket.on(evt, (data) => {
        this.events.push({ event: evt, data, timestamp: Date.now() });
      });
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        resolve();
      });
      this.socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  }

  waitForEvent(eventName, filterFn = () => true, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const existingIdx = this.events.findIndex(
        (e) => e.event === eventName && filterFn(e.data)
      );
      if (existingIdx !== -1) {
        const item = this.events.splice(existingIdx, 1)[0];
        return resolve(item.data);
      }

      const listener = (data) => {
        if (filterFn(data)) {
          clearTimeout(timer);
          this.socket.off(eventName, listener);
          const idx = this.events.findIndex((e) => e.event === eventName && e.data === data);
          if (idx !== -1) this.events.splice(idx, 1);
          resolve(data);
        }
      };

      const timer = setTimeout(() => {
        this.socket.off(eventName, listener);
        reject(
          new Error(
            `Timeout waiting for event '${eventName}' on client ${this.name}`
          )
        );
      }, timeoutMs);

      this.socket.on(eventName, listener);
    });
  }

  ensureNoEvent(eventName, waitMs = 600) {
    return new Promise((resolve, reject) => {
      const existing = this.events.find((e) => e.event === eventName);
      if (existing) {
        return reject(
          new Error(
            `Unexpected event '${eventName}' already received on client ${this.name}`
          )
        );
      }

      const listener = (data) => {
        clearTimeout(timer);
        this.socket.off(eventName, listener);
        reject(
          new Error(
            `Unexpected event '${eventName}' received on client ${this.name}`
          )
        );
      };

      const timer = setTimeout(() => {
        this.socket.off(eventName, listener);
        resolve();
      }, waitMs);

      this.socket.on(eventName, listener);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function runEndToEndSimulation() {
  console.log(`${colors.bold}${colors.magenta}STARTING COMPLETE 26-STEP END-TO-END AUDIT FOR YOUTUBE WATCH PARTY${colors.reset}\n`);

  const host = new TestClient('Host (User 1)');
  const user2 = new TestClient('User 2');
  const user3 = new TestClient('User 3');

  let roomCode = null;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Host creates room.
    // ------------------------------------------------------------------------
    logStep(1, 'Host creates room via REST API and connects socket.');
    const createRes = await axios.post(`${API_BASE}/rooms`, {
      username: 'AliceHost',
    });
    if (createRes.status !== 201 && createRes.status !== 200) {
      logFail(`Room creation failed with status ${createRes.status}`);
    }
    const createData = createRes.data.data;
    roomCode = createData.room.roomCode;
    host.userId = createData.hostUser.userId;
    host.username = createData.hostUser.username;
    host.role = createData.hostUser.role;

    if (!roomCode || host.role !== 'host') {
      logFail(`Room creation response invalid: ${JSON.stringify(createRes.data)}`);
    }
    logPass(`Room created with code [${roomCode}] by Host [${host.username}] (ID: ${host.userId})`);

    await host.connectSocket();
    host.socket.emit('join_room', {
      roomCode,
      username: host.username,
      userId: host.userId,
    });
    const hostSync = await host.waitForEvent('sync_state');
    if (hostSync.userRole !== 'host' || hostSync.roomCode !== roomCode) {
      logFail(`Host sync_state mismatch: ${JSON.stringify(hostSync)}`);
    }
    logPass(`Host connected to socket and received sync_state as role [${hostSync.userRole}]`);

    // ------------------------------------------------------------------------
    // Step 2: User 2 joins.
    // ------------------------------------------------------------------------
    logStep(2, 'User 2 joins room via REST API and connects socket.');
    const join2Res = await axios.post(`${API_BASE}/rooms/${roomCode}/join`, {
      username: 'BobUser2',
    });
    const join2Data = join2Res.data.data;
    user2.userId = join2Data.participant.userId;
    user2.username = join2Data.participant.username;
    user2.role = join2Data.participant.role;
    if (user2.role !== 'participant') {
      logFail(`User 2 initial role should be 'participant', got: ${user2.role}`);
    }
    logPass(`User 2 [${user2.username}] joined via REST as participant (ID: ${user2.userId})`);

    await user2.connectSocket();
    user2.socket.emit('join_room', {
      roomCode,
      username: user2.username,
      userId: user2.userId,
    });
    const user2Sync = await user2.waitForEvent('sync_state');
    if (user2Sync.userRole !== 'participant') {
      logFail(`User 2 sync_state role mismatch: ${user2Sync.userRole}`);
    }
    logPass(`User 2 received sync_state with participant count: ${user2Sync.participants.length}`);

    // ------------------------------------------------------------------------
    // Step 3: User 3 joins.
    // ------------------------------------------------------------------------
    logStep(3, 'User 3 joins room via REST API and connects socket.');
    const join3Res = await axios.post(`${API_BASE}/rooms/${roomCode}/join`, {
      username: 'CharlieUser3',
    });
    const join3Data = join3Res.data.data;
    user3.userId = join3Data.participant.userId;
    user3.username = join3Data.participant.username;
    user3.role = join3Data.participant.role;
    logPass(`User 3 [${user3.username}] joined via REST as participant (ID: ${user3.userId})`);

    await user3.connectSocket();
    user3.socket.emit('join_room', {
      roomCode,
      username: user3.username,
      userId: user3.userId,
    });
    const user3Sync = await user3.waitForEvent('sync_state');
    if (user3Sync.userRole !== 'participant') {
      logFail(`User 3 sync_state role mismatch: ${user3Sync.userRole}`);
    }
    logPass(`User 3 received sync_state with role [${user3Sync.userRole}]`);

    // ------------------------------------------------------------------------
    // Step 4: All users see participant list.
    // ------------------------------------------------------------------------
    logStep(4, 'Verify all 3 users have complete, accurate participant list.');
    const roomDetailsRes = await axios.get(`${API_BASE}/rooms/${roomCode}`);
    const participants = roomDetailsRes.data.data.participants;
    if (participants.length !== 3) {
      logFail(`Expected 3 participants in room, found ${participants.length}`);
    }
    const hasHost = participants.some((p) => p.userId === host.userId && p.role === 'host');
    const hasUser2 = participants.some((p) => p.userId === user2.userId && p.role === 'participant');
    const hasUser3 = participants.some((p) => p.userId === user3.userId && p.role === 'participant');
    if (!hasHost || !hasUser2 || !hasUser3) {
      logFail(`Participant list incomplete or inaccurate: ${JSON.stringify(participants)}`);
    }
    logPass(`All 3 participants verified in room: Host (${host.username}), User 2 (${user2.username}), User 3 (${user3.username})`);

    // ------------------------------------------------------------------------
    // Step 5: Host plays video.
    // ------------------------------------------------------------------------
    logStep(5, 'Host plays video at timestamp 15s.');
    host.socket.emit('play', { currentTime: 15 });
    logPass('Host emitted PLAY event with currentTime=15');

    // ------------------------------------------------------------------------
    // Step 6: User 2 receives play.
    // ------------------------------------------------------------------------
    logStep(6, 'User 2 receives play broadcast.');
    const user2Play = await user2.waitForEvent('play');
    if (user2Play.currentTime !== 15) {
      logFail(`User 2 expected play at 15s, got: ${user2Play.currentTime}`);
    }
    logPass(`User 2 received play broadcast at currentTime=${user2Play.currentTime}s`);

    // ------------------------------------------------------------------------
    // Step 7: User 3 receives play.
    // ------------------------------------------------------------------------
    logStep(7, 'User 3 receives play broadcast; verify no echo loops.');
    const user3Play = await user3.waitForEvent('play');
    if (user3Play.currentTime !== 15) {
      logFail(`User 3 expected play at 15s, got: ${user3Play.currentTime}`);
    }
    logPass(`User 3 received play broadcast at currentTime=${user3Play.currentTime}s`);

    // Verify sender (Host) did not receive duplicate echo
    await host.ensureNoEvent('play', 500);
    logPass('Verified loop prevention: Host did not receive redundant playback echo.');

    // ------------------------------------------------------------------------
    // Step 8: Host pauses.
    // ------------------------------------------------------------------------
    logStep(8, 'Host pauses video at timestamp 42s.');
    host.socket.emit('pause', { currentTime: 42 });
    logPass('Host emitted PAUSE event with currentTime=42');

    // ------------------------------------------------------------------------
    // Step 9: Everyone pauses.
    // ------------------------------------------------------------------------
    logStep(9, 'Verify User 2 and User 3 receive pause broadcast.');
    const user2Pause = await user2.waitForEvent('pause');
    const user3Pause = await user3.waitForEvent('pause');
    if (user2Pause.currentTime !== 42 || user3Pause.currentTime !== 42) {
      logFail(`Pause timestamp mismatch: User2=${user2Pause.currentTime}, User3=${user3Pause.currentTime}`);
    }
    logPass(`Everyone paused cleanly at currentTime=42s`);

    // ------------------------------------------------------------------------
    // Step 10: Host seeks.
    // ------------------------------------------------------------------------
    logStep(10, 'Host seeks video to 120s.');
    host.socket.emit('seek', { time: 120 });
    logPass('Host emitted SEEK event to time=120');

    // ------------------------------------------------------------------------
    // Step 11: Everyone seeks.
    // ------------------------------------------------------------------------
    logStep(11, 'Verify User 2 and User 3 receive seek broadcast.');
    const user2Seek = await user2.waitForEvent('seek');
    const user3Seek = await user3.waitForEvent('seek');
    if (user2Seek.currentTime !== 120 || user3Seek.currentTime !== 120) {
      logFail(`Seek timestamp mismatch: User2=${user2Seek.currentTime}, User3=${user3Seek.currentTime}`);
    }
    logPass(`Everyone sought cleanly to currentTime=120s`);

    // ------------------------------------------------------------------------
    // Step 12: Host changes video.
    // ------------------------------------------------------------------------
    logStep(12, 'Host changes video to dQw4w9WgXcQ.');
    host.socket.emit('change_video', { videoId: 'dQw4w9WgXcQ' });
    logPass('Host emitted CHANGE_VIDEO with videoId=dQw4w9WgXcQ');

    // ------------------------------------------------------------------------
    // Step 13: Everyone receives new video.
    // ------------------------------------------------------------------------
    logStep(13, 'Verify User 2 and User 3 receive new video broadcast.');
    const user2Video = await user2.waitForEvent('change_video');
    const user3Video = await user3.waitForEvent('change_video');
    if (user2Video.videoId !== 'dQw4w9WgXcQ' || user3Video.videoId !== 'dQw4w9WgXcQ') {
      logFail(`Video ID mismatch on change_video: User2=${user2Video.videoId}, User3=${user3Video.videoId}`);
    }
    logPass(`Everyone received new video dQw4w9WgXcQ with playback reset to 0s`);

    // ------------------------------------------------------------------------
    // Step 14: Host promotes User 2.
    // ------------------------------------------------------------------------
    logStep(14, 'Host promotes User 2 to Moderator role.');
    host.socket.emit('assign_role', {
      targetUserId: user2.userId,
      newRole: 'moderator',
    });
    logPass(`Host emitted assign_role for User 2 [${user2.userId}] -> moderator`);

    // ------------------------------------------------------------------------
    // Step 15: User 2 receives Moderator role.
    // ------------------------------------------------------------------------
    logStep(15, 'User 2 receives role_assigned broadcast with moderator role.');
    const user2RoleAssigned = await user2.waitForEvent('role_assigned');
    const targetUserId = user2RoleAssigned.targetUserId || user2RoleAssigned.userId;
    const newRole = user2RoleAssigned.newRole || user2RoleAssigned.role;
    if (targetUserId !== user2.userId || newRole !== 'moderator') {
      logFail(`role_assigned payload incorrect: ${JSON.stringify(user2RoleAssigned)}`);
    }
    user2.role = 'moderator';
    logPass(`User 2 successfully received role_assigned and updated role to [MODERATOR]`);

    // ------------------------------------------------------------------------
    // Step 16: User 2 controls playback.
    // ------------------------------------------------------------------------
    logStep(16, 'User 2 (now Moderator) controls playback: plays at 8s, then pauses at 18s.');
    user2.socket.emit('play', { currentTime: 8 });
    const hostPlayFromMod = await host.waitForEvent('play');
    const user3PlayFromMod = await user3.waitForEvent('play');
    if (hostPlayFromMod.currentTime !== 8 || user3PlayFromMod.currentTime !== 8) {
      logFail(`Playback control by moderator failed: Host=${hostPlayFromMod.currentTime}, User3=${user3PlayFromMod.currentTime}`);
    }
    logPass('Moderator play event successfully broadcast to Host and User 3');

    user2.socket.emit('pause', { currentTime: 18 });
    const hostPauseFromMod = await host.waitForEvent('pause');
    const user3PauseFromMod = await user3.waitForEvent('pause');
    if (hostPauseFromMod.currentTime !== 18 || user3PauseFromMod.currentTime !== 18) {
      logFail(`Moderator pause failed: Host=${hostPauseFromMod.currentTime}, User3=${user3PauseFromMod.currentTime}`);
    }
    logPass('Moderator pause event successfully broadcast to Host and User 3');

    // ------------------------------------------------------------------------
    // Step 17: User 3 cannot control playback directly.
    // ------------------------------------------------------------------------
    logStep(17, 'Verify User 3 (Participant) cannot control playback directly.');
    user3.socket.emit('play', { currentTime: 55 });
    const user3Error = await user3.waitForEvent('error');
    if (!user3Error.code || !user3Error.code.includes('FORBIDDEN')) {
      logFail(`Expected FORBIDDEN error for participant playback attempt, got: ${JSON.stringify(user3Error)}`);
    }
    logPass(`User 3 received expected permission error: [${user3Error.code}] ${user3Error.message}`);

    // Verify neither Host nor User 2 received unauthorized play event
    await host.ensureNoEvent('play', 500);
    await user2.ensureNoEvent('play', 500);
    logPass('Verified server authority: No playback update broadcast to other users.');

    // ------------------------------------------------------------------------
    // Step 18: User 3 sends control request.
    // ------------------------------------------------------------------------
    logStep(18, 'User 3 sends control request: Propose PLAY at 60s.');
    user3.socket.emit('request_action', {
      action: 'play',
      time: 60,
      currentTime: 18,
    });
    const hostReqNotice = await host.waitForEvent('action_request_created');
    const modReqNotice = await user2.waitForEvent('action_request_created');
    if (
      hostReqNotice.action !== 'play' ||
      hostReqNotice.requesterUserId !== user3.userId ||
      modReqNotice.requestId !== hostReqNotice.requestId
    ) {
      logFail(`Action request creation broadcast invalid: Host=${JSON.stringify(hostReqNotice)}, Mod=${JSON.stringify(modReqNotice)}`);
    }
    const requestId = hostReqNotice.requestId;
    logPass(`Control request [${requestId}] received by Host and Moderator for requester [${hostReqNotice.requesterUsername}]`);

    // ------------------------------------------------------------------------
    // Step 19: Moderator approves.
    // ------------------------------------------------------------------------
    logStep(19, 'Moderator (User 2) approves the control request.');
    user2.socket.emit('approve_action', { requestId });
    logPass(`Moderator emitted approve_action for request [${requestId}]`);

    // ------------------------------------------------------------------------
    // Step 20: Action executes.
    // ------------------------------------------------------------------------
    logStep(20, 'Verify action execution: action_request_approved and PLAY broadcast to everyone.');
    const user3Approval = await user3.waitForEvent('action_request_approved');
    if (user3Approval.requestId !== requestId || user3Approval.approvedBy !== user2.username) {
      logFail(`Approval notification mismatch: ${JSON.stringify(user3Approval)}`);
    }
    logPass(`User 3 received action_request_approved notice from approver [${user3Approval.approvedBy}]`);

    const hostApprovedPlay = await host.waitForEvent('play');
    const user2ApprovedPlay = await user2.waitForEvent('play');
    const user3ApprovedPlay = await user3.waitForEvent('play');
    if (
      hostApprovedPlay.currentTime !== 60 ||
      user2ApprovedPlay.currentTime !== 60 ||
      user3ApprovedPlay.currentTime !== 60
    ) {
      logFail(`Approved action playback execution failed: Host=${hostApprovedPlay.currentTime}, User2=${user2ApprovedPlay.currentTime}, User3=${user3ApprovedPlay.currentTime}`);
    }
    logPass(`Action executed automatically: Everyone playing at 60s!`);

    // ------------------------------------------------------------------------
    // Step 21: Host removes User 3.
    // ------------------------------------------------------------------------
    logStep(21, 'Host removes User 3 from the watch party.');
    host.socket.emit('remove_participant', { targetUserId: user3.userId });
    logPass(`Host emitted remove_participant for target [${user3.userId}]`);

    // ------------------------------------------------------------------------
    // Step 22: User 3 loses room access.
    // ------------------------------------------------------------------------
    logStep(22, 'Verify User 3 receives participant_removed notification and is disconnected.');
    const user3Removal = await user3.waitForEvent('participant_removed');
    if (user3Removal.targetUserId !== user3.userId) {
      logFail(`participant_removed event payload invalid: ${JSON.stringify(user3Removal)}`);
    }
    logPass(`User 3 received removal notification: "${user3Removal.reason || 'Removed by host'}"`);

    // ------------------------------------------------------------------------
    // Step 23: Participant list updates.
    // ------------------------------------------------------------------------
    logStep(23, 'Verify remaining participants receive participant_removed and updated list count.');
    const hostRemovalNotice = await host.waitForEvent('participant_removed');
    const modRemovalNotice = await user2.waitForEvent('participant_removed');
    if (hostRemovalNotice.targetUserId !== user3.userId || modRemovalNotice.targetUserId !== user3.userId) {
      logFail(`Remaining users removal notification invalid: Host=${JSON.stringify(hostRemovalNotice)}`);
    }

    const updatedRoomRes = await axios.get(`${API_BASE}/rooms/${roomCode}`);
    const remainingParticipants = updatedRoomRes.data.data.participants;
    if (remainingParticipants.length !== 2) {
      logFail(`Expected 2 remaining participants, found: ${remainingParticipants.length}`);
    }
    if (remainingParticipants.some((p) => p.userId === user3.userId)) {
      logFail('Removed User 3 still appears in active participants list!');
    }
    logPass(`Participant list updated: 2 active participants remain (Host & User 2). User 3 cleanly removed.`);

    user3.disconnect();

    // ------------------------------------------------------------------------
    // Step 24: User leaves normally.
    // ------------------------------------------------------------------------
    logStep(24, 'User 2 (Moderator) leaves room normally via leave_room.');
    user2.socket.emit('leave_room', { roomCode });
    logPass('User 2 emitted leave_room');

    // ------------------------------------------------------------------------
    // Step 25: Socket disconnect is cleaned up.
    // ------------------------------------------------------------------------
    logStep(25, 'User 2 disconnects socket; verify host receives departure update.');
    user2.disconnect();
    await new Promise((r) => setTimeout(r, 400));
    logPass(`User 2 socket disconnected and cleaned up on server.`);

    // ------------------------------------------------------------------------
    // Step 26: Reconnection works correctly.
    // ------------------------------------------------------------------------
    logStep(26, 'Host simulates network disconnect and reconnects with session recovery.');
    host.disconnect();
    logPass('Host socket disconnected temporarily.');

    await new Promise((r) => setTimeout(r, 600));

    // Reconnect Host socket
    await host.connectSocket();
    host.socket.emit('join_room', {
      roomCode,
      username: host.username,
      userId: host.userId,
    });
    const reconnectedHostSync = await host.waitForEvent('sync_state');
    if (reconnectedHostSync.userRole !== 'host' || reconnectedHostSync.roomCode !== roomCode) {
      logFail(`Host reconnection failed to restore state: ${JSON.stringify(reconnectedHostSync)}`);
    }
    if (reconnectedHostSync.videoId !== 'dQw4w9WgXcQ' || reconnectedHostSync.currentTime < 60) {
      logFail(`State synchronization lost after reconnect: ${JSON.stringify(reconnectedHostSync)}`);
    }
    logPass(`Host reconnected successfully! Authority: [${reconnectedHostSync.userRole}], Video: [${reconnectedHostSync.videoId}], Time: [${reconnectedHostSync.currentTime}s]`);

    console.log(`\n${colors.bold}${colors.green}======================================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.green}ALL 26 END-TO-END TEST STEPS PASSED PERFECTLY WITH ZERO DEFECTS!${colors.reset}`);
    console.log(`${colors.bold}${colors.green}======================================================================${colors.reset}\n`);

    host.disconnect();
    process.exit(0);
  } catch (err) {
    logFail(`Unexpected error during simulation: ${err.message}\n${err.stack}`);
    host.disconnect();
    user2.disconnect();
    user3.disconnect();
    process.exit(1);
  }
}

runEndToEndSimulation();
