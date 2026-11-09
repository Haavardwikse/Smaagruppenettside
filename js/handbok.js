// Lederhåndbok: korte informasjonspakker, basert på nestleder- og smågruppelederkurset.
// Innholdet vises i fanen «Håndbok» og åpnes også fra relevante steder på siden.
//
// Format for body: tekst = avsnitt, { h } = mellomtittel, { ul } / { ol } = liste,
// listepunkt som [fet, resten] gir en fet innledning, { note } = dempet tekst.

import { el } from './felles.js';

export const DREAM = [
  'Folk blir disippelgjort',
  'Gode venner som går på dypet',
  'Samtalen flyter',
  'Vi ber for hverandre',
  'Utfordres i tro og tjeneste',
  'Godt oppmøte',
  'Det er alltid en nestleder',
  'Gruppen vokser og multipliseres',
];

export const GUIDES = [
  {
    id: 'hvorfor',
    title: 'Hvorfor smågrupper?',
    teaser: 'Kirken møtes både i det store og i det lille.',
    body: [
      'Som kirke gjør vi egentlig bare to ting: gudstjenester og smågrupper. Begge er like viktige.',
      { ul: [
        ['Jesus og disiplene.', 'Mange fulgte Jesus, men han delte livet med tolv. De kom tett på, lærte av ham og ble lik ham. Siden ble de selv ledere for mange.'],
        ['De første kristne (Apg 2,42–47).', 'De møttes både på tempelplassen og i hjemmene. Det store fellesskapet løfter blikket mot Jesus. Det lille gjør at vi lever troen sammen.'],
        ['Moses og Jetro (2 Mos 18).', 'Ingen kan bære alt alene. Når ansvaret deles, får flere lede og flere blir sett.'],
      ] },
      'Smågruppen er ikke et tidspunkt, men menneskene. Vi møtes på onsdag og på søndag: se etter folkene dine i gudstjenesten også, og ta godt imot nye.',
    ],
  },
  {
    id: 'hensikter',
    title: 'Smågruppens fem hensikter',
    teaser: 'Det vi strekker oss etter, uke etter uke.',
    body: [
      'Alle gruppene våre har de samme fem hensiktene. Felles for dem er at de handler om å gjøre disipler.',
      { ul: [
        ['Oppbyggelse.', 'Vi bærer hverandre, ber for hverandre og heier på hverandre (Ef 4,11–13).'],
        ['Tjeneste.', 'Jeg kommer ikke bare for min egen del, men for de andre. Alle har en plass og noe å bidra med.'],
        ['Evangelisering.', 'Vi ber for og blir kjent med hverandres venner, så flere kan bli kjent med Jesus.'],
        ['Ledertrening.', 'De fleste kristne kan lede en smågruppe, men først må man trenes. Nestleder betyr neste leder.'],
        ['Omsorg.', 'Vi elsker hverandre i ord og handling. Den som blir lyttet til, kommer tilbake.'],
      ] },
      { note: 'Uten felles retning blir en gruppe fort bare en kosegruppe. Snakk om hensiktene i gruppen innimellom.' },
    ],
  },
  {
    id: 'leder',
    title: 'Å være smågruppeleder',
    teaser: 'Først og fremst en etterfølger av Jesus.',
    body: [
      'Å lede handler først og fremst om å følge Jesus selv, og invitere andre med. Det handler ikke om deg.',
      { ul: [
        ['Åndelig leder:', 'du ber for og bryr deg om folkene i gruppen.'],
        ['Ordstyrer:', 'du leder samtalen og holder ting i gang.'],
        ['Trener nye ledere:', 'særlig nestlederen.'],
      ] },
      'Ingen er god på alt. Del på oppgavene, og spill på styrkene til de andre i gruppen.',
      { h: 'Fem vaner som gjør forskjellen' },
      { note: 'Lederskap handler ikke om hvem du er, men om hva du gjør. Vanene er enkle å gjøre, og like enkle å la være.' },
      { ol: [
        ['Stilletid med Gud.', '«Bli i meg» (Joh 15).'],
        ['Be for hver enkelt', 'i gruppen.'],
        ['Sett mål', 'for gruppen, også for multiplisering.'],
        ['Vær sammen utenfor samlingene.', 'Relasjonene bærer gruppen.'],
        ['Tren opp en nestleder', '(2 Tim 2,2).'],
      ] },
    ],
  },
  {
    id: 'nestleder',
    title: 'Å være nestleder',
    teaser: 'Nestleder betyr neste leder.',
    body: [
      'Nestlederen hjelper lederen nå, og leder den nye gruppen når dere multipliserer. På denne siden har nestlederen samme tilgang som lederen.',
      { h: 'Hva gjør en nestleder?' },
      { ul: [
        'Deler på oppgavene: samtalen, bønn, det praktiske og å følge opp folk.',
        'Ser etter dem som mangler, og tar imot nye.',
        'Lærer lederoppgavene steg for steg.',
        'Tar over som leder når gruppen multipliseres.',
      ] },
      { h: 'Slik trenes en nestleder' },
      { ol: [
        'Jeg gjør, du ser.',
        'Jeg gjør, du hjelper.',
        'Du gjør, jeg hjelper.',
        'Du gjør, jeg ser.',
        'Du gjør, og trener en ny.',
      ] },
      { note: 'Snakk sammen etter hvert steg.' },
      { h: 'Hvem passer?' },
      'Se etter modenhet: solid karakter, god med mennesker, trofast, hjerte for kirkens visjon og et levende gudsliv. Velg aldri alene. Snakk med lederne for smågruppearbeidet først.',
    ],
  },
  {
    id: 'oppmote',
    title: 'Godt oppmøte',
    teaser: 'Relasjoner, relasjoner, relasjoner.',
    body: [
      'Oppmøte er en av de vanligste utfordringene. Det skjer ikke av seg selv, så snakk om det jevnlig.',
      { ul: [
        'Avklar tidlig at smågruppen er forpliktende, og snakk om hvorfor den er viktig.',
        'Send en melding i god tid før samlingen, gjerne på tirsdag.',
        'Be folk sende melding direkte til deg om de ikke kan komme, ikke i gruppechatten.',
        'Følg opp dem som ikke kommer. Ikke kjeftende, men vis at du bryr deg.',
        'Gi andre ansvar: å være vert, dele noe eller lede bønnen. Det gir eierskap.',
        'Legg nye til i gruppechatten etter at de har vært med første gang.',
      ] },
    ],
  },
  {
    id: 'kultur',
    title: 'God gruppekultur',
    teaser: 'Smågruppe er ikke noe vi har, men noe vi er.',
    body: [
      'Lederskap handler mye om å sette kulturen, gjennom ord og handling. De må henge sammen: sier du at dere starter kl. 19, så vær der kl. 19.',
      'Du klarer ikke dette alene. To viktige ord er «Hjelp meg!». Spør gruppen hvordan dere vil ha det, og hva som kjennetegner en god gruppe.',
      { note: 'Det er ikke lederen alene som setter kulturen. Vi er gruppen.' },
    ],
  },
  {
    id: 'vekst',
    title: 'Gud gir vekst',
    teaser: 'Vi planter og vanner. Gud gir vekst.',
    body: [
      'Vår jobb er ikke å skape vekst, men å holde gruppen sunn og med en tydelig retning (1 Kor 3,5–9). Vekst kan være åndelig, i relasjonene og i antall.',
      'Står gruppen stille, se etter årsaken og ikke bare symptomene:',
      { ul: [
        ['Visjonen lekker.', 'Snakk om hensiktene igjen.'],
        ['Gruppen blir en aktivitet.', 'Se livene til folk, og vær sammen.'],
        ['Lite åpenhet.', 'Gå foran selv, og alliér deg med nestlederen.'],
        ['Sammensetningen er unaturlig.', 'Det er ingen skam å stokke om.'],
        ['Gruppen er full.', 'Da er det tid for å multiplisere.'],
        ['Travelhet.', 'Smågruppen er menigheten, ikke et program.'],
      ] },
    ],
  },
];

