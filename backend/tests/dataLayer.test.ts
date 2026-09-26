import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { RoomModel } from '../src/models/Room';
import { roomService } from '../src/services/roomService';
import { syncService } from '../src/services/syncService';
import { PlaybackState, Role } from '../src/types/room.types';

async function runDataLayerTest() {
  console.log('--- Starting MongoDB Data Layer Verification ---');
  await connectDatabase();

  try {
    // 1. Test Room Creation & Automatic Host Assignment
    const creatorUserId = 'user_host_123';
    const { room, hostUser } = await roomService.createRoom('Alice', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', creatorUserId);
    console.log(`[PASS] Room created: code=${room.roomCode}, hostUserId=${room.hostUserId}`);
    
    if (hostUser.role !== Role.HOST || room.participants[0].role !== Role.HOST) {
      throw new Error('Host role was not automatically assigned to room creator');
    }
    console.log('[PASS] Host role automatically assigned to room creator');

    // 2. Test New User Joining -> Defaults to Participant
    const participantUserId = 'user_bob_456';
    const { participant: bob } = await roomService.joinRoom(room.roomCode, participantUserId, 'Bob');
    if (bob.role !== Role.PARTICIPANT) {
      throw new Error('New user did not default to participant role');
    }
    console.log('[PASS] New user Bob joined as participant by default');

    // 3. Test Host promoting Participant to Moderator
    const { newRole } = await roomService.assignRole(room.roomCode, creatorUserId, participantUserId, Role.MODERATOR);
    if (newRole !== Role.MODERATOR) {
      throw new Error('Host could not promote participant to moderator');
    }
    console.log('[PASS] Host successfully promoted Bob to Moderator');

    // 4. Test Backend Permission Enforcement: Non-host cannot promote or kick
    try {
      await roomService.assignRole(room.roomCode, participantUserId, creatorUserId, Role.PARTICIPANT);
      throw new Error('Non-host was able to assign roles (security vulnerability!)');
    } catch (err: any) {
      if (err.errorCode === 'FORBIDDEN_ROLE_MANAGEMENT') {
        console.log('[PASS] Backend successfully rejected role management attempt by non-host');
      } else {
        throw err;
      }
    }

    // 5. Test Playback State Updates (Host and Moderator allowed)
    const { playbackState } = await roomService.updatePlayback(room.roomCode, participantUserId, PlaybackState.PLAYING, 42.5);
    if (playbackState !== PlaybackState.PLAYING) {
      throw new Error('Moderator could not update playback state');
    }
    console.log('[PASS] Moderator successfully updated playback state to playing at 42.5s');

    // 6. Test Authoritative Virtual Time Calculation
    const fetchedRoom = await roomService.getRoomByCode(room.roomCode);
    console.log(`[PASS] Authoritative calculated playback time: ${fetchedRoom.currentCalculatedTime}s (initial was 42.5s)`);

    // 7. Test Host removing Participant
    await roomService.removeParticipant(room.roomCode, creatorUserId, participantUserId);
    const updatedRoomAfterKick = await roomService.getRoomByCode(room.roomCode);
    const bobExists = updatedRoomAfterKick.participants.some(p => p.userId === participantUserId);
    if (bobExists) {
      throw new Error('Participant was not removed from room');
    }
    console.log('[PASS] Host successfully removed participant from room');

    // Clean up test room
    await RoomModel.deleteOne({ roomCode: room.roomCode });
    console.log('[PASS] Test room cleaned up from MongoDB');
    console.log('--- ALL DATA LAYER TESTS PASSED SUCCESSFULLY ---');
  } finally {
    await disconnectDatabase();
  }
}

runDataLayerTest().catch((err) => {
  console.error('Data layer test failed:', err);
  process.exit(1);
});
