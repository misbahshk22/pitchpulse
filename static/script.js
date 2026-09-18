// Matchday Multi-Section Client

let currentMatchLeagueId = null; // null = All
let currentStandingsLeagueId = 39; // default Premier League
let currentSquadLeagueId = 39;
let activeView = 'dashboard';
let allTrackedLeagues = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadLeagues();
  await initDashboard();
  initEventSource();
  initAskForm();
  initNotifications();
});

// ===================================================
// 1. Navigation & Routing
// ===================================================
function navigateTo(viewName) {
  activeView = viewName;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  // Update view containers
  const viewMap = {
    dashboard: 'viewDashboard',
    live: 'viewLive',
    matches: 'viewMatches',
    squads: 'viewSquads',
    standings: 'viewStandings'
  };

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const targetEl = document.getElementById(viewMap[viewName]);
  if (targetEl) targetEl.classList.add('active');

  // Trigger data load for the selected view
  if (viewName === 'live') loadLiveSection();
  else if (viewName === 'matches') loadMatchesSection();
  else if (viewName === 'squads') loadSquadsSection();
  else if (viewName === 'standings') loadStandingsSection();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================================================
// 2. Initial Data Loading
// ===================================================
async function loadLeagues() {
  try {
    const res = await fetch('/api/leagues');
    const data = await res.json();
    if (data.status === 'success') {
      allTrackedLeagues = data.leagues;
    }
  } catch (err) {
    console.error('Failed to load leagues:', err);
  }
}

async function initDashboard() {
  // Marquee
  initNextMarquee();

  // Dashboard Live & Today's Real Matches
  const container = document.getElementById('dashboardLiveList');
  if (container) {
    try {
      const [liveRes, todayRes, fixRes] = await Promise.all([
        fetch('/api/fixtures/live'),
        fetch('/api/fixtures/today'),
        fetch('/api/fixtures?league=39')
      ]);
      const liveData = await liveRes.json();
      const todayData = await todayRes.json();
      const fixData = await fixRes.json();

      container.innerHTML = '';
      const pool = [
        ...(liveData.live || []),
        ...(todayData.fixtures || []),
        ...(fixData.fixtures || [])
      ];

      // Deduplicate by fixture id
      const seen = new Set();
      const highlights = [];
      for (const item of pool) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          highlights.push(item);
        }
      }

      const topMatches = highlights.slice(0, 6);

      if (topMatches.length === 0) {
        container.innerHTML = `<p style="color:var(--sideline)">No matches currently scheduled.</p>`;
      } else {
        for (const m of topMatches) {
          container.appendChild(createMatchCard(m));
        }
      }
    } catch (e) {
      container.innerHTML = `<p style="color:var(--sideline)">Error loading matches.</p>`;
    }
  }
}

async function initNextMarquee() {
  const nextUpEl = document.getElementById('nextUp');
  if (!nextUpEl) return;

  try {
    const res = await fetch('/api/fixtures/next');
    const data = await res.json();
    if (data.next) {
      const f = data.next;
      const dateStr = formatKickoff(f.kickoff);
      nextUpEl.innerHTML = `⚡ Next Marquee Match: <strong>${f.homeTeam.name} vs ${f.awayTeam.name}</strong> (${f.leagueName}) · ${dateStr}`;
    } else {
      nextUpEl.innerHTML = `⚡ European Football Tracker Active · Real-time Feed Connected`;
    }
  } catch (err) {
    nextUpEl.innerHTML = `⚡ Real-time Football Tracker Active`;
  }
}

