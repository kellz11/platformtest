import { normalize } from './core-data.js';

export const RELATIONSHIPS = {
  category_parent: { label: 'Cluster hub', color: '#9a9a96' },
  visual_overlap: { label: 'Visual overlap', color: '#5c7cfa' },
  emotional_overlap: { label: 'Emotional overlap', color: '#d95f9f' },
  historical_influence: { label: 'Historical influence', color: '#d98b35' },
  search_overlap: { label: 'Search overlap', color: '#38a37a' },
  sibling: { label: 'Adjacent formation', color: '#7d62c9' }
};

const CLUSTERS = [
  {
    id: 'dream-surreal', hub: 'Dreamcore', label: 'Dream, memory & liminality',
    keywords: ['dream', 'memory', 'liminal', 'surreal'],
    visuals: ['empty rooms', 'thresholds', 'haze', 'uncanny light'],
    emotions: ['nostalgia', 'wonder', 'unease'], era: 'internet-native / retrospective',
    names: ['Dreamcore','Weirdcore','Nostalgiacore','Traumacore','Glitchcore','Gloomcore','Cloudcore','Poolcore','Plazacore','Soft Apocalypse','Ghostcore','Liminalcore','Backroomscore','Memorycore','Sleepcore','Nightmarecore','Voidcore','Sadcore','Surrealcore'],
    patterns: ['dream','weird','nostalgia','trauma','glitch','gloom','cloud','pool','plaza','apocalypse','ghost','liminal','backroom','memory','sleep','nightmare','void','sad','surreal','haze']
  },
  {
    id: 'nature-rustic', hub: 'Naturecore', label: 'Nature, pastoral & ecological',
    keywords: ['nature', 'rural', 'organic', 'ecological'],
    visuals: ['forests', 'gardens', 'cabins', 'plants'],
    emotions: ['calm', 'comfort', 'curiosity'], era: 'historic roots / internet reassembly',
    names: ['Naturecore','Cottagecore','Goblincore','Frogcore','Mushroomcore','Gardencore','Bloomcore','Honeycore','Cabincore','Picniccore','Crowcore','Gorpcore','Adventurecore','Junglecore','Tropicalcore','Grandmacore','Craftcore','Cluttercore','Forestcore','Swampcore','Farmcore','Raincore','Autumncore','Wintercore'],
    patterns: ['nature','cottage','goblin','frog','mushroom','garden','bloom','honey','cabin','picnic','crow','gorp','adventure','jungle','tropical','grandma','craft','clutter','forest','swamp','farm','rain','autumn','winter','plant','flower','eco','rural']
  },
  {
    id: 'cute-playful', hub: 'Kidcore', label: 'Childhood, cute & playful',
    keywords: ['childhood', 'cute', 'play', 'character'],
    visuals: ['toys', 'pastels', 'cartoons', 'stickers'],
    emotions: ['joy', 'comfort', 'nostalgia'], era: 'childhood memory / platform culture',
    names: ['Kidcore','Cutecore','Babycore','Candycore','Sanriocore','Kuromicore','Lolicore','Puppycore','Dollcore','Barbiecore','Melodycore','Clowncore','Toycore','Rainbowcore','Cartooncore'],
    patterns: ['kid','cute','baby','candy','sanrio','kuromi','loli','puppy','doll','barbie','melody','clown','toy','rainbow','cartoon','kawaii','pastel','child']
  },
  {
    id: 'digital-internet', hub: 'Webcore', label: 'Digital, web & synthetic',
    keywords: ['internet', 'digital', 'software', 'synthetic'],
    visuals: ['screens', 'interfaces', 'pixels', 'chrome'],
    emotions: ['curiosity', 'energy', 'digital nostalgia'], era: '1990s roots / networked revival',
    names: ['Webcore','Cybercore','Chromecore','Arcadecore','Retro Gamer','Robotcore','Scenecore','Nerdcore','Animecore','Old Web Core','Y2K Core','Frutiger Aero','Vaporwave Core','Corecore','Memecore','Viralcore','Tiktokcore','Twittercore','X Core','Redditcore'],
    patterns: ['web','cyber','chrome','arcade','gamer','robot','scene','nerd','anime','old web','oldweb','y2k','frutiger','vaporwave','synthwave','retrowave','corecore','meme','viral','tiktok','twitter','reddit','internet','digital','pixel','computer','windows','tech']
  },
  {
    id: 'fantasy-mythic', hub: 'Fairycore', label: 'Fantasy, myth & spiritual worlds',
    keywords: ['fantasy', 'myth', 'magic', 'spiritual'],
    visuals: ['castles', 'wings', 'crowns', 'enchanted forests'],
    emotions: ['wonder', 'power', 'romance'], era: 'mythic roots / internet recombination',
    names: ['Fairycore','Angelcore','Fallen Angel','Devilcore','Witchcore','Wizardcore','Dragoncore','Knightcore','Royalcore','Kingcore','Queencore','Princecore','Princesscore','Goddesscore','Changelingcore','Bardcore','Mermaidcore','Heavencore'],
    patterns: ['fairy','angel','devil','witch','wizard','dragon','knight','royal','king','queen','prince','princess','goddess','changeling','bard','mermaid','heaven','elf','magic','myth','fantasy','spirit']
  },
  {
    id: 'dark-horror', hub: 'Horrorcore', label: 'Dark, horror & bodily',
    keywords: ['horror', 'macabre', 'body', 'danger'],
    visuals: ['shadows', 'medical objects', 'ruins', 'dark interiors'],
    emotions: ['fear', 'dread', 'fascination'], era: 'historic horror / internet mutation',
    names: ['Horrorcore','Gorecore','Meatcore','Medicalcore','Teethcore','Plaguecore','Cryptidcore','Dark Nautical','Heistcore','Hospitalcore','Vampcore','Goth Core'],
    patterns: ['horror','gore','meat','medical','teeth','plague','cryptid','dark nautical','heist','hospital','vamp','goth','death','blood','corpse','occult','demon']
  },
  {
    id: 'fashion-identity', hub: 'Fashioncore', label: 'Fashion, identity & social style',
    keywords: ['fashion', 'identity', 'style', 'subculture'],
    visuals: ['clothing', 'editorials', 'accessories', 'portraits'],
    emotions: ['confidence', 'belonging', 'expression'], era: 'subcultural roots / algorithmic styling',
    names: ['Fashioncore','Balletcore','Bimbocore','Blokecore','Normcore','Pridecore','Queercore','Maidcore','Pearlcore','Artcore','Lovecore','Coquette Core','Clean Core','Messy Core','Trash Core','Romantic Core','Emo Core','Punk Core'],
    patterns: ['fashion','ballet','bimbo','bloke','norm','pride','queer','maid','pearl','art','love','coquette','clean','messy','trash','romantic','emo','punk','style','girl','boy','beauty','model']
  },
  {
    id: 'cosmic-futurist', hub: 'Spacecore', label: 'Cosmic, scientific & futurist',
    keywords: ['space', 'future', 'science', 'alien'],
    visuals: ['stars', 'planets', 'auroras', 'spacecraft'],
    emotions: ['awe', 'isolation', 'curiosity'], era: 'scientific imagination / internet revival',
    names: ['Spacecore','Aliencore','Auroracore','Paleocore','Starcore','Mooncore','Suncore','Solarpunk Core','Steampunk Core','Seapunk Core'],
    patterns: ['space','alien','aurora','paleo','star','moon','sun','solar','future','cosmic','planet','astro','sci fi','scifi','steampunk','seapunk']
  },
  {
    id: 'archive-creative', hub: 'Archivecore', label: 'Archive, knowledge & creative practice',
    keywords: ['archive', 'writing', 'knowledge', 'making'],
    visuals: ['books', 'paper', 'collections', 'workspaces'],
    emotions: ['reflection', 'curiosity', 'devotion'], era: 'historic practices / digital indexing',
    names: ['Archive Core','Library Core','Museum Core','Journal Core','Letter Core','Diary Core','Poet Core','Writer Core','Minimal Core','Maximal Core','Quiet Core','Loud Core'],
    patterns: ['archive','library','museum','journal','letter','diary','poet','writer','minimal','maximal','quiet','loud','book','study','academia','academic','history','retro','analog','film']
  },
  {
    id: 'lifestyle-sport', hub: 'Campcore', label: 'Lifestyle, activity & place',
    keywords: ['activity', 'lifestyle', 'sport', 'routine'],
    visuals: ['equipment', 'outdoors', 'uniforms', 'everyday spaces'],
    emotions: ['focus', 'energy', 'belonging'], era: 'lived practice / aesthetic packaging',
    names: ['Campcore','Tenniscore','Cleancore','Officecore','Schoolcore'],
    patterns: ['camp','tennis','sport','office','school','work','gym','fitness','travel','airport','mall','hotel','beach','city','suburb','home','room','food','coffee']
  },
  {
    id: 'hope-emotion', hub: 'Hopecore', label: 'Emotion, healing & meaning',
    keywords: ['hope', 'life', 'emotion', 'healing'],
    visuals: ['sunlight', 'people', 'open landscapes', 'small moments'],
    emotions: ['hope', 'relief', 'connection'], era: 'early 2020s / affective publics',
    names: ['Hopecore','Lifecore','Comfortcore','Healing Core','Mindful Core','Softcore','Lightcore','Emocore'],
    patterns: ['hope','life','comfort','healing','mindful','soft','light','emotion','feeling','peace','happy','joy','calm','wellness']
  },
  {
    id: 'persona-character', hub: 'Dollcore', label: 'Persona, role & character',
    keywords: ['persona', 'role', 'character', 'archetype'],
    visuals: ['figures', 'costumes', 'avatars', 'symbols'],
    emotions: ['identification', 'projection', 'belonging'], era: 'archetypal roots / profile culture',
    names: ['Aliyahcore'],
    patterns: ['aliyah','character','persona','avatar','hero','villain','cowboy','pirate','samurai','warrior','clown','doll']
  }
];

