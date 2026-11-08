import {
  supabase, isConfigured, config, el, ageFromYear, formatDate, toast, friendlyError, notConfiguredBanner,
  ask, showCopyable,
} from './felles.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-org]').forEach((n) => (n.textContent = config.ORG_NAME));

const SPLIT_SUGGEST_AT = 10; // foreslå multiplisering fra så mange deltakere

const LEADER_TABS = [['group', 'Gruppen'], ['triad', 'Triade']];
const ADMIN_TABS = [['overview', 'Oversikt'], ['members', 'Deltakere'], ['triads', 'Triader'], ['people', 'Tilgang']];

const state = {
  session: null,
  me: null,
  isAdmin: false,
  allGroups: [],     // alle grupper jeg kan se navnet på
  groups: [],        // gruppene jeg har tilgang til
  leaders: [],       // group_leaders med profil (egne grupper + triade)
  members: [],
  invites: [],
  profiles: [],      // alle brukere (bare admin)
  triads: [],
  triadMembers: [],
  meetingsMeta: [],  // siste samling per gruppe (bare admin)
  current: null,
  meetings: [],
  view: 'home',
  tab: null,
  attend: { date: '', present: new Set(), meetingId: null },
  split: null,
  filterGroup: '',
  search: '',
  inviteCode: null,
  inviteMode: 'new',
};
let inRecovery = location.hash.includes('type=recovery');

// =====================================================================
//  Hjelpere
// =====================================================================

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ikke tilgjengelig */ } },
};

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

const today = () => new Date().toLocaleDateString('sv-SE');
const isoDay = (ts) => new Date(ts).toLocaleDateString('sv-SE');

function longDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  const s = new Date(y, m - 1, d).toLocaleDateString('nb-NO', opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shortDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

const groupById = (id) => state.groups.find((g) => g.id === id);
const anyGroupName = (id) => (state.allGroups.find((g) => g.id === id) || groupById(id))?.name || '–';
const groupName = (id) => groupById(id)?.name || anyGroupName(id);
const personName = (p) => p?.full_name || p?.email || 'Ukjent';
const firstName = (p) => personName(p).split(' ')[0];
const leadersOf = (gid) => state.leaders.filter((l) => l.group_id === gid)
  .sort((a, b) => (a.role === b.role ? 0 : a.role === 'leder' ? -1 : 1));
const activeIn = (gid) => state.members.filter((m) => m.group_id === gid && !m.archived_at)
  .sort((a, b) => a.full_name.localeCompare(b.full_name, 'nb'));
const archivedIn = (gid) => state.members.filter((m) => m.group_id === gid && m.archived_at)
  .sort((a, b) => a.full_name.localeCompare(b.full_name, 'nb'));
const signupLink = (gid) => new URL(`index.html?gruppe=${gid}`, location.href).href;
const inviteLink = (code) => new URL(`oversikt.html#inv-${code}`, location.href).href;

const deputiesOf = (gid) => state.leaders.filter((l) => l.group_id === gid && l.role === 'nestleder');
const pendingFor = (gid) => state.invites.filter((i) => i.group_id === gid);
const pendingDeputies = (gid) => pendingFor(gid).filter((i) => i.role === 'nestleder');
const hasDeputy = (gid) => deputiesOf(gid).length > 0;
const roleLabel = (r) => (r === 'nestleder' ? 'Nestleder' : 'Leder');

const normPhone = (s) => (s || '').replace(/[\s\-().]/g, '');
const validPhone = (s) => /^\+?[0-9]{8,15}$/.test(s);
const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
function fmtPhone(p) {
  if (!p) return '';
  if (/^\d{8}$/.test(p)) return p.replace(/(\d{3})(\d{2})(\d{3})/, '$1 $2 $3');
  if (/^\+47\d{8}$/.test(p)) return '+47 ' + fmtPhone(p.slice(3));
  return p;
}

function contactLine(phone, email) {
  const parts = [];
  if (phone) parts.push(el('a', { href: `tel:${phone}` }, fmtPhone(phone)));
  if (email) parts.push(el('a', { href: `mailto:${email}` }, email));
  return parts.length ? el('span', { class: 'contact' }, parts.flatMap((x, i) => (i ? [' · ', x] : [x]))) : null;
}

function memberSub(m) {
  return [m.birth_year ? `${ageFromYear(m.birth_year)} år` : null, m.city].filter(Boolean).join(' · ');
}

/** Liten dialog med inntastingsfelt. Gir verdiene, eller null ved avbryt. */
function formDialog(title, fields, okLabel = 'OK', intro = '') {
  return new Promise((resolve) => {
    const inputs = {};
    const form = el('form', { method: 'dialog' },
      el('h2', {}, title),
      intro ? el('p', { class: 'hint', style: 'margin:-4px 0 16px' }, intro) : null,
      fields.map((f) => {
        const id = 'fd-' + f.name;
        const input = f.options
          ? el('select', { id }, f.options.map(([v, t]) => el('option', { value: v }, t)))
          : el('input', { id, type: f.type || 'text', maxlength: f.max || 100, required: f.required, value: f.value || '' });
        inputs[f.name] = input;
        return el('div', { class: 'field' }, el('label', { for: id }, f.label), input);
      }),
      el('div', { class: 'actions' },
        el('button', { type: 'submit', value: 'ok' }, okLabel),
        el('button', { type: 'submit', value: 'cancel', class: 'secondary', formnovalidate: true }, 'Avbryt')));
    const dlg = el('dialog', {}, form);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok'
        ? Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()])) : null);
      dlg.remove();
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Generell dialog bygget av elementer. Gir dialogen tilbake. */
function openDialog(...children) {
  const dlg = el('dialog', {}, ...children);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function copyButton(text, input) {
  return el('button', {
    onclick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Kopiert.'); }
      catch { input?.select(); toast('Marker teksten og kopier den.'); }
    },
  }, 'Kopier');
}

