import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  enableNetwork,
  collection,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  GameRoom,
  GameType,
  LeaderboardEntry,
  RoomVisibility,
  SeatProfile,
  WalletTransaction,
} from './types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isOfflineOrUnavailableError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('unavailable')
  );
}

async function withOnlineRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isOfflineOrUnavailableError(error) || attempt === maxAttempts) {
        throw error;
      }
      await enableNetwork(db).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      try {
        await enableNetwork(db);
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          retryError.message.includes('the client is offline')
        ) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
  }
}
void testConnection();

export interface PlayerRecord {
  uid: string;
  displayName: string;
  avatar: string;
  balance: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  title: string;
  lastDailyClaimAt: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const DEFAULT_AVATAR = '/src/assets/images/avatar_emerald_ace_1795104784275.jpg';
const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 6;
export const NAIRA_STAKES = [1600, 3400, 5200, 7000, 9700] as const;
export const WITHDRAWAL_AMOUNTS = [1700, 3500, 5300, 8000, 10700] as const;
export type WithdrawalAmount = (typeof WITHDRAWAL_AMOUNTS)[number];

export function formatNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString()}`;
}

export function isValidDocId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

export function sanitizeDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length >= 2) return trimmed.slice(0, 40);
  return 'ArenaPlayer';
}

export function clampBalance(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(10000000, Math.round(val)));
}

export function parseInvitedHandles(raw: string[] | string): string[] {
  const tokens = Array.isArray(raw)
    ? raw
    : raw
        .split(/[\n,;]+/)
        .map((part) => part.trim())
        .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of tokens) {
    const normalized = item.trim().replace(/^@+/, '').toLowerCase();
    if (normalized.length >= 2 && normalized.length <= 100 && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= 20) break;
    }
  }
  return result;
}

function generatePrivateInviteToken(): string {
  const partA = Math.random().toString(36).slice(2, 10);
  const partB = Math.random().toString(36).slice(2, 10);
  return `inv_${partA}${partB}`;
}

async function syncLeaderboardEntry(
  uid: string,
  entry: {
    displayName: string;
    avatar: string;
    balance: number;
    totalWins: number;
    totalLosses: number;
    title: string;
  }
): Promise<void> {
  const path = `leaderboard/${uid}`;
  const ref = doc(db, 'leaderboard', uid);
  try {
    await withOnlineRetry(() =>
      setDoc(ref, {
        uid,
        displayName: sanitizeDisplayName(entry.displayName),
        avatar: (entry.avatar || DEFAULT_AVATAR).slice(0, 500),
        balance: clampBalance(entry.balance),
        totalWins: Math.max(0, Math.floor(entry.totalWins)),
        totalLosses: Math.max(0, Math.floor(entry.totalLosses)),
        title: (entry.title || 'Arena Challenger').slice(0, 60),
        isPublic: true,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const inFlightProfileLoads = new Map<string, Promise<PlayerRecord>>();

export async function getOrCreatePlayerProfile(
  uid: string,
  defaults: {
    displayName?: string | null;
    avatar?: string | null;
    preferCustomName?: boolean;
  }
): Promise<PlayerRecord> {
  const existingRequest = inFlightProfileLoads.get(uid);
  if (existingRequest) {
    const baseRecord = await existingRequest;
    if (defaults.preferCustomName && (defaults.displayName || defaults.avatar)) {
      const nextName = defaults.displayName ? sanitizeDisplayName(defaults.displayName) : baseRecord.displayName;
      const nextAvatar = (defaults.avatar || baseRecord.avatar || DEFAULT_AVATAR).slice(0, 500);
      if (nextName !== baseRecord.displayName || nextAvatar !== baseRecord.avatar) {
        await updatePlayerRecord(uid, { displayName: nextName, avatar: nextAvatar });
        return { ...baseRecord, displayName: nextName, avatar: nextAvatar };
      }
    }
    return baseRecord;
  }

  const run = (async (): Promise<PlayerRecord> => {
    const path = `players/${uid}`;
    const ref = doc(db, 'players', uid);

    let snap;
    try {
      snap = await withOnlineRetry(() => getDoc(ref));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (snap.exists()) {
      const data = snap.data() as PlayerRecord;
      let resolved = data;
      if (defaults.preferCustomName && (defaults.displayName || defaults.avatar)) {
        const nextName = defaults.displayName ? sanitizeDisplayName(defaults.displayName) : data.displayName;
        const nextAvatar = (defaults.avatar || data.avatar || DEFAULT_AVATAR).slice(0, 500);
        if (nextName !== data.displayName || nextAvatar !== data.avatar) {
          try {
            await withOnlineRetry(() =>
              updateDoc(ref, {
                displayName: nextName,
                avatar: nextAvatar,
                updatedAt: serverTimestamp(),
              })
            );
            resolved = { ...data, displayName: nextName, avatar: nextAvatar };
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, path);
          }
        }
      }
      await syncLeaderboardEntry(uid, resolved);
      return resolved;
    }

    const newRecord = {
      uid,
      displayName: sanitizeDisplayName(defaults.displayName),
      avatar: (defaults.avatar || DEFAULT_AVATAR).slice(0, 500),
      balance: 10000,
      totalWins: 0,
      totalLosses: 0,
      winStreak: 0,
      title: 'Arena Challenger',
      lastDailyClaimAt: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await withOnlineRetry(() => setDoc(ref, newRecord));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    const created: PlayerRecord = {
      uid: newRecord.uid,
      displayName: newRecord.displayName,
      avatar: newRecord.avatar,
      balance: newRecord.balance,
      totalWins: newRecord.totalWins,
      totalLosses: newRecord.totalLosses,
      winStreak: newRecord.winStreak,
      title: newRecord.title,
      lastDailyClaimAt: newRecord.lastDailyClaimAt,
    };
    await syncLeaderboardEntry(uid, created);
    return created;
  })();

  inFlightProfileLoads.set(uid, run);
  try {
    return await run;
  } finally {
    inFlightProfileLoads.delete(uid);
  }
}

export async function updatePlayerRecord(
  uid: string,
  patch: Partial<
    Pick<
      PlayerRecord,
      'displayName' | 'avatar' | 'balance' | 'totalWins' | 'totalLosses' | 'winStreak' | 'title' | 'lastDailyClaimAt'
    >
  >,
  leaderboardSnapshot?: {
    displayName: string;
    avatar: string;
    balance: number;
    totalWins: number;
    totalLosses: number;
    title: string;
  }
): Promise<void> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);

  const sanitized: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.displayName !== undefined) sanitized.displayName = sanitizeDisplayName(patch.displayName);
  if (patch.avatar !== undefined) sanitized.avatar = patch.avatar.slice(0, 500);
  if (patch.balance !== undefined) sanitized.balance = clampBalance(patch.balance);
  if (patch.totalWins !== undefined) sanitized.totalWins = Math.max(0, Math.floor(patch.totalWins));
  if (patch.totalLosses !== undefined) sanitized.totalLosses = Math.max(0, Math.floor(patch.totalLosses));
  if (patch.winStreak !== undefined) sanitized.winStreak = Math.max(0, Math.floor(patch.winStreak));
  if (patch.title !== undefined) sanitized.title = patch.title.slice(0, 60) || 'Arena Challenger';
  if (patch.lastDailyClaimAt !== undefined) {
    sanitized.lastDailyClaimAt = Math.max(0, Math.floor(patch.lastDailyClaimAt));
  }

  try {
    await updateDoc(ref, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  if (leaderboardSnapshot) {
    await syncLeaderboardEntry(uid, leaderboardSnapshot);
  }
}

export function subscribeLeaderboard(
  onData: (entries: LeaderboardEntry[]) => void
): () => void {
  const path = 'leaderboard';
  const q = query(collection(db, 'leaderboard'), where('isPublic', '==', true), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const entries: LeaderboardEntry[] = snapshot.docs.map((d) => {
        const data = d.data() as {
          uid: string;
          displayName: string;
          avatar: string;
          balance: number;
          totalWins: number;
          totalLosses: number;
          title: string;
        };
        const total = (data.totalWins || 0) + (data.totalLosses || 0);
        return {
          id: data.uid || d.id,
          name: data.displayName || 'ArenaPlayer',
          avatar: data.avatar || DEFAULT_AVATAR,
          balance: data.balance || 0,
          wins: data.totalWins || 0,
          winRate: total > 0 ? Math.round(((data.totalWins || 0) / total) * 100) : 0,
          title: data.title || 'Arena Challenger',
        };
      });
      entries.sort((a, b) => b.balance - a.balance);
      onData(entries);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

const WHOT_SHAPES = ['circle', 'triangle', 'square', 'cross', 'star'] as const;
const MEMORY_PAIR_IDS = [
  'crown',
  'diamond',
  'flame',
  'bolt',
  'clover',
  'spade',
  'heart',
  'star',
  'trophy',
];

export function createInitialCheckersBoardFlat(): number[] {
  const boardFlat = Array(64).fill(0) as number[];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) boardFlat[r * 8 + c] = 3; // Player 2 (Top / Black)
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) boardFlat[r * 8 + c] = 1; // Player 1 (Bottom / Red)
    }
  }
  return boardFlat;
}

export function createInitialGameState(
  gameType: GameType,
  playerIds: string[],
  playerProfiles: Record<string, SeatProfile>
): Record<string, unknown> {
  const firstId = playerIds[0] || '';
  const firstName = playerProfiles[firstId]?.name || 'Player 1';

  switch (gameType) {
    case 'tictactoe':
      return {
        board: Array(25).fill(''),
        turnIndex: 0,
        message: `${firstName} moves first! Align 3 in a row on the 5x5 grid.`,
      };
    case 'rps': {
      const scores: Record<string, number> = {};
      const choices: Record<string, string> = {};
      const lastChoices: Record<string, string> = {};
      playerIds.forEach((uid) => {
        scores[uid] = 0;
        choices[uid] = '';
        lastChoices[uid] = '';
      });
      return {
        scores,
        choices,
        lastChoices,
        round: 1,
        message: `Round 1: All ${playerIds.length} players lock in Rock, Paper, or Scissors!`,
      };
    }
    case 'checkers': {
      const p1 = playerIds[0] || '';
      const p2 = playerIds[1] || '';
      const p1Name = playerProfiles[p1]?.name || 'Player 1';
      const p2Name = playerProfiles[p2]?.name || 'Player 2';
      return {
        boardFlat: createInitialCheckersBoardFlat(),
        turn: 1,
        bracketRound: 1,
        currentPair: [p1, p2],
        queueIds: playerIds.slice(2),
        roundWinners: [] as string[],
        eliminatedIds: [] as string[],
        message: `Round 1 Bracket: ${p1Name} (Red) vs ${p2Name} (Black)!`,
      };
    }
    case 'memory': {
      const doubled = [...MEMORY_PAIR_IDS, ...MEMORY_PAIR_IDS];
      for (let i = doubled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
      }
      const scores: Record<string, number> = {};
      playerIds.forEach((uid) => {
        scores[uid] = 0;
      });
      return {
        deckPairIds: doubled,
        matchedBy: Array(18).fill(''),
        flippedIndices: [],
        turnIndex: 0,
        scores,
        message: `${firstName} flips first! Most pairs wins.`,
      };
    }
    case 'whot': {
      const deck: { id: string; shape: string; number: number }[] = [];
      let id = 1;
      for (const shape of WHOT_SHAPES) {
        for (let num = 1; num <= 10; num++) {
          deck.push({ id: `card-${id++}`, shape, number: num });
        }
      }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const hands: Record<string, { id: string; shape: string; number: number }[]> = {};
      playerIds.forEach((uid) => {
        hands[uid] = deck.splice(0, 6);
      });
      const topCard = deck[0] || { id: 'top-1', shape: 'circle', number: 5 };
      return {
        hands,
        topCard,
        turnIndex: 0,
        message: `${firstName} goes first! Match shape or number.`,
      };
    }
  }
}

function mapRoomDoc(docId: string, raw: Record<string, unknown>): GameRoom {
  const ts = raw.createdAt as Timestamp | undefined;
  const hostId = (raw.hostId as string) || '';
  const hostName = (raw.hostName as string) || 'Host';
  const hostAvatar = (raw.hostAvatar as string) || DEFAULT_AVATAR;

  const playerIds = Array.isArray(raw.playerIds)
    ? (raw.playerIds as string[])
    : hostId
    ? [hostId]
    : [];
  const rawProfiles = (raw.playerProfiles as Record<string, SeatProfile>) || {};
  const playerProfiles: Record<string, SeatProfile> = { ...rawProfiles };
  if (hostId && !playerProfiles[hostId]) {
    playerProfiles[hostId] = { name: hostName, avatar: hostAvatar };
  }

  return {
    id: (raw.id as string) || docId,
    title: (raw.title as string) || 'Arena Match',
    gameType: (raw.gameType as GameType) || 'whot',
    hostId,
    hostName,
    hostAvatar,
    playerIds,
    playerProfiles,
    stake: typeof raw.stake === 'number' ? raw.stake : 1600,
    minPlayers: typeof raw.minPlayers === 'number' ? raw.minPlayers : MIN_ROOM_PLAYERS,
    maxPlayers: typeof raw.maxPlayers === 'number' ? raw.maxPlayers : MIN_ROOM_PLAYERS,
    currentPlayers:
      typeof raw.currentPlayers === 'number' ? raw.currentPlayers : playerIds.length || 1,
    status: (raw.status as GameRoom['status']) || 'waiting',
    visibility: (raw.visibility as RoomVisibility) || 'public',
    inviteToken: typeof raw.inviteToken === 'string' ? raw.inviteToken : '',
    invitedHandles: Array.isArray(raw.invitedHandles)
      ? (raw.invitedHandles as unknown[])
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim().toLowerCase())
      : [],
    winnerId: (raw.winnerId as string) || '',
    gameState: (raw.gameState as Record<string, unknown>) || {},
    createdAt: ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now(),
  };
}

export function subscribeRooms(
  uid: string,
  onData: (rooms: GameRoom[]) => void
): () => void {
  const roomMap = new Map<string, GameRoom>();

  const emitSorted = () => {
    const active = Array.from(roomMap.values()).filter((r) => r.status !== 'completed');
    active.sort((a, b) => b.createdAt - a.createdAt);
    onData(active);
  };

  const publicQ = query(collection(db, 'rooms'), where('visibility', '==', 'public'), limit(40));
  const seatedQ = query(
    collection(db, 'rooms'),
    where('playerIds', 'array-contains', uid),
    limit(30)
  );

  const publicIds = new Set<string>();
  const seatedIds = new Set<string>();
  const recentlyRemovedIds = new Set<string>();

  const markRemoved = (id: string) => {
    publicIds.delete(id);
    seatedIds.delete(id);
    roomMap.delete(id);
    recentlyRemovedIds.add(id);
    window.setTimeout(() => recentlyRemovedIds.delete(id), 10000);
  };

  const pruneStale = () => {
    for (const id of Array.from(roomMap.keys())) {
      if (recentlyRemovedIds.has(id) || (!publicIds.has(id) && !seatedIds.has(id))) {
        roomMap.delete(id);
      }
    }
    emitSorted();
  };

  const unsubPublic = onSnapshot(
    publicQ,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          markRemoved(change.doc.id);
        }
      });
      publicIds.clear();
      snapshot.docs.forEach((d) => {
        if (recentlyRemovedIds.has(d.id)) return;
        publicIds.add(d.id);
        roomMap.set(d.id, mapRoomDoc(d.id, d.data() as Record<string, unknown>));
      });
      pruneStale();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    }
  );

  const unsubSeated = onSnapshot(
    seatedQ,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          markRemoved(change.doc.id);
        }
      });
      seatedIds.clear();
      snapshot.docs.forEach((d) => {
        if (recentlyRemovedIds.has(d.id)) return;
        seatedIds.add(d.id);
        roomMap.set(d.id, mapRoomDoc(d.id, d.data() as Record<string, unknown>));
      });
      pruneStale();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    }
  );

  return () => {
    unsubPublic();
    unsubSeated();
  };
}

export async function createMultiplayerRoom(params: {
  title: string;
  gameType: GameType;
  host: { id: string; name: string; avatar: string };
  stake: number;
  maxPlayers: number;
  visibility: RoomVisibility;
  invitedHandles?: string[];
}): Promise<GameRoom> {
  const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `rooms/${roomId}`;
  const cleanTitle = params.title.trim().slice(0, 60) || 'Arena Match';
  const safeTitle = cleanTitle.length >= 2 ? cleanTitle : 'Arena Match';
  const safeStake = Math.max(100, Math.min(100000, Math.round(params.stake)));
  const safeMaxPlayers = Math.max(MIN_ROOM_PLAYERS, Math.min(MAX_ROOM_PLAYERS, Math.round(params.maxPlayers)));
  const safeHostName = sanitizeDisplayName(params.host.name);
  const safeHostAvatar = (params.host.avatar || DEFAULT_AVATAR).slice(0, 500);
  const playerIds = [params.host.id];
  const playerProfiles: Record<string, SeatProfile> = {
    [params.host.id]: {
      name: safeHostName,
      avatar: safeHostAvatar,
    },
  };
  const initialGameState = createInitialGameState(params.gameType, playerIds, playerProfiles);
  const inviteToken = params.visibility === 'private' ? generatePrivateInviteToken() : '';
  const invitedHandles =
    params.visibility === 'private' ? parseInvitedHandles(params.invitedHandles || []) : [];

  const payload = {
    id: roomId,
    title: safeTitle,
    gameType: params.gameType,
    hostId: params.host.id,
    hostName: safeHostName,
    hostAvatar: safeHostAvatar,
    playerIds,
    playerProfiles,
    stake: safeStake,
    minPlayers: MIN_ROOM_PLAYERS,
    maxPlayers: safeMaxPlayers,
    currentPlayers: 1,
    status: 'waiting' as const,
    visibility: params.visibility,
    inviteToken,
    invitedHandles,
    winnerId: '',
    gameState: initialGameState,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'rooms', roomId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    ...payload,
    createdAt: Date.now(),
  };
}

export async function updateRoomInvitedHandles(
  roomId: string,
  invitedHandles: string[]
): Promise<string[]> {
  if (!isValidDocId(roomId)) throw new Error('Invalid room code.');
  const path = `rooms/${roomId}`;
  const cleanHandles = parseInvitedHandles(invitedHandles);
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      invitedHandles: cleanHandles,
      updatedAt: serverTimestamp(),
    });
    return cleanHandles;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getRoomById(roomId: string): Promise<GameRoom | null> {
  if (!isValidDocId(roomId)) return null;
  const path = `rooms/${roomId}`;
  try {
    const snap = await withOnlineRetry(() => getDoc(doc(db, 'rooms', roomId)));
    if (!snap.exists()) return null;
    return mapRoomDoc(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function joinMultiplayerRoom(
  roomId: string,
  player: { id: string; name: string; avatar: string; email?: string | null },
  options?: { inviteToken?: string }
): Promise<void> {
  if (!isValidDocId(roomId)) throw new Error('Invalid room code.');
  const path = `rooms/${roomId}`;
  const ref = doc(db, 'rooms', roomId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Match room not found.');

      const room = mapRoomDoc(snap.id, snap.data() as Record<string, unknown>);
      if (room.playerIds.includes(player.id)) return;
      if (room.status !== 'waiting') throw new Error('This match has already started.');
      if (room.currentPlayers >= room.maxPlayers) throw new Error('This room is already full.');

      if (room.visibility === 'private') {
        if (room.inviteToken && options?.inviteToken !== room.inviteToken) {
          throw new Error('This is a private room. A valid private invite link from the host is required.');
        }
        if (room.invitedHandles.length > 0) {
          const cleanName = sanitizeDisplayName(player.name).trim().toLowerCase();
          const cleanEmail = (player.email || '').trim().toLowerCase();
          const isInvited =
            room.invitedHandles.includes(cleanName) ||
            (cleanEmail.length > 0 && room.invitedHandles.includes(cleanEmail));
          if (!isInvited) {
            throw new Error('This private room is restricted to invited players only.');
          }
        }
      }

      const nextPlayerIds = [...room.playerIds, player.id];
      const nextPlayerProfiles: Record<string, SeatProfile> = {
        ...room.playerProfiles,
        [player.id]: {
          name: sanitizeDisplayName(player.name),
          avatar: (player.avatar || DEFAULT_AVATAR).slice(0, 500),
        },
      };
      const nextCount = nextPlayerIds.length;
      const shouldStart = nextCount === room.maxPlayers && nextCount >= MIN_ROOM_PLAYERS;

      const nextGameState = shouldStart
        ? createInitialGameState(room.gameType, nextPlayerIds, nextPlayerProfiles)
        : room.gameState;

      tx.update(ref, {
        playerIds: nextPlayerIds,
        playerProfiles: nextPlayerProfiles,
        currentPlayers: nextCount,
        status: shouldStart ? 'in_progress' : 'waiting',
        gameState: nextGameState,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('private room') ||
        error.message.includes('already full') ||
        error.message.includes('already started') ||
        error.message.includes('not found'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function startMultiplayerRoom(roomId: string): Promise<void> {
  if (!isValidDocId(roomId)) throw new Error('Invalid room code.');
  const path = `rooms/${roomId}`;
  const ref = doc(db, 'rooms', roomId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Match room not found.');

      const room = mapRoomDoc(snap.id, snap.data() as Record<string, unknown>);
      if (room.status !== 'waiting') return;
      if (room.playerIds.length < MIN_ROOM_PLAYERS) {
        throw new Error(`At least ${MIN_ROOM_PLAYERS} players must join before starting.`);
      }

      const initialGameState = createInitialGameState(
        room.gameType,
        room.playerIds,
        room.playerProfiles
      );

      tx.update(ref, {
        status: 'in_progress',
        gameState: initialGameState,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeRoom(
  roomId: string,
  onRoom: (room: GameRoom | null) => void
): () => void {
  const path = `rooms/${roomId}`;
  return onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) {
        onRoom(null);
        return;
      }
      onRoom(mapRoomDoc(snap.id, snap.data() as Record<string, unknown>));
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateRoomGameState(
  roomId: string,
  gameState: Record<string, unknown>,
  status: 'in_progress' | 'completed' = 'in_progress',
  winnerId = ''
): Promise<void> {
  const path = `rooms/${roomId}`;
  const ref = doc(db, 'rooms', roomId);
  try {
    await updateDoc(ref, {
      gameState,
      status,
      winnerId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitRpsChoice(params: {
  roomId: string;
  userId: string;
  choice: 'rock' | 'paper' | 'scissors';
}): Promise<void> {
  const path = `rooms/${params.roomId}`;
  const ref = doc(db, 'rooms', params.roomId);
  const beats: Record<'rock' | 'paper' | 'scissors', 'rock' | 'paper' | 'scissors'> = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper',
  };
  const TARGET_POINTS = 6;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Match room not found.');
      const room = mapRoomDoc(snap.id, snap.data() as Record<string, unknown>);
      if (room.status !== 'in_progress') return;
      if (!room.playerIds.includes(params.userId)) return;

      const gs = room.gameState || {};
      const scores: Record<string, number> = {
        ...((gs.scores as Record<string, number>) || {}),
      };
      const choices: Record<string, string> = {
        ...((gs.choices as Record<string, string>) || {}),
      };
      const round = typeof gs.round === 'number' ? gs.round : 1;

      room.playerIds.forEach((uid) => {
        if (typeof scores[uid] !== 'number') scores[uid] = 0;
        if (typeof choices[uid] !== 'string') choices[uid] = '';
      });

      if (choices[params.userId]) return;
      choices[params.userId] = params.choice;

      const allSubmitted = room.playerIds.every((uid) => Boolean(choices[uid]));
      const playerName = room.playerProfiles[params.userId]?.name || 'Player';

      if (!allSubmitted) {
        const lockedCount = room.playerIds.filter((uid) => Boolean(choices[uid])).length;
        tx.update(ref, {
          gameState: {
            ...gs,
            scores,
            choices,
            round,
            message: `${playerName} locked in! (${lockedCount}/${room.playerIds.length} ready)`,
          },
          status: 'in_progress',
          winnerId: '',
          updatedAt: serverTimestamp(),
        });
        return;
      }

      // Resolve round across all seated players
      const lastChoices: Record<string, string> = {};
      const clearedChoices: Record<string, string> = {};
      room.playerIds.forEach((uid) => {
        const myMove = choices[uid] as 'rock' | 'paper' | 'scissors';
        lastChoices[uid] = myMove;
        clearedChoices[uid] = '';
        let roundWins = 0;
        room.playerIds.forEach((oppUid) => {
          if (oppUid !== uid) {
            const oppMove = choices[oppUid] as 'rock' | 'paper' | 'scissors';
            if (beats[myMove] === oppMove) {
              roundWins += 1;
            }
          }
        });
        scores[uid] = (scores[uid] || 0) + roundWins;
      });

      // Check for a clear winner at >= TARGET_POINTS
      const sorted = [...room.playerIds].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
      const topUid = sorted[0];
      const topScore = scores[topUid] || 0;
      const secondScore = sorted.length > 1 ? scores[sorted[1]] || 0 : -1;

      if (topScore >= TARGET_POINTS && topScore > secondScore) {
        const winnerName = room.playerProfiles[topUid]?.name || 'Champion';
        tx.update(ref, {
          gameState: {
            scores,
            choices: clearedChoices,
            lastChoices,
            round,
            message: `${winnerName} leads with ${topScore} pts and wins the pot!`,
          },
          status: 'completed',
          winnerId: topUid,
          updatedAt: serverTimestamp(),
        });
      } else {
        const leaderName = room.playerProfiles[topUid]?.name || 'Leader';
        const message =
          topScore >= TARGET_POINTS && topScore === secondScore
            ? `Round ${round} tiebreaker at ${topScore} pts! Next round starts!`
            : `Round ${round} complete! ${leaderName} leads with ${topScore} pts. Round ${round + 1} begins!`;

        tx.update(ref, {
          gameState: {
            scores,
            choices: clearedChoices,
            lastChoices,
            round: round + 1,
            message,
          },
          status: 'in_progress',
          winnerId: '',
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelWaitingRoom(roomId: string): Promise<void> {
  if (!isValidDocId(roomId)) return;
  const path = `rooms/${roomId}`;
  try {
    await deleteDoc(doc(db, 'rooms', roomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function creditSquadDeposit(params: {
  uid: string;
  transactionRef: string;
  amountNaira: number;
}): Promise<{ alreadyCredited: boolean; newBalance: number }> {
  if (!isValidDocId(params.transactionRef)) {
    throw new Error('Invalid Squad transaction reference.');
  }
  const safeAmount = Math.max(100, Math.min(500000, Math.round(params.amountNaira)));
  const txDocRef = doc(db, 'transactions', params.transactionRef);
  const playerRef = doc(db, 'players', params.uid);

  let result: { alreadyCredited: boolean; newBalance: number; player?: PlayerRecord } = {
    alreadyCredited: false,
    newBalance: 0,
  };

  try {
    await runTransaction(db, async (tx) => {
      const txSnap = await tx.get(txDocRef);
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Player account record not found.');
      }

      const playerData = playerSnap.data() as PlayerRecord;
      if (txSnap.exists()) {
        result = {
          alreadyCredited: true,
          newBalance: playerData.balance || 0,
          player: playerData,
        };
        return;
      }

      const nextBalance = clampBalance((playerData.balance || 0) + safeAmount);
      tx.set(txDocRef, {
        id: params.transactionRef,
        uid: params.uid,
        type: 'deposit',
        provider: 'squad',
        amountNaira: safeAmount,
        currency: 'NGN',
        status: 'success',
        createdAt: serverTimestamp(),
      });
      tx.update(playerRef, {
        balance: nextBalance,
        updatedAt: serverTimestamp(),
      });

      result = {
        alreadyCredited: false,
        newBalance: nextBalance,
        player: { ...playerData, balance: nextBalance },
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${params.transactionRef}`);
  }

  if (!result.alreadyCredited && result.player) {
    await syncLeaderboardEntry(params.uid, {
      displayName: result.player.displayName,
      avatar: result.player.avatar,
      balance: result.newBalance,
      totalWins: result.player.totalWins,
      totalLosses: result.player.totalLosses,
      title: result.player.title,
    });
  }

  return {
    alreadyCredited: result.alreadyCredited,
    newBalance: result.newBalance,
  };
}