// ===================================================
// 3. Dedicated Live Matches Section (ALAG SECTION)
// ===================================================
async function loadLiveSection() {
  const container = document.getElementById('fullLiveList');
  if (!container) return;

  container.innerHTML = `<p style="color:var(--sideline)">Checking active in-play matches…</p>`;

  try {
    const res = await fetch('/api/fixtures/live');
    const data = await res.json();
    const liveMatches = data.live || [];
    const todayMatches = data.today || [];

    container.innerHTML = '';

    if (liveMatches.length > 0) {
      const headerEl = document.createElement('div');
      headerEl.style.gridColumn = '1 / -1';
      headerEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <h3 style="color:var(--live-red); display:flex; align-items:center; gap:8px; font-size:1.1rem; margin:0;">
            <span class="live-dot"></span> In-Play Right Now (${liveMatches.length})
          </h3>
          <span style="font-size:0.8rem; color:var(--sideline);">Live Score Updates Active</span>
        </div>
      `;
      container.appendChild(headerEl);

      for (const m of liveMatches) {
        container.appendChild(createMatchCard(m));
      }
    } else {
      const emptyEl = document.createElement('div');
      emptyEl.style.gridColumn = '1 / -1';
      emptyEl.innerHTML = `
        <div style="text-align: center; padding: 28px 20px; background: var(--panel-bg); border-radius: var(--card-radius); border: 1px solid var(--panel-border); margin-bottom: 20px;">
          <div style="font-size: 2.2rem; margin-bottom: 6px;">⏸️</div>
          <h3 style="color: #fff; margin-bottom: 6px; font-size:1.2rem;">No Matches Currently In-Play</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 550px; margin: 0 auto;">
            All European stadiums are currently between match windows. Below are today's scheduled real-world kickoffs and fixtures!
          </p>
        </div>
      `;
      container.appendChild(emptyEl);
    }

    // Also display today's real scheduled/finished fixtures
    if (todayMatches.length > 0) {
      const todayHeader = document.createElement('div');
      todayHeader.style.gridColumn = '1 / -1';
      todayHeader.innerHTML = `
        <div style="margin: 10px 0 14px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px;">
          <h3 style="color: var(--text-light); display:flex; align-items:center; gap:8px; font-size:1.05rem; margin:0;">
            <span>📅</span> Today's Matchday Kickoffs & Full-Time Results (${todayMatches.length} Matches)
          </h3>
        </div>
      `;
      container.appendChild(todayHeader);

      for (const m of todayMatches) {
        container.appendChild(createMatchCard(m));
      }
    }
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline)">Failed to load live match center.</p>`;
  }
}

// ===================================================
// 4. Matches & Schedules Section (Full Calendar)
// ===================================================
async function loadMatchesSection() {
  initMatchLeagueTabs();
  fetchLeagueFixtures();
}

function initMatchLeagueTabs() {
  const tabsContainer = document.getElementById('matchLeagueTabs');
  if (!tabsContainer || tabsContainer.children.length > 0) return;

  tabsContainer.innerHTML = '';

  // All
  const allBtn = document.createElement('button');
  allBtn.className = 'tab-btn active';
  allBtn.textContent = '🔥 All Competitions';
  allBtn.onclick = () => {
    currentMatchLeagueId = null;
    updateActiveTab(tabsContainer, allBtn);
    fetchLeagueFixtures();
  };
  tabsContainer.appendChild(allBtn);

  // Leagues
  for (const league of allTrackedLeagues) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.innerHTML = `<img src="${league.logo}" alt="${league.name}" onerror="this.style.display='none'"> ${league.name}`;
    btn.onclick = () => {
      currentMatchLeagueId = league.id;
      updateActiveTab(tabsContainer, btn);
      fetchLeagueFixtures();
    };
    tabsContainer.appendChild(btn);
  }
}

async function fetchLeagueFixtures() {
  const container = document.getElementById('matchList');
  const footNote = document.getElementById('footNote');
  if (!container) return;

  container.innerHTML = `<p style="color:var(--sideline)">Loading full fixture schedule…</p>`;

  try {
    const url = currentMatchLeagueId ? `/api/fixtures?league=${currentMatchLeagueId}` : '/api/fixtures';
    const res = await fetch(url);
    const data = await res.json();
    const fixtures = data.fixtures || [];

    if (fixtures.length === 0) {
      container.innerHTML = `<p style="color:var(--sideline); grid-column:1 / -1; text-align:center;">No scheduled matches found.</p>`;
      if (footNote) footNote.textContent = '';
      return;
    }

    container.innerHTML = '';
    for (const f of fixtures) {
      container.appendChild(createMatchCard(f));
    }

    if (footNote) {
      footNote.textContent = `Showing ${fixtures.length} scheduled matches across tracked matchdays.`;
    }
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline)">Error loading fixture schedule.</p>`;
  }
}

// ===================================================
// 5. Squads Explorer Section (ALAG SECTION)
// ===================================================
async function loadSquadsSection() {
  initSquadLeaguePills();
  loadClubsForSquad(currentSquadLeagueId);
}

function initSquadLeaguePills() {
  const container = document.getElementById('squadLeaguePills');
  if (!container || container.children.length > 0) return;

  container.innerHTML = '';

  const leaguesWithSquads = allTrackedLeagues.filter(l => [39, 140, 135, 78, 61].includes(l.id));

  for (const league of leaguesWithSquads) {
    const btn = document.createElement('button');
    btn.className = `league-pill-btn ${league.id === currentSquadLeagueId ? 'active' : ''}`;
    btn.innerHTML = `<img src="${league.logo}" width="16" height="16" style="object-fit:contain" onerror="this.style.display='none'"> ${league.name}`;
    btn.onclick = () => {
      currentSquadLeagueId = league.id;
      document.querySelectorAll('.league-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadClubsForSquad(league.id);
    };
    container.appendChild(btn);
  }
}

async function loadClubsForSquad(leagueId) {
  const container = document.getElementById('clubChipsContainer');
  if (!container) return;

  container.innerHTML = `<p style="color:var(--sideline); font-size:0.85rem">Loading clubs…</p>`;

  try {
    const res = await fetch(`/api/teams?league=${leagueId}`);
    const data = await res.json();
    const teams = data.teams || [];

    if (teams.length === 0) {
      container.innerHTML = `<p style="color:var(--sideline)">No clubs found.</p>`;
      return;
    }

    container.innerHTML = '';
    for (const team of teams) {
      const chip = document.createElement('button');
      chip.className = 'club-chip';
      chip.innerHTML = `<img src="${team.logo}" alt="${team.name}" onerror="this.style.display='none'"> <span>${team.name}</span>`;
      chip.onclick = () => {
        document.querySelectorAll('.club-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        fetchAndRenderSquad(team.name);
      };
      container.appendChild(chip);
    }
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline)">Error loading clubs.</p>`;
  }
}

function searchSquadFromInput() {
  const input = document.getElementById('squadSearchInput');
  const query = input?.value.trim();
  if (!query) return;
  fetchAndRenderSquad(query);
}

// Allow Enter key in squad search input
document.addEventListener('DOMContentLoaded', () => {
  const squadInput = document.getElementById('squadSearchInput');
  if (squadInput) {
    squadInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchSquadFromInput();
      }
    });
  }
});