const DESCRIPTIONS = {
  Dreamcore: 'A surreal internet aesthetic built around dreams, nostalgia, liminal spaces, and emotional ambiguity.',
  Weirdcore: 'A surreal internet aesthetic using distorted imagery, cryptic text, and uncanny digital nostalgia.',
  Nostalgiacore: 'An aesthetic centered on emotional memory, childhood references, old media, and the feeling of the past.',
  Webcore: 'An internet-native aesthetic inspired by early websites, interfaces, desktop graphics, and digital nostalgia.',
  Cybercore: 'A futuristic digital aesthetic built around networks, machinery, neon interfaces, and technological intensity.',
  Naturecore: 'An umbrella aesthetic centered on nature, plants, outdoor environments, and organic visual language.',
  Cottagecore: 'A romanticized rural aesthetic focused on domestic craft, gardens, countryside living, and pastoral calm.',
  Kidcore: 'A playful aesthetic built around bright colors, toys, cartoons, school imagery, and childhood nostalgia.',
  Fairycore: 'A whimsical fantasy aesthetic centered on fairies, enchanted forests, delicate magic, and natural wonder.',
  Horrorcore: 'A dark aesthetic family using horror imagery, suspense, decay, and unsettling environments.',
  Fashioncore: 'An umbrella for aesthetics primarily expressed through clothing, styling, accessories, and fashion identity.',
  Spacecore: 'A cosmic aesthetic centered on stars, planets, astronomy, spacecraft, and the scale of the universe.',
  Hopecore: 'An emotional internet aesthetic that uses ordinary moments, people, and nature to communicate hope and perseverance.',
  Corecore: 'A reflexive internet collage aesthetic that turns networked life, emotion, media overload, and cultural fatigue back onto themselves.'
};