export async function withdrawWalletFunds(params: {
  uid: string;
  amountNaira: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
}): Promise<{
  transactionRef: string;
  amountNaira: number;
  newBalance: number;
  maskedAccount: string;
  accountName: string;
}> {
  if (!WITHDRAWAL_AMOUNTS.includes(params.amountNaira as WithdrawalAmount)) {
    throw new Error('Selected withdrawal amount is not supported.');
  }

  const safeBankName = params.bankName.trim().slice(0, 60);
  if (safeBankName.length < 2) {
    throw new Error('Please select a destination bank.');
  }

  const safeAccountName = params.accountName.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (safeAccountName.length < 2) {
    throw new Error('Please enter your bank account name (at least 2 characters).');
  }

  const digits = params.accountNumber.replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new Error('Please enter a valid 10-digit bank account number.');
  }

  const maskedAccount = `****${digits.slice(-4)}`;
  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const transactionRef = `WD_${Date.now()}_${randomSuffix}`;
  const txDocRef = doc(db, 'transactions', transactionRef);
  const playerRef = doc(db, 'players', params.uid);

  let newBalance = 0;
  let playerSnapshotData: PlayerRecord | undefined;

  try {
    await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Player account record not found.');
      }

      const playerData = playerSnap.data() as PlayerRecord;
      const currentBalance = Number(playerData.balance || 0);
      if (currentBalance < params.amountNaira) {
        throw new Error(
          `Insufficient balance. You need ₦${params.amountNaira.toLocaleString()} to make this withdrawal.`
        );
      }

      newBalance = clampBalance(currentBalance - params.amountNaira);
      const safePlayerName = sanitizeDisplayName(playerData.displayName);
      tx.update(playerRef, {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });
      tx.set(txDocRef, {
        id: transactionRef,
        uid: params.uid,
        displayName: safePlayerName,
        type: 'withdrawal',
        provider: 'beto_payout',
        amountNaira: params.amountNaira,
        balanceAfter: newBalance,
        currency: 'NGN',
        status: 'pending',
        bankName: safeBankName,
        accountName: safeAccountName,
        accountNumber: digits,
        createdAt: serverTimestamp(),
      });

      playerSnapshotData = { ...playerData, balance: newBalance };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient balance') ||
        error.message.includes('not found') ||
        error.message.includes('supported'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `transactions/${transactionRef}`);
  }

  if (playerSnapshotData) {
    await syncLeaderboardEntry(params.uid, {
      displayName: playerSnapshotData.displayName,
      avatar: playerSnapshotData.avatar,
      balance: newBalance,
      totalWins: playerSnapshotData.totalWins,
      totalLosses: playerSnapshotData.totalLosses,
      title: playerSnapshotData.title,
    });
  }

  return {
    transactionRef,
    amountNaira: params.amountNaira,
    newBalance,
    maskedAccount,
    accountName: safeAccountName,
  };
}