async function fetchAndRenderSquad(teamQuery) {
  const container = document.getElementById('squadResult');
  if (!container) return;

  container.innerHTML = `
    <div style="background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:var(--card-radius); padding:24px; text-align:center;">
      <p style="color:var(--pitch-green)">Fetching official squad roster for "${teamQuery}"…</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/squad?team=${encodeURIComponent(teamQuery)}`);
    const data = await res.json();

    if (!data.squad || !data.squad.players || data.squad.players.length === 0) {
      container.innerHTML = `
        <div style="background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:var(--card-radius); padding:24px; text-align:center;">
          <p style="color:#ef4444">No official squad found for "${teamQuery}". Please check the spelling or pick a club above.</p>
        </div>
      `;
      return;
    }

    const s = data.squad;
    const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

    let html = `
      <div style="background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:var(--card-radius); padding:24px;">
        <div class="team-banner">
          <img src="${s.teamLogo || ''}" alt="${s.teamName}">
          <div>
            <h3>${s.teamName}</h3>
            <span style="font-size:0.85rem; color:var(--pitch-green); font-weight:600;">Official First Team Squad (${s.players.length} Players)</span>
          </div>
        </div>
        <div class="squad-section">
    `;

    for (const pos of positions) {
      const inPos = s.players.filter(p => p.position === pos);
      if (inPos.length > 0) {
        const icon = pos === 'Goalkeeper' ? '🧤' : pos === 'Defender' ? '🛡️' : pos === 'Midfielder' ? '🎯' : '⚡';
        html += `
          <div class="squad-pos-title">${icon} ${pos}s (${inPos.length})</div>
          <div class="squad-grid">
            ${inPos.map(p => `
              <div class="player-chip">
                <span class="jersey-badge">${p.jersey !== '-' ? '#' + p.jersey : '•'}</span>
                <span style="font-weight:500;">${p.name}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const others = s.players.filter(p => !positions.includes(p.position || ''));
    if (others.length > 0) {
      html += `
        <div class="squad-pos-title">Other Squad Members (${others.length})</div>
        <div class="squad-grid">
          ${others.map(p => `
            <div class="player-chip">
              <span class="jersey-badge">${p.jersey !== '-' ? '#' + p.jersey : '•'}</span>
              <span>${p.name}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `</div></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `
      <div style="background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:var(--card-radius); padding:24px; text-align:center;">
        <p style="color:#ef4444">Failed to load squad. Please try again.</p>
      </div>
    `;
  }
}

// ===================================================
// 6. Standings Section
// ===================================================
async function loadStandingsSection() {
  initStandingsLeagueTabs();
  fetchStandingsTable(currentStandingsLeagueId);
}

function initStandingsLeagueTabs() {
  const container = document.getElementById('standingsLeagueTabs');
  if (!container || container.children.length > 0) return;

  container.innerHTML = '';
  const majorLeagues = allTrackedLeagues.filter(l => [39, 140, 135, 78, 61].includes(l.id));

  for (const league of majorLeagues) {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${league.id === currentStandingsLeagueId ? 'active' : ''}`;
    btn.innerHTML = `<img src="${league.logo}" alt="${league.name}" onerror="this.style.display='none'"> ${league.name}`;
    btn.onclick = () => {
      currentStandingsLeagueId = league.id;
      updateActiveTab(container, btn);
      fetchStandingsTable(league.id);
    };
    container.appendChild(btn);
  }
}

async function fetchStandingsTable(leagueId) {
  const container = document.getElementById('standingsTableContainer');
  if (!container) return;

  container.innerHTML = `<p style="color:var(--sideline)">Loading table…</p>`;

  try {
    const res = await fetch(`/api/standings?league=${leagueId}`);
    const data = await res.json();
    const standings = data.standings || [];

    if (standings.length === 0) {
      container.innerHTML = `<p style="color:var(--sideline)">No standings available.</p>`;
      return;
    }

    container.innerHTML = `
      <table class="standings-table">
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>Club</th>
            <th style="text-align:center">P</th>
            <th style="text-align:center">W</th>
            <th style="text-align:center">D</th>
            <th style="text-align:center">L</th>
            <th style="text-align:center">GD</th>
            <th style="text-align:center">Pts</th>
            <th style="text-align:right">Form</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map(s => `
            <tr>
              <td style="font-weight:700; color:var(--text-muted);">${s.rank}</td>
              <td>
                <div class="club-cell">
                  <img src="${s.team.logo}" alt="${s.team.name}" onerror="this.style.display='none'">
                  <span>${s.team.name}</span>
                </div>
              </td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace;">${s.played}</td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace;">${s.win}</td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace;">${s.draw}</td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace;">${s.lose}</td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace; color:${s.goalsDiff > 0 ? 'var(--pitch-green)' : s.goalsDiff < 0 ? 'var(--live-red)' : 'var(--text-muted)'};">
                ${s.goalsDiff > 0 ? '+' + s.goalsDiff : s.goalsDiff}
              </td>
              <td style="text-align:center; font-family:'IBM Plex Mono',monospace; font-weight:800; font-size:1.05rem; color:#fff;">
                ${s.points}
              </td>
              <td style="text-align:right; font-family:'IBM Plex Mono',monospace; font-size:0.8rem; color:var(--sideline);">
                ${s.form || '-'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline)">Error loading standings.</p>`;
  }
}

// ===================================================
// 7. Match Card Generator
// ===================================================
function createMatchCard(f) {
  const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status);
  const card = document.createElement('div');
  card.className = `match-card ${isLive ? 'is-live' : ''}`;
  card.id = `fixture-${f.id}`;
  card.style.cursor = 'pointer';
  card.onclick = () => openMatchModal(f);

  const statusBadge = isLive
    ? `<span class="status-badge live"><span class="pulse-dot"></span> ${f.elapsed ? f.elapsed + "'" : ''} ${f.status}</span>`
    : `<span class="status-badge">${f.status === 'FT' ? 'FT' : formatKickoffTime(f.kickoff)}</span>`;

  const homeScore = f.score?.home !== null && f.score?.home !== undefined ? f.score.home : '-';
  const awayScore = f.score?.away !== null && f.score?.away !== undefined ? f.score.away : '-';

  const eventsHtml = (f.events && f.events.length > 0)
    ? `<div class="events-list">
        ${f.events.slice(-2).map(e => `
          <div class="event-row">
            <span>${e.type === 'Goal' ? '⚽' : '🟨'}</span>
            <strong>${e.time.elapsed}'</strong> ${e.player.name} (${e.team.name})
          </div>
        `).join('')}
       </div>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="league-info">
        <img src="${f.leagueLogo}" alt="${f.leagueName}" onerror="this.style.display='none'">
        <span>${f.leagueName}</span>
      </div>
      ${statusBadge}
    </div>

    <div class="teams-wrap">
      <div class="team-row">
        <div class="team-meta">
          <img src="${f.homeTeam.logo}" alt="${f.homeTeam.name}" onerror="this.style.display='none'">
          <span>${f.homeTeam.name}</span>
        </div>
        <div class="team-score">${homeScore}</div>
      </div>
      <div class="team-row">
        <div class="team-meta">
          <img src="${f.awayTeam.logo}" alt="${f.awayTeam.name}" onerror="this.style.display='none'">
          <span>${f.awayTeam.name}</span>
        </div>
        <div class="team-score">${awayScore}</div>
      </div>
    </div>

    ${eventsHtml}

    <div class="card-footer">
      <span>${f.round || formatKickoffDate(f.kickoff)}</span>
      <span style="color:var(--pitch-green); font-weight:600; font-size:0.75rem;">H2H & Details →</span>
    </div>
  `;

  return card;
}

