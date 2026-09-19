import { CONFIG, TRACKED_LEAGUES } from '../config.js';
import type { 
  Fixture, StandingTeam, MatchEvent, MatchStatus, TeamSquad, SquadPlayer,
  MatchDetails, MatchStatComparison, LineupPlayer, H2HSummary, H2HMeeting,
  LeagueLeaders, LeagueLeaderPlayer, PlayerProfile, GlobalSearchResult, Team, NewsArticle,
  MatchPrediction
} from '../types.js';
import { saveFixtures, getFixturesByLeague, getLiveFixturesFromDb, searchFixturesByTeam } from '../db/database.js';

export interface ClubInfo {
  id: number;
  name: string;
  shortName?: string;
  code?: string;
  logo: string;
  leagueId: number;
  espnLeagueCode: string;
}

const TEAM_ALIASES: Record<string, string> = {
  'barca': 'barcelona',
  'barça': 'barcelona',
  'fc barcelona': 'barcelona',
  'fcb': 'barcelona',
  'madrid': 'real madrid',
  'real': 'real madrid',
  'los blancos': 'real madrid',
  'atleti': 'atletico madrid',
  'atletico': 'atletico madrid',
  'gunners': 'arsenal',
  'the gunners': 'arsenal',
  'man city': 'manchester city',
  'mancity': 'manchester city',
  'city': 'manchester city',
  'man utd': 'manchester united',
  'manutd': 'manchester united',
  'man united': 'manchester united',
  'united': 'manchester united',
  'red devils': 'manchester united',
  'chelsea': 'chelsea',
  'the blues': 'chelsea',
  'spurs': 'tottenham hotspur',
  'tottenham': 'tottenham hotspur',
  'liverpool': 'liverpool',
  'reds': 'liverpool',
  'the reds': 'liverpool',
  'juve': 'juventus',
  'inter': 'internazionale',
  'inter milan': 'internazionale',
  'milan': 'ac milan',
  'roma': 'as roma',
  'bvb': 'borussia dortmund',
  'dortmund': 'borussia dortmund',
  'bayern': 'bayern munich',
  'fc bayern': 'bayern munich',
  'leverkusen': 'bayer leverkusen',
  'psg': 'paris saint-germain',
  'paris': 'paris saint-germain',
  'monaco': 'as monaco',
  'marseille': 'olympique de marseille',
  'om': 'olympique de marseille',
  'ol': 'olympique lyonnais',
  'lyon': 'olympique lyonnais'
};

