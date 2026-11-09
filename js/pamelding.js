import { supabase, isConfigured, config, el, friendlyError, notConfiguredBanner, lookupPostalCode } from './felles.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-org]').forEach((n) => (n.textContent = config.ORG_NAME));

const form = $('signup');
const groupId = new URLSearchParams(location.search).get('gruppe') || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let group = null;
let cityFound = null;

function showOnly(id) {
  for (const s of ['loading', 'no-link', 'form-card', 'done']) $(s).hidden = s !== id;
}

async function init() {
  if (!isConfigured) {
    $('setup').append(notConfiguredBanner());
    showOnly('no-link');
    return;
  }
  if (!UUID.test(groupId)) {
    showOnly('no-link');
    return;
  }
  const { data, error } = await supabase.rpc('group_public_info', { p_group: groupId });
  if (error) {
    $('no-link-reason').textContent = friendlyError(error);
    showOnly('no-link');
    return;
  }
  group = data?.[0] || null;
  if (!group) {
    $('no-link-reason').textContent = 'Lenken er ikke gyldig lenger. Gruppen kan være lagt ned eller endret. Be lederen om en ny lenke.';
    showOnly('no-link');
    return;
  }
  $('group-name').textContent = group.name;
  $('group-desc').textContent = group.description ? ` ${group.description}.` : '';
  showOnly('form-card');
}

// ---- Postnummer → sted ----
let lookupSeq = 0;
$('postal_code').addEventListener('input', async (e) => {
  const code = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = code;
  cityFound = null;
  $('city').value = '';
  clearFieldError(e.target);
  if (code.length !== 4) return;
  const seq = ++lookupSeq;
  $('city').placeholder = 'Søker …';
  const city = await lookupPostalCode(code);
  if (seq !== lookupSeq) return;
  $('city').placeholder = 'Fylles ut automatisk';
  if (city) { cityFound = city; $('city').value = city; }
  else setInvalid(e.target, 'Fant ikke postnummeret. Sjekk at det er riktig.');
});

$('birth_year').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

form.querySelectorAll('input[name=gender]').forEach((r) => r.addEventListener('change', () => clearFieldError($('gender'))));

// ---- Validering ----
function showError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = !message;
}
function setInvalid(input, message) {
  input.setAttribute('aria-invalid', 'true');
  let msg = input.parentElement.querySelector('.error-text');
  if (!msg) { msg = el('div', { class: 'error-text' }); input.parentElement.append(msg); }
  msg.textContent = message;
}
function clearFieldError(input) {
  input.removeAttribute('aria-invalid');
  input.parentElement.querySelector('.error-text')?.remove();
}
function clearInvalid() {
  form.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
  showError('');
}

function validate() {
  clearInvalid();
  const name = $('full_name').value.trim().replace(/\s+/g, ' ');
  const year = Number($('birth_year').value.trim());
  const pc = $('postal_code').value.trim();
  const thisYear = new Date().getFullYear();
  let firstBad = null;
  const bad = (input, text) => { setInvalid(input, text); firstBad ??= input; };

  if (name.length < 3 || !name.includes(' ') || !/\p{L}/u.test(name)) bad($('full_name'), 'Skriv fornavn og etternavn.');
  if (!/^\d{4}$/.test($('birth_year').value.trim()) || year < 1900 || year > thisYear) bad($('birth_year'), 'Skriv fødselsåret med fire siffer, f.eks. 1990.');
  const gender = form.querySelector('input[name=gender]:checked')?.value || null;
  if (!gender) { setInvalid($('gender'), 'Velg mann eller kvinne.'); firstBad ??= form.querySelector('input[name=gender]'); }
  if (!/^\d{4}$/.test(pc)) bad($('postal_code'), 'Fire siffer.');
  else if (!cityFound) bad($('postal_code'), 'Fant ikke postnummeret. Sjekk at det er riktig.');
  if (!$('consent').checked) { showError('Du må krysse av for samtykke for å melde deg på.'); firstBad ??= $('consent'); }

  if (firstBad) { firstBad.focus(); return null; }
  return { name, year, gender, pc };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!group) return;
  const v = validate();
  if (!v) return;
  if ($('website').value) return showDone(v.name); // robot: lat som alt gikk bra

  const button = $('submit');
  button.disabled = true;
  button.textContent = 'Sender …';
  const { error } = await supabase.rpc('register_member', {
    p_group: groupId, p_full_name: v.name, p_birth_year: v.year, p_gender: v.gender, p_postal_code: v.pc, p_city: cityFound, p_consent: true,
  });
  button.disabled = false;
  button.textContent = 'Meld meg på';
  if (error) return showError(friendlyError(error));
  showDone(v.name);
});

function showDone(name) {
  $('done-name').textContent = name.split(' ')[0];
  $('done-group').textContent = group.name;
  showOnly('done');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Familiemedlemmer bor ofte samme sted: behold postnummer og sted
$('again').addEventListener('click', () => {
  const keep = { pc: $('postal_code').value, city: $('city').value, found: cityFound };
  form.reset();
  $('postal_code').value = keep.pc;
  $('city').value = keep.city;
  cityFound = keep.found;
  clearInvalid();
  showOnly('form-card');
  $('full_name').focus();
});

init();