const CURATED_EDGES = [
  ['Dreamcore','Weirdcore','sibling','Both use surreal internet imagery and unsettling nostalgia.'],
  ['Dreamcore','Nostalgiacore','emotional_overlap','Both rely on memory, childhood feeling, and emotional ambiguity.'],
  ['Dreamcore','Poolcore','visual_overlap','Pools, blue light, emptiness, and dreamlike architecture overlap strongly.'],
  ['Dreamcore','Traumacore','emotional_overlap','Both transform memory and vulnerability into symbolic internet imagery.'],
  ['Weirdcore','Glitchcore','visual_overlap','Digital distortion and broken interfaces connect the two.'],
  ['Webcore','Cybercore','sibling','Both are internet-native digital aesthetics with different levels of futurism.'],
  ['Webcore','Scenecore','historical_influence','Scene culture grew through profiles, graphics, and early social-web design.'],
  ['Cottagecore','Goblincore','sibling','Both use rural environments and natural objects with different moods.'],
  ['Cottagecore','Grandmacore','visual_overlap','Domestic craft, vintage interiors, baking, and handmade objects connect them.'],
  ['Goblincore','Mushroomcore','visual_overlap','Mushrooms, moss, forest floors, and collected natural objects overlap.'],
  ['Kidcore','Cutecore','sibling','Both use bright playful imagery, toys, characters, and comfort.'],
  ['Kidcore','Nostalgiacore','emotional_overlap','Childhood objects and memories drive both aesthetics.'],
  ['Fairycore','Cottagecore','visual_overlap','Flowers, woodland settings, handmade detail, and romantic nature connect them.'],
  ['Fairycore','Witchcore','sibling','Both use magic and nature, but with different emotional tones.'],
  ['Horrorcore','Medicalcore','visual_overlap','Clinical imagery becomes unsettling when placed in a horror context.'],
  ['Pridecore','Queercore','emotional_overlap','Both center identity, belonging, expression, and queer community.'],
  ['Spacecore','Aliencore','sibling','Both center extraterrestrial settings, science fiction, and cosmic scale.'],
  ['Hopecore','Naturecore','emotional_overlap','Open landscapes and small natural moments often communicate hope.'],
  ['Hopecore','Nostalgiacore','emotional_overlap','Both use emotionally charged ordinary memories, but with different direction.'],
  ['Corecore','Webcore','historical_influence','Corecore is shaped by the media density and self-reference of networked culture.'],
  ['Corecore','Hopecore','emotional_overlap','Both organize short-form media around collective feeling, but with different tonal centers.'],
  ['Archive Core','Nostalgiacore','historical_influence','Archives convert cultural remnants into retrievable memory.'],
  ['Fashioncore','Pridecore','search_overlap','Identity and style are frequently discovered together through platform search.'],
  ['Naturecore','Spacecore','visual_overlap','Both produce scale, wonder, and environments larger than the individual.']
];