/** Råd til «Hvorfor multiplisere?» (vises under begrunnelsen der). */
export const MULTIPLY_HOW = [
  'Snakk om multiplisering som et mål fra gruppen starter: «Hadde vi ikke multiplisert, hadde vi ikke hatt plass til deg.»',
  'Tren opp nestlederen. Hen blir leder for den nye gruppen.',
  'Planlegg fordelingen i god tid, og snakk med hver enkelt så alle blir hørt.',
  'Multipliser når dere er rundt ti.',
];

export const TRIAD_INFO = [
  'Noen å sparre med som vet hvordan det er å lede en smågruppe.',
  'Ta en kaffe eller en middag sammen, del erfaringer og utfordringer, og be for hverandre.',
  'Møtes én til to ganger i semesteret.',
];

function rich(item) {
  if (Array.isArray(item)) return [el('strong', {}, item[0]), ' ', item[1]];
  return [item];
}

export function guideNodes(guide) {
  return guide.body.map((b) => {
    if (typeof b === 'string') return el('p', {}, b);
    if (b.h) return el('h3', { class: 'guide-h' }, b.h);
    if (b.note) return el('p', { class: 'guide-note' }, b.note);
    if (b.ul) return el('ul', { class: 'guide-list' }, b.ul.map((i) => el('li', {}, ...rich(i))));
    if (b.ol) return el('ol', { class: 'guide-list' }, b.ol.map((i) => el('li', {}, ...rich(i))));
    return null;
  });
}

export const guideById = (id) => GUIDES.find((g) => g.id === id);