// ============================================================
// Authoritative Club Managers & Stadiums Registry (Top 5 + UEFA)
// ============================================================
export const CLUB_MANAGERS: Record<string, { manager: string; stadium: string }> = {
  // Premier League — 2026/27 Official List
  'arsenal': { manager: 'Mikel Arteta', stadium: 'Emirates Stadium' },
  'aston villa': { manager: 'Unai Emery', stadium: 'Villa Park' },
  'bournemouth': { manager: 'Marco Rose', stadium: 'Vitality Stadium' },
  'afc bournemouth': { manager: 'Marco Rose', stadium: 'Vitality Stadium' },
  'brentford': { manager: 'Keith Andrews', stadium: 'Gtech Community Stadium' },
  'brighton': { manager: 'Fabian Hürzeler', stadium: 'Amex Stadium' },
  'brighton & hove albion': { manager: 'Fabian Hürzeler', stadium: 'Amex Stadium' },
  'brighton and hove albion': { manager: 'Fabian Hürzeler', stadium: 'Amex Stadium' },
  'chelsea': { manager: 'Xabi Alonso', stadium: 'Stamford Bridge' },
  'coventry': { manager: 'Frank Lampard', stadium: 'Coventry Building Society Arena' },
  'coventry city': { manager: 'Frank Lampard', stadium: 'Coventry Building Society Arena' },
  'crystal palace': { manager: 'Pierre Sage', stadium: 'Selhurst Park' },
  'everton': { manager: 'David Moyes', stadium: 'Goodison Park' },
  'fulham': { manager: 'Álvaro Arbeloa', stadium: 'Craven Cottage' },
  'hull': { manager: 'Sergej Jakirović', stadium: 'MKM Stadium' },
  'hull city': { manager: 'Sergej Jakirović', stadium: 'MKM Stadium' },
  'ipswich': { manager: "Gary O'Neil", stadium: 'Portman Road' },
  'ipswich town': { manager: "Gary O'Neil", stadium: 'Portman Road' },
  'leeds': { manager: 'Daniel Farke', stadium: 'Elland Road' },
  'leeds united': { manager: 'Daniel Farke', stadium: 'Elland Road' },
  'liverpool': { manager: 'Andoni Iraola', stadium: 'Anfield' },
  'manchester city': { manager: 'Enzo Maresca', stadium: 'Etihad Stadium' },
  'man city': { manager: 'Enzo Maresca', stadium: 'Etihad Stadium' },
  'manchester united': { manager: 'Michael Carrick', stadium: 'Old Trafford' },
  'man united': { manager: 'Michael Carrick', stadium: 'Old Trafford' },
  'man utd': { manager: 'Michael Carrick', stadium: 'Old Trafford' },
  'newcastle': { manager: 'Matthias Jaissle', stadium: "St. James' Park" },
  'newcastle united': { manager: 'Matthias Jaissle', stadium: "St. James' Park" },
  'nottingham forest': { manager: 'Oliver Glasner', stadium: 'City Ground' },
  'nottingham': { manager: 'Oliver Glasner', stadium: 'City Ground' },
  'sunderland': { manager: 'Régis Le Bris', stadium: 'Stadium of Light' },
  'tottenham': { manager: 'Roberto De Zerbi', stadium: 'Tottenham Hotspur Stadium' },
  'tottenham hotspur': { manager: 'Roberto De Zerbi', stadium: 'Tottenham Hotspur Stadium' },
  'spurs': { manager: 'Roberto De Zerbi', stadium: 'Tottenham Hotspur Stadium' },
  'west ham': { manager: 'Graham Potter', stadium: 'London Stadium' },
  'west ham united': { manager: 'Graham Potter', stadium: 'London Stadium' },
  'wolverhampton': { manager: 'Vítor Pereira', stadium: 'Molineux Stadium' },
  'wolverhampton wanderers': { manager: 'Vítor Pereira', stadium: 'Molineux Stadium' },
  'wolves': { manager: 'Vítor Pereira', stadium: 'Molineux Stadium' },
  'leicester': { manager: 'Ruud van Nistelrooy', stadium: 'King Power Stadium' },
  'leicester city': { manager: 'Ruud van Nistelrooy', stadium: 'King Power Stadium' },
  'southampton': { manager: 'Ivan Jurić', stadium: "St. Mary's Stadium" },

  // English Championship & Notable
  'sheffield united': { manager: 'Chris Wilder', stadium: 'Bramall Lane' },
  'sheffield utd': { manager: 'Chris Wilder', stadium: 'Bramall Lane' },
  'burnley': { manager: 'Scott Parker', stadium: 'Turf Moor' },
  'luton': { manager: 'Rob Edwards', stadium: 'Kenilworth Road' },
  'luton town': { manager: 'Rob Edwards', stadium: 'Kenilworth Road' },
  'west brom': { manager: 'Tony Mowbray', stadium: 'The Hawthorns' },
  'west bromwich albion': { manager: 'Tony Mowbray', stadium: 'The Hawthorns' },
  'middlesbrough': { manager: 'Michael Carrick', stadium: 'Riverside Stadium' },
  'norwich': { manager: 'Johannes Hoff Thorup', stadium: 'Carrow Road' },
  'norwich city': { manager: 'Johannes Hoff Thorup', stadium: 'Carrow Road' },
  'watford': { manager: 'Tom Cleverley', stadium: 'Vicarage Road' },
  'blackburn': { manager: 'John Eustace', stadium: 'Ewood Park' },
  'blackburn rovers': { manager: 'John Eustace', stadium: 'Ewood Park' },
  'derby': { manager: 'Paul Warne', stadium: 'Pride Park Stadium' },
  'derby county': { manager: 'Paul Warne', stadium: 'Pride Park Stadium' },
  'stoke': { manager: 'Narcís Pèlach', stadium: 'bet365 Stadium' },
  'stoke city': { manager: 'Narcís Pèlach', stadium: 'bet365 Stadium' },
  'portsmouth': { manager: 'John Mousinho', stadium: 'Fratton Park' },
  'qpr': { manager: 'Martí Cifuentes', stadium: 'Loftus Road' },
  'queens park rangers': { manager: 'Martí Cifuentes', stadium: 'Loftus Road' },
  'swansea': { manager: 'Luke Williams', stadium: 'Swansea.com Stadium' },
  'swansea city': { manager: 'Luke Williams', stadium: 'Swansea.com Stadium' },
  'bristol city': { manager: 'Liam Manning', stadium: 'Ashton Gate' },

  // La Liga — 2026/27 Official List
  'alaves': { manager: 'Quique Sánchez Flores', stadium: 'Mendizorrotza' },
  'deportivo alaves': { manager: 'Quique Sánchez Flores', stadium: 'Mendizorrotza' },
  'athletic club': { manager: 'Edin Terzić', stadium: 'San Mamés' },
  'athletic bilbao': { manager: 'Edin Terzić', stadium: 'San Mamés' },
  'atletico madrid': { manager: 'Diego Simeone', stadium: 'Riyadh Air Metropolitano' },
  'atleti': { manager: 'Diego Simeone', stadium: 'Riyadh Air Metropolitano' },
  'barcelona': { manager: 'Hansi Flick', stadium: 'Spotify Camp Nou' },
  'barca': { manager: 'Hansi Flick', stadium: 'Spotify Camp Nou' },
  'fc barcelona': { manager: 'Hansi Flick', stadium: 'Spotify Camp Nou' },
  'celta vigo': { manager: 'Claudio Giráldez', stadium: 'Balaídos' },
  'celta': { manager: 'Claudio Giráldez', stadium: 'Balaídos' },
  'deportivo': { manager: 'Antonio Hidalgo', stadium: 'Estadio Riazor' },
  'deportivo la coruna': { manager: 'Antonio Hidalgo', stadium: 'Estadio Riazor' },
  'rc deportivo': { manager: 'Antonio Hidalgo', stadium: 'Estadio Riazor' },
  'elche': { manager: 'Martín Anselmi', stadium: 'Estadio Martínez Valero' },
  'espanyol': { manager: 'Manolo González', stadium: 'Stage Front Stadium' },
  'rcd espanyol': { manager: 'Manolo González', stadium: 'Stage Front Stadium' },
  'getafe': { manager: 'José Bordalás', stadium: 'Coliseum' },
  'levante': { manager: 'Luís Castro', stadium: 'Estadi Ciutat de València' },
  'malaga': { manager: 'Juan Francisco Funes', stadium: 'La Rosaleda' },
  'osasuna': { manager: 'Luis Miguel Ramis', stadium: 'El Sadar' },
  'rayo vallecano': { manager: 'Beñat San José', stadium: 'Campo de Vallecas' },
  'rayo': { manager: 'Beñat San José', stadium: 'Campo de Vallecas' },
  'racing santander': { manager: 'José Alberto', stadium: 'El Sardinero' },
  'real betis': { manager: 'Manuel Pellegrini', stadium: 'Benito Villamarín' },
  'betis': { manager: 'Manuel Pellegrini', stadium: 'Benito Villamarín' },
  'real madrid': { manager: 'José Mourinho', stadium: 'Santiago Bernabéu' },
  'real': { manager: 'José Mourinho', stadium: 'Santiago Bernabéu' },
  'real sociedad': { manager: 'Pellegrino Matarazzo', stadium: 'Reale Arena' },
  'sevilla': { manager: 'Luis García Plaza', stadium: 'Ramón Sánchez-Pizjuán' },
  'valencia': { manager: 'Óscar Sánchez (interim)', stadium: 'Mestalla' },
  'villarreal': { manager: 'Iñigo Pérez', stadium: 'Estadio de la Cerámica' },
  'girona': { manager: 'Míchel', stadium: 'Montilivi' },
  'mallorca': { manager: 'Jagoba Arrasate', stadium: 'Son Moix' },
  'rcd mallorca': { manager: 'Jagoba Arrasate', stadium: 'Son Moix' },
  'las palmas': { manager: 'Diego Martínez', stadium: 'Estadio Gran Canaria' },
  'leganes': { manager: 'Borja Jiménez', stadium: 'Estadio Municipal Butarque' },
  'valladolid': { manager: 'Diego Cocca', stadium: 'José Zorrilla' },
  'real valladolid': { manager: 'Diego Cocca', stadium: 'José Zorrilla' },
  'granada': { manager: 'Fran Escribá', stadium: 'Nuevo Los Cármenes' },
  'almeria': { manager: 'Rubi', stadium: 'Power Horse Stadium' },
  'cadiz': { manager: 'Paco López', stadium: 'Nuevo Mirandilla' },
  'zaragoza': { manager: 'Víctor Fernández', stadium: 'La Romareda' },
  'real zaragoza': { manager: 'Víctor Fernández', stadium: 'La Romareda' },
  'sporting gijon': { manager: 'Rubén Albés', stadium: 'El Molinón' },
  'eibar': { manager: 'Joseba Etxeberria', stadium: 'Ipurua' },
  'real oviedo': { manager: 'Javi Calleja', stadium: 'Carlos Tartiere' },

  // Bundesliga — 2026/27 Official List
  'bayern munich': { manager: 'Vincent Kompany', stadium: 'Allianz Arena' },
  'bayern': { manager: 'Vincent Kompany', stadium: 'Allianz Arena' },
  'borussia dortmund': { manager: 'Niko Kovač', stadium: 'Signal Iduna Park' },
  'dortmund': { manager: 'Niko Kovač', stadium: 'Signal Iduna Park' },
  'bvb': { manager: 'Niko Kovač', stadium: 'Signal Iduna Park' },
  'rb leipzig': { manager: 'Martín Demichelis', stadium: 'Red Bull Arena' },
  'leipzig': { manager: 'Martín Demichelis', stadium: 'Red Bull Arena' },
  'vfb stuttgart': { manager: 'Sebastian Hoeneß', stadium: 'MHPArena' },
  'stuttgart': { manager: 'Sebastian Hoeneß', stadium: 'MHPArena' },
  'bayer leverkusen': { manager: 'Carles Martínez', stadium: 'BayArena' },
  'leverkusen': { manager: 'Carles Martínez', stadium: 'BayArena' },
  'eintracht frankfurt': { manager: 'Adi Hütter', stadium: 'Deutsche Bank Park' },
  'frankfurt': { manager: 'Adi Hütter', stadium: 'Deutsche Bank Park' },
  'sc freiburg': { manager: 'Julian Schuster', stadium: 'Europa-Park Stadion' },
  'freiburg': { manager: 'Julian Schuster', stadium: 'Europa-Park Stadion' },
  'mainz 05': { manager: 'Urs Fischer', stadium: 'Mewa Arena' },
  'mainz': { manager: 'Urs Fischer', stadium: 'Mewa Arena' },
  'borussia monchengladbach': { manager: 'Eugen Polanski', stadium: 'Borussia-Park' },
  'monchengladbach': { manager: 'Eugen Polanski', stadium: 'Borussia-Park' },
  'mönchengladbach': { manager: 'Eugen Polanski', stadium: 'Borussia-Park' },
  'hoffenheim': { manager: 'Christian Ilzer', stadium: 'PreZero Arena' },
  'tsg hoffenheim': { manager: 'Christian Ilzer', stadium: 'PreZero Arena' },
  'augsburg': { manager: 'Manuel Baum', stadium: 'WWK Arena' },
  'fc augsburg': { manager: 'Manuel Baum', stadium: 'WWK Arena' },
  'union berlin': { manager: 'Mauro Lustrinelli', stadium: 'Stadion An der Alten Försterei' },
  '1 fc union berlin': { manager: 'Mauro Lustrinelli', stadium: 'Stadion An der Alten Försterei' },
  'werder bremen': { manager: 'Daniel Thioune', stadium: 'Weserstadion' },
  'bremen': { manager: 'Daniel Thioune', stadium: 'Weserstadion' },
  'hamburg': { manager: 'Merlin Polzin', stadium: 'Volksparkstadion' },
  'hamburg sv': { manager: 'Merlin Polzin', stadium: 'Volksparkstadion' },
  'hsv': { manager: 'Merlin Polzin', stadium: 'Volksparkstadion' },
  'koln': { manager: 'René Wagner', stadium: 'RheinEnergieStadion' },
  '1 fc koln': { manager: 'René Wagner', stadium: 'RheinEnergieStadion' },
  'fc cologne': { manager: 'René Wagner', stadium: 'RheinEnergieStadion' },
  'cologne': { manager: 'René Wagner', stadium: 'RheinEnergieStadion' },
  'schalke 04': { manager: 'Miron Muslić', stadium: 'Veltins-Arena' },
  'schalke': { manager: 'Miron Muslić', stadium: 'Veltins-Arena' },
  'heidenheim': { manager: 'Frank Schmidt', stadium: 'Voith-Arena' },
  '1 fc heidenheim': { manager: 'Frank Schmidt', stadium: 'Voith-Arena' },
  'paderborn': { manager: 'Ralf Kettemann', stadium: 'Home Deluxe Arena' },
  'sc paderborn 07': { manager: 'Ralf Kettemann', stadium: 'Home Deluxe Arena' },
  'elversberg': { manager: 'Horst Steffen', stadium: 'Ursapharm-Arena an der Kaiserlinde' },
  'sv elversberg': { manager: 'Horst Steffen', stadium: 'Ursapharm-Arena an der Kaiserlinde' },
  'wolfsburg': { manager: 'Ralph Hasenhüttl', stadium: 'Volkswagen Arena' },
  'vfl wolfsburg': { manager: 'Ralph Hasenhüttl', stadium: 'Volkswagen Arena' },
  'st pauli': { manager: 'Alexander Blessin', stadium: 'Millerntor-Stadion' },
  'fc st pauli': { manager: 'Alexander Blessin', stadium: 'Millerntor-Stadion' },
  'bochum': { manager: 'Dieter Hecking', stadium: 'Vonovia Ruhrstadion' },
  'vfl bochum': { manager: 'Dieter Hecking', stadium: 'Vonovia Ruhrstadion' },
  'holstein kiel': { manager: 'Marcel Rapp', stadium: 'Holstein-Stadion' },
  'kiel': { manager: 'Marcel Rapp', stadium: 'Holstein-Stadion' },
  'hertha bsc': { manager: 'Cristian Fiél', stadium: 'Olympiastadion' },
  'hertha': { manager: 'Cristian Fiél', stadium: 'Olympiastadion' },
  'hannover 96': { manager: 'Stefan Leitl', stadium: 'Heinz von Heiden Arena' },
  'hannover': { manager: 'Stefan Leitl', stadium: 'Heinz von Heiden Arena' },
  'fortuna dusseldorf': { manager: 'Daniel Thioune', stadium: 'Merkur Spiel-Arena' },
  'dusseldorf': { manager: 'Daniel Thioune', stadium: 'Merkur Spiel-Arena' },
  '1 fc nurnberg': { manager: 'Miroslav Klose', stadium: 'Max-Morlock-Stadion' },
  'nurnberg': { manager: 'Miroslav Klose', stadium: 'Max-Morlock-Stadion' },
  '1 fc kaiserslautern': { manager: 'Markus Anfang', stadium: 'Fritz-Walter-Stadion' },
  'kaiserslautern': { manager: 'Markus Anfang', stadium: 'Fritz-Walter-Stadion' },
  'karlsruher sc': { manager: 'Christian Eichner', stadium: 'BBBank Wildpark' },
  'karlsruher': { manager: 'Christian Eichner', stadium: 'BBBank Wildpark' },
  'darmstadt 98': { manager: 'Florian Kohfeldt', stadium: 'Merck-Stadion am Böllenfalltor' },
  'darmstadt': { manager: 'Florian Kohfeldt', stadium: 'Merck-Stadion am Böllenfalltor' },

  // Serie A — 2026/27 Official List
  'atalanta': { manager: 'Maurizio Sarri', stadium: 'Gewiss Stadium' },
  'bologna': { manager: 'Domenico Tedesco', stadium: "Renato Dall'Ara" },
  'cagliari': { manager: 'Fabio Pisacane', stadium: 'Unipol Domus' },
  'como': { manager: 'Cesc Fàbregas', stadium: 'Stadio Giuseppe Sinigaglia' },
  'fiorentina': { manager: 'Fabio Grosso', stadium: 'Stadio Artemio Franchi' },
  'frosinone': { manager: 'Massimiliano Alvini', stadium: 'Stadio Benito Stirpe' },
  'genoa': { manager: 'Daniele De Rossi', stadium: 'Luigi Ferraris' },
  'inter': { manager: 'Cristian Chivu', stadium: 'San Siro' },
  'inter milan': { manager: 'Cristian Chivu', stadium: 'San Siro' },
  'internazionale': { manager: 'Cristian Chivu', stadium: 'San Siro' },
  'juventus': { manager: 'Luciano Spalletti', stadium: 'Allianz Stadium' },
  'juve': { manager: 'Luciano Spalletti', stadium: 'Allianz Stadium' },
  'lazio': { manager: 'Gennaro Gattuso', stadium: 'Stadio Olimpico' },
  'lecce': { manager: 'Eusebio Di Francesco', stadium: 'Stadio Via del mare' },
  'ac milan': { manager: 'Rúben Amorim', stadium: 'San Siro' },
  'milan': { manager: 'Rúben Amorim', stadium: 'San Siro' },
  'monza': { manager: 'Ivan Jurić', stadium: 'U-Power Stadium' },
  'napoli': { manager: 'Massimiliano Allegri', stadium: 'Stadio Diego Armando Maradona' },
  'parma': { manager: 'Carlos Cuesta', stadium: 'Ennio Tardini' },
  'roma': { manager: 'Gian Piero Gasperini', stadium: 'Stadio Olimpico' },
  'as roma': { manager: 'Gian Piero Gasperini', stadium: 'Stadio Olimpico' },
  'sassuolo': { manager: 'Alberto Aquilani', stadium: 'Mapei Stadium' },
  'torino': { manager: 'Ignazio Abate', stadium: 'Stadio Olimpico Grande Torino' },
  'udinese': { manager: 'Kosta Runjaić', stadium: 'Bluenergy Stadium' },
  'venezia': { manager: 'Giovanni Stroppa', stadium: 'Stadio Pier Luigi Penzo' },
  'empoli': { manager: "Roberto D'Aversa", stadium: 'Carlo Castellani' },
  'verona': { manager: 'Paolo Zanetti', stadium: 'Marcantonio Bentegodi' },
  'hellas verona': { manager: 'Paolo Zanetti', stadium: 'Marcantonio Bentegodi' },
  'salernitana': { manager: 'Stefano Colantuono', stadium: 'Stadio Arechi' },
  'sampdoria': { manager: 'Andrea Sottil', stadium: 'Luigi Ferraris' },
  'palermo': { manager: 'Alessio Dionisi', stadium: 'Renzo Barbera' },
  'cremonese': { manager: 'Giovanni Stroppa', stadium: 'Giovanni Zini' },
  'spezia': { manager: "Luca D'Angelo", stadium: 'Alberto Picco' },
  'pisa': { manager: 'Filippo Inzaghi', stadium: 'Arena Garibaldi' },
  'brescia': { manager: 'Rolando Maran', stadium: 'Mario Rigamonti' },
  'bari': { manager: 'Moreno Longo', stadium: 'San Nicola' },
  'cesena': { manager: 'Michele Mignani', stadium: 'Dino Manuzzi' },
  'catanzaro': { manager: 'Fabio Caserta', stadium: 'Nicola Ceravolo' },

  // Ligue 1 — 2026/27 Official List
  'auxerre': { manager: 'Will Still', stadium: "Stade de l'Abbé-Deschamps" },
  'aj auxerre': { manager: 'Will Still', stadium: "Stade de l'Abbé-Deschamps" },
  'angers': { manager: 'Stéphane Gilli', stadium: 'Stade Raymond Kopa' },
  'angers sco': { manager: 'Stéphane Gilli', stadium: 'Stade Raymond Kopa' },
  'brest': { manager: 'Julien Lachuer', stadium: 'Stade Francis-Le Blé' },
  'stade brestois': { manager: 'Julien Lachuer', stadium: 'Stade Francis-Le Blé' },
  'le havre': { manager: 'Didier Digard', stadium: 'Stade Océane' },
  'le havre ac': { manager: 'Didier Digard', stadium: 'Stade Océane' },
  'le mans': { manager: 'Patrick Videira', stadium: 'Stade Marie-Marvingt' },
  'le mans fc': { manager: 'Patrick Videira', stadium: 'Stade Marie-Marvingt' },
  'lens': { manager: 'Yannick Cahuzac', stadium: 'Stade Bollaert-Delelis' },
  'rc lens': { manager: 'Yannick Cahuzac', stadium: 'Stade Bollaert-Delelis' },
  'lille': { manager: 'Davide Ancelotti', stadium: 'Decathlon Arena' },
  'lille osc': { manager: 'Davide Ancelotti', stadium: 'Decathlon Arena' },
  'lorient': { manager: 'Alexandre Dujeux', stadium: 'Stade du Moustoir' },
  'fc lorient': { manager: 'Alexandre Dujeux', stadium: 'Stade du Moustoir' },
  'lyon': { manager: 'Paulo Fonseca', stadium: 'Groupama Stadium' },
  'olympiquelyonnais': { manager: 'Paulo Fonseca', stadium: 'Groupama Stadium' },
  'olympique lyonnais': { manager: 'Paulo Fonseca', stadium: 'Groupama Stadium' },
  'ol': { manager: 'Paulo Fonseca', stadium: 'Groupama Stadium' },
  'marseille': { manager: 'Bruno Génésio', stadium: 'Orange Vélodrome' },
  'olympiquedemarseille': { manager: 'Bruno Génésio', stadium: 'Orange Vélodrome' },
  'olympique de marseille': { manager: 'Bruno Génésio', stadium: 'Orange Vélodrome' },
  'om': { manager: 'Bruno Génésio', stadium: 'Orange Vélodrome' },
  'monaco': { manager: 'Filipe Luís', stadium: 'Stade Louis II' },
  'as monaco': { manager: 'Filipe Luís', stadium: 'Stade Louis II' },
  'nice': { manager: 'Olivier Pantaloni', stadium: 'Allianz Riviera' },
  'ogc nice': { manager: 'Olivier Pantaloni', stadium: 'Allianz Riviera' },
  'paris fc': { manager: 'Liam Rosenior', stadium: 'Stade Sébastien Charléty' },
  'paris saint-germain': { manager: 'Luis Enrique', stadium: 'Parc des Princes' },
  'psg': { manager: 'Luis Enrique', stadium: 'Parc des Princes' },
  'paris': { manager: 'Luis Enrique', stadium: 'Parc des Princes' },
  'rennes': { manager: 'Franck Haise', stadium: 'Roazhon Park' },
  'stade rennais': { manager: 'Franck Haise', stadium: 'Roazhon Park' },
  'stade rennais fc': { manager: 'Franck Haise', stadium: 'Roazhon Park' },
  'rennais': { manager: 'Franck Haise', stadium: 'Roazhon Park' },
  'strasbourg': { manager: 'Hugo Oliveira', stadium: 'Stade de la Meinau' },
  'rc strasbourg': { manager: 'Hugo Oliveira', stadium: 'Stade de la Meinau' },
  'toulouse': { manager: 'Jens Berthel Askou', stadium: 'Stadium de Toulouse' },
  'toulouse fc': { manager: 'Jens Berthel Askou', stadium: 'Stadium de Toulouse' },
  'troyes': { manager: 'Stéphane Dumont', stadium: "Stade de l'Aube" },
  'estac troyes': { manager: 'Stéphane Dumont', stadium: "Stade de l'Aube" },
  'reims': { manager: 'Samba Diawara', stadium: 'Stade Auguste-Delaune' },
  'stade de reims': { manager: 'Samba Diawara', stadium: 'Stade Auguste-Delaune' },
  'montpellier': { manager: 'Jean-Louis Gasset', stadium: 'Stade de la Mosson' },
  'montpellier hsc': { manager: 'Jean-Louis Gasset', stadium: 'Stade de la Mosson' },
  'nantes': { manager: 'Antoine Kombouaré', stadium: 'Stade de la Beaujoire' },
  'fc nantes': { manager: 'Antoine Kombouaré', stadium: 'Stade de la Beaujoire' },
  'saint-etienne': { manager: 'Eirik Horneland', stadium: 'Stade Geoffroy-Guichard' },
  'as saint-etienne': { manager: 'Eirik Horneland', stadium: 'Stade Geoffroy-Guichard' },
  'metz': { manager: 'Stéphane Le Mignan', stadium: 'Stade Saint-Symphorien' },
  'fc metz': { manager: 'Stéphane Le Mignan', stadium: 'Stade Saint-Symphorien' },

  // Champions League & European Giants — 2026/27 Official List
  'aek athens': { manager: 'Marko Nikolić', stadium: 'OPAP Arena' },
  'aek': { manager: 'Marko Nikolić', stadium: 'OPAP Arena' },
  'bodo/glimt': { manager: 'Kjetil Knutsen', stadium: 'Aspmyra Stadion' },
  'bodoglimt': { manager: 'Kjetil Knutsen', stadium: 'Aspmyra Stadion' },
  'bodø/glimt': { manager: 'Kjetil Knutsen', stadium: 'Aspmyra Stadion' },
  'bodøglimt': { manager: 'Kjetil Knutsen', stadium: 'Aspmyra Stadion' },
  'club brugge': { manager: 'Nicky Hayen', stadium: 'Jan Breydel Stadium' },
  'fenerbahce': { manager: 'Domenico Tedesco', stadium: 'Şükrü Saracoğlu Stadium' },
  'fenerbahçe': { manager: 'Domenico Tedesco', stadium: 'Şükrü Saracoğlu Stadium' },
  'fenerbahce sk': { manager: 'Domenico Tedesco', stadium: 'Şükrü Saracoğlu Stadium' },
  'feyenoord': { manager: 'Robin van Persie', stadium: 'De Kuip' },
  'feyenoord rotterdam': { manager: 'Robin van Persie', stadium: 'De Kuip' },
  'galatasaray': { manager: 'Okan Buruk', stadium: 'RAMS Park' },
  'galatasaray sk': { manager: 'Okan Buruk', stadium: 'RAMS Park' },
  'lask': { manager: 'Dietmar Kühbauer', stadium: 'Raiffeisen Arena' },
  'lask linz': { manager: 'Dietmar Kühbauer', stadium: 'Raiffeisen Arena' },
  'porto': { manager: 'Francesco Farioli', stadium: 'Estádio do Dragão' },
  'fc porto': { manager: 'Francesco Farioli', stadium: 'Estádio do Dragão' },
  'psv': { manager: 'Peter Bosz', stadium: 'Philips Stadion' },
  'psv eindhoven': { manager: 'Peter Bosz', stadium: 'Philips Stadion' },
  'sabah': { manager: 'Valdas Dambrauskas', stadium: 'Bank Respublika Arena' },
  'sabah fc': { manager: 'Valdas Dambrauskas', stadium: 'Bank Respublika Arena' },
  'shakhtar donetsk': { manager: 'Arda Turan', stadium: 'Donbass Arena' },
  'shakhtar': { manager: 'Arda Turan', stadium: 'Donbass Arena' },
  'slavia prague': { manager: 'Jindřich Trpišovský', stadium: 'Fortuna Arena' },
  'slovan bratislava': { manager: 'Vladimír Weiss', stadium: 'Tehelné pole' },
  'sporting cp': { manager: 'Rui Borges', stadium: 'Estádio José Alvalade' },
  'sporting': { manager: 'Rui Borges', stadium: 'Estádio José Alvalade' },
  'sporting lisbon': { manager: 'Rui Borges', stadium: 'Estádio José Alvalade' },
  'viking': { manager: 'Bjarte Lunde Aarsheim', stadium: 'SR-Bank Arena' },
  'viking fk': { manager: 'Bjarte Lunde Aarsheim', stadium: 'SR-Bank Arena' },
  'ajax': { manager: 'Francesco Farioli', stadium: 'Johan Cruyff Arena' },
  'afc ajax': { manager: 'Francesco Farioli', stadium: 'Johan Cruyff Arena' },
  'benfica': { manager: 'Bruno Lage', stadium: 'Estádio da Luz' },
  'sl benfica': { manager: 'Bruno Lage', stadium: 'Estádio da Luz' },
  'celtic': { manager: 'Brendan Rodgers', stadium: 'Celtic Park' },
  'celtic fc': { manager: 'Brendan Rodgers', stadium: 'Celtic Park' },
  'rangers': { manager: 'Barry Ferguson', stadium: 'Ibrox Stadium' },
  'rangers fc': { manager: 'Barry Ferguson', stadium: 'Ibrox Stadium' },
  'besiktas': { manager: 'Ole Gunnar Solskjær', stadium: 'Tüpraş Stadium' },
  'besiktas jk': { manager: 'Ole Gunnar Solskjær', stadium: 'Tüpraş Stadium' },
  'sparta prague': { manager: 'Lars Friis', stadium: 'epet ARENA' },
  'dinamo zagreb': { manager: 'Fabio Cannavaro', stadium: 'Stadion Maksimir' },
  'red star belgrade': { manager: 'Vladan Milojević', stadium: 'Rajko Mitić Stadium' },
  'crvena zvezda': { manager: 'Vladan Milojević', stadium: 'Rajko Mitić Stadium' },
  'young boys': { manager: 'Giorgio Contini', stadium: 'Stadion Wankdorf' },
  'bsc young boys': { manager: 'Giorgio Contini', stadium: 'Stadion Wankdorf' },
  'sturm graz': { manager: 'Fabio Ingolitsch', stadium: 'Merkur Arena' },
  'sk sturm graz': { manager: 'Fabio Ingolitsch', stadium: 'Merkur Arena' },
  'salzburg': { manager: 'Thomas Letsch', stadium: 'Red Bull Arena' },
  'red bull salzburg': { manager: 'Thomas Letsch', stadium: 'Red Bull Arena' },
  'anderlecht': { manager: 'David Hubert', stadium: 'Lotto Park' },
  'rsc anderlecht': { manager: 'David Hubert', stadium: 'Lotto Park' },
  'panathinaikos': { manager: 'Rui Vitória', stadium: 'Olympic Stadium Athens' },
  'olympiacos': { manager: 'José Luis Mendilibar', stadium: 'Karaiskakis Stadium' },
  'paok': { manager: 'Răzvan Lucescu', stadium: 'Toumba Stadium' },
  'maccabi tel aviv': { manager: 'Žarko Lazetić', stadium: 'Bloomfield Stadium' },
  'ferencvaros': { manager: 'Pascal Jansen', stadium: 'Groupama Arena' },
  'qarabag': { manager: 'Gurban Gurbanov', stadium: 'Tofiq Bahramov Stadium' },
  'malmo': { manager: 'Henrik Rydström', stadium: 'Eleda Stadion' },
  'malmo ff': { manager: 'Henrik Rydström', stadium: 'Eleda Stadion' },
  'twente': { manager: 'Joseph Oosting', stadium: 'De Grolsch Veste' },
  'fc twente': { manager: 'Joseph Oosting', stadium: 'De Grolsch Veste' },
  'az alkmaar': { manager: 'Maarten Martens', stadium: 'AFAS Stadion' },
  'az': { manager: 'Maarten Martens', stadium: 'AFAS Stadion' },
  'braga': { manager: 'Carlos Carvalhal', stadium: 'Estádio Municipal de Braga' },
  'sc braga': { manager: 'Carlos Carvalhal', stadium: 'Estádio Municipal de Braga' }
};

