import { supabase, isConfigured, config, el, friendlyError, notConfiguredBanner } from './felles.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-org]').forEach((n) => (n.textContent = config.ORG_NAME));

const form = $('signup');
const groupSelect = $('group');
let groups = [];

// Lenke rett til en gruppe: index.html?gruppe=<id>
const params = new URLSearchParams(location.search);
const presetGroup = params.get('gruppe');

async function loadGroups() {
  if (!isConfigured) {
    $('setup').append(notConfiguredBanner());
    groupSelect.innerHTML = '';
    groupSelect.append(el('option', { value: '' }, 'Ingen grupper ennå'));
    return;
  }
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, description')
    .eq('active', true)
    .order('name');

  groupSelect.innerHTML = '';
  if (error) {
    showError('Klarte ikke å hente gruppene. ' + friendlyError(error));
    return;
  }
  groups = data || [];
  groupSelect.append(el('option', { value: '' }, groups.length ? 'Velg lederens navn' : 'Ingen åpne grupper akkurat nå'));
  for (const g of groups) groupSelect.append(el('option', { value: g.id }, g.name));

  const preset = groups.find((g) => g.id === presetGroup);
  if (preset) {
    groupSelect.value = preset.id;
    $('group-fixed-name').textContent = preset.name;
    $('group-fixed').hidden = false;
    $('group-field').hidden = true;
  }
  updateDesc();
}

function updateDesc() {
  const g = groups.find((x) => x.id === groupSelect.value);
  $('group-desc').textContent = g ? (g.description || '') : 'Gruppene heter det samme som lederen.';
}

groupSelect.addEventListener('change', updateDesc);
$('change-group').addEventListener('click', () => {
  $('group-fixed').hidden = true;
  $('group-field').hidden = false;
  groupSelect.focus();
});

function showError(message) {
  const box = $('form-error');
  box.textContent = message;
  box.hidden = !message;
}

function setInvalid(input, message) {
  input.setAttribute('aria-invalid', 'true');
  let msg = input.parentElement.querySelector('.error-text');
  if (!msg) {
    msg = el('div', { class: 'error-text' });
    input.parentElement.append(msg);
  }
  msg.textContent = message;
}

function clearInvalid() {
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  form.querySelectorAll('.error-text').forEach((m) => m.remove());
  showError('');
}

function validate() {
  clearInvalid();
  const v = {
    group_id: groupSelect.value,
    full_name: $('full_name').value.trim().replace(/\s+/g, ' '),
    birth_year: $('birth_year').value.trim(),
    postal_code: $('postal_code').value.trim(),
    city: $('city').value.trim(),
    consent: $('consent').checked,
  };
  const thisYear = new Date().getFullYear();
  let firstBad = null;
  const bad = (input, text) => { setInvalid(input, text); firstBad ??= input; };

  if (!v.group_id) {
    $('group-field').hidden = false;
    $('group-fixed').hidden = true;
    bad(groupSelect, 'Velg en gruppe.');
  }
  if (v.full_name.length < 2) bad($('full_name'), 'Skriv inn navnet ditt.');
  const year = Number(v.birth_year);
  if (!/^\d{4}$/.test(v.birth_year) || year < 1900 || year > thisYear) bad($('birth_year'), 'Skriv fødselsåret med fire siffer, f.eks. 1990.');
  if (!/^\d{4}$/.test(v.postal_code)) bad($('postal_code'), 'Fire siffer.');
  if (v.city.length < 2) bad($('city'), 'Skriv inn sted.');
  if (!v.consent) { showError('Du må krysse av for samtykke for å melde deg på.'); firstBad ??= $('consent'); }

  if (firstBad) { firstBad.focus(); return null; }
  return { ...v, birth_year: year };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isConfigured) return showError('Nettsiden er ikke koblet til databasen ennå.');

  const values = validate();
  if (!values) return;

  // Spam-robot fylte ut det skjulte feltet: lat som alt gikk bra
  if ($('website').value) return showDone(values);

  const button = $('submit');
  button.disabled = true;
  button.textContent = 'Sender …';
  const { error } = await supabase.from('members').insert(values);
  button.disabled = false;
  button.textContent = 'Meld meg på';

  if (error) return showError('Noe gikk galt: ' + friendlyError(error));
  showDone(values);
});

function showDone(values) {
  $('done-name').textContent = values.full_name.split(' ')[0];
  $('done-group').textContent = groups.find((g) => g.id === values.group_id)?.name || 'gruppen';
  $('form-card').hidden = true;
  $('done').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('again').addEventListener('click', () => {
  // Familiemedlemmer bor ofte samme sted: behold gruppe, postnummer og sted
  const keep = { group: groupSelect.value, pc: $('postal_code').value, city: $('city').value };
  form.reset();
  groupSelect.value = keep.group;
  $('postal_code').value = keep.pc;
  $('city').value = keep.city;
  clearInvalid();
  $('done').hidden = true;
  $('form-card').hidden = false;
  $('full_name').focus();
});

loadGroups();