// ===================================================
// 8. Server-Sent Events (SSE) Live Score Updates
// ===================================================
function initEventSource() {
  const evtSource = new EventSource('/api/live/stream');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'LIVE_UPDATE' && Array.isArray(data.data)) {
        for (const liveMatch of data.data) {
          updateMatchCardInPlace(liveMatch);
        }
      }

      if (data.type === 'GOAL_ALERT') {
        showToast(`⚽ GOAL! ${data.message}`);
        if (Notification.permission === 'granted') {
          new Notification('GoalHub Goal Alert', { body: data.message });
        }
      }
    } catch (e) {}
  };

  evtSource.onerror = () => {
    console.warn('[SSE] Stream disconnected. Reconnecting...');
  };
}

function updateMatchCardInPlace(match) {
  const el = document.getElementById(`fixture-${match.id}`);
  if (el) {
    const scores = el.querySelectorAll('.team-score');
    if (scores.length >= 2) {
      scores[0].textContent = match.score.home ?? 0;
      scores[1].textContent = match.score.away ?? 0;
    }
    const badge = el.querySelector('.status-badge.live');
    if (badge && match.elapsed) {
      badge.innerHTML = `<span class="pulse-dot"></span> ${match.elapsed}' ${match.status}`;
    }
  }
}

// ===================================================
// 9. Natural Language Search / Ask Assistant
// ===================================================
function initAskForm() {
  const form = document.getElementById('askForm');
  const input = document.getElementById('askInput');
  const answerEl = document.getElementById('askAnswer');
  if (!form || !input || !answerEl) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    answerEl.style.display = 'block';
    answerEl.innerHTML = `<div style="padding:14px; text-align:center; color:var(--sideline)"><em>Searching European football database for "${query}"…</em></div>`;

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      const r = data.result;

      if (!r || (r.intent === 'unknown' && (!r.matches || r.matches.length === 0))) {
        answerEl.innerHTML = `
          <div style="padding:16px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
            <p style="color:#e2e8f0; margin-bottom:8px;">No exact match found for "<strong>${query}</strong>".</p>
            <p style="color:var(--sideline); font-size:0.85rem;">Try searching: <em>Barcelona</em>, <em>Real Madrid</em>, <em>Arsenal</em>, <em>Bayern Munich</em>, <em>PSG</em>, or <em>who is playing live</em>.</p>
          </div>
        `;
        return;
      }

      let html = '';

      // Team Header Banner
      if (r.squad?.teamName) {
        html += `
          <div style="background:linear-gradient(180deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.8) 100%); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:18px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
            <div style="display:flex; align-items:center; gap:14px;">
              ${r.squad.teamLogo ? `<img src="${r.squad.teamLogo}" alt="${r.squad.teamName}" style="width:52px; height:52px; object-fit:contain;">` : ''}
              <div>
                <h3 style="font-size:1.35rem; margin:0; color:#fff;">${r.squad.teamName}</h3>
                <span style="font-size:0.82rem; color:var(--pitch-green); font-weight:600;">Official European Club Schedule & Squad</span>
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="primary-btn" style="width:auto; padding:8px 14px; font-size:0.82rem; margin:0;" onclick="openAlertsModal('${r.squad.teamName}')">
                🔔 Set ${r.squad.teamName} Alerts
              </button>
              <button class="tab-btn" style="padding:8px 14px; font-size:0.82rem;" onclick="navigateTo('squads'); lookupClubSquad('${r.squad.teamName}')">
                👥 View Squad Explorer
              </button>
            </div>
          </div>
        `;
      }

      html += `<p style="margin: 0 0 12px; font-size:0.95rem; color:#f8fafc;"><strong>${r.message}</strong></p>`;

      // Matches Schedule
      if (r.matches && r.matches.length > 0) {
        html += `
          <div style="margin-bottom:20px;">
            <h4 style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
              📅 Match Schedule (${r.matches.length} matches)
            </h4>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:10px;">
              ${r.matches.map((m, idx) => {
                const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(m.status);
                const isFt = m.status === 'FT';
                const dateStr = formatKickoff(m.kickoff);
                const scoreDisplay = (m.score?.home !== null && m.score?.away !== null && (isLive || isFt))
                  ? `<span style="font-weight:800; font-family:'IBM Plex Mono',monospace; color:${isLive ? 'var(--live-red)' : 'var(--pitch-green)'}; margin:0 8px; font-size:1.05rem;">${m.score.home} - ${m.score.away}</span>`
                  : `<span style="color:var(--sideline); margin:0 8px; font-weight:600;">VS</span>`;

                return `
                <div class="search-match-card" style="background:#1e293b; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 14px; cursor:pointer; transition:all 0.2s;" onclick='openMatchModal(${JSON.stringify(m).replace(/'/g, "&#39;")})'>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:0.75rem; color:var(--sideline);">
                    <span>${m.round || m.leagueName}</span>
                    <span style="background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px; font-weight:600; color:${isLive ? '#ef4444' : '#94a3b8'}">${isLive ? "🔴 LIVE" : isFt ? "FT" : dateStr}</span>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:8px; flex:1;">
                      <img src="${m.homeTeam.logo}" alt="${m.homeTeam.name}" style="width:22px; height:22px; object-fit:contain;" onerror="this.style.display='none'">
                      <strong style="font-size:0.9rem;">${m.homeTeam.name}</strong>
                    </div>
                    ${scoreDisplay}
                    <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end;">
                      <strong style="font-size:0.9rem;">${m.awayTeam.name}</strong>
                      <img src="${m.awayTeam.logo}" alt="${m.awayTeam.name}" style="width:22px; height:22px; object-fit:contain;" onerror="this.style.display='none'">
                    </div>
                  </div>
                  <div style="margin-top:8px; font-size:0.75rem; color:var(--sideline); display:flex; justify-content:space-between;">
                    <span>🏟️ ${m.venue || 'Stadium'}</span>
                    <span style="color:var(--pitch-green);">Click for H2H details →</span>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Standings Table
      if (r.standings && r.standings.length > 0) {
        html += `
          <div class="standings-table-wrap" style="margin-bottom:20px;">
            <table class="standings-table">
              <thead><tr><th>#</th><th>Club</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th><th>Form</th></tr></thead>
              <tbody>
                ${r.standings.slice(0, 10).map(s => `
                  <tr>
                    <td>${s.rank}</td>
                    <td><div class="club-cell"><img src="${s.team.logo}" alt="${s.team.name}"> ${s.team.name}</div></td>
                    <td>${s.played}</td><td>${s.win}</td><td>${s.draw}</td><td>${s.lose}</td>
                    <td>${s.goalsDiff}</td><td><strong>${s.points}</strong></td><td>${s.form || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      // Squad Overview
      if (r.squad && r.squad.players && r.squad.players.length > 0) {
        const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
        html += `
          <div style="margin-top:16px;">
            <h4 style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
              👥 Official Club Squad (${r.squad.players.length} Players)
            </h4>
            <div class="squad-section" style="background:rgba(0,0,0,0.2); border-radius:10px; padding:16px;">`;

        for (const pos of positions) {
          const playersInPos = r.squad.players.filter(p => p.position === pos);
          if (playersInPos.length > 0) {
            html += `<div class="squad-pos-title" style="margin-top:8px;">${pos}s (${playersInPos.length})</div><div class="squad-grid">`;
            for (const p of playersInPos) {
              html += `
                <div class="player-chip">
                  <span class="jersey-badge">${p.jersey !== '-' ? '#' + p.jersey : '•'}</span>
                  <span>${p.name}</span>
                </div>
              `;
            }
            html += `</div>`;
          }
        }
        html += `</div></div>`;
      }

      answerEl.innerHTML = html;
    } catch (err) {
      console.error('Error in ask form:', err);
      answerEl.innerHTML = `<span style="color:#ef4444">Failed to process query. Please try again.</span>`;
    }
  };
}