export function getClubInfo(teamName: string): { manager: string; stadium: string } {
  const clean = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/ø/g, 'o')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const target = clean(teamName);
  if (!target) return { manager: 'First Team Head Coach', stadium: 'Home Stadium' };

  // 1. Direct exact key match
  for (const [key, info] of Object.entries(CLUB_MANAGERS)) {
    if (target === clean(key)) return info;
  }

  // 2. Exact match with stripped common club affixes (fc, cf, sc, as, ac, rc, sv, vfb, vfl, etc.)
  const stripAffixes = (str: string) =>
    str
      .replace(/^(fc|cf|sc|as|ac|rc|sv|vfb|vfl|afc|ogc|rb|tsg|bsc|sk|sl|aj|estac|sm)/, '')
      .replace(/(fc|cf|sc|as|ac|rc|sv|vfb|vfl|afc|ogc|rb|tsg|bsc|sk|sl|aj|estac|sm)$/, '')
      .replace(/(united|city|town|hotspur|wanderers|rovers|albion|athletic)$/, '');

  const strippedTarget = stripAffixes(target);
  if (strippedTarget.length >= 3) {
    for (const [key, info] of Object.entries(CLUB_MANAGERS)) {
      if (strippedTarget === stripAffixes(clean(key))) return info;
    }
  }

  // 3. Prefix / Contains match ordered by key length DESCENDING (prevents short words hijacking longer names)
  const sortedEntries = Object.entries(CLUB_MANAGERS).sort((a, b) => clean(b[0]).length - clean(a[0]).length);
  for (const [key, info] of sortedEntries) {
    const k = clean(key);
    // target contains the full key (e.g. "Paris Saint-Germain FC" contains "paris saint-germain")
    if (target.includes(k)) {
      return info;
    }
  }

  // 4. Stripped target contains stripped key (e.g. "staderennaisfc" stripped contains "rennais")
  if (strippedTarget.length >= 4) {
    for (const [key, info] of sortedEntries) {
      const strippedKey = stripAffixes(clean(key));
      if (strippedKey.length >= 4 && strippedTarget.includes(strippedKey)) {
        return info;
      }
    }
  }

  return { manager: 'First Team Head Coach', stadium: 'Home Stadium' };
}