function downloadCsv(rows, label) {
  if (!rows.length) return toast('Ingen å laste ned.');
  if (window.__DEMO__) return toast('Nedlasting er slått av i forhåndsvisningen.');
  const safe = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['Navn', 'Fødselsår', 'Alder', 'Postnummer', 'Sted', 'Gruppe', 'Registrert'];
  const lines = [header, ...rows.map((m) => [
    m.full_name, m.birth_year, m.birth_year ? ageFromYear(m.birth_year) : '', m.postal_code, m.city,
    groupName(m.group_id), new Date(m.created_at).toLocaleDateString('nb-NO'),
  ])].map((r) => r.map(safe).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const slug = label.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
  const a = el('a', { href: URL.createObjectURL(blob), download: `${slug}-${today()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

// =====================================================================
//  Visning og ruting
// =====================================================================

function show(view) {
  for (const v of ['login', 'invite', 'recovery', 'noaccess', 'app']) $('view-' + v).hidden = v !== view;
  $('usermenu').hidden = !(view === 'app' || view === 'noaccess');
}

async function route(session) {
  state.session = session;
  if (inRecovery && session) return show('recovery');
  if (state.inviteCode) return showInvite();
  if (!session) return show('login');
  try {
    await loadAll();
  } catch (err) {
    toast(friendlyError(err), 'error');
    return;
  }
  const name = personName(state.me) || session.user.email;
  $('who').textContent = firstName({ full_name: name });
  $('menu-who').textContent = name;
  if (!state.isAdmin && state.groups.length === 0) return show('noaccess');

  // Start alltid på riktig fane for rollen (hindrer at en admin-fane henger igjen)
  const tabs = state.isAdmin ? ADMIN_TABS : LEADER_TABS;
  const valid = tabs.some(([t]) => t === state.tab) || (state.isAdmin && state.tab === 'group');
  if (!state.tab || !valid) state.tab = tabs[0][0];
  state.view = 'home';
  await selectGroup(state.current);
  renderAll();
  setTab(state.tab);
  show('app');
}

// =====================================================================
//  Data
// =====================================================================

async function loadAll() {
  const uid = state.session.user.id;
  const [me, groups, leaders, members, invites, triads, triadMembers] = await Promise.all([
    q(supabase.from('profiles').select('id, email, full_name, role, phone').eq('id', uid).maybeSingle()),
    q(supabase.from('groups').select('id, name, description, active, created_at').order('name')),
    q(supabase.from('group_leaders').select('group_id, user_id, role, member_id, profiles(full_name, email, phone)')),
    q(supabase.from('members').select('id, group_id, full_name, birth_year, postal_code, city, archived_at, created_at').order('full_name')),
    q(supabase.from('group_invites').select('code, group_id, role, name, email, phone, member_id, expires_at, used_at').order('created_at')),
    q(supabase.from('triads').select('id, name, created_at').order('created_at')),
    q(supabase.from('triad_members').select('triad_id, user_id, profiles(full_name, email, phone)')),
  ]);
  state.me = me;
  state.isAdmin = me?.role === 'admin';
  state.leaders = leaders || [];
  state.members = members || [];
  state.allGroups = groups || [];
  state.triads = triads || [];
  state.triadMembers = triadMembers || [];
  const now = new Date();
  state.invites = (invites || []).filter((i) => !i.used_at && new Date(i.expires_at) > now);

  if (state.isAdmin) {
    state.groups = state.allGroups;
    const [profiles, meta] = await Promise.all([
      q(supabase.from('profiles').select('id, email, full_name, role, phone').order('email')),
      q(supabase.from('meetings').select('group_id, meeting_date').order('meeting_date', { ascending: false })),
    ]);
    state.profiles = profiles;
    state.meetingsMeta = meta || [];
  } else {
    const mine = new Set(state.leaders.filter((l) => l.user_id === uid).map((l) => l.group_id));
    state.groups = state.allGroups.filter((g) => mine.has(g.id));
    state.profiles = [];
    state.meetingsMeta = [];
  }
  if (!groupById(state.current)) {
    const saved = store.get('smagrupper-gruppe');
    state.current = groupById(saved)?.id || state.groups.find((g) => g.active)?.id || state.groups[0]?.id || null;
  }
  if (state.filterGroup && !groupById(state.filterGroup)) state.filterGroup = '';
}

async function loadMeetings() {
  state.meetings = state.current
    ? await q(supabase.from('meetings')
      .select('id, meeting_date, attendance(member_id)')
      .eq('group_id', state.current)
      .order('meeting_date', { ascending: false }))
    : [];
}

async function selectGroup(gid) {
  state.current = gid;
  if (gid) store.set('smagrupper-gruppe', gid);
  try { await loadMeetings(); } catch (err) { toast(friendlyError(err), 'error'); }
}

async function reload() {
  await loadAll();
  await loadMeetings();
  renderAll();
}

// =====================================================================
//  Faner og meny
// =====================================================================

function renderTabs() {
  const tabs = state.isAdmin ? ADMIN_TABS : LEADER_TABS;
  const nav = $('tabs');
  nav.innerHTML = '';
  for (const [id, label] of tabs) {
    const active = state.tab === id || (id === 'overview' && state.tab === 'group');
    nav.append(el('button', { role: 'tab', 'data-tab': id, 'aria-selected': String(active) }, label));
  }
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  renderTabs();
}

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  if (btn.dataset.tab === 'group') setView('home');
  setTab(btn.dataset.tab);
  window.scrollTo({ top: 0 });
});

$('btn-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('menu').hidden;
  $('menu').hidden = !open;
  $('btn-menu').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!$('menu').hidden && !e.target.closest('#usermenu')) {
    $('menu').hidden = true;
    $('btn-menu').setAttribute('aria-expanded', 'false');
  }
});

function renderAll() {
  renderGroupView();
  renderMyTriad();
  if (state.isAdmin) {
    renderOverview();
    renderMembersList();
    renderTriads();
    renderPeople();
  }
}

// =====================================================================
//  GRUPPEVISNING
// =====================================================================

function setView(view) {
  const changed = state.view !== view;
  state.view = view;
  $('group-home').hidden = view !== 'home';
  $('attend').hidden = view !== 'attend';
  $('split').hidden = view !== 'split';
  $('group-switch').hidden = view !== 'home';
  $('group-back').hidden = !(state.isAdmin && view === 'home');
  if (changed) window.scrollTo({ top: 0 });
}

async function openGroup(gid) {
  await selectGroup(gid);
  state.view = 'home';
  renderGroupView();
  setTab('group');
  window.scrollTo({ top: 0 });
}

$('group-back').addEventListener('click', () => { setTab('overview'); window.scrollTo({ top: 0 }); });

function renderGroupSwitch() {
  const box = $('group-switch');
  box.innerHTML = '';
  if (state.isAdmin || state.groups.length <= 1) return;
  for (const g of state.groups) {
    box.append(el('button', {
      class: 'chip-btn', 'aria-pressed': String(g.id === state.current),
      onclick: async () => { await selectGroup(g.id); renderGroupView(); },
    }, g.name));
  }
}

function renderGroupView() {
  renderGroupSwitch();
  const g = groupById(state.current);
  $('group-admin').hidden = !state.isAdmin;
  if (!g) {
    $('group-home').hidden = true;
    return;
  }
  setView(state.view);

  $('g-name').textContent = g.name;
  const meta = $('g-meta');
  meta.textContent = '';
  if (g.description) meta.append(g.description);
  if (!g.active) meta.append(' ', el('span', { class: 'pill grey' }, 'Inaktiv'));
  renderLeaderCard(g);

  const active = activeIn(g.id);
  $('g-count').textContent = active.length;
  $('btn-attend').disabled = active.length === 0;
  $('btn-delete-group').hidden = state.members.some((m) => m.group_id === g.id);

  renderSplitHint(g, active.length);
  renderParticipants(active);
  renderMeetings();
  renderArchived(g.id);
}

// ---- Leder og nestleder ----

function renderLeaderCard(g) {
  const box = $('g-leaders');
  box.innerHTML = '';
  const row = (label, who, actions, cls = '') => el('div', { class: 'lrow ' + cls },
    el('span', { class: 'lrole' }, label),
    el('span', { class: 'lwho' }, who),
    actions ? el('span', { class: 'lact' }, actions) : null);

  const ls = leadersOf(g.id);
  for (const l of ls) {
    const isMe = l.user_id === state.me?.id;
    const remove = l.role === 'nestleder' ? el('button', {
      class: 'ghost small muted-btn', 'aria-label': `Fjern ${personName(l.profiles)} som nestleder`,
      onclick: () => removeDeputy(g, l, isMe),
    }, 'Fjern') : null;
    box.append(row(roleLabel(l.role),
      [el('strong', {}, personName(l.profiles) + (isMe ? ' (deg)' : '')), contactLine(l.profiles?.phone, l.profiles?.email)],
      remove));
  }

  for (const i of pendingFor(g.id)) {
    box.append(row(roleLabel(i.role),
      [el('strong', {}, i.name || 'Invitert'), el('span', { class: 'contact' }, 'Invitert – har ikke logget inn ennå')],
      [
        el('button', { class: 'ghost small', onclick: () => shareInvite({ ...i, groupId: g.id }) }, 'Send lenken'),
        el('button', { class: 'ghost small muted-btn', onclick: () => cancelInvite(i) }, 'Avbryt'),
      ]));
  }

  if (state.isAdmin && !ls.some((l) => l.role === 'leder') && !pendingFor(g.id).some((i) => i.role === 'leder')) {
    box.append(row('Leder', el('span', { class: 'missing-text' }, 'Ingen leder'),
      el('button', { class: 'ghost small', onclick: () => inviteLeader(g) }, 'Inviter leder')));
  }

  if (!hasDeputy(g.id) && pendingDeputies(g.id).length === 0) {
    box.append(row('Nestleder',
      el('span', { class: 'missing-text' }, el('i', { class: 'dot', 'aria-hidden': 'true' }), 'Ingen nestleder ennå'),
      el('button', { class: 'ghost small', id: 'btn-choose-deputy', onclick: () => chooseDeputy(g) }, 'Velg nestleder')));
  }
}

async function removeDeputy(g, l, isMe) {
  const text = isMe
    ? `Fjerne deg selv som nestleder? Du mister tilgangen til gruppen.`
    : `Fjerne ${personName(l.profiles)} som nestleder? Vedkommende mister tilgangen til gruppen, men står fortsatt på deltakerlisten.`;
  if (!(await ask(text, 'Fjern', true))) return;
  const { error } = await supabase.rpc('remove_coleader', { p_group: g.id, p_user: l.user_id });
  if (error) return toast(friendlyError(error), 'error');
  toast('Nestlederen er fjernet.');
  if (isMe && !state.isAdmin) state.current = null;
  await reload();
  if (!state.isAdmin && state.groups.length === 0) show('noaccess');
}

async function cancelInvite(i) {
  if (!(await ask(`Avbryte invitasjonen til ${i.name || 'personen'}? Lenken slutter å virke.`, 'Avbryt invitasjonen', true))) return;
  const { error } = await supabase.from('group_invites').delete().eq('code', i.code);
  if (error) return toast(friendlyError(error), 'error');
  reload();
}

/** Viser en invitasjonslenke med knapper for SMS og e-post. */
function shareInvite({ code, name, role, email, phone, groupId }) {
  const gname = anyGroupName(groupId);
  const first = (name || '').split(' ')[0] || 'personen';
  const link = inviteLink(code);
  const what = role === 'nestleder' ? `nestleder i smågruppen til ${gname}` : 'leder for en smågruppe';
  const msg = `Hei ${first}! Du er invitert som ${what}. Åpne lenken for å lage konto og få tilgang: ${link}`;
  const input = el('input', { type: 'text', value: link, readonly: true, onfocus: (e) => e.target.select() });
  const dlg = openDialog(
    el('h2', {}, `Send invitasjonen til ${first}`),
    el('p', { class: 'hint', style: 'margin:-4px 0 14px' },
      `Når ${first} åpner lenken, lager hen en konto${email ? ` med ${email}` : ''} og får tilgang som ${role}. Lenken kan brukes én gang og varer i 30 dager.`),
    el('div', { class: 'copy-row' }, input, copyButton(link, input)),
    el('div', { class: 'actions', style: 'margin-top:14px' },
      phone ? el('a', { class: 'btn', href: `sms:${phone}?&body=${encodeURIComponent(msg)}` }, 'Send på SMS') : null,
      email ? el('a', {
        class: 'btn secondary',
        href: `mailto:${email}?subject=${encodeURIComponent('Invitasjon til smågruppe')}&body=${encodeURIComponent(msg)}`,
      }, 'Send på e-post') : null),
    window.__DEMO__ ? el('button', {
      class: 'ghost small', style: 'margin-top:8px',
      onclick: async () => {
        // Bare i forhåndsvisningen: prøv lenken som den inviterte
        dlg.close();
        state.inviteCode = code;
        history.replaceState(null, '', '#inv-' + code);
        await supabase.auth.signOut();
      },
    }, `Prøv lenken som ${first} (logger deg ut)`) : null,
    el('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:12px' },
      el('button', { class: 'secondary', onclick: () => dlg.close() }, 'Lukk')));
}

/** Felles skjema for e-post og telefon. */
function contactFields(prefix) {
  const email = el('input', { type: 'email', id: prefix + '-email', autocomplete: 'off', maxlength: 120 });
  const phone = el('input', { type: 'tel', id: prefix + '-phone', inputmode: 'tel', autocomplete: 'off', maxlength: 20 });
  return {
    email, phone,
    nodes: el('div', { class: 'row' },
      el('div', { class: 'field' }, el('label', { for: prefix + '-email' }, 'E-post'), email),
      el('div', { class: 'field' }, el('label', { for: prefix + '-phone' }, 'Telefon'), phone)),
    read() {
      const em = email.value.trim().toLowerCase();
      const ph = normPhone(phone.value);
      if (!validEmail(em)) return { error: 'Skriv inn en gyldig e-postadresse.' };
      if (!validPhone(ph)) return { error: 'Skriv inn et gyldig telefonnummer (8 sifre).' };
      return { email: em, phone: ph };
    },
  };
}

function chooseDeputy(g) {
  const taken = new Set([...leadersOf(g.id).map((l) => l.member_id), ...pendingFor(g.id).map((i) => i.member_id)].filter(Boolean));
  const people = activeIn(g.id).filter((m) => !taken.has(m.id));
  if (!people.length) {
    return toast('Nestlederen velges blant deltakerne. Del påmeldingslenken først.', 'error');
  }
  const sel = el('select', { id: 'dep-member' },
    el('option', { value: '' }, 'Velg person …'),
    people.map((m) => el('option', { value: m.id }, m.full_name)));
  const contact = contactFields('dep');
  const errBox = el('div', { class: 'notice error', hidden: true });
  const save = el('button', { type: 'submit', value: 'ok', id: 'dep-save' }, 'Lag invitasjon');
  const form = el('form', { method: 'dialog' },
    el('h2', {}, 'Velg nestleder'),
    el('p', { class: 'hint', style: 'margin:-4px 0 16px' },
      'Nestlederen får samme tilgang som lederen: ser gruppen, tar oppmøte og kan multiplisere.'),
    el('div', { class: 'field' }, el('label', { for: 'dep-member' }, 'Hvem i gruppen?'), sel),
    contact.nodes, errBox,
    el('div', { class: 'actions' }, save,
      el('button', { type: 'submit', value: 'cancel', class: 'secondary', formnovalidate: true }, 'Avbryt')));
  const dlg = openDialog(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return dlg.close();
    const fail = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
    const member = people.find((m) => m.id === sel.value);
    if (!member) return fail('Velg hvem som skal være nestleder.');
    const c = contact.read();
    if (c.error) return fail(c.error);
    save.disabled = true;
    const { data: code, error } = await supabase.rpc('create_invite', {
      p_group: g.id, p_role: 'nestleder', p_name: member.full_name, p_email: c.email, p_phone: c.phone, p_member_id: member.id,
    });
    save.disabled = false;
    if (error) return fail(friendlyError(error));
    dlg.close();
    await reload();
    shareInvite({ code, name: member.full_name, role: 'nestleder', email: c.email, phone: c.phone, groupId: g.id });
  });
  sel.focus();
}

async function inviteLeader(g) {
  const v = await formDialog('Inviter leder', [
    { name: 'name', label: 'Navn', required: true },
    { name: 'email', label: 'E-post', type: 'email' },
    { name: 'phone', label: 'Telefon', type: 'tel' },
  ], 'Lag lenke', 'Gruppen får navnet til lederen. Du får en lenke å sende til personen.');
  if (!v) return;
  const phone = normPhone(v.phone);
  if (v.name.length < 2) return toast('Skriv inn navnet.', 'error');
  if (v.email && !validEmail(v.email)) return toast('E-postadressen ser ikke riktig ut.', 'error');
  if (phone && !validPhone(phone)) return toast('Telefonnummeret ser ikke riktig ut.', 'error');
  const { data: code, error } = await supabase.rpc('create_invite', {
    p_group: g.id, p_role: 'leder', p_name: v.name, p_email: v.email || null, p_phone: phone || null, p_member_id: null,
  });
  if (error) return toast(friendlyError(error), 'error');
  await reload();
  shareInvite({ code, name: v.name, role: 'leder', email: v.email, phone, groupId: g.id });
}

// ---- Multiplisere: forslag og forklaring ----

function renderSplitHint(g, count) {
  const box = $('split-hint');
  box.innerHTML = '';
  const dismissedAt = Number(store.get('smagrupper-ikke-na-' + g.id) || 0);
  if (count < SPLIT_SUGGEST_AT || count <= dismissedAt) return;
  box.append(el('div', { class: 'soft-hint' },
    el('p', {}, `Gruppen har ${count} deltakere. Kanskje det er på tide å multiplisere?`),
    el('div', { class: 'soft-actions' },
      el('button', { class: 'ghost small', onclick: () => whyMultiply(true) }, 'Hvorfor multiplisere?'),
      el('button', { class: 'ghost small', onclick: startSplit }, 'Multipliser'),
      el('button', {
        class: 'ghost small muted-btn',
        onclick: () => { store.set('smagrupper-ikke-na-' + g.id, String(count)); renderSplitHint(g, count); },
      }, 'Ikke nå'))));
}

function whyMultiply(offerStart = false) {
  const points = [
    'Flest mulig skal få en gruppe å høre til.',
    'Flere skal bli disippelgjort.',
    'Vi skal alltid ha plass til nye i smågruppene.',
    'Nye ledere blir utfordret og får vokse.',
    'Oppmøtet blir ofte bedre når man er færre.',
    'Gruppene fungerer best når de er færre enn åtte.',
  ];
  const dlg = openDialog(
    el('h2', {}, 'Hvorfor multiplisere?'),
    el('p', {}, 'Når en smågruppe vokser, deler vi den i to. Det er viktig fordi:'),
    el('ol', { class: 'why-list' }, points.map((p) => el('li', {}, p))),
    el('p', { class: 'why-foot' },
      'Vi forstår at det kan være utfordrende å multiplisere, og at det er kjipt å dele en gruppe som fungerer veldig godt. ' +
      'Likevel er det en utrolig viktig del av det vi gjør som kirke, for å nå enda flere, og for at alle skal få muligheten til et mindre fellesskap.'),
    el('p', { class: 'why-foot' }, 'Når dere skal multiplisere, ønsker vi at dere gjør det i dialog med lederne for smågruppearbeidet.'),
    el('div', { class: 'actions', style: 'justify-content:flex-end' },
      offerStart ? el('button', { class: 'secondary', onclick: () => { dlg.close(); startSplit(); } }, 'Multipliser gruppen') : null,
      el('button', { onclick: () => dlg.close() }, 'Lukk')));
}

$('btn-why').addEventListener('click', () => whyMultiply(true));
document.addEventListener('click', (e) => { if (e.target.closest('[data-why]')) whyMultiply(false); });

// ---- Deltakere ----

function recentFor(m) {
  const joined = isoDay(m.created_at);
  return state.meetings.filter((mt) => mt.meeting_date >= joined).slice(0, 5).reverse()
    .map((mt) => ({ date: mt.meeting_date, present: mt.attendance.some((a) => a.member_id === m.id) }));
}

function memberRoles(gid) {
  const roles = new Map();
  for (const i of pendingFor(gid)) if (i.member_id) roles.set(i.member_id, [`${roleLabel(i.role)} (invitert)`, 'pending']);
  for (const l of leadersOf(gid)) if (l.member_id) roles.set(l.member_id, [roleLabel(l.role), '']);
  return roles;
}

function renderParticipants(active) {
  const list = $('participants');
  list.innerHTML = '';
  const roles = memberRoles(state.current);
  if (!active.length) {
    list.append(el('li', { class: 'empty' }, 'Ingen deltakere ennå. Trykk «+ Legg til» for å få en lenke du kan sende til dem som skal være med.'));
    return;
  }
  for (const m of active) {
    const recent = recentFor(m);
    const dots = el('span', {
      class: 'dots',
      title: recent.length ? `Til stede ${recent.filter((r) => r.present).length} av ${recent.length} siste samlinger` : 'Ingen samlinger ennå',
    }, recent.map((r) => el('i', { class: r.present ? 'on' : '' })));
    list.append(el('li', {},
      el('button', { class: 'prow', onclick: () => openPerson(m) },
        el('span', { class: 'pmain' },
          el('span', { class: 'pname' }, m.full_name,
            roles.has(m.id) ? el('span', { class: `role-pill ${roles.get(m.id)[1]}` }, roles.get(m.id)[0]) : null),
          el('span', { class: 'psub' }, memberSub(m))),
        dots)));
  }
}

function openPerson(m, { adminList = false } = {}) {
  const dlg = $('dlg-person');
  $('p-name').textContent = m.full_name;
  const facts = $('p-facts');
  facts.innerHTML = '';
  const fact = (label, value) => value && facts.append(el('dt', {}, label), el('dd', {}, value));
  fact('Alder', m.birth_year ? `${ageFromYear(m.birth_year)} år (født ${m.birth_year})` : null);
  fact('Bosted', [m.postal_code, m.city].filter(Boolean).join(' '));
  if (adminList) fact('Gruppe', groupName(m.group_id));
  fact('Med siden', formatDate(m.created_at));
  if (!adminList) {
    const joined = isoDay(m.created_at);
    const relevant = state.meetings.filter((mt) => mt.meeting_date >= joined);
    if (relevant.length) {
      const present = relevant.filter((mt) => mt.attendance.some((a) => a.member_id === m.id)).length;
      fact('Oppmøte', `${present} av ${relevant.length} samlinger`);
    }
  }

  const extra = $('p-extra');
  extra.innerHTML = '';
  if (state.isAdmin && state.groups.length > 1) {
    const move = el('select', { id: 'p-move', class: 'compact' },
      el('option', { value: '' }, 'Flytt til en annen gruppe …'),
      state.groups.filter((g) => g.id !== m.group_id && g.active).map((g) => el('option', { value: g.id }, g.name)));
    move.addEventListener('change', async () => {
      if (!move.value) return;
      const target = move.value;
      dlg.close();
      if (!(await ask(`Flytte ${m.full_name} til gruppen til ${groupName(target)}?`, 'Flytt'))) return;
      const { error } = await supabase.from('members').update({ group_id: target }).eq('id', m.id);
      if (error) return toast(friendlyError(error), 'error');
      toast(`${m.full_name} er flyttet.`);
      reload();
    });
    extra.append(el('div', { class: 'field' }, move));
  }

  const actions = $('p-actions');
  actions.innerHTML = '';
  actions.append(
    el('button', { class: 'secondary', onclick: () => { dlg.close(); openMemberForm(m); } }, 'Rediger'),
    el('button', {
      class: 'secondary',
      onclick: async () => {
        dlg.close();
        const { error } = await supabase.from('members').update({ archived_at: new Date().toISOString() }).eq('id', m.id);
        if (error) return toast(friendlyError(error), 'error');
        toast(`${m.full_name} er arkivert.`);
        reload();
      },
    }, 'Arkiver'),
    el('button', { class: 'ghost', onclick: () => dlg.close() }, 'Lukk'),
  );
  dlg.showModal();
}

// Legg til = del påmeldingslenken
function shareSignup(g) {
  const link = signupLink(g.id);
  const msg = `Hei! Her er lenken for å bli med i smågruppen til ${g.name}: ${link}`;
  const input = el('input', { type: 'text', value: link, readonly: true, onfocus: (e) => e.target.select() });
  const dlg = openDialog(
    el('h2', {}, 'Legg til deltakere'),
    el('p', { class: 'hint', style: 'margin:-4px 0 14px' },
      'Send denne lenken til dem som skal være med. De fyller inn navn, fødselsår og bosted selv, og havner rett i gruppen.'),
    el('div', { class: 'copy-row' }, input, copyButton(link, input)),
    el('div', { class: 'actions', style: 'margin-top:14px' },
      navigator.share && !window.__DEMO__
        ? el('button', { onclick: () => navigator.share({ title: 'Bli med i smågruppe', text: msg }).catch(() => {}) }, 'Del …')
        : null,
      el('a', { class: 'btn secondary', href: `sms:?&body=${encodeURIComponent(msg)}` }, 'Send på SMS'),
      el('a', { class: 'btn secondary', href: `mailto:?subject=${encodeURIComponent('Bli med i smågruppe')}&body=${encodeURIComponent(msg)}` }, 'Send på e-post')),
    el('div', { class: 'actions', style: 'justify-content:space-between;margin-top:12px' },
      state.isAdmin ? el('button', { class: 'ghost small', onclick: () => { dlg.close(); openMemberForm(null); } }, 'Legg inn manuelt') : el('span'),
      el('button', { class: 'secondary', onclick: () => dlg.close() }, 'Lukk')));
}

$('btn-add').addEventListener('click', () => shareSignup(groupById(state.current)));

// Rediger (eller admin legger inn manuelt)
let editing = null;
function openMemberForm(m = null) {
  editing = m;
  $('dlg-member-title').textContent = m ? 'Rediger deltaker' : 'Legg inn deltaker';
  $('m-save').textContent = m ? 'Lagre' : 'Legg inn';
  $('m-name').value = m?.full_name || '';
  $('m-year').value = m?.birth_year || '';
  $('m-pc').value = m?.postal_code || '';
  $('m-city').value = m?.city || '';
  $('m-consent').checked = false;
  $('m-consent-field').hidden = !!m;
  $('m-error').hidden = true;
  $('dlg-member').showModal();
  $('m-name').focus();
}

$('dlg-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') return $('dlg-member').close();
  const err = (msg) => { $('m-error').textContent = msg; $('m-error').hidden = false; };
  const v = {
    full_name: $('m-name').value.trim().replace(/\s+/g, ' '),
    birth_year: $('m-year').value.trim() ? Number($('m-year').value.trim()) : null,
    postal_code: $('m-pc').value.trim() || null,
    city: $('m-city').value.trim() || null,
  };
  if (v.full_name.length < 2) return err('Skriv inn navnet.');
  if (v.birth_year !== null && (!(v.birth_year >= 1900) || v.birth_year > new Date().getFullYear())) return err('Fødselsår må være fire siffer, f.eks. 1990.');
  if (v.postal_code && !/^\d{4}$/.test(v.postal_code)) return err('Postnummer må være fire siffer.');
  if (v.city && v.city.length < 2) return err('Sted er for kort.');
  if (!editing && !$('m-consent').checked) return err('Kryss av for at personen har sagt ja.');

  const { error } = editing
    ? await supabase.from('members').update(v).eq('id', editing.id)
    : await supabase.from('members').insert({ ...v, group_id: state.current, consent: true });
  if (error) return err(friendlyError(error));
  $('dlg-member').close();
  toast(editing ? 'Lagret.' : `${v.full_name} er lagt inn.`);
  reload();
});

// ---- Arkiv ----

function renderArchived(gid) {
  const archived = archivedIn(gid);
  $('archived-box').hidden = archived.length === 0;
  $('archived-count').textContent = archived.length;
  const list = $('archived');
  list.innerHTML = '';
  for (const m of archived) {
    list.append(el('li', { class: 'arow' },
      el('span', { class: 'pmain' },
        el('span', { class: 'pname' }, m.full_name),
        el('span', { class: 'psub' }, 'Arkivert ' + formatDate(m.archived_at))),
      el('span', { class: 'actions' },
        el('button', {
          class: 'secondary small',
          onclick: async () => {
            const { error } = await supabase.from('members').update({ archived_at: null }).eq('id', m.id);
            if (error) return toast(friendlyError(error), 'error');
            toast(`${m.full_name} er tilbake i gruppen.`);
            reload();
          },
        }, 'Gjenopprett'),
        el('button', {
          class: 'danger small',
          onclick: async () => {
            if (!(await ask(`Slette ${m.full_name} for godt? Oppmøtehistorikken slettes også. Dette kan ikke angres.`, 'Slett', true))) return;
            const { error, count } = await supabase.from('members').delete({ count: 'exact' }).eq('id', m.id);
            if (error) return toast(friendlyError(error), 'error');
            if (count === 0) return toast('Du har ikke tilgang til å slette denne personen.', 'error');
            toast(`${m.full_name} er slettet.`);
            reload();
          },
        }, 'Slett'))));
  }
}

// ---- Tidligere samlinger ----

function renderMeetings() {
  const mts = state.meetings;
  $('meetings-box').hidden = mts.length === 0;
  $('meetings-count').textContent = mts.length;
  const list = $('meetings');
  list.innerHTML = '';
  for (const mt of mts) {
    list.append(el('li', {},
      el('button', { class: 'mrow', onclick: () => openAttend(mt.meeting_date) },
        el('span', {}, longDate(mt.meeting_date)),
        el('span', { class: 'psub' }, `${mt.attendance.length} til stede`))));
  }
}

// ---- Admin-valg for gruppen ----

$('btn-edit-group').addEventListener('click', () => {
  const g = groupById(state.current);
  const dlg = $('dlg-group');
  $('dlg-group-desc').value = g.description || '';
  $('dlg-group-active').checked = g.active;
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'save') return;
    const { error } = await supabase.from('groups').update({
      description: $('dlg-group-desc').value.trim() || null,
      active: $('dlg-group-active').checked,
    }).eq('id', g.id);
    if (error) return toast(friendlyError(error), 'error');
    toast('Gruppen er oppdatert.');
    reload();
  };
  dlg.returnValue = '';
  dlg.showModal();
});
$('btn-invite-leader').addEventListener('click', () => inviteLeader(groupById(state.current)));
$('btn-delete-group').addEventListener('click', async () => {
  const g = groupById(state.current);
  if (!(await ask(`Slette gruppen til ${g.name}? Den har ingen deltakere.`, 'Slett', true))) return;
  const { error } = await supabase.from('groups').delete().eq('id', g.id);
  if (error) return toast(friendlyError(error), 'error');
  toast('Gruppen er slettet.');
  state.current = null;
  await reload();
  setTab('overview');
});
$('btn-export-group').addEventListener('click', () => downloadCsv(activeIn(state.current), groupName(state.current)));

// =====================================================================
//  OPPMØTE
// =====================================================================

function openAttend(date = today()) {
  state.attend.date = date;
  $('attend-date').value = date;
  $('attend-date').max = today();
  loadAttendForDate();
  setView('attend');
}

function loadAttendForDate() {
  const mt = state.meetings.find((x) => x.meeting_date === state.attend.date);
  state.attend.meetingId = mt?.id || null;
  state.attend.present = new Set(mt ? mt.attendance.map((a) => a.member_id) : []);
  $('attend-existing').textContent = mt ? 'Oppmøte er allerede registrert denne dagen. Du kan endre det.' : '';
  $('attend-delete').hidden = !mt;
  renderAttendList();
}

function renderAttendList() {
  const list = $('attend-list');
  list.innerHTML = '';
  for (const m of activeIn(state.current)) {
    const on = state.attend.present.has(m.id);
    list.append(el('li', {},
      el('button', {
        class: 'arow-btn', role: 'checkbox', 'aria-checked': String(on),
        onclick: (e) => {
          const btn = e.currentTarget;
          const now = !state.attend.present.has(m.id);
          if (now) state.attend.present.add(m.id); else state.attend.present.delete(m.id);
          btn.setAttribute('aria-checked', String(now));
          updateAttendCount();
        },
      },
      el('span', { class: 'tick', 'aria-hidden': 'true' }),
      el('span', { class: 'pname' }, m.full_name))));
  }
  updateAttendCount();
}

function updateAttendCount() {
  const people = activeIn(state.current);
  const n = people.filter((m) => state.attend.present.has(m.id)).length;
  $('attend-count').innerHTML = '';
  $('attend-count').append(el('strong', {}, n), ` av ${people.length} til stede`);
  $('attend-all').textContent = n === people.length ? 'Fjern alle' : 'Alle til stede';
}

$('btn-attend').addEventListener('click', () => openAttend());
$('attend-back').addEventListener('click', () => setView('home'));
$('attend-date').addEventListener('change', (e) => {
  if (!e.target.value) return;
  state.attend.date = e.target.value;
  loadAttendForDate();
});
$('attend-all').addEventListener('click', () => {
  const people = activeIn(state.current);
  const allOn = people.every((m) => state.attend.present.has(m.id));
  state.attend.present = new Set(allOn ? [] : people.map((m) => m.id));
  renderAttendList();
});

$('attend-save').addEventListener('click', async () => {
  const date = $('attend-date').value;
  if (!date) return toast('Velg en dato.', 'error');
  if (date > today()) return toast('Datoen kan ikke være fram i tid.', 'error');
  const ids = activeIn(state.current).filter((m) => state.attend.present.has(m.id)).map((m) => m.id);
  const btn = $('attend-save');
  btn.disabled = true;
  const { error } = await supabase.rpc('save_attendance', { p_group: state.current, p_date: date, p_member_ids: ids });
  btn.disabled = false;
  if (error) return toast(friendlyError(error), 'error');
  toast(`Oppmøte lagret: ${ids.length} av ${activeIn(state.current).length} til stede.`);
  setView('home');
  await reload();
});

$('attend-delete').addEventListener('click', async () => {
  if (!state.attend.meetingId) return;
  if (!(await ask(`Slette samlingen ${longDate(state.attend.date).toLowerCase()} og oppmøtet som er registrert?`, 'Slett', true))) return;
  const { error } = await supabase.from('meetings').delete().eq('id', state.attend.meetingId);
  if (error) return toast(friendlyError(error), 'error');
  toast('Samlingen er slettet.');
  setView('home');
  await reload();
});

// =====================================================================
//  MULTIPLISERE
// =====================================================================

function startSplit() {
  const g = groupById(state.current);
  const deputies = deputiesOf(g.id);
  state.split = {
    leader: deputies[0]?.user_id || 'invite',
    side: Object.fromEntries(activeIn(g.id).map((m) => [m.id, 'A'])),
    newName: '',
  };
  ['name', 'email', 'phone'].forEach((f) => ($('split-invite-' + f).value = ''));
  renderLeaderOptions();
  splitStep(1);
  setView('split');
}

function splitStep(n) {
  document.querySelectorAll('[data-splitstep]').forEach((s) => (s.hidden = s.dataset.splitstep !== String(n)));
  document.querySelectorAll('#split-steps [data-step]').forEach((s) => s.classList.toggle('on', Number(s.dataset.step) <= n));
  $('split-back').hidden = n === 3;
  window.scrollTo({ top: 0 });
}

function renderLeaderOptions() {
  const g = groupById(state.current);
  const box = $('split-leader-options');
  box.innerHTML = '';
  const option = (value, title, sub) => {
    const id = 'sl-' + value;
    const input = el('input', { type: 'radio', name: 'split-leader', id, value, checked: state.split.leader === value });
    input.addEventListener('change', () => { state.split.leader = value; renderLeaderOptions(); });
    return el('label', { class: 'choice', for: id }, input,
      el('span', {}, el('strong', {}, title), sub ? el('span', { class: 'psub' }, sub) : null));
  };
  for (const l of deputiesOf(g.id)) {
    box.append(option(l.user_id, personName(l.profiles), 'Nestleder i dag. Slutter som nestleder her og leder den nye gruppen.'));
  }
  box.append(option('invite', 'En ny leder', 'Du får en invitasjonslenke å sende til vedkommende'));
  $('split-new-leader').hidden = state.split.leader !== 'invite';
}

$('btn-split').addEventListener('click', startSplit);
$('split-back').addEventListener('click', () => setView('home'));

$('split-next').addEventListener('click', () => {
  const s = state.split;
  if (s.leader === 'invite') {
    const name = $('split-invite-name').value.trim();
    if (name.length < 2) { $('split-invite-name').focus(); return toast('Skriv navnet på den nye lederen.', 'error'); }
    const em = $('split-invite-email').value.trim().toLowerCase();
    const ph = normPhone($('split-invite-phone').value);
    if (!validEmail(em)) { $('split-invite-email').focus(); return toast('Skriv inn en gyldig e-postadresse.', 'error'); }
    if (!validPhone(ph)) { $('split-invite-phone').focus(); return toast('Skriv inn et gyldig telefonnummer.', 'error'); }
    Object.assign(s, { newName: name, email: em, phone: ph });
  } else {
    s.newName = personName(leadersOf(state.current).find((l) => l.user_id === s.leader)?.profiles);
  }
  renderSplitList();
  splitStep(2);
});

function renderSplitList() {
  const g = groupById(state.current);
  const people = activeIn(g.id);
  const a = people.filter((m) => state.split.side[m.id] === 'A').length;
  const b = people.length - a;
  $('split-totals').innerHTML = '';
  $('split-totals').append(
    el('div', { class: 'total a' }, el('b', {}, a), el('span', {}, g.name)),
    el('div', { class: 'total b' }, el('b', {}, b), el('span', {}, state.split.newName)));
  const list = $('split-list');
  list.innerHTML = '';
  for (const m of people) {
    const side = state.split.side[m.id];
    list.append(el('li', {},
      el('button', {
        class: `srow ${side === 'B' ? 'b' : 'a'}`,
        onclick: () => { state.split.side[m.id] = side === 'A' ? 'B' : 'A'; renderSplitList(); },
      },
      el('span', { class: 'pmain' },
        el('span', { class: 'pname' }, m.full_name),
        el('span', { class: 'psub' }, [m.postal_code, m.city].filter(Boolean).join(' '))),
      el('span', { class: 'sidepill' }, side === 'A' ? g.name : state.split.newName))));
  }
  $('split-confirm').disabled = a === 0 || b === 0;
}

$('split-by-postcode').addEventListener('click', () => {
  const people = activeIn(state.current).slice()
    .sort((x, y) => (x.postal_code || '9999').localeCompare(y.postal_code || '9999') || x.full_name.localeCompare(y.full_name, 'nb'));
  const half = Math.ceil(people.length / 2);
  people.forEach((m, i) => (state.split.side[m.id] = i < half ? 'A' : 'B'));
  renderSplitList();
  toast('Fordelt etter postnummer. Juster gjerne.');
});

$('split-confirm').addEventListener('click', async () => {
  const g = groupById(state.current);
  const s = state.split;
  const moving = activeIn(g.id).filter((m) => s.side[m.id] === 'B');
  const msg = s.leader === 'invite'
    ? `Lage en ny gruppe med ${moving.length} deltakere, og invitere ${s.newName} som leder?`
    : `Lage en ny gruppe med ${moving.length} deltakere, ledet av ${s.newName}?`;
  if (!(await ask(msg, 'Multipliser'))) return;
  const btn = $('split-confirm');
  btn.disabled = true;
  const { data, error } = await supabase.rpc('split_group', {
    p_source: g.id,
    p_member_ids: moving.map((m) => m.id),
    p_leader_user: s.leader === 'invite' ? null : s.leader,
    p_move_leader: true,
    p_invite_name: s.leader === 'invite' ? s.newName : null,
    p_invite_email: s.leader === 'invite' ? s.email : null,
    p_invite_phone: s.leader === 'invite' ? s.phone : null,
  });
  btn.disabled = false;
  if (error) return toast(friendlyError(error), 'error');
  $('split-result').textContent = `Den nye gruppen til ${data.name} har ${data.moved} deltakere. Din gruppe har nå ${activeIn(g.id).length - data.moved}.`;
  s.result = data;
  $('split-send').hidden = !data.invite_code;
  splitStep(3);
  if (data.invite_code) sendSplitInvite();
});

function sendSplitInvite() {
  const s = state.split;
  shareInvite({ code: s.result.invite_code, name: s.newName, role: 'leder', email: s.email, phone: s.phone, groupId: s.result.group_id });
}
$('split-send').addEventListener('click', sendSplitInvite);

$('split-done').addEventListener('click', async () => {
  state.split = null;
  state.view = 'home';
  await reload();
  if (!state.isAdmin && state.groups.length === 0) return show('noaccess');
  setView('home');
});

// =====================================================================
//  TRIADE (leder)
// =====================================================================

function triadPeople(triadId) {
  return state.triadMembers.filter((m) => m.triad_id === triadId);
}
function groupsLedBy(userId) {
  return state.leaders.filter((l) => l.user_id === userId)
    .map((l) => `${roleLabel(l.role)} for gruppen til ${anyGroupName(l.group_id)}`);
}

function renderMyTriad() {
  const box = $('my-triad');
  box.innerHTML = '';
  const mine = state.triadMembers.find((m) => m.user_id === state.me?.id);
  if (!mine) {
    box.append(el('div', { class: 'card plain empty-card' },
      el('p', {}, 'Du er ikke satt i en triade ennå.'),
      el('p', { class: 'hint' }, 'Administratorene setter sammen triadene.')));
    return;
  }
  const t = state.triads.find((x) => x.id === mine.triad_id);
  const people = triadPeople(mine.triad_id)
    .sort((a, b) => (a.user_id === state.me.id) - (b.user_id === state.me.id) || personName(a.profiles).localeCompare(personName(b.profiles), 'nb'));
  box.append(el('section', { class: 'card plain' },
    el('div', { class: 'card-head' }, el('h2', {}, t?.name || 'Din triade')),
    el('ul', { class: 'tlist' }, people.map((p) => {
      const isMe = p.user_id === state.me.id;
      return el('li', {},
        el('strong', {}, personName(p.profiles) + (isMe ? ' (deg)' : '')),
        groupsLedBy(p.user_id).map((s) => el('span', { class: 'psub' }, s)),
        !isMe ? contactLine(p.profiles?.phone, p.profiles?.email) : null);
    }))));
}

// =====================================================================
//  OVERSIKT (admin)
// =====================================================================

function lastMeeting(gid) {
  return state.meetingsMeta.find((m) => m.group_id === gid)?.meeting_date || null;
}

function groupCard(g) {
  const count = activeIn(g.id).length;
  const deps = deputiesOf(g.id);
  const pendingDep = pendingDeputies(g.id);
  const hasLeader = leadersOf(g.id).some((l) => l.role === 'leder');
  const last = lastMeeting(g.id);
  let deputyLine;
  if (deps.length) deputyLine = el('span', {}, 'Nestleder: ' + deps.map((d) => personName(d.profiles)).join(', '));
  else if (pendingDep.length) deputyLine = el('span', { class: 'muted' }, `Nestleder invitert: ${pendingDep[0].name || ''}`);
  else deputyLine = el('span', { class: 'missing-text' }, el('i', { class: 'dot', 'aria-hidden': 'true' }), 'Ingen nestleder');
  const bits = [
    last ? `Sist samlet ${shortDate(last)}` : 'Ingen samlinger ennå',
    !hasLeader ? (pendingFor(g.id).some((i) => i.role === 'leder') ? 'leder invitert' : 'ingen leder') : null,
    g.active && count >= SPLIT_SUGGEST_AT ? 'klar for å multiplisere' : null,
  ].filter(Boolean);
  return el('li', {},
    el('button', { class: 'gcard', onclick: () => openGroup(g.id) },
      el('span', { class: 'gmain' },
        el('span', { class: 'gname' }, g.name),
        el('span', { class: 'gline' }, deputyLine),
        el('span', { class: 'gline muted' }, bits.join(' · '))),
      el('span', { class: 'gcount' }, el('b', {}, count), el('small', {}, 'deltakere'))));
}

function renderOverview() {
  const active = state.groups.filter((g) => g.active);
  const inactive = state.groups.filter((g) => !g.active);
  const members = state.members.filter((m) => !m.archived_at).length;
  const missing = active.filter((g) => !hasDeputy(g.id)).length;
  const stats = $('ov-stats');
  stats.innerHTML = '';
  const stat = (n, label) => el('div', { class: 'stat' }, el('b', {}, n), el('span', {}, label));
  stats.append(stat(active.length, 'grupper'), stat(members, 'deltakere'), stat(missing, 'uten nestleder'));

  const list = $('ov-groups');
  list.innerHTML = '';
  if (!active.length) list.append(el('li', { class: 'empty' }, 'Ingen aktive grupper. Trykk «+ Ny gruppe».'));
  for (const g of active) list.append(groupCard(g));

  $('ov-inactive-box').hidden = inactive.length === 0;
  $('ov-inactive-count').textContent = inactive.length;
  $('ov-inactive').innerHTML = '';
  for (const g of inactive) $('ov-inactive').append(groupCard(g));
}

$('btn-new-group').addEventListener('click', () => {
  const existing = state.profiles.filter((p) => !state.leaders.some((l) => l.user_id === p.id && l.role === 'leder'));
  let mode = existing.length ? 'existing' : 'invite';
  const userSel = el('select', { id: 'ng-user' },
    el('option', { value: '' }, 'Velg person …'),
    existing.map((p) => el('option', { value: p.id }, personName(p))));
  const name = el('input', { type: 'text', id: 'ng-name', maxlength: 100, autocomplete: 'off' });
  const contact = contactFields('ng');
  const desc = el('input', { type: 'text', id: 'ng-desc', maxlength: 300, placeholder: 'f.eks. Tirsdager kl. 19 på Nesttun' });
  const existingBox = el('div', { class: 'field' }, el('label', { for: 'ng-user' }, 'Leder'), userSel);
  const inviteBox = el('div', {}, el('div', { class: 'field' }, el('label', { for: 'ng-name' }, 'Navn på lederen'), name), contact.nodes);
  const seg = el('div', { class: 'segmented', role: 'tablist' },
    el('button', { type: 'button', 'data-m': 'existing', disabled: !existing.length }, 'Har konto'),
    el('button', { type: 'button', 'data-m': 'invite' }, 'Inviter ny'));
  const setMode = (m) => {
    mode = m;
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === m)));
    existingBox.hidden = m !== 'existing';
    inviteBox.hidden = m !== 'invite';
  };
  seg.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b && !b.disabled) setMode(b.dataset.m); });
  const errBox = el('div', { class: 'notice error', hidden: true });
  const form = el('form', { method: 'dialog' },
    el('h2', {}, 'Ny gruppe'),
    el('p', { class: 'hint', style: 'margin:-4px 0 14px' }, 'Gruppen får navnet til lederen.'),
    seg, existingBox, inviteBox,
    el('div', { class: 'field' }, el('label', { for: 'ng-desc' }, 'Beskrivelse (valgfritt)'), desc),
    errBox,
    el('div', { class: 'actions' },
      el('button', { type: 'submit', value: 'ok' }, 'Lag gruppe'),
      el('button', { type: 'submit', value: 'cancel', class: 'secondary', formnovalidate: true }, 'Avbryt')));
  const dlg = openDialog(form);
  setMode(mode);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return dlg.close();
    const fail = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
    let args = { p_description: desc.value.trim() || null, p_leader_user: null, p_invite_name: null, p_invite_email: null, p_invite_phone: null };
    let c = null;
    if (mode === 'existing') {
      if (!userSel.value) return fail('Velg hvem som skal lede gruppen.');
      args.p_leader_user = userSel.value;
    } else {
      if (name.value.trim().length < 2) return fail('Skriv navnet på lederen.');
      c = contact.read();
      if (c.error) return fail(c.error);
      args = { ...args, p_invite_name: name.value.trim(), p_invite_email: c.email, p_invite_phone: c.phone };
    }
    const { data, error } = await supabase.rpc('create_group', args);
    if (error) return fail(friendlyError(error));
    dlg.close();
    await reload();
    toast(`Gruppen til ${data.name} er laget.`);
    await openGroup(data.group_id);
    if (data.invite_code) shareInvite({ code: data.invite_code, name: data.name, role: 'leder', email: c.email, phone: c.phone, groupId: data.group_id });
  });
});

// =====================================================================
//  DELTAKERE (admin)
// =====================================================================

function visibleMembers() {
  const s = state.search.toLowerCase();
  return state.members.filter((m) => !m.archived_at &&
    (!state.filterGroup || m.group_id === state.filterGroup) &&
    (!s || `${m.full_name} ${m.postal_code || ''} ${m.city || ''}`.toLowerCase().includes(s)));
}

function renderMembersList() {
  const sel = $('filter-group');
  sel.innerHTML = '';
  sel.append(el('option', { value: '' }, 'Alle grupper'));
  for (const g of state.groups) sel.append(el('option', { value: g.id }, `${g.name} (${activeIn(g.id).length})`));
  sel.value = state.filterGroup;

  const rows = visibleMembers();
  const ages = rows.filter((m) => m.birth_year).map((m) => ageFromYear(m.birth_year));
  $('members-summary').textContent = `${rows.length} deltakere` +
    (ages.length ? ` · snittalder ${Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)} år` : '');

  const list = $('members-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.append(el('li', { class: 'empty' }, state.search ? 'Ingen treff.' : 'Ingen deltakere ennå.'));
    return;
  }
  for (const m of rows) {
    list.append(el('li', {},
      el('button', { class: 'prow', onclick: () => openPerson(m, { adminList: true }) },
        el('span', { class: 'pmain' },
          el('span', { class: 'pname' }, m.full_name),
          el('span', { class: 'psub' }, [memberSub(m), state.filterGroup ? null : groupName(m.group_id)].filter(Boolean).join(' · '))))));
  }
}

$('filter-group').addEventListener('change', (e) => { state.filterGroup = e.target.value; renderMembersList(); });
$('filter-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderMembersList(); });
$('btn-export').addEventListener('click', () =>
  downloadCsv(visibleMembers(), state.filterGroup ? groupName(state.filterGroup) : 'smågrupper alle'));

// =====================================================================
//  TRIADER (admin)
// =====================================================================

/** Alle som leder eller er nestleder i en gruppe. */
function leaderProfiles() {
  const ids = [...new Set(state.leaders.map((l) => l.user_id))];
  return ids.map((id) => {
    const l = state.leaders.find((x) => x.user_id === id);
    return { id, profile: l.profiles, label: personName(l.profiles) };
  }).sort((a, b) => a.label.localeCompare(b.label, 'nb'));
}

function renderTriads() {
  const list = $('triads-list');
  list.innerHTML = '';
  if (!state.triads.length) {
    list.append(el('div', { class: 'card plain empty-card' }, el('p', {}, 'Ingen triader ennå. Trykk «+ Ny triade».')));
  }
  state.triads.forEach((t, idx) => {
    const people = triadPeople(t.id);
    list.append(el('section', { class: 'card plain triad-card' },
      el('div', { class: 'card-head' },
        el('h2', {}, t.name || `Triade ${idx + 1}`),
        el('span', { class: 'actions' },
          el('button', { class: 'ghost small', onclick: () => editTriad(t) }, 'Endre'),
          el('button', {
            class: 'ghost small muted-btn',
            onclick: async () => {
              if (!(await ask('Slette triaden? Lederne blir ikke berørt ellers.', 'Slett', true))) return;
              const { error } = await supabase.from('triads').delete().eq('id', t.id);
              if (error) return toast(friendlyError(error), 'error');
              reload();
            },
          }, 'Slett'))),
      el('ul', { class: 'tlist' }, people.map((p) => el('li', {},
        el('strong', {}, personName(p.profiles)),
        groupsLedBy(p.user_id).map((s) => el('span', { class: 'psub' }, s))))),
      people.length < 3 ? el('p', { class: 'hint' }, `${people.length} av 3 ledere`) : null));
  });
  const inTriad = new Set(state.triadMembers.map((m) => m.user_id));
  const without = leaderProfiles().filter((p) => !inTriad.has(p.id));
  $('triads-missing').textContent = without.length ? `Ledere uten triade: ${without.map((p) => p.label).join(', ')}` : '';
}

function editTriad(t = null) {
  const current = t ? triadPeople(t.id).map((m) => m.user_id) : [];
  const options = leaderProfiles();
  const triadOf = (uid) => {
    const m = state.triadMembers.find((x) => x.user_id === uid);
    if (!m || m.triad_id === t?.id) return '';
    const other = state.triads.find((x) => x.id === m.triad_id);
    return ` (i ${other?.name || 'en annen triade'})`;
  };
  const name = el('input', { type: 'text', id: 'tr-name', maxlength: 60, value: t?.name || '', placeholder: 'f.eks. Triade Fana' });
  const selects = [0, 1, 2].map((i) => {
    const s = el('select', { id: 'tr-' + i, 'aria-label': `Leder ${i + 1}` },
      el('option', { value: '' }, i === 2 ? 'Velg leder (valgfritt) …' : 'Velg leder …'),
      options.map((o) => el('option', { value: o.id }, o.label + triadOf(o.id))));
    s.value = current[i] || '';
    return s;
  });
  const errBox = el('div', { class: 'notice error', hidden: true });
  const form = el('form', { method: 'dialog' },
    el('h2', {}, t ? 'Endre triade' : 'Ny triade'),
    el('div', { class: 'field' }, el('label', { for: 'tr-name' }, 'Navn (valgfritt)'), name),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Ledere'), el('div', { class: 'stack' }, selects)),
    el('p', { class: 'hint' }, 'Velger du en som allerede er i en triade, flyttes vedkommende hit.'),
    errBox,
    el('div', { class: 'actions' },
      el('button', { type: 'submit', value: 'ok' }, 'Lagre'),
      el('button', { type: 'submit', value: 'cancel', class: 'secondary', formnovalidate: true }, 'Avbryt')));
  const dlg = openDialog(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return dlg.close();
    const ids = selects.map((s) => s.value).filter(Boolean);
    const fail = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
    if (new Set(ids).size !== ids.length) return fail('Samme person er valgt flere ganger.');
    if (ids.length < 2) return fail('Velg minst to ledere.');
    const { error } = await supabase.rpc('save_triad', { p_id: t?.id || null, p_name: name.value.trim() || null, p_members: ids });
    if (error) return fail(friendlyError(error));
    dlg.close();
    toast('Triaden er lagret.');
    reload();
  });
}

$('btn-new-triad').addEventListener('click', () => editTriad(null));

// =====================================================================
//  TILGANG (admin)
// =====================================================================

function renderPeople() {
  const list = $('people-list');
  list.innerHTML = '';
  for (const p of state.profiles) {
    const assignments = state.leaders.filter((l) => l.user_id === p.id);
    const sub = assignments.length
      ? assignments.map((a) => `${roleLabel(a.role)} · ${groupName(a.group_id)}`).join(', ')
      : (p.role === 'admin' ? 'Ser alle grupper' : 'Ingen gruppe');
    list.append(el('li', {},
      el('button', { class: 'prow', onclick: () => editAccess(p) },
        el('span', { class: 'pmain' },
          el('span', { class: 'pname' }, personName(p),
            p.role === 'admin' ? el('span', { class: 'role-pill' }, 'Admin') : null,
            p.id === state.me.id ? el('span', { class: 'psub inline' }, ' (deg)') : null),
          el('span', { class: 'psub' }, sub)),
        el('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))));
  }
}

function editAccess(p) {
  const isMe = p.id === state.me.id;
  const assignments = state.leaders.filter((l) => l.user_id === p.id);
  const roleSel = el('select', { id: 'acc-role', disabled: isMe },
    el('option', { value: 'bruker' }, 'Leder/nestleder'),
    el('option', { value: 'admin' }, 'Administrator'));
  roleSel.value = p.role;
  const free = state.groups.filter((g) => !assignments.some((a) => a.group_id === g.id));
  const gSel = el('select', { id: 'acc-group' }, el('option', { value: '' }, 'Legg til i gruppe …'),
    free.map((g) => el('option', { value: g.id }, g.name)));
  const rSel = el('select', { id: 'acc-grouprole' },
    el('option', { value: 'nestleder' }, 'som nestleder'), el('option', { value: 'leder' }, 'som leder'));
  const dlg = openDialog(
    el('h2', {}, personName(p)),
    el('p', { class: 'hint', style: 'margin:-4px 0 14px' }, [p.email, fmtPhone(p.phone)].filter(Boolean).join(' · ')),
    el('div', { class: 'field' }, el('label', { for: 'acc-role' }, 'Rolle'), roleSel,
      isMe ? el('div', { class: 'hint' }, 'Du kan ikke endre din egen rolle.') : null),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Grupper'),
      assignments.length
        ? el('ul', { class: 'plist' }, assignments.map((a) => el('li', { class: 'arow' },
          el('span', {}, `${roleLabel(a.role)} · ${groupName(a.group_id)}`),
          el('button', {
            class: 'ghost small muted-btn',
            onclick: async () => {
              if (!(await ask(`Fjerne ${personName(p)} som ${a.role} i gruppen til ${groupName(a.group_id)}?`, 'Fjern', true))) return;
              const { error } = await supabase.from('group_leaders').delete().eq('group_id', a.group_id).eq('user_id', p.id);
              if (error) return toast(friendlyError(error), 'error');
              dlg.close();
              reload();
            },
          }, 'Fjern'))))
        : el('p', { class: 'hint' }, 'Ikke satt i noen gruppe.')),
    free.length ? el('div', { class: 'field' }, el('div', { class: 'stack' }, gSel, rSel)) : null,
    el('div', { class: 'actions' },
      el('button', {
        onclick: async () => {
          if (!isMe && roleSel.value !== p.role) {
            const { error } = await supabase.from('profiles').update({ role: roleSel.value }).eq('id', p.id);
            if (error) return toast(friendlyError(error), 'error');
          }
          if (gSel.value) {
            const { error } = await supabase.from('group_leaders').insert({ group_id: gSel.value, user_id: p.id, role: rSel.value });
            if (error) return toast(friendlyError(error), 'error');
          }
          dlg.close();
          toast('Lagret.');
          reload();
        },
      }, 'Lagre'),
      el('button', { class: 'secondary', onclick: () => dlg.close() }, 'Avbryt')));
}

// =====================================================================
//  INVITASJON (lenke: oversikt.html#inv-KODE)
// =====================================================================

function readInviteCode() {
  const m = /^#inv-([a-f0-9]{20,64})$/i.exec(location.hash);
  return m ? m[1].toLowerCase() : null;
}

async function showInvite() {
  $('invite-valid').hidden = true;
  $('invite-invalid').hidden = true;
  show('invite');
  const { data, error } = await supabase.rpc('invite_info', { p_code: state.inviteCode });
  const info = !error && data && data[0];
  $('invite-valid').hidden = !info;
  $('invite-invalid').hidden = !!info;
  if (!info) return;
  $('invite-role').textContent = info.role;
  $('invite-lead').textContent = info.role === 'nestleder'
    ? `Du er invitert som nestleder i smågruppen til ${info.group_name}.`
    : 'Du er invitert som leder for en smågruppe. Gruppen får navnet ditt.';
  if (info.name && !$('invite-name').value) $('invite-name').value = info.name;
  if (info.email && !$('invite-email').value) $('invite-email').value = info.email;
  const loggedIn = !!state.session;
  $('invite-loggedin').hidden = !loggedIn;
  $('invite-loggedout').hidden = loggedIn;
  if (loggedIn) $('invite-me').textContent = state.session.user.email;
  setInviteMode(state.inviteMode);
}

function setInviteMode(mode) {
  state.inviteMode = mode;
  document.querySelectorAll('[data-invmode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.invmode === mode)));
  const isNew = mode === 'new';
  $('invite-name-field').hidden = !isNew;
  $('invite-password-label').textContent = isNew ? 'Velg et passord' : 'Passord';
  $('invite-password-hint').hidden = !isNew;
  $('invite-password').autocomplete = isNew ? 'new-password' : 'current-password';
  $('invite-submit').textContent = isNew ? 'Lag konto og bli med' : 'Logg inn og bli med';
  $('invite-error').hidden = true;
}

document.querySelectorAll('[data-invmode]').forEach((b) => b.addEventListener('click', () => setInviteMode(b.dataset.invmode)));

async function acceptInvite() {
  const { error } = await supabase.rpc('accept_invite', { p_code: state.inviteCode });
  if (error) {
    $('invite-error').className = 'notice error';
    $('invite-error').textContent = friendlyError(error);
    $('invite-error').hidden = false;
    return false;
  }
  state.inviteCode = null;
  history.replaceState(null, '', location.pathname + location.search);
  toast('Velkommen! Du har nå tilgang til gruppen.');
  state.current = null;
  state.tab = 'group';
  const { data } = await supabase.auth.getSession();
  await route(data.session);
  return true;
}

$('invite-accept').addEventListener('click', acceptInvite);

$('invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('invite-error');
  errBox.hidden = true;
  const email = $('invite-email').value.trim();
  const password = $('invite-password').value;
  const btn = $('invite-submit');
  btn.disabled = true;
  try {
    if (state.inviteMode === 'new') {
      const name = $('invite-name').value.trim();
      if (name.length < 2) throw new Error('Skriv inn navnet ditt.');
      if (password.length < 8) throw new Error('Passordet må ha minst 8 tegn.');
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) throw error;
      if (!data.session) {
        errBox.className = 'notice info';
        errBox.textContent = 'Vi har sendt deg en e-post for å bekrefte kontoen. Trykk på lenken i e-posten, og åpne så denne invitasjonslenken på nytt.';
        errBox.hidden = false;
        return;
      }
      state.session = data.session;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.session = data.session;
    }
    await acceptInvite();
  } catch (err) {
    errBox.className = 'notice error';
    errBox.textContent = friendlyError(err);
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
//  INNLOGGING, PROFIL OG PASSORD
// =====================================================================

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('login-error');
  errBox.hidden = true;
  if (!isConfigured) { errBox.textContent = 'Nettsiden er ikke koblet til databasen ennå.'; errBox.hidden = false; return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: $('login-email').value.trim(),
    password: $('login-password').value,
  });
  btn.disabled = false;
  if (error) { errBox.textContent = friendlyError(error); errBox.hidden = false; }
});

$('btn-forgot').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) { $('login-email').focus(); return toast('Skriv inn e-posten din først.', 'error'); }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) return toast(friendlyError(error), 'error');
  toast('Hvis e-posten finnes hos oss, har vi sendt deg en lenke.');
});

$('recovery-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await supabase.auth.updateUser({ password: $('recovery-password').value });
  if (error) return toast(friendlyError(error), 'error');
  inRecovery = false;
  history.replaceState(null, '', location.pathname);
  toast('Passordet er lagret.');
  route(state.session);
});

$('btn-logout').addEventListener('click', async () => {
  $('menu').hidden = true;
  $('toast')?.classList.remove('show');
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await supabase.auth.signOut();
  Object.assign(state, {
    me: null, isAdmin: false, groups: [], allGroups: [], leaders: [], members: [], invites: [], profiles: [],
    triads: [], triadMembers: [], meetingsMeta: [], current: null, meetings: [], filterGroup: '', search: '',
    view: 'home', tab: null,
  });
  $('filter-search').value = '';
});

$('btn-profile').addEventListener('click', () => {
  $('menu').hidden = true;
  const dlg = $('dlg-profile');
  $('dlg-profile-name').value = state.me?.full_name || '';
  $('dlg-profile-phone').value = fmtPhone(state.me?.phone || '');
  $('dlg-profile-pw').value = '';
  dlg.returnValue = '';
  dlg.showModal();
});

$('dlg-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dlg = $('dlg-profile');
  if (e.submitter?.value === 'cancel') return dlg.close();
  const name = $('dlg-profile-name').value.trim();
  const pw = $('dlg-profile-pw').value;
  const phone = normPhone($('dlg-profile-phone').value) || null;
  if (name.length < 2) return toast('Skriv inn navnet ditt.', 'error');
  if (phone && !validPhone(phone)) return toast('Telefonnummeret ser ikke riktig ut.', 'error');
  if (pw && pw.length < 8) return toast('Passordet må ha minst 8 tegn.', 'error');
  if (name !== (state.me?.full_name || '') || phone !== (state.me?.phone || null)) {
    const { error } = await supabase.from('profiles').update({ full_name: name, phone }).eq('id', state.me.id);
    if (error) return toast(friendlyError(error), 'error');
  }
  if (pw) {
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast(friendlyError(error), 'error');
  }
  dlg.close();
  toast('Profilen er lagret.');
  await reload();
  $('who').textContent = firstName(state.me);
  $('menu-who').textContent = personName(state.me);
});

// =====================================================================
//  OPPSTART
// =====================================================================

state.inviteCode = readInviteCode();
window.addEventListener('hashchange', () => {
  const code = readInviteCode();
  if (code) { state.inviteCode = code; showInvite(); }
});

if (!isConfigured) {
  $('setup').append(notConfiguredBanner());
  show('login');
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') inRecovery = true;
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { state.session = session; return; }
    if (state.inviteCode && event === 'SIGNED_IN') { state.session = session; return; }
    setTimeout(() => route(session), 0);
  });
}