const CROSS_CLUSTER_BRIDGES = [
  ['Dreamcore','Webcore','historical_influence'],
  ['Dreamcore','Horrorcore','emotional_overlap'],
  ['Naturecore','Fairycore','visual_overlap'],
  ['Kidcore','Webcore','historical_influence'],
  ['Fashioncore','Kidcore','search_overlap'],
  ['Archive Core','Webcore','historical_influence'],
  ['Campcore','Naturecore','visual_overlap'],
  ['Hopecore','Dreamcore','emotional_overlap'],
  ['Dollcore','Fashioncore','visual_overlap'],
  ['Spacecore','Webcore','visual_overlap']
];

function cleanName(value) {
  return String(value || '').toLowerCase().replace(/[–—_-]+/g, ' ').replace(/\bcore\b/g, ' core ').replace(/\s+/g, ' ').trim();
}

function scoreCluster(name, cluster) {
  const haystack = ` ${cleanName(name)} `;
  let score = 0;
  cluster.patterns.forEach((pattern) => {
    const needle = cleanName(pattern);
    if (!needle) return;
    if (haystack.includes(` ${needle} `)) score += 4;
    else if (haystack.includes(needle)) score += 2;
  });
  if (normalize(name) === normalize(cluster.hub)) score += 20;
  return score;
}