class FootballApiService {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private teamDirectory: Map<string, ClubInfo> = new Map();
  private teamsByLeague: Map<number, ClubInfo[]> = new Map();
  private isTeamsIndexed = false;

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any, ttlSec: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSec * 1000
    });
  }

  // 1. Index all clubs across all tracked leagues from ESPN
  public async indexAllTeams(): Promise<void> {
    if (this.isTeamsIndexed) return;
    console.log('[FootballAPI] Indexing all clubs across Top 5 Leagues & UEFA...');

    for (const league of Object.values(TRACKED_LEAGUES)) {
      if (!league.espnCode) continue;

      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/teams`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;

        const json = await res.json();
        const teamsRaw = json.sports?.[0]?.leagues?.[0]?.teams || [];
        const leagueClubs: ClubInfo[] = [];

        for (const item of teamsRaw) {
          const t = item.team;
          if (!t) continue;

          const club: ClubInfo = {
            id: parseInt(t.id, 10),
            name: t.displayName || t.name,
            shortName: t.shortDisplayName || t.name,
            code: t.abbreviation,
            logo: t.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`,
            leagueId: league.id,
            espnLeagueCode: league.espnCode
          };

          leagueClubs.push(club);

          // Index by exact name and clean variants
          const norm = (str: string) => str.toLowerCase().trim().replace(/^fc\s+/, '').replace(/\s+fc$/, '').replace(/[\.\-]/g, '');
          this.teamDirectory.set(t.name.toLowerCase(), club);
          this.teamDirectory.set(t.displayName.toLowerCase(), club);
          this.teamDirectory.set(norm(t.name), club);
          this.teamDirectory.set(norm(t.displayName), club);
          if (t.shortDisplayName) this.teamDirectory.set(norm(t.shortDisplayName), club);
          if (t.abbreviation) this.teamDirectory.set(t.abbreviation.toLowerCase(), club);
        }

        this.teamsByLeague.set(league.id, leagueClubs);
      } catch (err) {
        console.warn(`[FootballAPI] Could not index teams for ${league.name}:`, err);
      }
    }

    this.isTeamsIndexed = true;
    console.log(`[FootballAPI] Successfully indexed ${this.teamDirectory.size} club name mappings across all leagues!`);
  }

  // Get list of teams for a specific league or all leagues
  public async getTeams(leagueId?: number): Promise<ClubInfo[]> {
    await this.indexAllTeams();
    if (leagueId) {
      return this.teamsByLeague.get(leagueId) || [];
    }
    const all: ClubInfo[] = [];
    for (const list of this.teamsByLeague.values()) {
      all.push(...list);
    }
    return all;
  }

  // Find team by query string (case-insensitive, alias aware, fuzzy friendly)
  public async findTeam(query: string): Promise<ClubInfo | null> {
    if (!query || typeof query !== 'string') return null;
    await this.indexAllTeams();

    let clean = query.toLowerCase().trim();
    // Strip query noise words (including manager / coach / stadium intent words)
    const stripped = clean.replace(/\b(schedule|fixtures|matches|match|vs|game|squad|roster|players|player|manager|coach|head|boss|gaffer|trainer|stadium|ground|arena|when|is|playing|next|who|the|now|live|scores?|of|for|about)\b/g, '').trim();

    // If query was just a generic status word without a team name, return null
    if (['', 'live', 'today', 'now', 'match', 'game', 'score', 'scores', 'table', 'standings'].includes(stripped)) {
      return null;
    }

    clean = stripped;

    // Check alias direct match
    if (TEAM_ALIASES[clean]) {
      clean = TEAM_ALIASES[clean];
    } else {
      for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
        const regex = new RegExp(`\\b${alias}\\b`, 'i');
        if (regex.test(clean)) {
          clean = canonical;
          break;
        }
      }
    }

    const norm = clean.replace(/^fc\s+/, '').replace(/\s+fc$/, '').replace(/[\.\-]/g, '').trim();

    // Exact match
    if (this.teamDirectory.has(clean)) return this.teamDirectory.get(clean)!;
    if (this.teamDirectory.has(norm)) return this.teamDirectory.get(norm)!;

    // Partial contains (require at least 4 chars for norm to prevent false prefixes)
    for (const [key, club] of this.teamDirectory.entries()) {
      if (key.length >= 4 && (norm.includes(key) || (norm.length >= 4 && key.includes(norm)))) {
        return club;
      }
    }
    return null;
  }

  // Resolve high-resolution portrait face for any soccer player via Wikipedia & ESPN
  public async getPlayerPhoto(playerName: string, espnId?: string): Promise<string> {
    const cleanName = (playerName || '').trim();
    if (!cleanName) return 'https://ui-avatars.com/api/?name=Player&background=10281b&color=00ff87&size=256&bold=true';

    const cacheKey = `photo:${cleanName.toLowerCase()}`;
    const cached = this.getCached<string>(cacheKey);
    if (cached) return cached;

    // 1. Try Wikipedia page images search API
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanName + ' footballer')}&gsrlimit=1&prop=pageimages&pithumbsize=320&format=json`;
      const res = await fetch(url, { headers: { 'User-Agent': 'GoalHubFootball/1.0 (contact@goalhub.com)' } });
      if (res.ok) {
        const json = await res.json();
        const pages = json.query?.pages || {};
        const firstPage = Object.values(pages)[0] as any;
        if (firstPage?.thumbnail?.source) {
          const photoUrl = firstPage.thumbnail.source;
          this.setCache(cacheKey, photoUrl, 86400 * 7); // Cache for 7 days
          return photoUrl;
        }
      }
    } catch (e) {}

    // 2. Check ESPN headshot if id provided
    if (espnId) {
      const espnUrl = `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png`;
      this.setCache(cacheKey, espnUrl, 86400);
      return espnUrl;
    }

    // 3. Fallback initials avatar
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=10281b&color=00ff87&size=256&bold=true`;
    return fallback;
  }

  // 2. Get Real Squad / Roster for ANY club (with Manager, Stadium & Player Photos)
  public async getTeamSquad(teamQuery: string): Promise<TeamSquad | null> {
    const team = await this.findTeam(teamQuery);
    if (!team) return null;

    const cacheKey = `squad:${team.id}`;
    const cached = this.getCached<TeamSquad>(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${team.espnLeagueCode}/teams/${team.id}/roster`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const athletes = json.athletes || [];
      const clubInfo = getClubInfo(team.name);

      const players: SquadPlayer[] = athletes.map((a: any) => {
        const headshot = a.headshot?.href || (a.id ? `https://a.espncdn.com/i/headshots/soccer/players/full/${a.id}.png` : '');
        return {
          id: a.id,
          name: a.displayName || a.fullName || 'Player',
          jersey: a.jersey || '-',
          position: a.position?.displayName || 'Player',
          photo: headshot
        };
      });

      const squadData: TeamSquad = {
        teamName: team.name,
        teamLogo: team.logo,
        manager: clubInfo.manager,
        stadium: clubInfo.stadium,
        players
      };

      this.setCache(cacheKey, squadData, 86400); // 24h cache
      return squadData;
    } catch (err) {
      console.warn(`[ESPN Free API] Squad fetch failed for ${team.name}:`, err);
      return null;
    }
  }

  // 3. Get Real Team Full Schedule (Upcoming + Recent from ESPN & DB)
  public async getTeamSchedule(teamQuery: string): Promise<Fixture[]> {
    const team = await this.findTeam(teamQuery);
    if (!team) return [];

    const cacheKey = `schedule:${team.id}`;
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    const fixturesMap = new Map<number, Fixture>();

    // 1. Check local database for any fixtures involving this team
    const dbFixtures = searchFixturesByTeam(team.name, 20);
    for (const f of dbFixtures) {
      fixturesMap.set(f.id, f);
    }
    if (team.shortName && team.shortName !== team.name) {
      for (const f of searchFixturesByTeam(team.shortName, 20)) {
        fixturesMap.set(f.id, f);
      }
    }

    // 2. Fetch official ESPN team schedule
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${team.espnLeagueCode}/teams/${team.id}/schedule`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.events)) {
          const league = TRACKED_LEAGUES[team.leagueId];
          for (const ev of json.events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;

            const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!homeComp || !awayComp) continue;

            const state = ev.status?.type?.state;
            let status: MatchStatus = 'NS';
            if (state === 'in') status = '1H';
            else if (state === 'post' || ev.status?.type?.completed) status = 'FT';

            const parseScore = (c: any) => {
              if (c.score?.value !== undefined) return c.score.value;
              if (typeof c.score === 'string' || typeof c.score === 'number') return parseInt(c.score, 10);
              return null;
            };

            const fId = parseInt(ev.id, 10) || Math.floor(Math.random() * 90000) + 10000;
            fixturesMap.set(fId, {
              id: fId,
              leagueId: team.leagueId,
              leagueName: league?.name || 'Football',
              leagueLogo: league?.logo || '',
              round: ev.status?.type?.detail || ev.seasonType?.name || '',
              kickoff: ev.date || new Date().toISOString(),
              status,
              statusText: ev.status?.type?.description || (status === 'FT' ? 'Finished' : 'Scheduled'),
              elapsed: null,
              homeTeam: {
                id: parseInt(homeComp.team?.id, 10) || 1,
                name: homeComp.team?.displayName || 'Home',
                code: homeComp.team?.abbreviation,
                logo: homeComp.team?.logo || ''
              },
              awayTeam: {
                id: parseInt(awayComp.team?.id, 10) || 2,
                name: awayComp.team?.displayName || 'Away',
                code: awayComp.team?.abbreviation,
                logo: awayComp.team?.logo || ''
              },
              score: {
                home: parseScore(homeComp),
                away: parseScore(awayComp)
              },
              venue: comp.venue?.fullName || undefined
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[ESPN Free API] Schedule fetch failed for ${team.name}:`, err);
    }

    const allFixtures = Array.from(fixturesMap.values());
    allFixtures.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

    if (allFixtures.length > 0) {
      saveFixtures(allFixtures);
      this.setCache(cacheKey, allFixtures, 300);
    }
    return allFixtures;
  }

  // 4. Fetch Full Fixture Schedule across multiple matchday dates
  public async getFixtures(leagueId: number): Promise<Fixture[]> {
    const cacheKey = `fixtures:${leagueId}`;
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached && cached.length > 2) return cached;

    const league = TRACKED_LEAGUES[leagueId];

    if (CONFIG.useEspnFreeLiveFeed && league?.espnCode) {
      try {
        // First fetch current scoreboard to get active calendar dates
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const json = await res.json();
          const rawCalendar = json.leagues?.[0]?.calendar || [];
          const allFixtures: Fixture[] = [];

          // Map today's matches
          const todayEvents = this.mapEspnEventsToFixtures(json.events || [], leagueId);
          allFixtures.push(...todayEvents);

          // Extract date strings safely (handles string arrays and UEFA nested object entries)
          const calendarDates: string[] = [];
          for (const item of rawCalendar) {
            if (typeof item === 'string') {
              calendarDates.push(item);
            } else if (item && typeof item === 'object') {
              if (Array.isArray(item.entries)) {
                for (const entry of item.entries) {
                  if (typeof entry === 'string') calendarDates.push(entry);
                  else if (entry?.value) calendarDates.push(entry.value);
                  else if (entry?.startDate) calendarDates.push(entry.startDate);
                }
              } else if (item.startDate) {
                calendarDates.push(item.startDate);
              }
            }
          }

          // Find upcoming dates in calendar and fetch next 3 match dates to show the full schedule!
          const nowIso = new Date().toISOString().split('T')[0];
          const upcomingDates = calendarDates
            .map((c: string) => (typeof c === 'string' ? c.split('T')[0].replace(/-/g, '') : ''))
            .filter((dStr: string) => {
              if (!dStr || dStr.length < 8) return false;
              const dIso = `${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}`;
              return dIso >= nowIso;
            })
            .slice(0, 3);

          for (const dateParam of upcomingDates) {
            try {
              const dateUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/scoreboard?dates=${dateParam}`;
              const dRes = await fetch(dateUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              if (dRes.ok) {
                const dJson = await dRes.json();
                const dEvents = this.mapEspnEventsToFixtures(dJson.events || [], leagueId);
                for (const ev of dEvents) {
                  if (!allFixtures.some(existing => existing.id === ev.id)) {
                    allFixtures.push(ev);
                  }
                }
              }
            } catch (e) {}
          }

          if (allFixtures.length > 0) {
            saveFixtures(allFixtures);
            this.setCache(cacheKey, allFixtures, 300);
            return allFixtures;
          }
        }
      } catch (err) {
        console.warn(`[ESPN Free API] Error fetching full fixtures for ${league?.name}:`, err);
      }
    }

    const dbFixtures = getFixturesByLeague(leagueId);
    if (dbFixtures.length > 0) {
      this.setCache(cacheKey, dbFixtures, 60);
      return dbFixtures;
    }

    return [];
  }

  // Statistical European Club Power Ratings (Base strength 50-95)
  private getClubRating(name: string): number {
    const clean = (name || '').toLowerCase().trim();
    const RATINGS: Record<string, number> = {
      'manchester city': 92, 'man city': 92, 'real madrid': 92, 'bayern munich': 90,
      'liverpool': 90, 'arsenal': 89, 'barcelona': 88, 'inter milan': 88, 'inter': 88,
      'paris saint-germain': 87, 'psg': 87, 'bayer leverkusen': 87, 'leverkusen': 87,
      'atletico madrid': 85, 'chelsea': 84, 'juventus': 84, 'atalanta': 83,
      'borussia dortmund': 83, 'dortmund': 83, 'sporting cp': 83, 'sporting': 83,
      'tottenham hotspur': 82, 'spurs': 82, 'ac milan': 82, 'milan': 82,
      'aston villa': 82, 'newcastle united': 81, 'newcastle': 81, 'brighton': 80,
      'napoli': 82, 'roma': 81, 'lazio': 80, 'monaco': 80, 'marseille': 80,
      'athletic club': 80, 'real sociedad': 79, 'villarreal': 79, 'eintracht frankfurt': 79,
      'rb leipzig': 81, 'leipzig': 81, 'vfb stuttgart': 79, 'stuttgart': 79,
      'feyenoord': 78, 'psv': 79, 'benfica': 81, 'porto': 80,
      'west ham united': 78, 'west ham': 78, 'manchester united': 82, 'man utd': 82,
      'nottingham forest': 77, 'fulham': 77, 'brentford': 77, 'bournemouth': 77,
      'crystal palace': 76, 'everton': 75, 'wolves': 75, 'leicester city': 75,
      'ipswich town': 70, 'southampton': 70, 'girona': 79, 'celta vigo': 76,
      'sevilla': 78, 'real betis': 78, 'mallorca': 75, 'osasuna': 75, 'valencia': 76,
      'torino': 76, 'fiorentina': 79, 'bologna': 78, 'como': 74, 'parma': 73,
      'freiburg': 77, 'wolfsburg': 76, 'werder bremen': 75, 'mainz': 74, 'heidenheim': 74,
      'lille': 79, 'lens': 77, 'nice': 77, 'lyon': 78, 'rennes': 77, 'reims': 75
    };
    for (const [k, v] of Object.entries(RATINGS)) {
      if (clean.includes(k) || k.includes(clean)) return v;
    }
    return 74;
  }

  // Real Match Prediction Engine (Odds + In-Play Game Flow + Club Rating Baseline)
  public calculatePrediction(f: Partial<Fixture>, rawComp?: any): MatchPrediction {
    // 1. Try betting odds from ESPN comp if available
    const odds = rawComp?.odds?.[0] || rawComp?.pickcenter?.[0];
    if (odds?.homeTeamOdds?.moneyLine !== undefined && odds?.awayTeamOdds?.moneyLine !== undefined) {
      const hML = parseFloat(odds.homeTeamOdds.moneyLine);
      const aML = parseFloat(odds.awayTeamOdds.moneyLine);
      const dML = parseFloat(odds.drawOdds?.moneyLine || '270');

      if (!isNaN(hML) && !isNaN(aML) && !isNaN(dML)) {
        const toProb = (ml: number) => ml < 0 ? Math.abs(ml) / (Math.abs(ml) + 100) : 100 / (ml + 100);
        const hProb = toProb(hML);
        const aProb = toProb(aML);
        const dProb = toProb(dML);
        const total = hProb + aProb + dProb;
        if (total > 0) {
          const homeWinPct = Math.max(5, Math.min(90, Math.round((hProb / total) * 100)));
          const awayWinPct = Math.max(5, Math.min(90, Math.round((aProb / total) * 100)));
          const drawPct = Math.max(5, 100 - homeWinPct - awayWinPct);
          return { homeWinPct, drawPct, awayWinPct, source: 'odds' };
        }
      }
    }

    // 2. If In-Play Live Match: dynamically calculate based on score & clock
    if (f.status && f.status !== 'NS' && f.score && f.score.home !== null && f.score.away !== null) {
      const hScore = f.score.home ?? 0;
      const aScore = f.score.away ?? 0;
      const elapsed = Math.max(1, Math.min(90, f.elapsed || 45));
      const diff = hScore - aScore;
      const timeRemainingFactor = (90 - elapsed) / 90;

      if (f.status === 'FT' || f.status === 'AET') {
        if (diff > 0) return { homeWinPct: 100, drawPct: 0, awayWinPct: 0, source: 'live' };
        if (diff < 0) return { homeWinPct: 0, drawPct: 0, awayWinPct: 100, source: 'live' };
        return { homeWinPct: 0, drawPct: 100, awayWinPct: 0, source: 'live' };
      }

      if (diff > 0) {
        const leadMultiplier = diff >= 2 ? 0.92 : 0.72;
        const homeWinPct = Math.min(95, Math.round(50 + (leadMultiplier * 45) + ((1 - timeRemainingFactor) * 20)));
        const drawPct = Math.max(3, Math.round((100 - homeWinPct) * 0.75));
        const awayWinPct = Math.max(1, 100 - homeWinPct - drawPct);
        return { homeWinPct, drawPct, awayWinPct, source: 'live' };
      } else if (diff < 0) {
        const leadMultiplier = Math.abs(diff) >= 2 ? 0.92 : 0.72;
        const awayWinPct = Math.min(95, Math.round(50 + (leadMultiplier * 45) + ((1 - timeRemainingFactor) * 20)));
        const drawPct = Math.max(3, Math.round((100 - awayWinPct) * 0.75));
        const homeWinPct = Math.max(1, 100 - awayWinPct - drawPct);
        return { homeWinPct, drawPct, awayWinPct, source: 'live' };
      } else {
        const drawPct = Math.min(75, Math.round(30 + ((1 - timeRemainingFactor) * 40)));
        const rem = 100 - drawPct;
        const hRating = this.getClubRating(f.homeTeam?.name || '');
        const aRating = this.getClubRating(f.awayTeam?.name || '');
        const hShare = (hRating + 4) / (hRating + 4 + aRating);
        const homeWinPct = Math.round(rem * hShare);
        const awayWinPct = rem - homeWinPct;
        return { homeWinPct, drawPct, awayWinPct, source: 'live' };
      }
    }

    // 3. Pre-Match Model based on Club Power Ratings + Home Ground Advantage
    const homeRating = this.getClubRating(f.homeTeam?.name || '') + 6;
    const awayRating = this.getClubRating(f.awayTeam?.name || '');
    const ratingDiff = homeRating - awayRating;

    const drawBase = Math.max(18, Math.min(30, 26 - Math.round(Math.abs(ratingDiff) * 0.4)));
    const winPool = 100 - drawBase;

    const seed = ((f.id || 12345) % 7) - 3; // Deterministic subtle match nuance (-3 to +3%)
    const expFactor = 1 / (1 + Math.pow(10, -ratingDiff / 28));
    let homeWinPct = Math.round(winPool * expFactor) + seed;
    homeWinPct = Math.max(10, Math.min(85, homeWinPct));
    let drawPct = drawBase;
    let awayWinPct = 100 - homeWinPct - drawPct;

    if (awayWinPct < 5) {
      awayWinPct = 5;
      homeWinPct = 100 - drawPct - awayWinPct;
    }

    return {
      homeWinPct,
      drawPct,
      awayWinPct,
      source: 'form'
    };
  }

  // Realistic Fallback: Build Projected 11 from official club squad if official matchday teamsheet not yet released
  public buildProjectedLineup(players: SquadPlayer[]): { starters: LineupPlayer[]; substitutes: LineupPlayer[] } {
    const starters: LineupPlayer[] = [];
    const substitutes: LineupPlayer[] = [];

    const gks: LineupPlayer[] = [];
    const defs: LineupPlayer[] = [];
    const mids: LineupPlayer[] = [];
    const fwds: LineupPlayer[] = [];

    for (const p of players) {
      const lp: LineupPlayer = {
        id: p.id || Math.random().toString(36).substring(7),
        name: p.name,
        jersey: p.jersey || '-',
        position: p.position || 'Player',
        starter: false,
        captain: false
      };
      const pos = (p.position || '').toLowerCase();
      if (pos.includes('goalkeeper') || pos === 'gk' || pos === 'g') {
        gks.push(lp);
      } else if (pos.includes('back') || pos.includes('def') || pos === 'cb' || pos === 'lb' || pos === 'rb' || pos === 'd') {
        defs.push(lp);
      } else if (pos.includes('mid') || pos === 'cm' || pos === 'cdm' || pos === 'cam' || pos === 'm') {
        mids.push(lp);
      } else {
        fwds.push(lp);
      }
    }

    // Pick 1 GK, 4 DEF, 3 MID, 3 FWD
    if (gks.length > 0) starters.push({ ...gks.shift()!, starter: true });
    for (let i = 0; i < 4 && defs.length > 0; i++) starters.push({ ...defs.shift()!, starter: true });
    for (let i = 0; i < 3 && mids.length > 0; i++) starters.push({ ...mids.shift()!, starter: true });
    for (let i = 0; i < 3 && fwds.length > 0; i++) starters.push({ ...fwds.shift()!, starter: true });

    // Fill up to 11 if needed
    const remaining = [...defs, ...mids, ...fwds, ...gks];
    while (starters.length < 11 && remaining.length > 0) {
      starters.push({ ...remaining.shift()!, starter: true });
    }

    if (starters.length > 1) {
      starters[1].captain = true;
    }

    substitutes.push(...remaining);
    return { starters, substitutes };
  }

  // Helper to map ESPN events array to our Fixture model
  private mapEspnEventsToFixtures(events: any[], leagueId: number): Fixture[] {
    const league = TRACKED_LEAGUES[leagueId];
    const fixtures: Fixture[] = [];

    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;

      const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!homeComp || !awayComp) continue;

      const state = ev.status?.type?.state;
      let status: MatchStatus = 'NS';
      if (state === 'in') status = '1H';
      else if (state === 'post' || ev.status?.type?.completed) status = 'FT';

      const elapsed = ev.status?.displayClock ? parseInt(ev.status.displayClock, 10) : null;
      const homeScore = homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null;
      const awayScore = awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null;

      const eventsList: MatchEvent[] = [];
      if (Array.isArray(comp.details)) {
        for (const d of comp.details) {
          if (d.type?.text?.toLowerCase().includes('goal')) {
            eventsList.push({
              time: { elapsed: parseInt(d.clock?.displayValue || '0', 10) },
              team: { id: d.team?.id ? parseInt(d.team.id, 10) : 0, name: d.team?.displayName || 'Team' },
              player: { name: d.athletesInvolved?.[0]?.displayName || 'Scorer' },
              type: 'Goal',
              detail: d.type?.text || 'Goal'
            });
          }
        }
      }

      const fixObj: Fixture = {
        id: parseInt(ev.id, 10) || Math.floor(Math.random() * 90000) + 10000,
        leagueId,
        leagueName: league?.name || 'Football',
        leagueLogo: league?.logo || '',
        round: ev.status?.type?.detail || '',
        kickoff: ev.date || new Date().toISOString(),
        status,
        statusText: ev.status?.type?.description || 'Scheduled',
        elapsed,
        homeTeam: {
          id: parseInt(homeComp.team?.id, 10) || 1,
          name: homeComp.team?.displayName || 'Home',
          code: homeComp.team?.abbreviation,
          logo: homeComp.team?.logo || ''
        },
        awayTeam: {
          id: parseInt(awayComp.team?.id, 10) || 2,
          name: awayComp.team?.displayName || 'Away',
          code: awayComp.team?.abbreviation,
          logo: awayComp.team?.logo || ''
        },
        score: {
          home: homeScore,
          away: awayScore
        },
        venue: comp.venue?.fullName ? `${comp.venue.fullName}, ${comp.venue.address?.city || ''}` : undefined,
        events: eventsList
      };

      fixObj.prediction = this.calculatePrediction(fixObj, comp);
      fixtures.push(fixObj);
    }

    return fixtures;
  }

  // 5. Get Live Matches (In-play only)
  public async getLiveMatches(): Promise<Fixture[]> {
    const cacheKey = 'fixtures:live';
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    if (CONFIG.useEspnFreeLiveFeed) {
      const allPromises = Object.values(TRACKED_LEAGUES).map(async (l) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.espnCode}/scoreboard`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return [];
          const json = await res.json();
          return this.mapEspnEventsToFixtures(json.events || [], l.id);
        } catch {
          return [];
        }
      });

      const results = await Promise.all(allPromises);
      const live = results.flat().filter(f => ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status));
      if (live.length > 0) {
        this.setCache(cacheKey, live, 20);
        return live;
      }
    }

    const dbLive = getLiveFixturesFromDb();
    if (dbLive.length > 0) {
      this.setCache(cacheKey, dbLive, 15);
      return dbLive;
    }

    // Absolutely zero mock data fallback
    this.setCache(cacheKey, [], 20);
    return [];
  }

  // 5b. Get Today's Real Scoreboard Matches (Active, Upcoming or Finished Today)
  public async getTodayMatches(): Promise<Fixture[]> {
    const cacheKey = 'fixtures:today';
    const cached = this.getCached<Fixture[]>(cacheKey);
    if (cached) return cached;

    if (CONFIG.useEspnFreeLiveFeed) {
      const allPromises = Object.values(TRACKED_LEAGUES).map(async (l) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.espnCode}/scoreboard`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return [];
          const json = await res.json();
          return this.mapEspnEventsToFixtures(json.events || [], l.id);
        } catch {
          return [];
        }
      });

      const results = await Promise.all(allPromises);
      const today = results.flat();
      today.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      this.setCache(cacheKey, today, 60);
      return today;
    }

    return [];
  }

  // 6. Get Standings (Enhanced for Top 5 Leagues & UEFA 36-team Swiss Stage)
  public async getStandings(leagueId: number): Promise<StandingTeam[]> {
    const cacheKey = `standings:${leagueId}`;
    const cached = this.getCached<StandingTeam[]>(cacheKey);
    if (cached) return cached;

    const league = TRACKED_LEAGUES[leagueId];
    if (league?.espnCode) {
      try {
        const url = `https://site.web.api.espn.com/apis/v2/sports/soccer/${league.espnCode}/standings`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const json = await res.json();
          let entries: any[] = [];
          if (Array.isArray(json.children)) {
            for (const child of json.children) {
              if (Array.isArray(child.standings?.entries)) {
                entries.push(...child.standings.entries);
              }
            }
          }
          if (entries.length === 0) {
            entries = json.standings?.[0]?.entries || [];
          }

          if (Array.isArray(entries) && entries.length > 0) {
            const list: StandingTeam[] = entries.map((item: any, idx: number) => {
              const getStat = (name: string) => item.stats?.find((s: any) => s.name === name)?.value ?? 0;
              return {
                rank: idx + 1,
                team: {
                  id: parseInt(item.team?.id, 10) || idx + 1,
                  name: item.team?.displayName || item.team?.name || 'Club',
                  logo: item.team?.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${item.team?.id}.png`
                },
                points: getStat('points'),
                goalsDiff: getStat('pointDifferential') || getStat('goalDifference'),
                played: getStat('gamesPlayed'),
                win: getStat('wins'),
                draw: getStat('ties'),
                lose: getStat('losses'),
                form: item.stats?.find((s: any) => s.name === 'form')?.displayValue
              };
            });
            this.setCache(cacheKey, list, 3600);
            return list;
          }
        }
      } catch (e) {
        console.warn(`[FootballAPI] Standings fetch failed for ${league.name}:`, e);
      }
    }

    return [];
  }

  // 7. Match Center Details (Lineups, Formations, Dual-Team Stats, Key Events Timeline)
  public async getMatchDetails(matchId: number, leagueCode?: string): Promise<MatchDetails | null> {
    const cacheKey = `match:details:${matchId}`;
    const cached = this.getCached<MatchDetails>(cacheKey);
    if (cached) return cached;

    // Determine candidate league codes
    const candidates = leagueCode ? [leagueCode] : Object.values(TRACKED_LEAGUES).map(l => l.espnCode);

    for (const code of candidates) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/summary?event=${matchId}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;

        const json = await res.json();
        const header = json.header;
        if (!header) continue;

        const comp = header.competitions?.[0];
        if (!comp) continue;

        const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
        const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
        if (!homeComp || !awayComp) continue;

        const state = header.status?.type?.state;
        let status: MatchStatus = 'NS';
        if (state === 'in') status = '1H';
        else if (state === 'post' || header.status?.type?.completed) status = 'FT';

        const fixture: Fixture = {
          id: matchId,
          leagueId: 0,
          leagueName: header.league?.name || 'Football',
          leagueLogo: header.league?.logos?.[0]?.href || '',
          round: header.season?.name || comp.round || '',
          kickoff: comp.date || new Date().toISOString(),
          status,
          statusText: header.status?.type?.description || 'Scheduled',
          elapsed: header.status?.displayClock ? parseInt(header.status.displayClock, 10) : null,
          homeTeam: {
            id: parseInt(homeComp.team?.id, 10) || 1,
            name: homeComp.team?.displayName || 'Home',
            code: homeComp.team?.abbreviation,
            logo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || ''
          },
          awayTeam: {
            id: parseInt(awayComp.team?.id, 10) || 2,
            name: awayComp.team?.displayName || 'Away',
            code: awayComp.team?.abbreviation,
            logo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || ''
          },
          score: {
            home: homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null,
            away: awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null
          },
          venue: comp.venue?.fullName ? `${comp.venue.fullName}, ${comp.venue.address?.city || ''}` : undefined,
          events: []
        };

        // Extract dual-team stats
        const stats: MatchStatComparison[] = [];
        const homeStatsRaw = json.boxscore?.teams?.find((t: any) => t.team?.id === homeComp.team?.id)?.statistics || [];
        const awayStatsRaw = json.boxscore?.teams?.find((t: any) => t.team?.id === awayComp.team?.id)?.statistics || [];

        const statDefinitions = [
          { name: 'possessionPct', label: 'Possession %' },
          { name: 'totalShots', label: 'Total Shots' },
          { name: 'shotsOnTarget', label: 'Shots on Target' },
          { name: 'wonCorners', label: 'Corner Kicks' },
          { name: 'foulsCommitted', label: 'Fouls Committed' },
          { name: 'yellowCards', label: 'Yellow Cards' },
          { name: 'redCards', label: 'Red Cards' },
          { name: 'accuratePasses', label: 'Passes Completed' }
        ];

        for (const def of statDefinitions) {
          const hStat = homeStatsRaw.find((s: any) => s.name === def.name)?.displayValue ?? '0';
          const aStat = awayStatsRaw.find((s: any) => s.name === def.name)?.displayValue ?? '0';
          const hNum = parseFloat(String(hStat).replace('%', '')) || 0;
          const aNum = parseFloat(String(aStat).replace('%', '')) || 0;
          const sum = hNum + aNum;
          const homePct = sum > 0 ? Math.round((hNum / sum) * 100) : 50;
          const awayPct = 100 - homePct;

          stats.push({
            name: def.name,
            label: def.label,
            homeValue: hStat,
            awayValue: aStat,
            homePct,
            awayPct
          });
        }

        // Extract Lineups (Starting XI + Bench Substitutes)
        const mapRoster = (rawRoster: any[]): { starters: LineupPlayer[]; substitutes: LineupPlayer[] } => {
          const starters: LineupPlayer[] = [];
          const substitutes: LineupPlayer[] = [];
          if (!Array.isArray(rawRoster)) return { starters, substitutes };

          for (const item of rawRoster) {
            const ath = item.athlete || item;
            const p: LineupPlayer = {
              id: String(ath.id || Math.random().toString(36).substring(7)),
              name: ath.displayName || ath.name || 'Player',
              jersey: String(ath.jersey ?? item.jersey ?? '-'),
              position: ath.position?.name || ath.position?.abbreviation || item.position || '',
              starter: !!item.starter,
              captain: !!item.captain
            };
            if (item.starter) {
              starters.push(p);
            } else {
              substitutes.push(p);
            }
          }
          return { starters, substitutes };
        };

        const homeRosterRaw = json.rosters?.find((r: any) => r.homeAway === 'home');
        const awayRosterRaw = json.rosters?.find((r: any) => r.homeAway === 'away');

        let homeLineupMapped = mapRoster(homeRosterRaw?.roster || []);
        let awayLineupMapped = mapRoster(awayRosterRaw?.roster || []);

        const homeConfirmed = homeLineupMapped.starters.length >= 11;
        const awayConfirmed = awayLineupMapped.starters.length >= 11;

        if (homeLineupMapped.starters.length < 11) {
          try {
            const homeSquad = await this.getTeamSquad(fixture.homeTeam.name);
            if (homeSquad && Array.isArray(homeSquad.players) && homeSquad.players.length >= 11) {
              homeLineupMapped = this.buildProjectedLineup(homeSquad.players);
            }
          } catch {}
        }

        if (awayLineupMapped.starters.length < 11) {
          try {
            const awaySquad = await this.getTeamSquad(fixture.awayTeam.name);
            if (awaySquad && Array.isArray(awaySquad.players) && awaySquad.players.length >= 11) {
              awayLineupMapped = this.buildProjectedLineup(awaySquad.players);
            }
          } catch {}
        }

        fixture.prediction = this.calculatePrediction(fixture, comp);

        const lineups = {
          home: {
            team: fixture.homeTeam,
            formation: homeRosterRaw?.formation || '4-3-3',
            coach: getClubInfo(fixture.homeTeam.name).manager,
            starters: homeLineupMapped.starters,
            substitutes: homeLineupMapped.substitutes,
            confirmed: homeConfirmed,
            isProjected: !homeConfirmed
          },
          away: {
            team: fixture.awayTeam,
            formation: awayRosterRaw?.formation || '4-3-3',
            coach: getClubInfo(fixture.awayTeam.name).manager,
            starters: awayLineupMapped.starters,
            substitutes: awayLineupMapped.substitutes,
            confirmed: awayConfirmed,
            isProjected: !awayConfirmed
          }
        };

        // Extract Events Timeline (Goals, Cards, Subs)
        const timeline: MatchEvent[] = [];
        if (Array.isArray(json.keyEvents)) {
          for (const ev of json.keyEvents) {
            const isGoal = ev.type?.type === 'goal' || ev.type?.text?.toLowerCase().includes('goal') || ev.scoringPlay;
            const isCard = ev.type?.type === 'card' || ev.type?.text?.toLowerCase().includes('card');
            const isSub = ev.type?.type === 'substitution' || ev.type?.text?.toLowerCase().includes('sub');

            timeline.push({
              id: ev.id,
              time: { elapsed: parseInt(ev.clock?.displayValue || String(ev.period?.number ? ev.period.number * 45 : 0), 10) },
              team: {
                id: ev.team?.id ? parseInt(ev.team.id, 10) : 0,
                name: ev.team?.displayName || ''
              },
              player: {
                id: ev.participants?.[0]?.athlete?.id ? parseInt(ev.participants[0].athlete.id, 10) : undefined,
                name: ev.participants?.[0]?.athlete?.displayName || ev.text || ''
              },
              type: isGoal ? 'Goal' : isCard ? 'Card' : isSub ? 'subst' : 'Var',
              detail: ev.type?.text || ev.text || ''
            });
          }
        }

        // Extract Commentary
        const commentary: string[] = [];
        if (Array.isArray(json.commentary)) {
          for (const c of json.commentary.slice(0, 15)) {
            if (c.text) commentary.push(`${c.time?.displayValue ? c.time.displayValue + ' - ' : ''}${c.text}`);
          }
        }

        const matchDetails: MatchDetails = {
          fixture,
          stats,
          lineups,
          timeline,
          commentary
        };

        this.setCache(cacheKey, matchDetails, status === 'FT' ? 1800 : 30);
        return matchDetails;
      } catch (err) {
        // try next candidate league code
      }
    }
    return null;
  }

  // 8. Head-to-Head (H2H) Module: W/D/L record, last 5-10 meetings, score history
  public async getHeadToHead(team1Query: string, team2Query: string): Promise<H2HSummary | null> {
    const t1 = await this.findTeam(team1Query);
    const t2 = await this.findTeam(team2Query);
    if (!t1 || !t2) return null;

    const cacheKey = `h2h:${t1.id}:${t2.id}`;
    const cached = this.getCached<H2HSummary>(cacheKey);
    if (cached) return cached;

    const meetings: H2HMeeting[] = [];
    const seenEventIds = new Set<number>();
    const currentYear = new Date().getFullYear();
    const seasons = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

    // Fetch team 1's schedule & match history across multiple seasons to capture past meetings
    await Promise.all(
      seasons.map(async (yr) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${t1.espnLeagueCode}/teams/${t1.id}/schedule?season=${yr}`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!res.ok) return;

          const json = await res.json();
          const events = json.events || [];
          for (const ev of events) {
            const evId = parseInt(ev.id, 10);
            if (seenEventIds.has(evId)) continue;

            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!homeComp || !awayComp) continue;

            const hId = parseInt(homeComp.team?.id, 10);
            const aId = parseInt(awayComp.team?.id, 10);

            if ((hId === t1.id && aId === t2.id) || (hId === t2.id && aId === t1.id)) {
              seenEventIds.add(evId);
              const hScore = homeComp.score?.value ?? (homeComp.score?.displayValue !== undefined ? parseInt(homeComp.score.displayValue, 10) : (homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null));
              const aScore = awayComp.score?.value ?? (awayComp.score?.displayValue !== undefined ? parseInt(awayComp.score.displayValue, 10) : (awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null));

              let winnerId: number | null = null;
              if (hScore !== null && aScore !== null) {
                if (hScore > aScore) winnerId = hId;
                else if (aScore > hScore) winnerId = aId;
              }

              meetings.push({
                id: evId,
                date: ev.date || new Date().toISOString(),
                competition: ev.season?.name || comp.notes?.[0]?.headline || 'Direct Match',
                homeTeam: {
                  id: hId,
                  name: homeComp.team?.displayName || 'Home',
                  logo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${hId}.png`
                },
                awayTeam: {
                  id: aId,
                  name: awayComp.team?.displayName || 'Away',
                  logo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${aId}.png`
                },
                score: { home: hScore, away: aScore },
                winnerId
              });
            }
          }
        } catch (e) {}
      })
    );

    // Sort by date descending and cap to last 10 meetings
    meetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentMeetings = meetings.slice(0, 10);

    let t1Wins = 0;
    let t2Wins = 0;
    let draws = 0;
    let t1Goals = 0;
    let t2Goals = 0;

    for (const m of recentMeetings) {
      if (m.winnerId === t1.id) t1Wins++;
      else if (m.winnerId === t2.id) t2Wins++;
      else if (m.score.home !== null && m.score.away !== null) draws++;

      if (m.homeTeam.id === t1.id) {
        t1Goals += m.score.home || 0;
        t2Goals += m.score.away || 0;
      } else {
        t2Goals += m.score.home || 0;
        t1Goals += m.score.away || 0;
      }
    }

    const summary: H2HSummary = {
      team1: { id: t1.id, name: t1.name, logo: t1.logo, code: t1.code },
      team2: { id: t2.id, name: t2.name, logo: t2.logo, code: t2.code },
      totalMatches: recentMeetings.length,
      team1Wins: t1Wins,
      draws,
      team2Wins: t2Wins,
      team1Goals: t1Goals,
      team2Goals: t2Goals,
      recentMeetings
    };

    this.setCache(cacheKey, summary, 600);
    return summary;
  }

  // 9. League Leaders (Top Scorers, Assists & Golden Glove Clean Sheets per League)
  public async getLeagueLeaders(leagueId: number): Promise<LeagueLeaders | null> {
    const cacheKey = `leaders:${leagueId}`;
    const cached = this.getCached<LeagueLeaders>(cacheKey);
    if (cached) return cached;

    const league = TRACKED_LEAGUES[leagueId];
    if (!league?.espnCode) return null;

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnCode}/statistics`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const statsCategories = json.stats || [];

      const parseCategory = (name: string): LeagueLeaderPlayer[] => {
        const cat = statsCategories.find((c: any) => c.name === name || c.displayName?.toLowerCase().includes(name));
        if (!cat || !Array.isArray(cat.leaders)) return [];

        return cat.leaders.slice(0, 15).map((l: any, idx: number) => {
          const ath = l.athlete || {};
          const team = ath.team || {};
          let apps = 0;
          const matchMatch = (l.displayValue || '').match(/Matches:\s*(\d+)/i);
          if (matchMatch) apps = parseInt(matchMatch[1], 10);

          return {
            rank: idx + 1,
            id: String(ath.id || idx + 1),
            name: ath.displayName || 'Player',
            shortName: ath.shortName || ath.displayName,
            jersey: ath.jersey || '',
            team: {
              id: parseInt(team.id, 10) || 0,
              name: team.displayName || team.name || 'Club',
              logo: team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
            },
            appearances: apps,
            value: l.value ?? 0,
            displayValue: l.displayValue || String(l.value ?? 0)
          };
        });
      };

      const topScorers = parseCategory('goalsLeaders');
      const topAssists = parseCategory('assistsLeaders');

      // Top Goalkeepers / Golden Glove clean sheets registry for tracked leagues
      const LEAGUE_GKS: Record<number, Array<{ id: string; name: string; team: string; teamId: number }>> = {
        39: [ // Premier League
          { id: '196176', name: 'David Raya', team: 'Arsenal', teamId: 359 },
          { id: '196876', name: 'Alisson Becker', team: 'Liverpool', teamId: 364 },
          { id: '204664', name: 'Ederson', team: 'Manchester City', teamId: 382 },
          { id: '238356', name: 'Robert Sánchez', team: 'Chelsea', teamId: 363 },
          { id: '204082', name: 'Guglielmo Vicario', team: 'Tottenham Hotspur', teamId: 367 },
          { id: '214251', name: 'André Onana', team: 'Manchester United', teamId: 360 },
          { id: '160416', name: 'Emiliano Martínez', team: 'Aston Villa', teamId: 362 },
          { id: '175908', name: 'Nick Pope', team: 'Newcastle United', teamId: 361 },
          { id: '175936', name: 'Matz Sels', team: 'Nottingham Forest', teamId: 393 },
          { id: '175883', name: 'Jordan Pickford', team: 'Everton', teamId: 368 },
          { id: '270765', name: 'Bart Verbruggen', team: 'Brighton & Hove Albion', teamId: 331 }
        ],
        140: [ // La Liga
          { id: '149622', name: 'Jan Oblak', team: 'Atlético Madrid', teamId: 1068 },
          { id: '134283', name: 'Thibaut Courtois', team: 'Real Madrid', teamId: 86 },
          { id: '131634', name: 'Wojciech Szczesny', team: 'Barcelona', teamId: 83 },
          { id: '257237', name: 'Andriy Lunin', team: 'Real Madrid', teamId: 86 },
          { id: '187946', name: 'Dominik Livakovic', team: 'Barcelona', teamId: 83 },
          { id: '177927', name: 'Juan Musso', team: 'Atlético Madrid', teamId: 1068 }
        ],
        78: [ // Bundesliga
          { id: '84774', name: 'Manuel Neuer', team: 'Bayern Munich', teamId: 132 },
          { id: '161825', name: 'Janis Blaswich', team: 'Bayer Leverkusen', teamId: 131 },
          { id: '228965', name: 'Gregor Kobel', team: 'Borussia Dortmund', teamId: 124 },
          { id: '113733', name: 'Sven Ulreich', team: 'Bayern Munich', teamId: 132 }
        ],
        135: [ // Serie A
          { id: '181836', name: 'Ivan Provedel', team: 'Lazio', teamId: 112 },
          { id: '240533', name: 'Josep Martínez', team: 'Inter Milan', teamId: 110 },
          { id: '204082', name: 'Guglielmo Vicario', team: 'Juventus', teamId: 111 },
          { id: '259474', name: 'Kamil Grabara', team: 'Juventus', teamId: 111 }
        ],
        61: [ // Ligue 1
          { id: '248699', name: 'Matvei Safonov', team: 'Paris Saint-Germain', teamId: 160 },
          { id: '288925', name: 'Lucas Chevalier', team: 'Lille', teamId: 165 }
        ],
        2: [ // Champions League
          { id: '149622', name: 'Jan Oblak', team: 'Atlético Madrid', teamId: 1068 },
          { id: '196176', name: 'David Raya', team: 'Arsenal', teamId: 359 },
          { id: '196876', name: 'Alisson Becker', team: 'Liverpool', teamId: 364 },
          { id: '84774', name: 'Manuel Neuer', team: 'Bayern Munich', teamId: 132 },
          { id: '134283', name: 'Thibaut Courtois', team: 'Real Madrid', teamId: 86 },
          { id: '204664', name: 'Ederson', team: 'Manchester City', teamId: 382 }
        ]
      };

      const gkCandidates = LEAGUE_GKS[leagueId] || LEAGUE_GKS[39];
      const cleanSheetsRaw = await Promise.allSettled(
        gkCandidates.map(async (gk) => {
          try {
            const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${gk.id}`);
            if (!r.ok) return null;
            const d = await r.json();
            const stats = d.athlete?.statsSummary?.statistics || [];
            const cs = stats.find((s: any) => s.name === 'cleanSheet')?.value ?? 0;
            const sv = stats.find((s: any) => s.name === 'saves')?.value ?? 0;
            const ga = stats.find((s: any) => s.name === 'goalsConceded')?.value ?? 0;
            const appsItem = stats.find((s: any) => s.name === 'starts-subIns');
            let apps = 0;
            if (appsItem) {
              if (typeof appsItem.value === 'number') apps = appsItem.value;
              else if (appsItem.displayValue) {
                const m = appsItem.displayValue.match(/(\d+)/);
                if (m) apps = parseInt(m[1], 10);
              }
            }
            return {
              id: gk.id,
              name: d.athlete?.displayName || gk.name,
              shortName: d.athlete?.shortName || gk.name,
              jersey: d.athlete?.jersey || '1',
              team: {
                id: gk.teamId,
                name: gk.team,
                logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${gk.teamId}.png`
              },
              appearances: apps,
              value: cs,
              displayValue: `${cs} clean sheets (${sv} saves)`
            };
          } catch {
            return null;
          }
        })
      );

      const validGks = cleanSheetsRaw
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .sort((a, b) => b.value - a.value || b.appearances - a.appearances);

      const cleanSheetsRanked: LeagueLeaderPlayer[] = validGks.map((g, idx) => ({
        ...g,
        rank: idx + 1
      }));

      // Asynchronously enrich leaders with high-res portrait faces
      const enrichWithPhotos = async (list: LeagueLeaderPlayer[]) => {
        return Promise.all(
          list.map(async (p) => {
            const photo = await this.getPlayerPhoto(p.name, p.id);
            return { ...p, photo };
          })
        );
      };

      const [topScorersWithPhotos, topAssistsWithPhotos, cleanSheetsWithPhotos] = await Promise.all([
        enrichWithPhotos(topScorers),
        enrichWithPhotos(topAssists),
        enrichWithPhotos(cleanSheetsRanked)
      ]);

      const result: LeagueLeaders = {
        leagueId,
        leagueName: league.name,
        topScorers: topScorersWithPhotos,
        topAssists: topAssistsWithPhotos,
        cleanSheets: cleanSheetsWithPhotos
      };

      this.setCache(cacheKey, result, 1800);
      return result;
    } catch (err) {
      console.warn(`[FootballAPI] Failed to fetch leaders for ${league.name}:`, err);
      return null;
    }
  }

  // 10. Player Profile (Photo, Club, Position, Age, Season Stats & Goalkeeper Clean Sheets)
  public async getPlayerProfile(playerId: string | number): Promise<PlayerProfile | null> {
    const cacheKey = `player:${playerId}`;
    const cached = this.getCached<PlayerProfile>(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${playerId}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;

      const json = await res.json();
      const ath = json.athlete;
      if (!ath) return null;

      const team = ath.team || {};
      const statsSummary = ath.statsSummary?.statistics || [];

      const getStat = (names: string[]) => {
        const item = statsSummary.find((s: any) =>
          names.some(n => s.name?.toLowerCase() === n.toLowerCase() || s.name?.toLowerCase().includes(n.toLowerCase()))
        );
        if (!item) return 0;
        if (typeof item.value === 'number') return item.value;
        const parsed = parseFloat(item.displayValue);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Also parse starts-subIns if present e.g. "4 (0)" -> 4 appearances
      let apps = getStat(['appearances', 'gamesPlayed']);
      if (!apps) {
        const startsItem = statsSummary.find((s: any) => s.name === 'starts-subIns');
        if (startsItem) {
          if (typeof startsItem.value === 'number') {
            apps = startsItem.value;
          } else if (startsItem.displayValue) {
            const m = startsItem.displayValue.match(/(\d+)\s*\(\s*(\d+)\s*\)/);
            if (m) apps = parseInt(m[1], 10) + parseInt(m[2], 10);
            else apps = parseFloat(startsItem.displayValue) || 0;
          }
        }
      }

      const goals = getStat(['totalGoals', 'goals']);
      const assists = getStat(['goalAssists', 'assists']);
      const yellowCards = getStat(['yellowCards', 'yellow']);
      const redCards = getStat(['redCards', 'red']);
      const cleanSheets = getStat(['cleanSheet', 'cleansheets', 'cleanSheets']);
      const saves = getStat(['saves', 'save']);
      const goalsConceded = getStat(['goalsConceded', 'goalsAgainst']);
      const savePct = (saves + goalsConceded > 0) ? Math.round((saves / (saves + goalsConceded)) * 100) : undefined;

      const playerName = ath.displayName || ath.fullName || 'Player';
      const playerPhoto = await this.getPlayerPhoto(playerName, String(ath.id));

      const profile: PlayerProfile = {
        id: String(ath.id),
        name: playerName,
        fullName: ath.fullName,
        jersey: ath.jersey,
        photo: playerPhoto,
        position: ath.position?.displayName || ath.position?.name || 'Player',
        team: {
          id: parseInt(team.id, 10) || 0,
          name: team.displayName || team.name || 'Club',
          logo: team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
        },
        age: ath.age,
        birthDate: ath.displayDOB,
        height: ath.displayHeight,
        weight: ath.displayWeight,
        nationality: ath.citizenship || ath.citizenshipCountry,
        flag: ath.flag?.href,
        stats: {
          season: ath.statsSummary?.displayName || ath.statsSummary?.season?.displayName || '2024-25',
          appearances: apps,
          goals,
          assists,
          yellowCards,
          redCards,
          cleanSheets,
          saves,
          goalsConceded,
          savePct
        }
      };

      this.setCache(cacheKey, profile, 3600);
      return profile;
    } catch (err) {
      console.warn(`[FootballAPI] Failed to fetch player profile for ${playerId}:`, err);
      return null;
    }
  }

  // 12. European Soccer News Feed (Phase 3)
  public async getEuropeanNews(): Promise<NewsArticle[]> {
    const cacheKey = 'news:european';
    const cached = this.getCached<NewsArticle[]>(cacheKey);
    if (cached) return cached;

    try {
      const endpoints = [
        'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/news',
        'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/news'
      ];

      const responses = await Promise.allSettled(
        endpoints.map(url => fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()))
      );

      const articles: NewsArticle[] = [];
      const seenTitles = new Set<string>();

      for (const res of responses) {
        if (res.status !== 'fulfilled' || !Array.isArray(res.value?.articles)) continue;
        for (const a of res.value.articles) {
          if (!a.headline || seenTitles.has(a.headline)) continue;
          seenTitles.add(a.headline);

          const img = a.images?.[0]?.url || 'https://a.espncdn.com/photo/2024/0815/r1372776_1296x729_16-9.jpg';
          const cat = a.categories?.[1]?.description || a.categories?.[0]?.description || 'European Football';

          articles.push({
            id: String(a.id || Math.random().toString(36).substring(7)),
            title: a.headline,
            description: a.description || '',
            published: a.published || new Date().toISOString(),
            image: img,
            url: a.links?.web?.href || 'https://www.espn.com/soccer/',
            category: cat,
            byline: a.byline || 'ESPN Soccer'
          });
        }
      }

      // Sort newest first
      articles.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

      const topArticles = articles.slice(0, 30);
      this.setCache(cacheKey, topArticles, 600); // 10m cache
      return topArticles;
    } catch (err) {
      console.warn('[FootballAPI] Failed to fetch European news:', err);
      return [];
    }
  }

  // 11. Omnichannel Global Search (Teams, Players, Fixtures)
  public async globalSearch(query: string): Promise<GlobalSearchResult> {
    if (!query || typeof query !== 'string') {
      return { query: '', teams: [], players: [], fixtures: [] };
    }
    await this.indexAllTeams();

    const q = query.toLowerCase().trim();
    const matchingTeams: Team[] = [];
    const matchingPlayers: (SquadPlayer & { teamName: string; teamLogo: string; teamId: number })[] = [];

    // Search clubs
    for (const club of this.teamDirectory.values()) {
      if (club.name.toLowerCase().includes(q) || (club.shortName && club.shortName.toLowerCase().includes(q))) {
        if (!matchingTeams.some(t => t.id === club.id)) {
          matchingTeams.push({
            id: club.id,
            name: club.name,
            code: club.code,
            logo: club.logo
          });
        }
      }
      if (matchingTeams.length >= 6) break;
    }

    // Search players across cached squads
    for (const [key, cacheItem] of this.cache.entries()) {
      if (key.startsWith('squad:')) {
        const squad = cacheItem.data as TeamSquad;
        if (squad && Array.isArray(squad.players)) {
          for (const p of squad.players) {
            if (p.name.toLowerCase().includes(q)) {
              if (!matchingPlayers.some(existing => existing.id === p.id)) {
                matchingPlayers.push({
                  ...p,
                  teamName: squad.teamName,
                  teamLogo: squad.teamLogo || '',
                  teamId: 0
                });
              }
              if (matchingPlayers.length >= 8) break;
            }
          }
        }
      }
      if (matchingPlayers.length >= 8) break;
    }

    // Also search live athletes via ESPN search API if we have few players
    if (matchingPlayers.length < 5) {
      try {
        const searchUrl = `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=8`;
        const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (sRes.ok) {
          const sJson = await sRes.json();
          const results = sJson.results || [];
          for (const group of results) {
            const contents = group.contents || [];
            for (const item of contents) {
              if (item.sport === 'soccer' && item.type === 'player') {
                let pId = '';
                const uidMatch = (item.uid || '').match(/a:(\d+)/);
                if (uidMatch) pId = uidMatch[1];
                else {
                  const linkMatch = (item.link?.web || '').match(/\/id\/(\d+)/);
                  if (linkMatch) pId = linkMatch[1];
                }
                if (pId && !matchingPlayers.some(existing => existing.id === pId)) {
                  matchingPlayers.push({
                    id: pId,
                    name: item.displayName || 'Player',
                    jersey: '',
                    position: item.description || 'Soccer Player',
                    teamName: item.subtitle || 'Club',
                    teamLogo: '',
                    teamId: 0
                  });
                }
                if (matchingPlayers.length >= 8) break;
              }
            }
            if (matchingPlayers.length >= 8) break;
          }
        }
      } catch (e) {}
    }

    // Search fixtures
    const matchingFixtures = searchFixturesByTeam(q, 6);

    return {
      query,
      teams: matchingTeams.slice(0, 5),
      players: matchingPlayers.slice(0, 6),
      fixtures: matchingFixtures.slice(0, 5)
    };
  }

  public async seedInitialData(): Promise<void> {
    console.log('[FootballAPI] Initializing real-time sports data across all 8 European competitions...');
    
    // 1. Index all 96+ clubs immediately
    await this.indexAllTeams().catch(err => console.error('[FootballAPI] Team indexing error:', err));

    // 2. Pre-fetch real schedules for all 8 leagues in parallel
    const leagueIds = Object.keys(TRACKED_LEAGUES).map(Number);
    console.log(`[FootballAPI] Pre-fetching live fixtures for ${leagueIds.length} competitions...`);
    
    await Promise.allSettled(leagueIds.map(id => this.getFixtures(id)));
    console.log('[FootballAPI] All 8 European competitions successfully synced and ready!');
  }
}

export const footballApi = new FootballApiService();