// ===================================================
// 10. Head-to-Head & Match Details Modal
// ===================================================
async function openMatchModal(f) {
  const modal = document.getElementById('matchDetailsModal');
  const body = document.getElementById('matchModalBody');
  if (!modal || !body) return;

  modal.classList.add('open');
  body.innerHTML = `
    <div style="text-align:center; padding: 40px 0;">
      <p style="color:var(--sideline)">Loading Head-to-Head insights & table context...</p>
    </div>
  `;

  let homeStanding = null;
  let awayStanding = null;
  if (f.leagueId) {
    try {
      const sRes = await fetch(`/api/standings?league=${f.leagueId}`);
      const sData = await sRes.json();
      const list = sData.standings || [];
      homeStanding = list.find(s => s.team.name.toLowerCase().includes(f.homeTeam.name.toLowerCase()) || f.homeTeam.name.toLowerCase().includes(s.team.name.toLowerCase()));
      awayStanding = list.find(s => s.team.name.toLowerCase().includes(f.awayTeam.name.toLowerCase()) || f.awayTeam.name.toLowerCase().includes(s.team.name.toLowerCase()));
    } catch (e) {}
  }

  const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status);
  const statusBadge = isLive
    ? `<span class="modal-badge" style="background:rgba(239,68,68,0.2); color:#ef4444;"><span class="pulse-dot"></span> LIVE ${f.elapsed ? f.elapsed + "'" : ''} ${f.status}</span>`
    : `<span class="modal-badge">${f.status === 'FT' ? 'FULL TIME' : 'SCHEDULED · ' + formatKickoff(f.kickoff)}</span>`;

  const renderFormPills = (formStr) => {
    if (!formStr) return '<span style="color:var(--sideline); font-size:0.8rem;">No form data</span>';
    return `<div class="form-badges-wrap">
      ${formStr.split('').slice(-5).map(ch => {
        const c = ch.toUpperCase();
        const cls = c === 'W' ? 'w' : c === 'D' ? 'd' : 'l';
        return `<span class="form-pill ${cls}">${c}</span>`;
      }).join('')}
    </div>`;
  };

  const homeScore = f.score?.home !== null && f.score?.home !== undefined ? f.score.home : '-';
  const awayScore = f.score?.away !== null && f.score?.away !== undefined ? f.score.away : '-';

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <div>
        ${statusBadge}
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
          <img src="${f.leagueLogo}" alt="${f.leagueName}" style="width:20px; height:20px; object-fit:contain;" onerror="this.style.display='none'">
          <span style="font-weight:600; color:var(--text-light); font-size:0.95rem;">${f.leagueName}</span>
          <span style="color:var(--sideline); font-size:0.85rem;">· ${f.round || 'Matchday'}</span>
        </div>
      </div>
      <div style="font-size:0.82rem; color:var(--sideline); text-align:right;">
        🏟️ ${f.venue || 'Stadium'}<br>
        📅 ${formatKickoffDate(f.kickoff)}
      </div>
    </div>

    <!-- Head-to-Head Banner -->
    <div class="h2h-banner">
      <div class="h2h-team">
        <img src="${f.homeTeam.logo}" alt="${f.homeTeam.name}" onerror="this.style.display='none'">
        <span class="h2h-team-name">${f.homeTeam.name}</span>
        ${homeStanding ? `<span style="font-size:0.8rem; color:var(--pitch-green); font-weight:600;">#${homeStanding.rank} in Table (${homeStanding.points} pts)</span>` : ''}
      </div>

      <div class="h2h-vs">
        ${isLive || f.status === 'FT'
          ? `<div class="h2h-score-big">${homeScore} - ${awayScore}</div>`
          : `<div class="h2h-vs-badge">VS</div><span style="font-size:0.75rem; color:var(--sideline);">${formatKickoffTime(f.kickoff)}</span>`
        }
      </div>

      <div class="h2h-team">
        <img src="${f.awayTeam.logo}" alt="${f.awayTeam.name}" onerror="this.style.display='none'">
        <span class="h2h-team-name">${f.awayTeam.name}</span>
        ${awayStanding ? `<span style="font-size:0.8rem; color:var(--pitch-green); font-weight:600;">#${awayStanding.rank} in Table (${awayStanding.points} pts)</span>` : ''}
      </div>
    </div>

    <!-- H2H Comparison Stats -->
    <div class="h2h-stats-grid">
      <div class="h2h-stat-row">
        ${renderFormPills(homeStanding?.form)}
        <span class="h2h-stat-label">Recent Form Guide</span>
        ${renderFormPills(awayStanding?.form)}
      </div>

      ${(homeStanding && awayStanding) ? `
      <div class="h2h-stat-row">
        <span style="font-weight:700; color:#fff;">${homeStanding.win}W / ${homeStanding.draw}D / ${homeStanding.lose}L</span>
        <span class="h2h-stat-label">Season Record (W/D/L)</span>
        <span style="font-weight:700; color:#fff;">${awayStanding.win}W / ${awayStanding.draw}D / ${awayStanding.lose}L</span>
      </div>
      <div class="h2h-stat-row">
        <span style="font-weight:700; font-family:'IBM Plex Mono',monospace; color:${homeStanding.goalsDiff > 0 ? 'var(--pitch-green)' : '#ef4444'}">${homeStanding.goalsDiff > 0 ? '+' + homeStanding.goalsDiff : homeStanding.goalsDiff}</span>
        <span class="h2h-stat-label">Goal Difference</span>
        <span style="font-weight:700; font-family:'IBM Plex Mono',monospace; color:${awayStanding.goalsDiff > 0 ? 'var(--pitch-green)' : '#ef4444'}">${awayStanding.goalsDiff > 0 ? '+' + awayStanding.goalsDiff : awayStanding.goalsDiff}</span>
      </div>
      ` : ''}
    </div>

    ${(f.events && f.events.length > 0) ? `
    <div style="background:rgba(0,0,0,0.25); border-radius:10px; padding:14px; margin-bottom:20px;">
      <h4 style="font-size:0.88rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Match Events & Scorers</h4>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${f.events.map(e => `
          <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
            <span style="color:var(--pitch-green); font-weight:700;">${e.time.elapsed}'</span>
            <span>${e.type === 'Goal' ? '⚽' : '🟨'}</span>
            <strong>${e.player.name}</strong> (${e.team.name})
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Modal Action Buttons -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:20px;">
      <button class="primary-btn" style="flex:1; margin-top:0;" onclick="quickSubscribeMatch('${f.homeTeam.name}', '${f.awayTeam.name}')">
        🔔 Set Alert for this Match
      </button>
      <button class="tab-btn" style="flex:1;" onclick="closeMatchModal(); navigateTo('squads'); lookupClubSquad('${f.homeTeam.name}')">
        👥 ${f.homeTeam.name} Squad
      </button>
      <button class="tab-btn" style="flex:1;" onclick="closeMatchModal(); navigateTo('squads'); lookupClubSquad('${f.awayTeam.name}')">
        👥 ${f.awayTeam.name} Squad
      </button>
    </div>
  `;
}

function closeMatchModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('matchDetailsModal');
  if (modal) modal.classList.remove('open');
}

async function quickSubscribeMatch(home, away) {
  try {
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'web',
        targetId: `${home} vs ${away}`,
        events: ['goal', 'kickoff', 'fulltime']
      })
    });
    showToast(`🔔 Match alert set for ${home} vs ${away}!`);
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  } catch (err) {
    showToast(`🔔 Subscribed to match notifications!`);
  }
}

// ===================================================
// 11. Alerts & Subscriptions Hub
// ===================================================
async function openAlertsModal(preselectedTeam) {
  const modal = document.getElementById('alertsModal');
  if (!modal) return;
  modal.classList.add('open');

  const select = document.getElementById('alertTeamSelect');
  if (select && select.children.length <= 1) {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      const teams = data.teams || [];
      teams.sort((a, b) => a.name.localeCompare(b.name));
      for (const t of teams) {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = `${t.name} (${t.espnLeagueCode.toUpperCase()})`;
        select.appendChild(opt);
      }
    } catch (e) {}
  }

  if (preselectedTeam && select) {
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value.toLowerCase().includes(preselectedTeam.toLowerCase())) {
        select.selectedIndex = i;
        break;
      }
    }
  }

  loadUserSubscriptions();
}

function closeAlertsModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('alertsModal');
  if (modal) modal.classList.remove('open');
}

async function loadUserSubscriptions() {
  const container = document.getElementById('activeSubsList');
  if (!container) return;

  container.innerHTML = `<p style="color:var(--sideline)">Loading active alerts...</p>`;

  try {
    const res = await fetch('/api/notifications/subscriptions');
    const data = await res.json();
    const subs = data.subscriptions || [];

    if (subs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:0.85rem;">
          No active subscriptions yet.<br>Select a club on the left to activate alerts!
        </div>
      `;
      return;
    }

    container.innerHTML = subs.map(s => {
      const channelIcon = s.channel === 'telegram' ? '📱' : s.channel === 'discord' ? '🎮' : s.channel === 'whatsapp' ? '💬' : '🌐';
      const eventsStr = (s.events || []).map(e => e === 'goal' ? '⚽ Goals' : e === 'kickoff' ? '⏱️ Kickoff' : '🏁 Full-Time').join(', ');
      return `
        <div class="sub-item-card">
          <div class="sub-item-meta">
            <strong>${channelIcon} ${s.targetId || 'Browser'}</strong>
            <span>Events: ${eventsStr}</span>
          </div>
          <button class="sub-del-btn" onclick="deleteUserSubscription('${s.id}')">Remove</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444">Failed to load subscriptions.</p>`;
  }
}

