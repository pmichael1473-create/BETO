import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { WifiOff, RotateCcw, LogOut } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { WalletModal } from './components/WalletModal';
import { LeaderboardView } from './components/LeaderboardView';
import { LobbyView } from './components/LobbyView';
import { GameSelectModal } from './components/GameSelectModal';
import { WaitingRoomView } from './components/WaitingRoomView';
import { AuthPage, AuthMode } from './components/AuthPage';

import { WhotGame } from './games/WhotGame';
import { CheckersGame } from './games/CheckersGame';
import { RockPaperScissorsGame } from './games/RockPaperScissorsGame';
import { TicTacToeGame } from './games/TicTacToeGame';
import { MemoryGame } from './games/MemoryGame';

import {
  GameRoom,
  GameType,
  LeaderboardEntry,
  RoomVisibility,
  UserProfile,
  WalletTransaction,
} from './types';
import {
  auth,
  getOrCreatePlayerProfile,
  updatePlayerRecord,
  clampBalance,
  subscribeLeaderboard,
  subscribeRooms,
  subscribeRoom,
  subscribePlayerTransactions,
  creditSquadDeposit,
  createMultiplayerRoom,
  updateRoomInvitedHandles,
  getRoomById,
  joinMultiplayerRoom,
  startMultiplayerRoom,
  updateRoomGameState,
  cancelWaitingRoom,
  isValidDocId,
  isOfflineOrUnavailableError,
  sanitizeDisplayName,
  MIN_ROOM_PLAYERS,
} from './firebase';
import { verifySquadPayment } from './utils/squad';

interface AuthUserProfile extends UserProfile {
  lastDailyClaimAt: number;
}

interface ParsedInvite {
  roomId: string;
  inviteToken?: string;
}

function parseInitialInvite(): ParsedInvite | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const param = params.get('room')?.trim() || '';
  const invite = params.get('invite')?.trim() || '';
  if (param && isValidDocId(param)) {
    return { roomId: param, inviteToken: invite || undefined };
  }
  const pathMatch = window.location.pathname.match(/^\/beto\/[^/]+\/([^/]+)\/?$/i);
  const pathRoom = pathMatch?.[1]?.trim() || '';
  return pathRoom && isValidDocId(pathRoom)
    ? { roomId: pathRoom, inviteToken: invite || undefined }
    : null;
}

function extractInviteFromInput(rawInput: string): ParsedInvite | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes('://') || trimmed.includes('?room=') || trimmed.startsWith('/beto/')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, window.location.origin);
      const param = url.searchParams.get('room')?.trim() || '';
      const invite = url.searchParams.get('invite')?.trim() || '';
      if (param && isValidDocId(param)) {
        return { roomId: param, inviteToken: invite || undefined };
      }
      const pathMatch = url.pathname.match(/^\/beto\/[^/]+\/([^/]+)\/?$/i);
      const pathRoom = pathMatch?.[1]?.trim() || '';
      return pathRoom && isValidDocId(pathRoom)
        ? { roomId: pathRoom, inviteToken: invite || undefined }
        : null;
    }
  } catch {
    // Fall through to raw room ID check
  }

  return isValidDocId(trimmed) ? { roomId: trimmed } : null;
}

function clearInviteQueryParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has('room')) {
    url.searchParams.delete('room');
    changed = true;
  }
  if (url.searchParams.has('invite')) {
    url.searchParams.delete('invite');
    changed = true;
  }
  if (url.pathname.startsWith('/beto/')) {
    url.pathname = '/';
    changed = true;
  }
  if (changed) {
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

function parseInitialSquadTx(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('squad_tx') || params.get('reference') || '').trim();
  return raw && isValidDocId(raw) ? raw : null;
}

function clearSquadQueryParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.has('squad_tx') || url.searchParams.has('reference')) {
    url.searchParams.delete('squad_tx');
    url.searchParams.delete('reference');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUserProfile | null>(null);
  const currentUserRef = useRef<AuthUserProfile | null>(null);
  currentUserRef.current = currentUser;

  const [pendingInvite, setPendingInvite] = useState<ParsedInvite | null>(() =>
    parseInitialInvite()
  );

  const [authPageMode, setAuthPageMode] = useState<AuthMode>(() =>
    parseInitialInvite() ? 'signin' : 'signup'
  );
  const [authReason, setAuthReason] = useState<string | null>(() =>
    parseInitialInvite() ? 'Sign in or sign up to join the invited match room.' : null
  );
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [retryingProfile, setRetryingProfile] = useState(false);

  const pendingAuthRef = useRef<{ customHandle?: string; customAvatar?: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'lobby' | 'leaderboard' | 'auth'>('auth');
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletInitialTab, setWalletInitialTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('betarena-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [pendingSquadTxRef, setPendingSquadTxRef] = useState<string | null>(() =>
    parseInitialSquadTx()
  );
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const activeRoomRef = useRef<GameRoom | null>(null);
  activeRoomRef.current = activeRoom;
  const cancelledRoomIdsRef = useRef<Set<string>>(new Set());

  const showNotice = useCallback((msg: string) => {
    setNoticeMsg(msg);
    window.setTimeout(() => setNoticeMsg(null), 4500);
  }, []);

  const handleUpdateBalance = useCallback(
    (newBalance: number) => {
      const prev = currentUserRef.current;
      const clamped = clampBalance(newBalance);
      if (!prev) return;

      const updated: AuthUserProfile = { ...prev, balance: clamped };
      currentUserRef.current = updated;
      setCurrentUser(updated);

      if (firebaseUser) {
        void updatePlayerRecord(
          firebaseUser.uid,
          { balance: clamped },
          {
            displayName: updated.name,
            avatar: updated.avatar,
            balance: clamped,
            totalWins: updated.totalWins,
            totalLosses: updated.totalLosses,
            title: updated.title,
          }
        ).catch(console.error);
      }
    },
    [firebaseUser]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('betarena-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const loadPlayerProfile = useCallback(
    async (
      user: User,
      options?: { customHandle?: string; customAvatar?: string }
    ) => {
      setRetryingProfile(true);
      try {
        const pending = options ?? pendingAuthRef.current;
        if (!options) {
          pendingAuthRef.current = null;
        }

        const record = await getOrCreatePlayerProfile(user.uid, {
          displayName: pending?.customHandle || user.displayName,
          avatar: pending?.customAvatar || user.photoURL,
          preferCustomName: Boolean(pending?.customHandle || pending?.customAvatar),
        });

        setCurrentUser({
          id: record.uid,
          name: record.displayName,
          avatar: record.avatar,
          balance: record.balance,
          totalWins: record.totalWins,
          totalLosses: record.totalLosses,
          winStreak: record.winStreak,
          title: record.title,
          lastDailyClaimAt: record.lastDailyClaimAt,
        });
        setProfileLoadError(null);
        setAuthReason(null);
        setActiveTab((prev) => (prev === 'auth' ? 'lobby' : prev));
      } catch (err) {
        if (isOfflineOrUnavailableError(err)) {
          console.warn('Firestore temporarily unreachable while loading player profile.');
          setProfileLoadError(
            'Unable to reach Cloud Firestore right now. Check your internet connection and retry.'
          );
        } else {
          console.error('Failed to load player profile:', err);
          setProfileLoadError('Could not load your player profile. Please retry in a moment.');
        }
      } finally {
        setRetryingProfile(false);
        setAuthReady(true);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCurrentUser(null);
        setProfileLoadError(null);
        setActiveRoomId(null);
        setActiveRoom(null);
        setRooms([]);
        setLeaderboardEntries([]);
        setWalletTransactions([]);
        setIsWalletOpen(false);
        setIsCreateRoomOpen(false);
        setAuthReady(true);
        return;
      }

      await loadPlayerProfile(user);
    });

    return () => unsubscribe();
  }, [loadPlayerProfile]);

  useEffect(() => {
    if (!firebaseUser || currentUser) return;
    const handleOnline = () => {
      void loadPlayerProfile(firebaseUser);
    };
    window.addEventListener('online', handleOnline);
    const retryTimer = profileLoadError
      ? window.setTimeout(() => {
          if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            void loadPlayerProfile(firebaseUser);
          }
        }, 4500)
      : undefined;
    return () => {
      window.removeEventListener('online', handleOnline);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [firebaseUser, currentUser, profileLoadError, loadPlayerProfile]);

  // Subscribe to real-time leaderboard, live rooms & verified wallet deposits once authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !currentUser) return;
    const unsubLeaderboard = subscribeLeaderboard(setLeaderboardEntries);
    const unsubRooms = subscribeRooms(firebaseUser.uid, (nextRooms) => {
      setRooms(nextRooms.filter((r) => !cancelledRoomIdsRef.current.has(r.id)));
    });
    const unsubTransactions = subscribePlayerTransactions(firebaseUser.uid, setWalletTransactions);
    return () => {
      unsubLeaderboard();
      unsubRooms();
      unsubTransactions();
    };
  }, [authReady, firebaseUser, currentUser]);

  // Verify Squad payment automatically on callback redirect (?squad_tx=...)
  useEffect(() => {
    if (!authReady || !firebaseUser || !currentUser || !pendingSquadTxRef) return;
    const txRef = pendingSquadTxRef;
    setPendingSquadTxRef(null);
    clearSquadQueryParams();

    void (async () => {
      try {
        const verification = await verifySquadPayment(txRef);
        if (!verification.verified || !verification.amountNaira) {
          showNotice(
            verification.message || `Squad payment ${txRef} is ${verification.status || 'pending'}.`
          );
          return;
        }
        const credited = await creditSquadDeposit({
          uid: firebaseUser.uid,
          transactionRef: verification.transactionRef || txRef,
          amountNaira: verification.amountNaira,
        });
        setCurrentUser((prev) =>
          prev ? { ...prev, balance: credited.newBalance } : prev
        );
        showNotice(
          credited.alreadyCredited
            ? `Squad payment ${txRef} was already credited.`
            : `Squad payment verified! +₦${verification.amountNaira.toLocaleString()} added to your wallet.`
        );
      } catch (err) {
        console.error('Squad callback verification failed:', err);
        showNotice('Could not verify Squad callback transaction. Open Wallet to retry.');
      }
    })();
  }, [authReady, firebaseUser, currentUser, pendingSquadTxRef, showNotice]);

  // Subscribe to the currently active room (waiting room or live match)
  useEffect(() => {
    if (!authReady || !firebaseUser || !activeRoomId) {
      setActiveRoom(null);
      return;
    }
    const unsub = subscribeRoom(activeRoomId, (roomData) => {
      if (!roomData) {
        const prevRoom = activeRoomRef.current;
        const user = currentUserRef.current;
        cancelledRoomIdsRef.current.add(activeRoomId);
        setRooms((prev) => prev.filter((r) => r.id !== activeRoomId));
        if (
          prevRoom &&
          prevRoom.status === 'waiting' &&
          user &&
          prevRoom.hostId !== user.id &&
          prevRoom.playerIds.includes(user.id)
        ) {
          handleUpdateBalance(user.balance + prevRoom.stake);
          showNotice('Host cancelled the match.');
        } else {
          showNotice('The match room was closed.');
        }
        setActiveRoom(null);
        setActiveRoomId(null);
        return;
      }
      setActiveRoom(roomData);
    });
    return () => unsub();
  }, [authReady, firebaseUser, activeRoomId, handleUpdateBalance, showNotice]);

  const openAuthPage = (mode: AuthMode, reason?: string) => {
    setAuthPageMode(mode);
    setAuthReason(reason ?? null);
    setActiveRoomId(null);
    setActiveRoom(null);
    setActiveTab('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthSuccess = async ({
    customHandle,
    customAvatar,
  }: {
    mode: AuthMode;
    customHandle?: string;
    customAvatar?: string;
  }) => {
    if (customHandle || customAvatar) {
      pendingAuthRef.current = { customHandle, customAvatar };
    }
    const user = auth.currentUser;
    if (user) {
      await loadPlayerProfile(user, { customHandle, customAvatar });
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveRoomId(null);
    setActiveRoom(null);
    setCurrentUser(null);
    setProfileLoadError(null);
    setAuthPageMode('signin');
    setAuthReason(null);
    setActiveTab('auth');
  };

  const handleSquadCredited = useCallback((newBalance: number) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, balance: newBalance };
      currentUserRef.current = updated;
      return updated;
    });
  }, []);

  const handleUpdateUserName = useCallback(
    async (rawName: string) => {
      const user = currentUserRef.current;
      if (!firebaseUser || !user) return;
      const cleanName = sanitizeDisplayName(rawName);
      if (cleanName.length < 2) {
        showNotice('Username must be at least 2 characters.');
        return;
      }

      try {
        await updatePlayerRecord(
          firebaseUser.uid,
          { displayName: cleanName },
          {
            displayName: cleanName,
            avatar: user.avatar,
            balance: user.balance,
            totalWins: user.totalWins,
            totalLosses: user.totalLosses,
            title: user.title,
          }
        );
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, name: cleanName };
          currentUserRef.current = updated;
          return updated;
        });
        showNotice(`Username updated to ${cleanName}.`);
      } catch (err) {
        console.error('Failed to update username:', err);
        showNotice('Could not update username right now. Please try again.');
        throw err;
      }
    },
    [firebaseUser, showNotice]
  );

  const enterRoomById = useCallback(
    async (roomId: string, inviteToken?: string) => {
      const user = currentUserRef.current;
      if (!firebaseUser || !user) {
        setPendingInvite({ roomId, inviteToken });
        openAuthPage('signin', 'Sign in or sign up to join this invited match.');
        return;
      }

      const targetRoom = await getRoomById(roomId);
      if (!targetRoom) {
        showNotice('Match room not found or already cancelled.');
        return;
      }

      if (targetRoom.playerIds.includes(user.id)) {
        setActiveRoomId(targetRoom.id);
        setActiveRoom(targetRoom);
        return;
      }

      if (targetRoom.visibility === 'private') {
        if (targetRoom.inviteToken && inviteToken !== targetRoom.inviteToken) {
          showNotice('This is a private room. You need the host’s private invite link to join.');
          return;
        }
        if (targetRoom.invitedHandles.length > 0) {
          const cleanName = user.name.trim().toLowerCase();
          const cleanEmail = (firebaseUser.email || '').trim().toLowerCase();
          const isInvited =
            targetRoom.invitedHandles.includes(cleanName) ||
            (cleanEmail.length > 0 && targetRoom.invitedHandles.includes(cleanEmail));
          if (!isInvited) {
            showNotice('Access denied: this private room is restricted to players invited by the host.');
            return;
          }
        }
      }

      if (targetRoom.status !== 'waiting' || targetRoom.currentPlayers >= targetRoom.maxPlayers) {
        showNotice('This match room is already full or in progress.');
        return;
      }

      if (user.balance < targetRoom.stake) {
        showNotice('Insufficient Naira balance! Top up your wallet to match this stake.');
        setIsWalletOpen(true);
        return;
      }

      const previousBalance = user.balance;
      handleUpdateBalance(previousBalance - targetRoom.stake);

      try {
        await joinMultiplayerRoom(
          targetRoom.id,
          {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            email: firebaseUser.email,
          },
          { inviteToken }
        );
        setActiveRoomId(targetRoom.id);
      } catch (err) {
        handleUpdateBalance(previousBalance);
        showNotice(
          err instanceof Error && err.message.includes('private')
            ? err.message
            : 'Could not join room — it may have filled up or started.'
        );
        console.error(err);
      }
    },
    [firebaseUser, handleUpdateBalance, showNotice]
  );

  useEffect(() => {
    if (!authReady || !firebaseUser || !currentUser || !pendingInvite) return;
    const inviteToJoin = pendingInvite;
    setPendingInvite(null);
    clearInviteQueryParam();
    void enterRoomById(inviteToJoin.roomId, inviteToJoin.inviteToken);
  }, [authReady, firebaseUser, currentUser, pendingInvite, enterRoomById]);

  const handleJoinRoom = (room: GameRoom) => {
    void enterRoomById(room.id, room.visibility === 'private' ? room.inviteToken : undefined);
  };

  const handleJoinInviteCode = async (rawInput: string) => {
    const parsed = extractInviteFromInput(rawInput);
    if (!parsed) {
      showNotice('Invalid invite link or room code. Please check and try again.');
      return;
    }
    await enterRoomById(parsed.roomId, parsed.inviteToken);
  };

  const handleCreateRoom = async (
    title: string,
    gameType: GameType,
    stake: number,
    maxPlayers: number,
    visibility: RoomVisibility,
    invitedHandles: string[]
  ) => {
    const user = currentUserRef.current;
    if (!firebaseUser || !user) {
      openAuthPage('signup', 'Create an account or sign in before creating a room.');
      return;
    }
    if (user.balance < stake) {
      showNotice('Insufficient Naira balance! Top up your wallet to create this room.');
      setIsWalletOpen(true);
      return;
    }

    const previousBalance = user.balance;
    handleUpdateBalance(previousBalance - stake);

    try {
      const created = await createMultiplayerRoom({
        title,
        gameType,
        host: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
        },
        stake,
        maxPlayers: Math.max(MIN_ROOM_PLAYERS, maxPlayers),
        visibility,
        invitedHandles,
      });
      setActiveRoomId(created.id);
      setActiveRoom(created);
    } catch (err) {
      handleUpdateBalance(previousBalance);
      showNotice('Failed to create match room. Your stake was refunded.');
      console.error(err);
    }
  };

  const handleStartWaitingMatch = async () => {
    const user = currentUserRef.current;
    if (!activeRoom || !user) return;
    if (activeRoom.hostId !== user.id || activeRoom.currentPlayers < MIN_ROOM_PLAYERS) {
      showNotice(`At least ${MIN_ROOM_PLAYERS} real players must join before starting.`);
      return;
    }
    await startMultiplayerRoom(activeRoom.id);
  };

  const handleCancelWaitingRoom = async () => {
    const user = currentUserRef.current;
    if (!activeRoom || !user) return;
    if (activeRoom.hostId !== user.id || activeRoom.status !== 'waiting') return;

    const cancelledId = activeRoom.id;
    cancelledRoomIdsRef.current.add(cancelledId);
    setRooms((prev) => prev.filter((r) => r.id !== cancelledId));
    await cancelWaitingRoom(cancelledId);
    handleUpdateBalance(user.balance + activeRoom.stake);
    setActiveRoomId(null);
    setActiveRoom(null);
    showNotice('Match cancelled.');
  };

  const handleUpdateMatch = async (
    gameState: Record<string, unknown>,
    status: 'in_progress' | 'completed' = 'in_progress',
    winnerId = ''
  ) => {
    if (!activeRoom) return;
    await updateRoomGameState(activeRoom.id, gameState, status, winnerId);
  };

  const handleGameOver = useCallback(
    (won: boolean, reward: number, isTie = false) => {
      const prev = currentUserRef.current;
      if (!prev) return;

      const nextBalance =
        won || isTie ? clampBalance(prev.balance + reward) : prev.balance;
      const nextWins = won ? prev.totalWins + 1 : prev.totalWins;
      const nextLosses = won || isTie ? prev.totalLosses : prev.totalLosses + 1;
      const nextStreak = isTie ? prev.winStreak : won ? prev.winStreak + 1 : 0;

      const updated: AuthUserProfile = {
        ...prev,
        balance: nextBalance,
        totalWins: nextWins,
        totalLosses: nextLosses,
        winStreak: nextStreak,
      };
      currentUserRef.current = updated;
      setCurrentUser(updated);

      if (firebaseUser) {
        void updatePlayerRecord(
          firebaseUser.uid,
          {
            balance: nextBalance,
            totalWins: nextWins,
            totalLosses: nextLosses,
            winStreak: nextStreak,
          },
          {
            displayName: updated.name,
            avatar: updated.avatar,
            balance: nextBalance,
            totalWins: nextWins,
            totalLosses: nextLosses,
            title: updated.title,
          }
        ).catch(console.error);
      }
    },
    [firebaseUser]
  );

  const isAuthenticated = Boolean(firebaseUser && currentUser);

  const displayedLeaderboard: LeaderboardEntry[] = leaderboardEntries.map((entry) =>
    currentUser && entry.id === currentUser.id
      ? { ...entry, name: `${entry.name} (You)` }
      : entry
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white dark:selection:text-slate-950 transition-colors duration-200">
      <Navbar
        isAuthenticated={isAuthenticated}
        authReady={authReady}
        userName={currentUser?.name}
        userAvatar={currentUser?.avatar}
        balance={currentUser?.balance ?? 0}
        activeTab={activeTab}
        authPageMode={authPageMode}
        setActiveTab={(tab) => {
          setActiveRoomId(null);
          setActiveRoom(null);
          setActiveTab(tab);
        }}
        onOpenWallet={() => {
          if (!isAuthenticated) {
            openAuthPage('signin', 'Sign in to access your Naira wallet.');
            return;
          }
          setWalletInitialTab('deposit');
          setIsWalletOpen(true);
        }}
        onOpenWithdraw={() => {
          if (!isAuthenticated) {
            openAuthPage('signin', 'Sign in to withdraw from your Naira wallet.');
            return;
          }
          setWalletInitialTab('withdraw');
          setIsWalletOpen(true);
        }}
        onUpdateUserName={handleUpdateUserName}
        onOpenAuth={(mode) => openAuthPage(mode)}
        onSignOut={() => void handleSignOut()}
        muted={muted}
        setMuted={setMuted}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />

      {noticeMsg && (
        <div className="max-w-3xl mx-auto mt-4 px-4 w-full">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold text-center shadow-sm">
            {noticeMsg}
          </div>
        </div>
      )}

      <main className="flex-1 pb-12">
        {!authReady ? (
          <div className="max-w-6xl mx-auto px-4 py-16">
            <div className="h-96 rounded-3xl bg-slate-200/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 animate-pulse" />
          </div>
        ) : activeRoom && isAuthenticated && currentUser ? (
          activeRoom.status === 'waiting' ? (
            <WaitingRoomView
              room={activeRoom}
              currentUserId={currentUser.id}
              isHost={activeRoom.hostId === currentUser.id}
              onStartMatch={handleStartWaitingMatch}
              onCancelMatch={handleCancelWaitingRoom}
              onUpdateInvitedHandles={async (handles) => {
                await updateRoomInvitedHandles(activeRoom.id, handles);
              }}
              onBackToLobby={() => {
                setActiveRoomId(null);
                setActiveRoom(null);
              }}
            />
          ) : (
            <div className="py-6">
              {activeRoom.gameType === 'whot' && (
                <WhotGame
                  key={activeRoom.id}
                  room={activeRoom}
                  currentUserId={currentUser.id}
                  onUpdateMatch={handleUpdateMatch}
                  onGameOver={handleGameOver}
                  onBack={() => {
                    setActiveRoomId(null);
                    setActiveRoom(null);
                  }}
                />
              )}
              {activeRoom.gameType === 'checkers' && (
                <CheckersGame
                  key={activeRoom.id}
                  room={activeRoom}
                  currentUserId={currentUser.id}
                  onUpdateMatch={handleUpdateMatch}
                  onGameOver={handleGameOver}
                  onBack={() => {
                    setActiveRoomId(null);
                    setActiveRoom(null);
                  }}
                />
              )}
              {activeRoom.gameType === 'rps' && (
                <RockPaperScissorsGame
                  key={activeRoom.id}
                  room={activeRoom}
                  currentUserId={currentUser.id}
                  onGameOver={handleGameOver}
                  onBack={() => {
                    setActiveRoomId(null);
                    setActiveRoom(null);
                  }}
                />
              )}
              {activeRoom.gameType === 'tictactoe' && (
                <TicTacToeGame
                  key={activeRoom.id}
                  room={activeRoom}
                  currentUserId={currentUser.id}
                  onUpdateMatch={handleUpdateMatch}
                  onGameOver={handleGameOver}
                  onBack={() => {
                    setActiveRoomId(null);
                    setActiveRoom(null);
                  }}
                />
              )}
              {activeRoom.gameType === 'memory' && (
                <MemoryGame
                  key={activeRoom.id}
                  room={activeRoom}
                  currentUserId={currentUser.id}
                  onUpdateMatch={handleUpdateMatch}
                  onGameOver={handleGameOver}
                  onBack={() => {
                    setActiveRoomId(null);
                    setActiveRoom(null);
                  }}
                />
              )}
            </div>
          )
        ) : (
          <>
            {firebaseUser && !currentUser && profileLoadError && (
              <div className="max-w-lg mx-auto px-4 py-12">
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 text-center space-y-5 shadow-lg">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-500/30">
                    <WifiOff className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                      Connection Interrupted
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {profileLoadError}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      type="button"
                      disabled={retryingProfile}
                      onClick={() => void loadPlayerProfile(firebaseUser)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-sm transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <RotateCcw className={`w-4 h-4 ${retryingProfile ? 'animate-spin' : ''}`} />
                      <span>{retryingProfile ? 'Reconnecting...' : 'Retry Connection'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'auth' && !isAuthenticated && !profileLoadError && (
              <AuthPage
                initialMode={authPageMode}
                reasonMessage={authReason}
                onModeChange={(mode) => setAuthPageMode(mode)}
                onBeforeAuth={({ customHandle, customAvatar }) => {
                  pendingAuthRef.current =
                    customHandle || customAvatar ? { customHandle, customAvatar } : null;
                }}
                onAuthSuccess={handleAuthSuccess}
                onBrowseLobby={() => {
                  setAuthReason(null);
                  setActiveTab('lobby');
                }}
              />
            )}
            {(activeTab === 'lobby' || (activeTab === 'auth' && isAuthenticated)) && (
              <LobbyView
                rooms={rooms}
                currentUserId={currentUser?.id}
                isAuthenticated={isAuthenticated}
                onRequireAuth={openAuthPage}
                onJoinRoom={handleJoinRoom}
                onJoinInviteCode={handleJoinInviteCode}
                onCreateRoomClick={() => {
                  if (!isAuthenticated) {
                    openAuthPage('signup', 'Sign up or sign in before creating a game room.');
                    return;
                  }
                  setIsCreateRoomOpen(true);
                }}
              />
            )}
            {activeTab === 'leaderboard' && (
              <LeaderboardView
                entries={displayedLeaderboard}
                isAuthenticated={isAuthenticated}
              />
            )}
          </>
        )}
      </main>

      {currentUser && (
        <>
          <WalletModal
            isOpen={isWalletOpen}
            initialTab={walletInitialTab}
            onClose={() => setIsWalletOpen(false)}
            uid={currentUser.id}
            playerEmail={firebaseUser?.email || ''}
            playerName={currentUser.name}
            balance={currentUser.balance}
            transactions={walletTransactions}
            onSquadCredited={(newBalance) => handleSquadCredited(newBalance)}
            onWithdrawn={(newBalance) => handleSquadCredited(newBalance)}
          />

          <GameSelectModal
            isOpen={isCreateRoomOpen}
            onClose={() => setIsCreateRoomOpen(false)}
            onCreateRoom={handleCreateRoom}
          />
        </>
      )}
    </div>
  );
}
