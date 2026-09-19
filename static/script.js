// GoalHub Multi-Section Client

let currentMatchLeagueId = null; // null = All
let currentStandingsLeagueId = 39; // default Premier League
let currentSquadLeagueId = 39;
let currentLeadersLeagueId = 39;
let currentLeaderCategory = 'scorers'; // 'scorers' | 'assists'
let activeView = 'dashboard';
let allTrackedLeagues = [];
let activeMatchDetails = null;
let currentActiveMatchCenterTab = 'stats';

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initAudio();
  initPwa();
  await loadLeagues();
  await initDashboard();
  initEventSource();
  initGlobalSearch();
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
    standings: 'viewStandings',
    leaders: 'viewLeaders',
    news: 'viewNews'
  };

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const targetEl = document.getElementById(viewMap[viewName]);
  if (targetEl) targetEl.classList.add('active');

  // Trigger data load for the selected view
  if (viewName === 'live') loadLiveSection();
  else if (viewName === 'matches') loadMatchesSection();
  else if (viewName === 'squads') loadSquadsSection();
  else if (viewName === 'standings') loadStandingsSection();
  else if (viewName === 'leaders') loadLeadersSection();
  else if (viewName === 'news') loadNewsSection();

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

// ==========================================
// Phase 2: Personalization & Favorites
// ==========================================
function getFavorites() {
  try {
    const raw = localStorage.getItem('goalhub_favorites');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function isFavorite(teamName) {
  if (!teamName) return false;
  const favs = getFavorites();
  const clean = teamName.toLowerCase().trim();
  return favs.some(f => f.toLowerCase().trim() === clean);
}

function toggleFavorite(teamName) {
  if (!teamName) return;
  let favs = getFavorites();
  const clean = teamName.trim();
  const idx = favs.findIndex(f => f.toLowerCase() === clean.toLowerCase());
  if (idx >= 0) {
    favs.splice(idx, 1);
    showToast(`Removed ${clean} from your favorites.`);
  } else {
    favs.push(clean);
    showToast(`⭐ Added ${clean} to your favorite clubs!`);
  }
  localStorage.setItem('goalhub_favorites', JSON.stringify(favs));

  // Update all star buttons on the page
  document.querySelectorAll('.fav-star-btn').forEach(btn => {
    const t = btn.getAttribute('data-team');
    if (t) {
      const active = isFavorite(t);
      btn.classList.toggle('active', active);
      btn.textContent = active ? '⭐' : '☆';
    }
  });

  // Re-render feed
  if (window.latestHomePool) {
    renderPersonalizedFavoritesFeed(window.latestHomePool);
  }
}

function renderPersonalizedFavoritesFeed(pool) {
  const wrap = document.getElementById('personalizedFavoritesWrap');
  const container = document.getElementById('favoritesLiveList');
  const countTag = document.getElementById('favCountTag');
  if (!wrap || !container) return;

  const favs = getFavorites();
  if (favs.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';
  if (countTag) countTag.textContent = `${favs.length} ${favs.length === 1 ? 'Club' : 'Clubs'} Followed`;

  const matches = (pool || []).filter(f =>
    isFavorite(f.homeTeam?.name) || isFavorite(f.awayTeam?.name)
  );

  container.innerHTML = '';
  if (matches.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: rgba(255,215,0,0.04); border: 1px dashed rgba(255,215,0,0.25); border-radius: 10px; padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        ⭐ Following <strong>${favs.join(', ')}</strong>. No live matches right now for your clubs. Browse full schedule below!
      </div>
    `;
    return;
  }

  for (const m of matches) {
    container.appendChild(createMatchCard(m));
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

      window.latestHomePool = highlights;
      renderPersonalizedFavoritesFeed(highlights);

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
          <img src="${s.teamLogo || ''}" alt="${s.teamName}" onerror="this.style.display='none'">
          <div>
            <h3>
              ${s.teamName}
              <button class="fav-star-btn ${isFavorite(s.teamName) ? 'active' : ''}" data-team="${s.teamName}" onclick="toggleFavorite('${s.teamName}')" title="Favorite ${s.teamName}">
                ${isFavorite(s.teamName) ? '⭐' : '☆'}
              </button>
            </h3>
            <div class="squad-meta-row">
              <span class="manager-badge">👔 Manager: <strong>${s.manager || 'First Team Head Coach'}</strong></span>
              ${s.stadium ? `<span class="stadium-badge">🏟️ ${s.stadium}</span>` : ''}
              <span class="squad-count-badge">👥 ${s.players.length} Players</span>
            </div>
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
          <div class="squad-grid-cards">
            ${inPos.map(p => {
              const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=10281b&color=00ff87&size=150&bold=true`;
              const avatarSrc = p.photo || fallbackAvatar;
              return `
                <div class="squad-player-card" onclick="openPlayerProfile('${p.id || p.name}')" title="Click to view ${p.name}'s bio & season stats">
                  <div class="squad-player-avatar-wrap">
                    <img class="squad-player-avatar" src="${avatarSrc}" onerror="this.src='${fallbackAvatar}'" alt="${p.name}">
                  </div>
                  <div class="squad-player-info">
                    <div class="squad-player-name">${p.name}</div>
                    <div class="squad-player-sub">
                      <span class="jersey-badge">${p.jersey !== '-' ? '#' + p.jersey : '•'}</span>
                      <span class="squad-player-pos-tag">${p.position}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    const others = s.players.filter(p => !positions.includes(p.position || ''));
    if (others.length > 0) {
      html += `
        <div class="squad-pos-title">Other Squad Members (${others.length})</div>
        <div class="squad-grid-cards">
          ${others.map(p => {
            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=10281b&color=00ff87&size=150&bold=true`;
            const avatarSrc = p.photo || fallbackAvatar;
            return `
              <div class="squad-player-card" onclick="openPlayerProfile('${p.id || p.name}')" title="Click to view ${p.name}'s bio & season stats">
                <div class="squad-player-avatar-wrap">
                  <img class="squad-player-avatar" src="${avatarSrc}" onerror="this.src='${fallbackAvatar}'" alt="${p.name}">
                </div>
                <div class="squad-player-info">
                  <div class="squad-player-name">${p.name}</div>
                  <div class="squad-player-sub">
                    <span class="jersey-badge">${p.jersey !== '-' ? '#' + p.jersey : '•'}</span>
                    <span class="squad-player-pos-tag">${p.position || 'Player'}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
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
  const majorLeagues = allTrackedLeagues;

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
          <button class="fav-star-btn ${isFavorite(f.homeTeam.name) ? 'active' : ''}" data-team="${f.homeTeam.name}" onclick="event.stopPropagation(); toggleFavorite('${f.homeTeam.name}')" title="Favorite ${f.homeTeam.name}">${isFavorite(f.homeTeam.name) ? '⭐' : '☆'}</button>
        </div>
        <div class="team-score">${homeScore}</div>
      </div>
      <div class="team-row">
        <div class="team-meta">
          <img src="${f.awayTeam.logo}" alt="${f.awayTeam.name}" onerror="this.style.display='none'">
          <span>${f.awayTeam.name}</span>
          <button class="fav-star-btn ${isFavorite(f.awayTeam.name) ? 'active' : ''}" data-team="${f.awayTeam.name}" onclick="event.stopPropagation(); toggleFavorite('${f.awayTeam.name}')" title="Favorite ${f.awayTeam.name}">${isFavorite(f.awayTeam.name) ? '⭐' : '☆'}</button>
        </div>
        <div class="team-score">${awayScore}</div>
      </div>
    </div>

    ${eventsHtml}

    <!-- Match Predictions (Phase 3) -->
    <div class="prediction-box" onclick="event.stopPropagation()">
      <div class="pred-title-row">
        <span>🎯 Predict Match</span>
        <span>${getPrediction(f.id) ? '<span style="color:var(--pitch-green); font-weight:700;">Pick: ' + (getPrediction(f.id) === '1' ? 'HOME' : getPrediction(f.id) === 'x' ? 'DRAW' : 'AWAY') + '</span>' : 'Make your call'}</span>
      </div>
      <div class="pred-buttons">
        <button class="pred-btn ${getPrediction(f.id) === '1' ? 'picked' : ''}" onclick="submitPrediction(${f.id}, '1')">
          <span>🏠 Home</span>
          <span class="pred-pct">48%</span>
        </button>
        <button class="pred-btn ${getPrediction(f.id) === 'x' ? 'picked' : ''}" onclick="submitPrediction(${f.id}, 'x')">
          <span>🤝 Draw</span>
          <span class="pred-pct">24%</span>
        </button>
        <button class="pred-btn ${getPrediction(f.id) === '2' ? 'picked' : ''}" onclick="submitPrediction(${f.id}, '2')">
          <span>✈️ Away</span>
          <span class="pred-pct">28%</span>
        </button>
      </div>
    </div>

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
        playGoalSound();
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
// 10. Match Center & Head-to-Head (H2H) System
// ===================================================
function updateMatchCenterTabButtons() {
  document.querySelectorAll('.mc-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mctab') === currentActiveMatchCenterTab);
  });
}

function switchMatchCenterTab(tabName) {
  currentActiveMatchCenterTab = tabName;
  updateMatchCenterTabButtons();
  renderMatchCenterTabBody();
}

async function openMatchModal(f) {
  const modal = document.getElementById('matchDetailsModal');
  const body = document.getElementById('matchModalBody');
  if (!modal || !body) return;

  modal.classList.add('open');
  currentActiveMatchCenterTab = 'stats';
  updateMatchCenterTabButtons();

  body.innerHTML = `
    <div style="text-align:center; padding: 40px 0;">
      <p style="color:var(--sideline)">Loading Match Center, lineups & live statistics...</p>
    </div>
  `;

  let details = null;
  try {
    const res = await fetch(`/api/matches/${f.id}/details`);
    if (res.ok) {
      const data = await res.json();
      details = data.details;
    }
  } catch (e) {}

  activeMatchDetails = details || {
    fixture: f,
    stats: [
      { name: 'possessionPct', label: 'Possession %', homeValue: '50%', awayValue: '50%', homePct: 50, awayPct: 50 },
      { name: 'totalShots', label: 'Total Shots', homeValue: '0', awayValue: '0', homePct: 50, awayPct: 50 },
      { name: 'shotsOnTarget', label: 'Shots on Target', homeValue: '0', awayValue: '0', homePct: 50, awayPct: 50 },
      { name: 'wonCorners', label: 'Corner Kicks', homeValue: '0', awayValue: '0', homePct: 50, awayPct: 50 },
      { name: 'foulsCommitted', label: 'Fouls', homeValue: '0', awayValue: '0', homePct: 50, awayPct: 50 },
      { name: 'accuratePasses', label: 'Passes Completed', homeValue: '0', awayValue: '0', homePct: 50, awayPct: 50 }
    ],
    lineups: {
      home: { team: f.homeTeam, formation: '4-3-3', starters: [], substitutes: [] },
      away: { team: f.awayTeam, formation: '4-3-3', starters: [], substitutes: [] }
    },
    timeline: f.events || [],
    commentary: []
  };

  renderMatchCenterTabBody();
}

function renderMatchCenterTabBody() {
  const body = document.getElementById('matchModalBody');
  if (!body || !activeMatchDetails) return;

  const f = activeMatchDetails.fixture;
  const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status);
  const homeScore = f.score?.home !== null && f.score?.home !== undefined ? f.score.home : '-';
  const awayScore = f.score?.away !== null && f.score?.away !== undefined ? f.score.away : '-';

  const headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <div>
        <span class="mc-status-pill ${isLive ? 'live' : ''}">${isLive ? '🔴 LIVE ' + (f.elapsed ? f.elapsed + "'" : '') : f.status === 'FT' ? 'FULL TIME' : 'SCHEDULED'}</span>
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
          <img src="${f.leagueLogo}" alt="${f.leagueName}" style="width:20px; height:20px; object-fit:contain;" onerror="this.style.display='none'">
          <span style="font-weight:600; color:var(--text-main); font-size:0.95rem;">${f.leagueName}</span>
          <span style="color:var(--sideline); font-size:0.85rem;">· ${f.round || 'Matchday'}</span>
        </div>
      </div>
      <div style="font-size:0.82rem; color:var(--sideline); text-align:right;">
        🏟️ ${f.venue || 'Stadium'}<br>
        📅 ${formatKickoffDate(f.kickoff)} · ${formatKickoffTime(f.kickoff)}
      </div>
    </div>

    <!-- Dual Team Crests & Score Banner -->
    <div class="mc-header">
      <div class="mc-team-side">
        <img src="${f.homeTeam.logo}" alt="${f.homeTeam.name}" onerror="this.style.display='none'">
        <span class="mc-team-name">${f.homeTeam.name}</span>
      </div>

      <div class="mc-score-side">
        <div class="mc-score-display">${homeScore} - ${awayScore}</div>
        <span style="font-size:0.8rem; color:var(--sideline); font-weight:600;">${isLive ? 'IN PLAY' : f.status === 'FT' ? 'FINAL' : 'KICKOFF'}</span>
      </div>

      <div class="mc-team-side">
        <img src="${f.awayTeam.logo}" alt="${f.awayTeam.name}" onerror="this.style.display='none'">
        <span class="mc-team-name">${f.awayTeam.name}</span>
      </div>
    </div>
  `;

  let tabContentHtml = '';

  if (currentActiveMatchCenterTab === 'stats') {
    const stats = activeMatchDetails.stats || [];
    if (stats.length === 0) {
      tabContentHtml = `<div style="text-align:center; padding:30px; color:var(--sideline);">Detailed match statistics will be available once the match begins.</div>`;
    } else {
      tabContentHtml = `
        <div style="margin-top:10px;">
          ${stats.map(s => `
            <div class="stat-bar-row">
              <div class="stat-bar-labels">
                <span style="color:var(--pitch-green); font-family:'IBM Plex Mono',monospace;">${s.homeValue}</span>
                <span class="stat-bar-name">${s.label}</span>
                <span style="color:#3b82f6; font-family:'IBM Plex Mono',monospace;">${s.awayValue}</span>
              </div>
              <div class="stat-bar-track">
                <div class="stat-bar-fill-home" style="width:${s.homePct}%;"></div>
                <div class="stat-bar-fill-away" style="width:${s.awayPct}%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else if (currentActiveMatchCenterTab === 'lineups') {
    const homeLineup = activeMatchDetails.lineups?.home;
    const awayLineup = activeMatchDetails.lineups?.away;

    const renderPitchSide = (lineup, isAway) => {
      if (!lineup || !Array.isArray(lineup.starters) || lineup.starters.length === 0) {
        return `<p style="color:var(--sideline); padding:12px; font-size:0.85rem; text-align:center;">Lineup not yet announced for ${lineup?.team?.name || 'this team'}.</p>`;
      }

      const starters = [...lineup.starters];
      const formationStr = lineup.formation || '4-3-3';
      const formLines = formationStr.split(/[-–—]/).map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0);

      const rows = [];
      // 1. Goalkeeper line (1 player)
      let gkIndex = starters.findIndex(p => {
        const pos = (p.position || '').toLowerCase();
        return pos.includes('goalkeeper') || pos === 'gk' || pos === 'g';
      });
      if (gkIndex < 0) gkIndex = 0;
      const gk = starters.splice(gkIndex, 1)[0];
      rows.push([gk]);

      // 2. Outfield tactical lines
      if (formLines.length > 0 && formLines.reduce((a, b) => a + b, 0) <= starters.length + 1) {
        for (const count of formLines) {
          if (starters.length === 0) break;
          rows.push(starters.splice(0, count));
        }
        if (starters.length > 0) {
          rows[rows.length - 1].push(...starters);
        }
      } else {
        const defs = [];
        const mids = [];
        const fwds = [];
        for (const p of starters) {
          const pos = (p.position || '').toLowerCase();
          if (pos.includes('back') || pos.includes('def') || pos === 'cb' || pos === 'lb' || pos === 'rb' || pos === 'd') {
            defs.push(p);
          } else if (pos.includes('mid') || pos === 'cm' || pos === 'cdm' || pos === 'cam' || pos === 'lm' || pos === 'rm' || pos === 'm') {
            mids.push(p);
          } else {
            fwds.push(p);
          }
        }
        if (defs.length) rows.push(defs);
        if (mids.length) rows.push(mids);
        if (fwds.length) rows.push(fwds);
      }

      // For Away team on bottom half of vertical pitch, invert rows (Attackers near halfway line, GK at bottom)
      const displayRows = isAway ? rows.slice().reverse() : rows;

      return `
        <div style="margin: 6px 0;">
          <div class="pitch-team-title">
            ${lineup.team?.name} <span style="font-size:0.78rem; opacity:0.85; font-weight:600;">(${formationStr})</span>
            ${lineup.coach && lineup.coach !== 'First Team Head Coach' ? `<span style="display:inline-block; margin-left:8px; font-size:0.75rem; font-weight:600; color:var(--pitch-green); background:rgba(0,255,135,0.1); padding:2px 8px; border-radius:4px; border:1px solid rgba(0,255,135,0.25);">👔 ${lineup.coach}</span>` : ''}
          </div>
          <div style="display:flex; flex-direction:column; gap:14px; margin: 8px 0;">
            ${displayRows.map(row => `
              <div class="pitch-tactical-row">
                ${row.map(p => {
                  const isGk = (p.position || '').toLowerCase().includes('gk') || (p.position || '').toLowerCase().includes('goalkeeper') || p.id === gk?.id;
                  const surname = p.name ? p.name.split(' ').slice(-1)[0] : 'Player';
                  return `
                    <div class="pitch-player-node" onclick="openPlayerProfile('${p.id}')" title="View ${p.name}'s Profile">
                      <div class="pitch-jersey ${isGk ? 'gk-jersey' : isAway ? 'away-jersey' : ''}">
                        ${p.jersey && p.jersey !== '-' ? p.jersey : '•'}
                        ${p.captain ? '<span class="captain-badge">C</span>' : ''}
                      </div>
                      <span class="pitch-player-name">${surname}</span>
                      <span class="pitch-pos-tag">${p.position || ''}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    const renderBench = (lineup) => {
      if (!lineup || !Array.isArray(lineup.substitutes) || lineup.substitutes.length === 0) return '';
      return `
        <div style="margin-top:14px;">
          <h5 style="font-size:0.8rem; color:var(--sideline); text-transform:uppercase; margin-bottom:6px;">${lineup.team?.name} Substitutes</h5>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${lineup.substitutes.map(p => `
              <div class="player-chip" onclick="openPlayerProfile('${p.id}')" style="cursor:pointer;" title="View Profile">
                <span class="jersey-badge">#${p.jersey}</span>
                <span>${p.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    tabContentHtml = `
      <div>
        <div class="pitch-tactical-container">
          ${renderPitchSide(homeLineup, false)}
          <div class="pitch-half-line">
            <div class="pitch-center-circle"></div>
            <div class="pitch-center-spot"></div>
            <span class="pitch-half-badge">HALFWAY LINE</span>
          </div>
          ${renderPitchSide(awayLineup, true)}
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:16px;">
          <h4 style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Bench Substitutes</h4>
          ${renderBench(homeLineup)}
          ${renderBench(awayLineup)}
        </div>
      </div>
    `;
  } else if (currentActiveMatchCenterTab === 'timeline') {
    const timeline = activeMatchDetails.timeline || [];
    if (timeline.length === 0) {
      tabContentHtml = `<div style="text-align:center; padding:30px; color:var(--sideline);">No match events recorded yet.</div>`;
    } else {
      tabContentHtml = `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:16px;">
          ${timeline.map(e => `
            <div class="timeline-item">
              <span class="timeline-minute">${e.time.elapsed}'</span>
              <span class="timeline-icon">${e.type === 'Goal' ? '⚽' : e.type === 'Card' ? '🟨' : e.type === 'subst' ? '🔄' : '📌'}</span>
              <div class="timeline-desc">
                <strong>${e.player?.name || e.detail}</strong> 
                <span style="color:var(--sideline);">(${e.team.name})</span>
                ${e.detail && e.detail !== e.player?.name ? `<div style="font-size:0.8rem; color:var(--text-muted);">${e.detail}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else if (currentActiveMatchCenterTab === 'h2h') {
    tabContentHtml = `
      <div id="h2hTabContainer">
        <div style="text-align:center; padding:30px; color:var(--sideline);">
          <p>Loading last 10 Head-to-Head encounters between ${f.homeTeam.name} and ${f.awayTeam.name}...</p>
        </div>
      </div>
    `;
    // Load H2H asynchronously
    setTimeout(() => {
      loadH2HInsideModal(f.homeTeam.name, f.awayTeam.name);
    }, 50);
  }

  body.innerHTML = `
    ${headerHtml}
    ${tabContentHtml}
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

async function loadH2HInsideModal(team1, team2) {
  const container = document.getElementById('h2hTabContainer');
  if (!container) return;

  try {
    const res = await fetch(`/api/h2h?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}`);
    if (!res.ok) {
      container.innerHTML = `<p style="color:var(--sideline); text-align:center; padding:20px;">No previous direct encounters found between these two teams in recent history.</p>`;
      return;
    }
    const data = await res.json();
    const h = data.h2h;

    container.innerHTML = `
      <div class="h2h-summary-box">
        <div>
          <div class="h2h-stat-num" style="color:var(--pitch-green);">${h.team1Wins}</div>
          <div class="h2h-stat-label">${h.team1.name} Wins</div>
        </div>
        <div>
          <div class="h2h-stat-num" style="color:var(--sideline);">${h.draws}</div>
          <div class="h2h-stat-label">Draws</div>
        </div>
        <div>
          <div class="h2h-stat-num" style="color:#3b82f6;">${h.team2Wins}</div>
          <div class="h2h-stat-label">${h.team2.name} Wins</div>
        </div>
        <div>
          <div class="h2h-stat-num" style="color:var(--accent-gold);">${h.team1Goals} - ${h.team2Goals}</div>
          <div class="h2h-stat-label">Goal Tallies</div>
        </div>
      </div>

      <h4 style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Last ${h.recentMeetings.length} Meetings</h4>
      <div class="h2h-meetings-list">
        ${h.recentMeetings.map(m => {
          const isT1Win = m.winnerId === h.team1.id;
          const isT2Win = m.winnerId === h.team2.id;
          const isDraw = m.winnerId === null;
          const badgeClass = isDraw ? 'draw' : isT1Win ? 'win' : 'loss';
          const badgeText = isDraw ? 'DRAW' : isT1Win ? `${h.team1.name} WIN` : `${h.team2.name} WIN`;

          return `
            <div class="h2h-card">
              <div>
                <span class="h2h-pill-res ${badgeClass}">${badgeText}</span>
                <span class="h2h-card-date" style="margin-left:8px;">${formatKickoffDate(m.date)} · ${m.competition}</span>
              </div>
              <div class="h2h-teams-score">
                <span>${m.homeTeam.name}</span>
                <span style="font-family:'IBM Plex Mono',monospace; font-weight:800; font-size:1.1rem; color:var(--text-main);">${m.score.home !== null ? m.score.home : '-'} : ${m.score.away !== null ? m.score.away : '-'}</span>
                <span>${m.awayTeam.name}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline); text-align:center;">Failed to load H2H records.</p>`;
  }
}

function closeMatchModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('matchDetailsModal');
  if (modal) modal.classList.remove('open');
}

// ===================================================
// 11. Top Scorers & Assists Leaderboard
// ===================================================
async function loadLeadersSection() {
  initLeadersLeagueTabs();
  fetchLeagueLeaders(currentLeadersLeagueId);
}

function initLeadersLeagueTabs() {
  const container = document.getElementById('leadersLeagueTabs');
  if (!container || container.children.length > 0) return;

  container.innerHTML = '';
  for (const league of allTrackedLeagues) {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${league.id === currentLeadersLeagueId ? 'active' : ''}`;
    btn.innerHTML = `<img src="${league.logo}" alt="${league.name}" onerror="this.style.display='none'"> ${league.name}`;
    btn.onclick = () => {
      currentLeadersLeagueId = league.id;
      updateActiveTab(container, btn);
      fetchLeagueLeaders(league.id);
    };
    container.appendChild(btn);
  }
}

function switchLeaderCategory(cat) {
  currentLeaderCategory = cat;
  document.getElementById('btnScorers')?.classList.toggle('active', cat === 'scorers');
  document.getElementById('btnAssists')?.classList.toggle('active', cat === 'assists');
  document.getElementById('btnCleanSheets')?.classList.toggle('active', cat === 'cleansheets');
  fetchLeagueLeaders(currentLeadersLeagueId);
}

async function fetchLeagueLeaders(leagueId) {
  const container = document.getElementById('leadersTableContainer');
  if (!container) return;

  const categoryName = currentLeaderCategory === 'scorers' ? 'top scorers' : currentLeaderCategory === 'assists' ? 'top assists' : 'clean sheets (Golden Glove)';
  container.innerHTML = `<p style="color:var(--sideline); padding:24px; text-align:center;">Loading ${categoryName}…</p>`;

  try {
    const res = await fetch(`/api/leagues/${leagueId}/leaders`);
    if (!res.ok) {
      container.innerHTML = `<p style="color:var(--sideline); padding:24px; text-align:center;">No statistics available for this league currently.</p>`;
      return;
    }
    const data = await res.json();
    const leaders = data.leaders;
    let playerList = [];
    let metricTitle = 'Goals';

    if (currentLeaderCategory === 'scorers') {
      playerList = leaders.topScorers || [];
      metricTitle = 'Goals';
    } else if (currentLeaderCategory === 'assists') {
      playerList = leaders.topAssists || [];
      metricTitle = 'Assists';
    } else if (currentLeaderCategory === 'cleansheets') {
      playerList = leaders.cleanSheets || [];
      metricTitle = 'Clean Sheets';
    }

    if (playerList.length === 0) {
      container.innerHTML = `<p style="color:var(--sideline); padding:24px; text-align:center;">No ${categoryName} data available.</p>`;
      return;
    }

    container.innerHTML = `
      <table class="leaders-table">
        <thead>
          <tr>
            <th style="width:50px; text-align:center;">Rank</th>
            <th>${currentLeaderCategory === 'cleansheets' ? 'Goalkeeper' : 'Player'}</th>
            <th>Club</th>
            <th style="text-align:center;">Appearances</th>
            <th style="text-align:right;">${metricTitle}</th>
          </tr>
        </thead>
        <tbody>
          ${playerList.map(p => {
            const rankMedal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank;
            const rankClass = p.rank <= 3 ? `rank-${p.rank}` : '';

            return `
              <tr onclick="openPlayerProfile('${p.id}')" title="Click to view full player profile">
                <td style="text-align:center;">
                  <span class="rank-badge ${rankClass}">${rankMedal}</span>
                </td>
                <td>
                  <div class="leader-player-cell">
                    <img class="leader-player-avatar" src="${p.photo || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name) + '&background=10281b&color=00ff87&size=150&bold=true'}" onerror="this.src='https://ui-avatars.com/api/?name=' + encodeURIComponent('${escapeHtml(p.name)}') + '&background=10281b&color=00ff87&size=150&bold=true'" alt="${p.name}">
                    <div>
                      <div style="font-weight:700; color:var(--text-main);">${p.name}</div>
                      <div style="font-size:0.75rem; color:var(--sideline);">${p.jersey ? '#' + p.jersey : ''}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="club-cell">
                    <img src="${p.team.logo}" alt="${p.team.name}" onerror="this.style.display='none'">
                    <span>${p.team.name}</span>
                  </div>
                </td>
                <td style="text-align:center; font-family:'IBM Plex Mono',monospace; color:var(--text-muted);">
                  ${p.appearances || '-'}
                </td>
                <td style="text-align:right;">
                  <span class="leader-val">${p.value}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline); padding:24px; text-align:center;">Error fetching statistics.</p>`;
  }
}

// ===================================================
// 12. Player Profile Modal
// ===================================================
async function openPlayerProfile(playerId) {
  const modal = document.getElementById('playerProfileModal');
  const body = document.getElementById('playerProfileBody');
  if (!modal || !body) return;

  modal.classList.add('open');
  body.innerHTML = `
    <div style="text-align:center; padding: 50px 0;">
      <p style="color:var(--sideline)">Loading player bio and performance stats...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/players/${playerId}`);
    if (!res.ok) {
      body.innerHTML = `<p style="color:var(--sideline); padding:30px; text-align:center;">Player profile not available.</p>`;
      return;
    }
    const data = await res.json();
    const p = data.profile;

    const fallbackPhoto = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=10281b&color=00ff87&size=350&bold=true`;

    body.innerHTML = `
      <div class="player-hero-header">
        <img class="player-big-photo" src="${p.photo || fallbackPhoto}" onerror="this.src='${fallbackPhoto}'" alt="${p.name}">
        <div class="player-hero-info">
          <div style="font-size:0.8rem; color:var(--pitch-green); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">
            ${p.position} ${p.jersey ? '· #' + p.jersey : ''}
          </div>
          <h2 class="player-hero-name">${p.name}</h2>
          <div class="player-hero-team">
            <img src="${p.team.logo}" alt="${p.team.name}" onerror="this.style.display='none'">
            <span>${p.team.name}</span>
          </div>
        </div>
      </div>

      <div class="player-bio-bar">
        <div>
          <div class="bio-item-label">Age</div>
          <div class="bio-item-val">${p.age ? p.age + ' yrs' : '-'}</div>
        </div>
        <div>
          <div class="bio-item-label">Nationality</div>
          <div class="bio-item-val">${p.flag ? `<img src="${p.flag}" style="width:14px; height:10px; margin-right:4px;">` : ''}${p.nationality || '-'}</div>
        </div>
        <div>
          <div class="bio-item-label">Height</div>
          <div class="bio-item-val">${p.height || '-'}</div>
        </div>
        <div>
          <div class="bio-item-label">Weight</div>
          <div class="bio-item-val">${p.weight || '-'}</div>
        </div>
      </div>

      <div class="player-stats-section">
        <h4 style="font-size:0.85rem; font-weight:700; color:var(--sideline); text-transform:uppercase; margin-bottom:14px; letter-spacing:0.05em;">
          Season Statistics (${p.stats.season || '2024-25'})
        </h4>
        ${(() => {
          const isKeeper = (p.position || '').toLowerCase().includes('goalkeeper') || (p.position || '').toLowerCase() === 'gk' || (p.position || '').toLowerCase() === 'g';
          if (isKeeper) {
            return `
              <div class="player-stat-cards gk-layout">
                <div class="stat-counter-card gk-cs">
                  <div class="stat-counter-val" style="color:#22c55e;">${p.stats.cleanSheets ?? 0}</div>
                  <div class="stat-counter-label">🧤 Clean Sheets</div>
                </div>
                <div class="stat-counter-card gk-sv">
                  <div class="stat-counter-val" style="color:#38bdf8;">${p.stats.saves ?? 0}</div>
                  <div class="stat-counter-label">🛡️ Saves</div>
                </div>
                <div class="stat-counter-card gk-ga">
                  <div class="stat-counter-val" style="color:#ef4444;">${p.stats.goalsConceded ?? 0}</div>
                  <div class="stat-counter-label">🥅 Goals Conceded</div>
                </div>
                <div class="stat-counter-card">
                  <div class="stat-counter-val" style="color:var(--accent-gold); font-size:1.7rem;">${p.stats.appearances ?? 0}</div>
                  <div class="stat-counter-label">${p.stats.savePct !== undefined ? p.stats.savePct + '% Saves' : 'Appearances'}</div>
                </div>
              </div>
            `;
          } else {
            return `
              <div class="player-stat-cards">
                <div class="stat-counter-card">
                  <div class="stat-counter-val">${p.stats.goals}</div>
                  <div class="stat-counter-label">Goals</div>
                </div>
                <div class="stat-counter-card">
                  <div class="stat-counter-val" style="color:#3b82f6;">${p.stats.assists}</div>
                  <div class="stat-counter-label">Assists</div>
                </div>
                <div class="stat-counter-card">
                  <div class="stat-counter-val" style="color:var(--accent-gold);">${p.stats.appearances}</div>
                  <div class="stat-counter-label">Appearances</div>
                </div>
              </div>
            `;
          }
        })()}
        
        <div style="display:flex; gap:10px; margin-top:20px;">
          <button class="tab-btn" style="flex:1;" onclick="closePlayerModal(); navigateTo('squads'); lookupClubSquad('${p.team.name}')">
            👥 View Full ${p.team.name} Squad
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p style="color:var(--sideline); padding:30px; text-align:center;">Failed to load player details.</p>`;
  }
}

function closePlayerModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('playerProfileModal');
  if (modal) modal.classList.remove('open');
}

// ===================================================
// 13. Omnichannel Global Search Bar
// ===================================================
let globalSearchTimeout = null;

function initGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('globalSearchDropdown');
  const clearBtn = document.getElementById('globalSearchClear');
  if (!input || !dropdown) return;

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

    if (val.length < 2) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    clearTimeout(globalSearchTimeout);
    globalSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        renderGlobalSearchDropdown(data);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 220);
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrap')) {
      dropdown.style.display = 'none';
    }
  });

  // Close dropdown on Escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });
}

function clearGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('globalSearchDropdown');
  const clearBtn = document.getElementById('globalSearchClear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
}

function renderGlobalSearchDropdown(data) {
  const dropdown = document.getElementById('globalSearchDropdown');
  if (!dropdown) return;

  const hasTeams = data.teams && data.teams.length > 0;
  const hasPlayers = data.players && data.players.length > 0;
  const hasFixtures = data.fixtures && data.fixtures.length > 0;

  if (!hasTeams && !hasPlayers && !hasFixtures) {
    dropdown.innerHTML = `<div style="padding:16px; color:var(--sideline); text-align:center;">No results found for "${data.query}".</div>`;
    dropdown.style.display = 'block';
    return;
  }

  let html = '';

  if (hasTeams) {
    html += `<div class="dropdown-section-title">🏟️ Clubs</div>`;
    for (const t of data.teams) {
      html += `
        <div class="dropdown-item" onclick="selectSearchClub('${t.name}')">
          <img src="${t.logo}" alt="${t.name}" onerror="this.style.display='none'">
          <div>
            <div class="dropdown-item-title">${t.name}</div>
            <div class="dropdown-item-sub">View squad & upcoming matches</div>
          </div>
        </div>
      `;
    }
  }

  if (hasPlayers) {
    html += `<div class="dropdown-section-title">👤 Players</div>`;
    for (const p of data.players) {
      html += `
        <div class="dropdown-item" onclick="selectSearchPlayer('${p.id || p.name}')">
          <img src="${p.teamLogo}" alt="${p.teamName}" onerror="this.style.display='none'">
          <div>
            <div class="dropdown-item-title">${p.name} ${p.jersey ? '#' + p.jersey : ''}</div>
            <div class="dropdown-item-sub">${p.position || 'Player'} · ${p.teamName}</div>
          </div>
        </div>
      `;
    }
  }

  if (hasFixtures) {
    html += `<div class="dropdown-section-title">📅 Matches & Fixtures</div>`;
    for (const f of data.fixtures) {
      html += `
        <div class="dropdown-item" onclick="selectSearchFixture(${f.id})">
          <img src="${f.leagueLogo}" alt="${f.leagueName}" onerror="this.style.display='none'">
          <div>
            <div class="dropdown-item-title">${f.homeTeam.name} vs ${f.awayTeam.name}</div>
            <div class="dropdown-item-sub">${f.leagueName} · ${formatKickoffDate(f.kickoff)}</div>
          </div>
        </div>
      `;
    }
  }

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectSearchClub(teamName) {
  clearGlobalSearch();
  navigateTo('squads');
  lookupClubSquad(teamName);
}

function selectSearchPlayer(playerIdOrName) {
  clearGlobalSearch();
  openPlayerProfile(playerIdOrName);
}

function selectSearchFixture(fixtureId) {
  clearGlobalSearch();
  openMatchModal({ id: fixtureId, homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' } });
}

// ===================================================
// 14. Theme Toggle (Dark / Light Mode)
// ===================================================
function initTheme() {
  const saved = localStorage.getItem('goalhub_theme');
  if (saved === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcon('☀️');
  } else {
    updateThemeIcon('🌙');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('goalhub_theme', isLight ? 'light' : 'dark');
  updateThemeIcon(isLight ? '☀️' : '🌙');
}

function updateThemeIcon(icon) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = icon;
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
      const compStr = s.competitionFilter && s.competitionFilter !== 'all' ? ` · 🏆 ${s.competitionFilter.toUpperCase()}` : '';
      return `
        <div class="sub-item-card">
          <div class="sub-item-meta">
            <strong>${channelIcon} ${s.targetId || 'Browser'}</strong>
            <span>Events: ${eventsStr}${compStr}</span>
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
  const compSelect = document.getElementById('alertCompSelect');
  const channelSelect = document.getElementById('alertChannelSelect');
  const teamName = select ? select.value : '';
  const competitionFilter = compSelect ? compSelect.value : 'all';
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
        competitionFilter,
        events
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast(`🔔 Subscribed to ${teamName || 'all'} alerts (${competitionFilter.toUpperCase()}) via ${channel.toUpperCase()}!`);
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
      playGoalSound();
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

// ===================================================
// 14. Discord Bot Interactive Simulator & Preview
// ===================================================
function openDiscordModal() {
  const modal = document.getElementById('discordModal');
  if (modal) modal.classList.add('open');
}

function closeDiscordModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
  const modal = document.getElementById('discordModal');
  if (modal) modal.classList.remove('open');
}

function sendQuickDiscord(cmd) {
  const input = document.getElementById('dcChatInput');
  if (input) {
    input.value = cmd;
    submitDiscordMessage(cmd);
  }
}

function handleDiscordChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('dcChatInput');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';
  submitDiscordMessage(text);
}

async function submitDiscordMessage(commandText) {
  const chatBody = document.getElementById('dcChatBody');
  if (!chatBody) return;

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. User message
  const userMsg = document.createElement('div');
  userMsg.className = 'dc-message';
  userMsg.innerHTML = `
    <div class="dc-avatar user-avatar">👤</div>
    <div class="dc-content">
      <div class="dc-author-row">
        <span class="dc-author">You</span>
        <span class="dc-timestamp">Today at ${nowStr}</span>
      </div>
      <div class="dc-text">${escapeHtml(commandText)}</div>
    </div>
  `;
  chatBody.appendChild(userMsg);

  // 2. Typing indicator
  const typingMsg = document.createElement('div');
  typingMsg.className = 'dc-message';
  typingMsg.id = 'dcTyping';
  typingMsg.innerHTML = `
    <div class="dc-avatar">⚽</div>
    <div class="dc-content">
      <div class="dc-author-row">
        <span class="dc-author">GoalHub</span>
        <span class="dc-bot-tag">BOT</span>
      </div>
      <div class="dc-text" style="color:#949ba4; font-style:italic;">GoalHub is querying live football feed…</div>
    </div>
  `;
  chatBody.appendChild(typingMsg);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const res = await fetch('/api/bot/discord-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commandText })
    });
    const data = await res.json();
    document.getElementById('dcTyping')?.remove();

    const r = data.result;
    const botMsg = document.createElement('div');
    botMsg.className = 'dc-message';

    let contentHtml = '';

    if (r?.content) {
      contentHtml += `<div class="dc-text">${escapeHtml(r.content)}</div>`;
    }

    if (r?.embeds && r.embeds.length > 0) {
      for (const em of r.embeds) {
        const d = em.data || em;
        const colorHex = d.color ? `#${d.color.toString(16).padStart(6, '0')}` : '#10b981';

        let fieldsHtml = '';
        if (d.fields && d.fields.length > 0) {
          fieldsHtml = `
            <div class="dc-embed-fields">
              ${d.fields.map(f => `
                <div class="dc-embed-field">
                  <strong>${escapeHtml(f.name)}</strong>
                  <span>${formatDiscordMarkdown(f.value)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }

        contentHtml += `
          <div class="dc-embed" style="border-left-color: ${colorHex}">
            <div class="dc-embed-header">
              <div>
                ${d.title ? `<div class="dc-embed-title">${escapeHtml(d.title)}</div>` : ''}
                ${d.description ? `<div class="dc-embed-desc">${formatDiscordMarkdown(d.description)}</div>` : ''}
              </div>
              ${d.thumbnail?.url ? `<img src="${d.thumbnail.url}" class="dc-embed-thumb" alt="thumb">` : ''}
            </div>
            ${fieldsHtml}
            ${d.footer?.text ? `<div class="dc-embed-footer">${escapeHtml(d.footer.text)}</div>` : ''}
          </div>
        `;
      }
    }

    botMsg.innerHTML = `
      <div class="dc-avatar">⚽</div>
      <div class="dc-content">
        <div class="dc-author-row">
          <span class="dc-author">GoalHub</span>
          <span class="dc-bot-tag">BOT</span>
          <span class="dc-timestamp">Today at ${nowStr}</span>
        </div>
        ${contentHtml}
      </div>
    `;

    chatBody.appendChild(botMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
  } catch (err) {
    document.getElementById('dcTyping')?.remove();
    showToast('Failed to reach Discord command processor.');
  }
}

function formatDiscordMarkdown(text) {
  if (!text) return '';
  let out = escapeHtml(text);
  out = out.replace(/```([\s\S]*?)```/g, '<pre style="background:#1e1f22; padding:8px 10px; border-radius:4px; font-family:\'IBM Plex Mono\',monospace; font-size:0.8rem; overflow-x:auto; margin:6px 0;"><code>$1</code></pre>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

// ===================================================
// 14. Phase 3: Match Predictions Game
// ===================================================
function getPredictions() {
  try {
    const raw = localStorage.getItem('goalhub_predictions');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getPrediction(fixtureId) {
  const all = getPredictions();
  return all[fixtureId] || null;
}

function submitPrediction(fixtureId, pick) {
  const all = getPredictions();
  all[fixtureId] = pick;
  localStorage.setItem('goalhub_predictions', JSON.stringify(all));

  // Update card UI if present
  const card = document.getElementById(`fixture-${fixtureId}`);
  if (card) {
    const btns = card.querySelectorAll('.pred-btn');
    btns.forEach(b => b.classList.remove('picked'));
    const targetIdx = pick === '1' ? 0 : pick === 'x' ? 1 : 2;
    if (btns[targetIdx]) btns[targetIdx].classList.add('picked');

    const titleSpan = card.querySelector('.pred-title-row span:last-child');
    if (titleSpan) {
      const label = pick === '1' ? 'HOME' : pick === 'x' ? 'DRAW' : 'AWAY';
      titleSpan.innerHTML = `<span style="color:var(--pitch-green); font-weight:700;">Pick: ${label}</span>`;
    }
  }

  const pickLabel = pick === '1' ? 'Home Win' : pick === 'x' ? 'Draw' : 'Away Win';
  showToast(`🎯 Prediction locked in: ${pickLabel}! (+3 pts on match completion)`);
  if (audioEnabled) playGoalSound();
}

// ===================================================
// 15. Phase 3: European Football News Feed
// ===================================================
let allNewsArticles = [];
let currentNewsCategory = 'all';

async function loadNewsSection() {
  const container = document.getElementById('newsContainer');
  if (!container) return;
  container.innerHTML = `<p style="color:var(--sideline); padding:30px; text-align:center;">Loading latest European football stories...</p>`;

  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error('Failed to load news');
    const data = await res.json();
    allNewsArticles = data.articles || [];
    renderNewsCards();
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sideline); padding:30px; text-align:center;">Failed to load news stories. Please refresh.</p>`;
  }
}

function filterNewsCategory(cat, btn) {
  currentNewsCategory = cat;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.toggle-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderNewsCards();
}

function renderNewsCards() {
  const container = document.getElementById('newsContainer');
  if (!container) return;

  const filtered = currentNewsCategory === 'all'
    ? allNewsArticles
    : allNewsArticles.filter(a => 
        (a.category || '').toLowerCase().includes(currentNewsCategory.toLowerCase()) || 
        (a.title || '').toLowerCase().includes(currentNewsCategory.toLowerCase())
      );

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color:var(--sideline); padding:30px; text-align:center;">No stories found in this category.</p>`;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const timeAgo = formatTimeAgo(a.published);
    return `
      <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="news-card">
        <div class="news-img-wrap">
          <img class="news-img" src="${a.image}" alt="${escapeHtml(a.title)}" onerror="this.src='https://a.espncdn.com/photo/2024/0815/r1372776_1296x729_16-9.jpg'">
          <span class="news-tag">${escapeHtml(a.category)}</span>
        </div>
        <div class="news-body">
          <h3 class="news-title">${escapeHtml(a.title)}</h3>
          <p class="news-desc">${escapeHtml(a.description)}</p>
          <div class="news-meta">
            <span>✍️ ${escapeHtml(a.byline || 'ESPN')}</span>
            <span>🕒 ${timeAgo}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'Recent';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ===================================================
// 16. Phase 4: PWA Registration & Install
// ===================================================
let deferredInstallPrompt = null;

function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[PWA] SW registration failed:', err);
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('installPwaBtn');
    if (btn) btn.style.display = 'inline-block';
  });
}

function installGoalHubPwa() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      showToast('Thank you for installing GoalHub! ⚽');
    }
    deferredInstallPrompt = null;
    const btn = document.getElementById('installPwaBtn');
    if (btn) btn.style.display = 'none';
  });
}

// ===================================================
// 17. Phase 5: Web Audio Goal Sound Synthesizer
// ===================================================
let audioEnabled = localStorage.getItem('goalhub_audio') !== 'false';
let audioCtx = null;

function initAudio() {
  const btn = document.getElementById('soundToggleBtn');
  if (btn) {
    btn.innerHTML = audioEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
    btn.classList.toggle('muted', !audioEnabled);
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  localStorage.setItem('goalhub_audio', audioEnabled ? 'true' : 'false');
  initAudio();
  if (audioEnabled) {
    playGoalSound();
    showToast('Goal audio alerts enabled! 🔔');
  } else {
    showToast('Goal audio alerts muted. 🔕');
  }
}

function playGoalSound() {
  if (!audioEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;

    // Upbeat live goal chime tone 1 (523.25 Hz - C5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Chime tone 2 (783.99 Hz - G5 -> 1046.5 Hz - C6)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(783.99, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.4);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}