function classify(name) {
  const exact = CLUSTERS.find((cluster) => cluster.names.some((candidate) => normalize(candidate) === normalize(name)));
  if (exact) return exact;
  const ranked = CLUSTERS.map((cluster) => ({ cluster, score: scoreCluster(name, cluster) })).sort((a, b) => b.score - a.score);
  return ranked[0].score > 0 ? ranked[0].cluster : CLUSTERS.find((cluster) => cluster.id === 'persona-character');
}

function genericDescription(record, cluster) {
  const subject = record.name.replace(/\s*core$/i, '').trim() || record.name;
  return `${record.name} is indexed as a ${cluster.label.toLowerCase()} formation: an internet-organized selection of imagery, emotion, references, and identity signals associated with ${subject}.`;
}

export function buildCoreGraph(records) {
  const nodes = [];
  const nodeMap = new Map();
  const groups = new Map(CLUSTERS.map((cluster) => [cluster.id, []]));

  records.forEach((record) => {
    const cluster = classify(record.name);
    const id = normalize(record.name);
    const node = {
      id,
      name: record.name,
      type: 'internet_aesthetic',
      parent: normalize(record.name) === normalize(cluster.hub) ? 'aestheticformation' : normalize(cluster.hub),
      cluster: cluster.id,
      clusterLabel: cluster.label,
      description: DESCRIPTIONS[record.name] || genericDescription(record, cluster),
      keywords: cluster.keywords,
      visuals: cluster.visuals,
      emotions: cluster.emotions,
      era: cluster.era,
      thumbnail: record.paths[0] || '',
      graphicCount: record.paths.length
    };
    nodes.push(node);
    nodeMap.set(id, node);
    groups.get(cluster.id).push(node);
  });

  const edges = [];
  const edgeKeys = new Set();
  const addEdge = (fromName, toName, relationship, reason) => {
    const from = normalize(fromName);
    const to = normalize(toName);
    if (!nodeMap.has(from) || !nodeMap.has(to) || from === to) return;
    const key = [from, to].sort().join('|') + `|${relationship}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, relationship, reason });
  };

  CLUSTERS.forEach((cluster) => {
    const members = [...(groups.get(cluster.id) || [])].sort((a, b) => b.graphicCount - a.graphicCount || a.name.localeCompare(b.name));
    if (!members.length) return;
    const explicitHub = members.find((node) => normalize(node.name) === normalize(cluster.hub));
    const hub = explicitHub || members[0];
    members.forEach((node) => {
      if (node.id === hub.id) return;
      addEdge(hub.name, node.name, 'category_parent', `${hub.name} is the visible hub for the ${cluster.label.toLowerCase()} cluster.`);
    });
    const ring = members.filter((node) => node.id !== hub.id);
    ring.forEach((node, index) => {
      if (ring.length < 2) return;
      const next = ring[(index + 1) % ring.length];
      addEdge(node.name, next.name, index % 2 ? 'search_overlap' : 'sibling', `Both are adjacent formations inside the ${cluster.label.toLowerCase()} field.`);
    });
  });

  CURATED_EDGES.forEach((edge) => addEdge(...edge));
  CROSS_CLUSTER_BRIDGES.forEach(([from, to, relationship]) => addEdge(from, to, relationship, 'This bridge shows how one aesthetic field can transform into or overlap with another.'));

  return {
    nodes,
    edges,
    relationships: RELATIONSHIPS,
    clusters: CLUSTERS.map(({ id, label, hub }) => ({ id, label, hub }))
  };
}