export function subscribePlayerTransactions(
  uid: string,
  onData: (items: WalletTransaction[]) => void
): () => void {
  const path = 'transactions';
  const q = query(collection(db, 'transactions'), where('uid', '==', uid), limit(20));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: WalletTransaction[] = snapshot.docs.map((d) => {
        const data = d.data() as {
          id?: string;
          uid?: string;
          displayName?: string;
          type?: 'deposit' | 'withdrawal';
          provider?: 'squad' | 'beto_payout';
          amountNaira?: number;
          balanceAfter?: number;
          currency?: 'NGN';
          status?: string;
          approved?: boolean;
          bankName?: string;
          accountName?: string;
          accountNumber?: string;
          createdAt?: Timestamp;
        };
        const isWithdrawal =
          data.type === 'withdrawal' || data.provider === 'beto_payout';
        const rawStatus =
          typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
        const resolvedStatus: 'pending' | 'approved' | 'success' =
          data.approved === true || rawStatus === 'approved'
            ? 'approved'
            : rawStatus === 'success'
            ? isWithdrawal
              ? 'approved'
              : 'success'
            : rawStatus === 'pending' || isWithdrawal
            ? 'pending'
            : 'pending';

        return {
          id: data.id || d.id,
          uid: data.uid || uid,
          displayName: data.displayName,
          type: data.type || (isWithdrawal ? 'withdrawal' : 'deposit'),
          provider: data.provider || 'squad',
          amountNaira: typeof data.amountNaira === 'number' ? data.amountNaira : 0,
          balanceAfter: typeof data.balanceAfter === 'number' ? data.balanceAfter : undefined,
          currency: data.currency || 'NGN',
          status: resolvedStatus,
          bankName: data.bankName,
          accountName: data.accountName,
          accountNumber: data.accountNumber,
          createdAt:
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : Date.now(),
        };
      });
      items.sort((a, b) => b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