async function submitNewSubscription() {
  const select = document.getElementById('alertTeamSelect');
  const channelSelect = document.getElementById('alertChannelSelect');
  const teamName = select ? select.value : '';
  const channel = channelSelect ? channelSelect.value : 'web';

  const events = [];
  if (document.getElementById('chkGoal')?.checked) events.push('goal');
  if (document.getElementById('chkKickoff')?.checked) events.push('kickoff');
  if (document.getElementById('chkFulltime')?.checked) events.push('fulltime');
  if (document.getElementById('chkLineup')?.checked) events.push('lineup');

  if (events.length === 0) {
    showToast('Please select at least one alert event.');
    return;
  }

  try {
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        targetId: teamName ? teamName : 'All European Clubs',
        events
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast(`🔔 Subscribed to ${teamName || 'all'} alerts via ${channel.toUpperCase()}!`);
      if (channel === 'web' && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
      loadUserSubscriptions();
    }
  } catch (err) {
    showToast('Failed to save subscription.');
  }
}

async function deleteUserSubscription(id) {
  try {
    await fetch(`/api/notifications/unsubscribe/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Subscription removed.');
    loadUserSubscriptions();
  } catch (err) {
    showToast('Failed to delete subscription.');
  }
}

async function triggerTestAlert() {
  showToast('⚡ Triggering live goal event broadcast...');
  try {
    const res = await fetch('/api/test/trigger-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scorer: 'Robert Lewandowski' })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('⚽ GOAL! Robert Lewandowski has scored! (Live SSE & Push Broadcasted)');
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('GoalHub Goal Alert', {
          body: '⚽ GOAL! Robert Lewandowski scores a stunning goal! (GoalHub Live)'
        });
      }
    }
  } catch (err) {
    showToast('Failed to trigger test alert.');
  }
}

// ===================================================
// 12. Notifications Master Setup
// ===================================================
function initNotifications() {
  const btn = document.getElementById('notifyBtn');
  const statusText = document.getElementById('notifyStatusText');
  if (!btn || !statusText) return;

  if ('Notification' in window && Notification.permission === 'granted') {
    statusText.textContent = 'Live matchday alerts enabled.';
    btn.textContent = 'Subscribed ✓';
    btn.disabled = true;
  }

  btn.onclick = async () => {
    if (!('Notification' in window)) {
      showToast('Notifications not supported by this browser.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      statusText.textContent = 'Live matchday alerts enabled.';
      btn.textContent = 'Subscribed ✓';
      btn.disabled = true;
      showToast('Notifications activated! You will receive goal and kickoff alerts.');

      fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web',
          targetId: 'browser_subscriber',
          events: ['goal', 'kickoff', 'fulltime']
        })
      });
    } else {
      showToast('Notification permission was denied.');
    }
  };
}

// Helpers
function updateActiveTab(parent, activeBtn) {
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function formatKickoff(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatKickoffTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatKickoffDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===================================================
// 13. WhatsApp Bot Interactive Simulator & Share
// ===================================================
function openWhatsAppModal() {
  const modal = document.getElementById('whatsAppModal');
  if (modal) modal.classList.add('open');
}

function closeWhatsAppModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('whatsAppModal');
  if (modal) modal.classList.remove('open');
}

function sendQuickWa(promptText) {
  const input = document.getElementById('waChatInput');
  if (input) {
    input.value = promptText;
    submitWaMessage(promptText);
  }
}

function handleWaChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('waChatInput');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';
  submitWaMessage(text);
}

async function submitWaMessage(userText) {
  const chatBody = document.getElementById('waChatBody');
  if (!chatBody) return;

  // Append user bubble
  const userMsg = document.createElement('div');
  userMsg.className = 'wa-msg wa-msg-user';
  userMsg.innerHTML = `
    <div class="wa-bubble">
      ${escapeHtml(userText)}
      <div class="wa-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
    </div>
  `;
  chatBody.appendChild(userMsg);

  // Typing indicator
  const typingMsg = document.createElement('div');
  typingMsg.className = 'wa-msg wa-msg-bot';
  typingMsg.id = 'waTyping';
  typingMsg.innerHTML = `
    <div class="wa-bubble" style="color:var(--sideline); font-style:italic;">
      GoalHub is typing…
    </div>
  `;
  chatBody.appendChild(typingMsg);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const res = await fetch('/api/bot/whatsapp-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, from: 'user' })
    });
    const data = await res.json();
    document.getElementById('waTyping')?.remove();

    const reply = data.reply || '⚽ No response received.';
    const waLink = data.waLink || `https://wa.me/?text=${encodeURIComponent(reply)}`;

    // Convert WhatsApp *bold* syntax to HTML <strong>
    const formattedHtml = formatWhatsAppText(reply);

    const botMsg = document.createElement('div');
    botMsg.className = 'wa-msg wa-msg-bot';
    botMsg.innerHTML = `
      <div class="wa-bubble">
        ${formattedHtml}
        <div class="wa-action-row">
          <a href="${waLink}" target="_blank" class="wa-share-direct-btn">
            📲 Open & Send in WhatsApp
          </a>
        </div>
        <div class="wa-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
    chatBody.appendChild(botMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
  } catch (err) {
    document.getElementById('waTyping')?.remove();
    showToast('Failed to reach WhatsApp bot endpoint.');
  }
}

function formatWhatsAppText(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  return out;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function verifyCallMeBot() {
  const phone = document.getElementById('callMePhone')?.value.trim();
  const apiKey = document.getElementById('callMeKey')?.value.trim();
  const resultEl = document.getElementById('callMeResult');

  if (!phone || !apiKey) {
    if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444">Please enter both your phone number and CallMeBot API key.</span>';
    return;
  }

  if (resultEl) resultEl.innerHTML = '<span style="color:var(--sideline)">Sending live test goal alert to your phone…</span>';

  try {
    const res = await fetch('/api/test/callmebot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, apiKey })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--pitch-green); font-weight:600;">✅ Success! Goal alert sent to your WhatsApp. Check your phone!</span>';
      showToast('✅ WhatsApp message delivered to your phone!');
    } else {
      if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444">Could not send alert. Check phone format (+country code) and API key.</span>';
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444">Request failed. Check internet connection.</span>';
  }
}

function shareMatchToWhatsApp(home, away, homeScore, awayScore, status, league) {
  const text = `⚽ *${home} vs ${away}*\n🏆 ${league}\n📊 Score: ${homeScore} - ${awayScore}\n⏱️ Status: ${status}\n\nTrack European Football live on GoalHub: https://goalhub-six.vercel.app`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
