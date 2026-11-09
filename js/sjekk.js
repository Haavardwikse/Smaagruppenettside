import { supabase, createClient, isConfigured, config, el, SCHEMA_VERSION } from './felles.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-org]').forEach((n) => (n.textContent = config.ORG_NAME));

const ICON = { ok: '✓', bad: '✗', warnc: '!', wait: '…' };
let counts;

function add(list, status, title, detail = '') {
  counts[status] = (counts[status] || 0) + 1;
  $(list).append(el('li', { class: status },
    el('span', { class: 'icon', 'aria-hidden': 'true' }, ICON[status]),
    el('strong', {}, title),
    detail ? el('span', { class: 'detail' }, detail) : null));
}

async function run() {
  counts = {};
  $('checks').innerHTML = '';
  $('admin-checks').innerHTML = '';
  $('admin-card').hidden = true;
  $('summary').className = 'notice';
  $('summary').textContent = 'Kjører sjekken …';

  // 1. Innstillinger
  if (!isConfigured) {
    add('checks', 'bad', 'config.js er ikke fylt ut', 'Legg inn SUPABASE_URL og SUPABASE_KEY.');
    return finish();
  }
  if (/service_role|sb_secret_/i.test(config.SUPABASE_KEY)) {
    add('checks', 'bad', 'Feil nøkkel i config.js', 'Det ligger en hemmelig nøkkel i config.js. Bytt den UMIDDELBART til publishable/anon-nøkkelen, og lag en ny hemmelig nøkkel i Supabase.');
  } else {
    add('checks', 'ok', 'config.js er fylt ut', config.SUPABASE_URL);
  }
  if (!config.CONTACT_EMAIL || /eksempel/i.test(config.CONTACT_EMAIL)) {
    add('checks', 'warnc', 'Kontakt-e-post for personvern er ikke fylt ut', 'Sett CONTACT_EMAIL i config.js. Den vises i personvernerklæringen.');
  }

  // Egen klient uten innlogging, så vi tester som en vanlig besøkende
  const anon = createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sjekk-anon' },
  });

  // 2. Kontakt og versjon
  const ver = await anon.rpc('schema_version');
  if (ver.error) {
    add('checks', 'bad', 'Får ikke kontakt med databasen, eller schema.sql er ikke kjørt', ver.error.message);
    return finish();
  }
  if (ver.data === SCHEMA_VERSION) add('checks', 'ok', `Databasen svarer og har riktig versjon (${ver.data})`);
  else add('checks', 'bad', `Databasen har versjon ${ver.data}, nettsiden trenger ${SCHEMA_VERSION}`, 'Kjør den nyeste schema.sql i Supabase.');

  // 3. Postnummer
  const pc = await anon.from('postal_codes').select('code', { count: 'exact', head: true });
  const bergen = await anon.from('postal_codes').select('city').eq('code', '5003').maybeSingle();
  if (pc.error) add('checks', 'bad', 'Postnummerregisteret kan ikke leses', pc.error.message);
  else if ((pc.count || 0) < 4000) add('checks', 'bad', `Postnummerregisteret har bare ${pc.count || 0} postnumre`, 'Kjør postnummer.sql i Supabase.');
  else add('checks', 'ok', `Postnummerregisteret er på plass (${pc.count} postnumre)`, bergen.data ? `5003 = ${bergen.data.city}` : '');

  // 4. Ingen kan lese data uten å være logget inn
  const tables = ['members', 'profiles', 'groups', 'group_leaders', 'meetings', 'attendance', 'group_invites', 'triads', 'triad_members'];
  const leaks = [];
  const soft = [];
  for (const t of tables) {
    const r = await anon.from(t).select('*').limit(1);
    if (!r.error && r.data?.length) leaks.push(t);
    else if (!r.error) soft.push(t);
  }
  if (leaks.length) add('checks', 'bad', 'Data er synlig uten innlogging!', `Tabeller: ${leaks.join(', ')}. Kjør schema.sql på nytt med en gang.`);
  else if (soft.length) add('checks', 'warnc', 'Ingen data er synlig uten innlogging', `Men tabellene ${soft.join(', ')} er ikke helt stengt. Kjør schema.sql på nytt.`);
  else add('checks', 'ok', 'Ingen data er synlig uten innlogging', `Sjekket ${tables.length} tabeller.`);

  // 5. Ingen kan skrive direkte uten innlogging (testen bruker en gruppe som ikke finnes)
  const ins = await anon.from('members').insert({ group_id: '00000000-0000-0000-0000-000000000000', full_name: 'Systemsjekk Test', consent: true });
  if (ins.error && (ins.error.code === '42501' || /permission denied/i.test(ins.error.message))) {
    add('checks', 'ok', 'Ingen kan legge inn deltakere direkte uten innlogging', 'Påmelding går bare via den kontrollerte påmeldingsfunksjonen.');
  } else {
    add('checks', 'bad', 'Tabellen for deltakere er ikke stengt for direkte innlegging', ins.error?.message || 'Innlegging ble ikke stoppet.');
  }

  // 6. Offentlige funksjoner virker, admin-funksjoner er stengt
  const pub = await anon.rpc('group_public_info', { p_group: '00000000-0000-0000-0000-000000000000' });
  const inv = await anon.rpc('invite_info', { p_code: 'finnes-ikke' });
  if (!pub.error && !inv.error) add('checks', 'ok', 'Påmelding og invitasjoner er klare');
  else add('checks', 'bad', 'Påmeldings- eller invitasjonsfunksjonen svarer ikke', (pub.error || inv.error).message);
  const adm = await anon.rpc('data_health');
  if (adm.error) add('checks', 'ok', 'Administratorfunksjoner er stengt for besøkende');
  else add('checks', 'bad', 'Administratorfunksjoner er åpne for besøkende!', 'Kjør schema.sql på nytt.');

  // 7. Innloggingsinnstillinger i Supabase
  try {
    const res = await fetch(`${config.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: config.SUPABASE_KEY } });
    const st = await res.json();
    if (st.disable_signup) add('checks', 'bad', '«Allow new users to sign up» er slått av', 'Nye ledere kan ikke lage konto fra invitasjonslenken. Slå det på under Authentication → Sign In / Providers.');
    else add('checks', 'ok', 'Nye ledere kan lage konto fra invitasjonslenken');
    if (st.mailer_autoconfirm === false) add('checks', 'warnc', '«Confirm email» er slått på', 'Nye ledere må bekrefte e-posten, men Supabase sender bare e-post til teamet deres uten egen e-posttjeneste. Slå det av, eller sett opp SMTP.');
    else add('checks', 'ok', 'E-postbekreftelse er av (nye ledere slipper inn rett fra lenken)');
  } catch (err) {
    add('checks', 'warnc', 'Fikk ikke lest innloggingsinnstillingene', String(err));
  }

  // 8. Sider og filer
  const files = ['index.html', 'oversikt.html', 'personvern.html', 'config.js', 'css/style.css', 'js/felles.js', 'js/pamelding.js', 'js/oversikt.js', 'js/eksport.js', 'paaminnelse.ics'];
  const missing = [];
  for (const f of files) {
    try {
      const r = await fetch(f, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) missing.push(`${f} (${r.status})`);
    } catch { missing.push(f); }
  }
  if (missing.length) add('checks', 'bad', 'Noen filer mangler på nettsiden', missing.join(', '));
  else add('checks', 'ok', 'Alle sider og filer finnes', files.length + ' filer');
  if (location.protocol !== 'https:' && !/^(localhost|127\.)/.test(location.hostname)) {
    add('checks', 'warnc', 'Siden er ikke åpnet med https', 'Bruk adressen som starter med https://');
  }

  // 9. Datasjekk for innlogget administrator
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) {
    add('checks', 'warnc', 'Datasjekken er ikke kjørt', 'Logg inn som administrator på ledersiden og åpne denne siden igjen for å sjekke dataene også.');
  } else {
    const h = await supabase.rpc('data_health');
    if (h.error) {
      add('checks', 'warnc', 'Datasjekk krever administrator', `Du er logget inn som ${sess.session.user.email}.`);
    } else {
      $('admin-card').hidden = false;
      const d = h.data;
      const item = (cond, okText, badText, detail = '') => add('admin-checks', cond ? 'ok' : 'warnc', cond ? okText : badText, cond ? '' : detail);
      item(d.groups_without_leader.length === 0, 'Alle aktive grupper har leder', 'Grupper uten leder', d.groups_without_leader.join(', '));
      item(d.possible_duplicates.length === 0, 'Ingen mulige dobbeltregistreringer', 'Mulige dobbeltregistreringer (samme navn og fødselsår)', d.possible_duplicates.join(', '));
      item(d.members_missing_info === 0, 'Alle deltakere har fødselsår og bosted', `${d.members_missing_info} deltakere mangler fødselsår eller bosted`, 'Dette gjelder deltakere lagt inn manuelt.');
      item(d.expired_invites === 0, 'Ingen utløpte invitasjoner', `${d.expired_invites} utløpte invitasjoner`, 'Rydd dem bort fra Datasjekk på oversikten.');
      item(d.archived_over_1_year === 0, 'Ingen har vært arkivert i over ett år', `${d.archived_over_1_year} har vært arkivert i over ett år`, 'Vurder å slette dem (personvern).');
      item(d.accounts_without_access === 0, 'Alle kontoer har en rolle', `${d.accounts_without_access} kontoer uten tilgang`, 'Kan være noen som har laget konto uten invitasjon. Se Tilgang.');
    }
  }
  finish();
}

function finish() {
  const bad = counts.bad || 0;
  const warn = counts.warnc || 0;
  const box = $('summary');
  if (bad) { box.className = 'notice error'; box.textContent = `${bad} ting må rettes før siden tas i bruk.`; }
  else if (warn) { box.className = 'notice warn'; box.textContent = `Alt viktig er i orden. ${warn} ting er verdt å se på.`; }
  else { box.className = 'notice ok'; box.textContent = 'Alt er i orden.'; }
}

$('rerun').addEventListener('click', run);
run();
