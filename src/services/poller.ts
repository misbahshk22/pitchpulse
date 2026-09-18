import { CONFIG } from '../config.js';
import { footballApi } from './footballApi.js';
import { notificationDispatcher } from './notificationDispatcher.js';
import { saveFixtures } from '../db/database.js';
import type { Fixture } from '../types.js';

class AdaptivePoller {
  private timer: NodeJS.Timeout | null = null;
  private previousScores: Map<number, { home: number | null; away: number | null }> = new Map();
  private isRunning = false;

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[AdaptivePoller] Starting polling service...');
    this.tick();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const liveMatches = await footballApi.getLiveMatches();
      const hasLiveMatches = liveMatches.length > 0;

      if (hasLiveMatches) {
        // Process score diffs
        for (const match of liveMatches) {
          const prev = this.previousScores.get(match.id);
          const currentHome = match.score.home ?? 0;
          const currentAway = match.score.away ?? 0;

          if (prev) {
            const prevHome = prev.home ?? 0;
            const prevAway = prev.away ?? 0;
            if (currentHome > prevHome || currentAway > prevAway) {
              const scoringTeam = currentHome > prevHome ? match.homeTeam : match.awayTeam;
              notificationDispatcher.notifyGoal(match, {
                time: { elapsed: match.elapsed || 80 },
                team: scoringTeam,
                player: { name: scoringTeam.name + ' Scorer' },
                type: 'Goal',
                detail: 'Normal Goal'
              });
            }
          }

          this.previousScores.set(match.id, { home: match.score.home, away: match.score.away });
        }

        // Broadcast current state to all connected SSE clients
        notificationDispatcher.broadcastLiveUpdate(liveMatches);
      }

      // Adaptive interval: fast when live games exist, quiet when idle
      const intervalMs = hasLiveMatches
        ? CONFIG.pollingIntervalLiveSec * 1000
        : CONFIG.pollingIntervalIdleMin * 60 * 1000;

      this.timer = setTimeout(() => this.tick(), intervalMs);
    } catch (err) {
      console.error('[AdaptivePoller] Error in poller tick:', err);
      this.timer = setTimeout(() => this.tick(), 30000);
    }
  }
}

export const adaptivePoller = new AdaptivePoller();
