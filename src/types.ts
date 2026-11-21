export type GameType = 'whot' | 'checkers' | 'rps' | 'tictactoe' | 'memory';

export type GameStateStatus = 'LOBBY' | 'PLAYING' | 'VICTORY' | 'DEFEAT';

export type RoomVisibility = 'public' | 'private';

export interface SeatProfile {
  name: string;
  avatar: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  title: string;
}

export interface GameRoom {
  id: string;
  title: string;
  gameType: GameType;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  playerIds: string[];
  playerProfiles: Record<string, SeatProfile>;
  stake: number;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'in_progress' | 'completed';
  visibility: RoomVisibility;
  inviteToken: string;
  invitedHandles: string[];
  winnerId: string;
  gameState: Record<string, unknown>;
  createdAt: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  wins: number;
  winRate: number;
  title: string;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  displayName?: string;
  type?: 'deposit' | 'withdrawal';
  provider: 'squad' | 'beto_payout';
  amountNaira: number;
  balanceAfter?: number;
  currency: 'NGN';
  status: 'pending' | 'approved' | 'success';
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  createdAt: number;
}
