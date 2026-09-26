import http from 'http';
import assert from 'assert';
import mongoose from 'mongoose';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { initSocketServer } from '../src/sockets';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { Role } from '../src/types/room.types';
import { SOCKET_EVENTS } from '../src/sockets/socketTypes';
import {
  canControlPlayback,
  canManageRoles,
  canRemoveParticipant,
  canTransferHost,
  hasPermission,
  isHost,
  Permission,
  requireRole,
} from '../src/services/permissionService';

const TEST_PORT = 5055;
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

async function runRbacTests() {
  console.log('--- Starting Centralized RBAC Tests ---');
  let httpServer: http.Server;
  let ioServer: any;

  try {
    await connectDatabase();
    httpServer = http.createServer(app);
    ioServer = initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });

    // ========================================================================
    // 1. UNIT TESTS: Centralized Permission Matrix & Helpers
    // ========================================================================
    console.log('[TEST 1] Verifying Centralized Permission Matrix & Helpers...');

    // Host permissions
    assert.strictEqual(hasPermission(Role.HOST, Permission.PLAY), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.PAUSE), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.SEEK), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.CHANGE_VIDEO), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.ASSIGN_ROLE), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.REMOVE_PARTICIPANT), true);
    assert.strictEqual(hasPermission(Role.HOST, Permission.TRANSFER_HOST), true);

    // Moderator permissions
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.PLAY), true);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.PAUSE), true);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.SEEK), true);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.CHANGE_VIDEO), true);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.ASSIGN_ROLE), false);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.REMOVE_PARTICIPANT), false);
    assert.strictEqual(hasPermission(Role.MODERATOR, Permission.TRANSFER_HOST), false);

    // Participant permissions (Watch only)
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.PLAY), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.PAUSE), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.SEEK), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.CHANGE_VIDEO), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.ASSIGN_ROLE), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.REMOVE_PARTICIPANT), false);
    assert.strictEqual(hasPermission(Role.PARTICIPANT, Permission.TRANSFER_HOST), false);

    // Helper functions
    assert.strictEqual(isHost(Role.HOST), true);
    assert.strictEqual(isHost(Role.MODERATOR), false);
    assert.strictEqual(isHost(Role.PARTICIPANT), false);

    assert.strictEqual(canControlPlayback(Role.HOST), true);
    assert.strictEqual(canControlPlayback(Role.MODERATOR), true);
    assert.strictEqual(canControlPlayback(Role.PARTICIPANT), false);

    assert.strictEqual(canManageRoles(Role.HOST), true);
    assert.strictEqual(canManageRoles(Role.MODERATOR), false);
    assert.strictEqual(canManageRoles(Role.PARTICIPANT), false);

    assert.strictEqual(canRemoveParticipant(Role.HOST), true);
    assert.strictEqual(canRemoveParticipant(Role.MODERATOR), false);
    assert.strictEqual(canRemoveParticipant(Role.PARTICIPANT), false);

    assert.strictEqual(canTransferHost(Role.HOST), true);
    assert.strictEqual(canTransferHost(Role.MODERATOR), false);
    assert.strictEqual(canTransferHost(Role.PARTICIPANT), false);

    // requireRole helper
    assert.doesNotThrow(() => requireRole(Role.HOST, [Role.HOST]));
    assert.doesNotThrow(() => requireRole(Role.MODERATOR, [Role.HOST, Role.MODERATOR]));
    assert.throws(
      () => requireRole(Role.PARTICIPANT, [Role.HOST, Role.MODERATOR], 'control playback'),
      (err: any) => err.statusCode === 403 && err.errorCode === 'FORBIDDEN'
    );

    console.log('[PASS] Permission Matrix and all reusable helpers verified correctly.');

    // ========================================================================
    // 2. INTEGRATION SETUP: Room with Host, Moderator, and Participant
    // ========================================================================
    const hostCreated = await roomService.createRoom('AliceHost');
    const roomCode = hostCreated.room.roomCode;
    const hostUserId = hostCreated.hostUser.userId;

    const modJoin = await roomService.joinRoom(roomCode, 'mod-user-1', 'CharlieMod');
    const modUserId = modJoin.participant.userId;
    // Upgrade Charlie to moderator via roomService
    await roomService.assignRole(roomCode, hostUserId, modUserId, Role.MODERATOR);

    const partJoin = await roomService.joinRoom(roomCode, 'part-user-1', 'BobParticipant');
    const partUserId = partJoin.participant.userId;

    // Connect WebSockets
    const hostSocket = createClientSocket();
    const modSocket = createClientSocket();
    const partSocket = createClientSocket();

    await Promise.all([
      waitForEvent(hostSocket, 'connect'),
      waitForEvent(modSocket, 'connect'),
      waitForEvent(partSocket, 'connect'),
    ]);

    // Host joins
    const hostSyncPromise = waitForEvent(hostSocket, SOCKET_EVENTS.SYNC_STATE);
    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'AliceHost', userId: hostUserId });
    const hostSync: any = await hostSyncPromise;
    assert.strictEqual(hostSync.userRole, Role.HOST);

    // Mod joins
    const modSyncPromise = waitForEvent(modSocket, SOCKET_EVENTS.SYNC_STATE);
    modSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'CharlieMod', userId: modUserId });
    const modSync: any = await modSyncPromise;
    assert.strictEqual(modSync.userRole, Role.MODERATOR);

    // Part joins
    const partSyncPromise = waitForEvent(partSocket, SOCKET_EVENTS.SYNC_STATE);
    partSocket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, username: 'BobParticipant', userId: partUserId });
    const partSync: any = await partSyncPromise;
    assert.strictEqual(partSync.userRole, Role.PARTICIPANT);

    console.log('[PASS] Setup room and connected all 3 authenticated clients.');

    // ========================================================================
    // 3. CLIENT ROLE SPOOFING PREVENTION
    // Client attempts to upgrade role by sending { role: "host" } or { role: "moderator" }
    // ========================================================================
    console.log('[TEST 3] Verifying Client Role Spoofing Prevention...');
    const attackerSocket = createClientSocket();
    await waitForEvent(attackerSocket, 'connect');

    const attackerSyncPromise = waitForEvent(attackerSocket, SOCKET_EVENTS.SYNC_STATE);
    attackerSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode,
      username: 'SneakyAttacker',
      role: 'host', // Client attempt to spoof host!
    } as any);

    const attackerSync: any = await attackerSyncPromise;
    assert.strictEqual(
      attackerSync.userRole,
      Role.PARTICIPANT,
      'Server MUST ignore client-provided role and assign server-side role (participant)'
    );

    // Attacker attempts to pause playback
    const attackerErrorPromise = waitForEvent(attackerSocket, SOCKET_EVENTS.ERROR);
    attackerSocket.emit(SOCKET_EVENTS.PAUSE, {});
    const attackerError: any = await attackerErrorPromise;
    assert.strictEqual(attackerError.code, 'FORBIDDEN_PLAYBACK_CONTROL');
    console.log('[PASS] Role spoofing prevented: Attacker forced to participant and denied playback control.');
    attackerSocket.disconnect();

    // ========================================================================
    // 4. ROLE ASSIGNMENT: assign_role
    // Payload: { userId, role }
    // Requirements: Host only, valid target roles (moderator, participant),
    // target user must exist in room, no multiple hosts, host protected.
    // ========================================================================
    console.log('[TEST 4] Testing assign_role RBAC, Validations, and Broadcasts...');

    // 4a: Participant tries to assign role -> Rejected
    const partAssignErrorPromise = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: Role.MODERATOR,
    });
    const partAssignError: any = await partAssignErrorPromise;
    assert.strictEqual(partAssignError.code, 'FORBIDDEN_ROLE_MANAGEMENT');
    console.log('[PASS] Participant cannot assign roles (rejected with FORBIDDEN_ROLE_MANAGEMENT).');

    // 4b: Participant attempts to make themselves host -> Rejected
    const partSelfHostErrorPromise = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: 'host',
    });
    const partSelfHostError: any = await partSelfHostErrorPromise;
    assert.strictEqual(partSelfHostError.code, 'FORBIDDEN_ROLE_MANAGEMENT');
    console.log('[PASS] Participant cannot make themselves host.');

    // 4c: Moderator tries to assign role -> Rejected
    const modAssignErrorPromise = waitForEvent(modSocket, SOCKET_EVENTS.ERROR);
    modSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: Role.MODERATOR,
    });
    const modAssignError: any = await modAssignErrorPromise;
    assert.strictEqual(modAssignError.code, 'FORBIDDEN_ROLE_MANAGEMENT');
    console.log('[PASS] Moderator cannot assign roles (rejected with FORBIDDEN_ROLE_MANAGEMENT).');

    // 4d: Host attempts to assign 'host' role through assign_role -> Rejected
    const assignHostErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: 'host',
    });
    const assignHostError: any = await assignHostErrorPromise;
    assert.strictEqual(assignHostError.code, 'CANNOT_ASSIGN_HOST_ROLE');
    console.log('[PASS] Attempt to assign host role rejected (prevent multiple hosts / multiple host creation).');

    // 4e: Host attempts to assign an invalid role ('superadmin') -> Rejected
    const invalidRoleErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: 'superadmin',
    });
    const invalidRoleError: any = await invalidRoleErrorPromise;
    assert.strictEqual(invalidRoleError.code, 'INVALID_ROLE');
    console.log('[PASS] Invalid role rejected with INVALID_ROLE.');

    // 4f: Target user outside room / unknown user -> Rejected
    const unknownUserErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: 'unknown-uuid-999',
      role: Role.MODERATOR,
    });
    const unknownUserError: any = await unknownUserErrorPromise;
    assert.strictEqual(unknownUserError.code, 'USER_NOT_FOUND');
    console.log('[PASS] Unknown user / user outside room rejected with USER_NOT_FOUND.');

    // 4g: Host role protection: Host attempts to alter their own role via assign_role -> Rejected
    const protectHostErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: hostUserId,
      role: Role.PARTICIPANT,
    });
    const protectHostError: any = await protectHostErrorPromise;
    assert.strictEqual(protectHostError.code, 'PROTECTED_HOST_ROLE');
    console.log('[PASS] Host role protected: Host cannot alter host role via assign_role.');

    // 4h: Valid assignment: Host promotes Bob to MODERATOR using { userId, role } payload
    const hostRoleAssignedPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    const modRoleAssignedPromise = waitForEvent(modSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    const partRoleAssignedPromise = waitForEvent(partSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    const partUpdatePromise = waitForEvent(partSocket, SOCKET_EVENTS.PARTICIPANT_UPDATE);

    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: 'moderator',
    });

    const [hostBroadcast, modBroadcast, partBroadcast, partUpdate]: any = await Promise.all([
      hostRoleAssignedPromise,
      modRoleAssignedPromise,
      partRoleAssignedPromise,
      partUpdatePromise,
    ]);

    assert.strictEqual(partBroadcast.userId, partUserId);
    assert.strictEqual(partBroadcast.role, Role.MODERATOR);
    assert.strictEqual(partBroadcast.targetUserId, partUserId);
    assert.strictEqual(partBroadcast.newRole, Role.MODERATOR);
    assert.strictEqual(partBroadcast.updatedBy, 'AliceHost');
    assert.strictEqual(hostBroadcast.role, Role.MODERATOR);
    assert.strictEqual(modBroadcast.role, Role.MODERATOR);

    // Verify Bob is now moderator in participant list
    const updatedBob = partUpdate.participants.find((p: any) => p.userId === partUserId);
    assert.strictEqual(updatedBob.role, Role.MODERATOR);
    console.log('[PASS] Host successfully promoted Bob to Moderator via { userId, role } and broadcasted role_assigned + participant_update.');

    // 4i: Now Bob (as newly promoted Moderator) can control playback!
    const modPlayPromise = waitForEvent(hostSocket, SOCKET_EVENTS.PLAY);
    partSocket.emit(SOCKET_EVENTS.PLAY, { currentTime: 10 });
    const playData: any = await modPlayPromise;
    assert.strictEqual(playData.currentTime, 10);
    assert.strictEqual(playData.triggeredBy, 'BobParticipant');
    console.log('[PASS] Promoted user can now control playback.');

    // 4j: Host demotes Bob back to PARTICIPANT using { userId, role }
    const demoteBroadcastPromise = waitForEvent(partSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    hostSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      userId: partUserId,
      role: 'participant',
    });
    const demoteData: any = await demoteBroadcastPromise;
    assert.strictEqual(demoteData.userId, partUserId);
    assert.strictEqual(demoteData.role, Role.PARTICIPANT);

    // 4k: Bob should now be blocked from playback controls again
    const demoteErrorPromise = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.PAUSE, {});
    const demoteError: any = await demoteErrorPromise;
    assert.strictEqual(demoteError.code, 'FORBIDDEN_PLAYBACK_CONTROL');
    console.log('[PASS] Demoted user is immediately blocked from playback controls.');

    // ========================================================================
    // 5. PARTICIPANT REMOVAL: remove_participant
    // Payload: { userId }
    // Requirements: Host only, Host cannot remove themselves, target must belong
    // to room, notify removed user before disconnect, update active state & DB,
    // broadcast participant_removed + updated participant list, handle race conditions.
    // ========================================================================
    console.log('[TEST 5] Testing remove_participant RBAC, Validations, and Broadcasts...');

    // 5a: Moderator tries to remove participant -> Rejected
    const modRemoveErrorPromise = waitForEvent(modSocket, SOCKET_EVENTS.ERROR);
    modSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: partUserId });
    const modRemoveError: any = await modRemoveErrorPromise;
    assert.strictEqual(modRemoveError.code, 'FORBIDDEN_REMOVE_PARTICIPANT');
    console.log('[PASS] Moderator cannot remove participants (rejected with FORBIDDEN_REMOVE_PARTICIPANT).');

    // 5b: Participant tries to remove someone -> Rejected
    const partRemoveErrorPromise = waitForEvent(partSocket, SOCKET_EVENTS.ERROR);
    partSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: modUserId });
    const partRemoveError: any = await partRemoveErrorPromise;
    assert.strictEqual(partRemoveError.code, 'FORBIDDEN_REMOVE_PARTICIPANT');
    console.log('[PASS] Participant cannot remove participants (rejected with FORBIDDEN_REMOVE_PARTICIPANT).');

    // 5c: Host attempts to remove themselves -> Rejected
    const selfRemoveErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: hostUserId });
    const selfRemoveError: any = await selfRemoveErrorPromise;
    assert.strictEqual(selfRemoveError.code, 'CANNOT_REMOVE_HOST');
    console.log('[PASS] Host cannot remove themselves (rejected with CANNOT_REMOVE_HOST).');

    // 5d: Target user outside room / unknown user -> Rejected
    const unknownRemoveErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: 'non-existent-user-uuid' });
    const unknownRemoveError: any = await unknownRemoveErrorPromise;
    assert.strictEqual(unknownRemoveError.code, 'USER_NOT_FOUND');
    console.log('[PASS] Removing unknown user outside room rejected with USER_NOT_FOUND.');

    // 5e: Valid Removal: Host removes Bob (partUserId) using { userId } payload
    const partRemovedOnBobPromise = waitForEvent(partSocket, SOCKET_EVENTS.PARTICIPANT_REMOVED);
    const bobDisconnectPromise = waitForEvent(partSocket, 'disconnect');
    const partRemovedOnModPromise = waitForEvent(modSocket, SOCKET_EVENTS.PARTICIPANT_REMOVED);
    const modParticipantUpdatePromise = waitForEvent(modSocket, SOCKET_EVENTS.PARTICIPANT_UPDATE);

    hostSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: partUserId });

    const [bobRemovedData, , modRemovedData, modPartUpdate]: any = await Promise.all([
      partRemovedOnBobPromise,
      bobDisconnectPromise,
      partRemovedOnModPromise,
      modParticipantUpdatePromise,
    ]);

    // Target received notification before disconnect
    assert.strictEqual(bobRemovedData.userId, partUserId);
    assert.strictEqual(bobRemovedData.removedBy, 'AliceHost');
    assert.ok(bobRemovedData.reason.includes('Host'));

    // Remaining member received broadcast
    assert.strictEqual(modRemovedData.userId, partUserId);
    assert.strictEqual(modRemovedData.removedBy, 'AliceHost');

    // Updated participant list sent to room without Bob
    const bobInList = modPartUpdate.participants.find((p: any) => p.userId === partUserId);
    assert.strictEqual(bobInList, undefined);
    console.log('[PASS] Host successfully removed Bob via { userId }; Bob notified & disconnected; room received broadcast + updated list.');

    // 5f: Verify persistent storage: Bob is removed from MongoDB
    const roomAfterRemoval = await RoomModel.findOne({ roomCode });
    const bobInDb = roomAfterRemoval?.participants.find((p) => p.userId === partUserId);
    assert.strictEqual(bobInDb, undefined);
    console.log('[PASS] Persistent storage verified: Participant removed from MongoDB.');

    // 5g: Race condition handling: Concurrent / repeated removal of already removed user is handled safely
    const duplicateRemoveErrorPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ERROR);
    hostSocket.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, { userId: partUserId });
    const dupRemoveError: any = await duplicateRemoveErrorPromise;
    assert.strictEqual(dupRemoveError.code, 'USER_NOT_FOUND');
    console.log('[PASS] Safe race condition handling: duplicate removal handled gracefully without errors.');

    // ========================================================================
    // 6. HOST TRANSFER: transfer_host
    // Only current Host can transfer ownership.
    // ========================================================================
    console.log('[TEST 6] Testing transfer_host RBAC and Broadcasts...');

    // 6a: Moderator tries to transfer host -> Rejected
    const modTransferErrorPromise = waitForEvent(modSocket, SOCKET_EVENTS.ERROR);
    modSocket.emit(SOCKET_EVENTS.TRANSFER_HOST, { targetUserId: modUserId });
    const modTransferError: any = await modTransferErrorPromise;
    assert.strictEqual(modTransferError.code, 'FORBIDDEN_HOST_TRANSFER');
    console.log('[PASS] Non-host cannot transfer ownership (rejected with FORBIDDEN_HOST_TRANSFER).');

    // 6b: Host transfers ownership to Charlie (modUserId)
    const hostTransferOnHostPromise = waitForEvent(hostSocket, SOCKET_EVENTS.HOST_TRANSFERRED);
    const hostTransferOnModPromise = waitForEvent(modSocket, SOCKET_EVENTS.HOST_TRANSFERRED);

    hostSocket.emit(SOCKET_EVENTS.TRANSFER_HOST, { targetUserId: modUserId });

    const [hostTData, modTData]: any = await Promise.all([
      hostTransferOnHostPromise,
      hostTransferOnModPromise,
    ]);

    assert.strictEqual(hostTData.previousHostUserId, hostUserId);
    assert.strictEqual(hostTData.newHostUserId, modUserId);
    assert.strictEqual(modTData.newHostUserId, modUserId);

    // Verify in MongoDB
    const roomInDb = await RoomModel.findOne({ roomCode });
    assert.strictEqual(roomInDb?.hostUserId, modUserId);
    const charlieInDb = roomInDb?.participants.find((p) => p.userId === modUserId);
    const aliceInDb = roomInDb?.participants.find((p) => p.userId === hostUserId);
    assert.strictEqual(charlieInDb?.role, Role.HOST);
    assert.strictEqual(aliceInDb?.role, Role.MODERATOR);

    // 6c: Charlie (the new Host) can now assign roles
    const newHostAssignPromise = waitForEvent(hostSocket, SOCKET_EVENTS.ROLE_ASSIGNED);
    modSocket.emit(SOCKET_EVENTS.ASSIGN_ROLE, {
      targetUserId: hostUserId,
      newRole: Role.PARTICIPANT,
    });
    const newHostAssignData: any = await newHostAssignPromise;
    assert.strictEqual(newHostAssignData.targetUserId, hostUserId);
    assert.strictEqual(newHostAssignData.newRole, Role.PARTICIPANT);
    assert.strictEqual(newHostAssignData.updatedBy, 'CharlieMod');

    console.log('[PASS] Host transfer successful: Charlie is new Host with full administrative authority.');

    // Cleanup sockets
    hostSocket.disconnect();
    modSocket.disconnect();
    partSocket.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('--- ALL ROLE-BASED ACCESS CONTROL TESTS PASSED SUCCESSFULLY ---');
  } finally {
    if (httpServer!) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await disconnectDatabase();
  }
}

runRbacTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('RBAC Test Failed:', err);
    process.exit(1);
  });
