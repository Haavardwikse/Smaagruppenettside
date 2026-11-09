// Fast versjon av Supabase-biblioteket, så siden ikke endrer seg av seg selv
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { config } from '../config.js';

export { config, createClient };

/** Databaseversjonen nettsiden er laget for (se supabase/schema.sql). */
export const SCHEMA_VERSION = 9;

export const isConfigured =
  !config.SUPABASE_URL.includes('DITT-PROSJEKT') && !config.SUPABASE_KEY.startsWith('LIM-INN');

export const supabase = isConfigured
  ? createClient(config.SUPABASE_URL, config.SUPABASE_KEY)
  : null;

/** Lager et HTML-element trygt (tekst blir aldri tolket som HTML). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Alder i år (blir/har blitt) ut fra fødselsår. */
export function ageFromYear(year) {
  return new Date().getFullYear() - Number(year);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Kort melding nederst på skjermen. */
export function toast(message, type = 'ok') {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `toast show ${type}`;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('show'), 3500);
}

/** Gjør tekniske feilmeldinger forståelige. Våre egne meldinger fra databasen er allerede på norsk. */
export function friendlyError(error) {
  const msg = (error && (error.message || error.error_description || error.msg)) || String(error);
  const map = [
    [/Invalid login credentials/i, 'Feil e-post eller passord.'],
    [/Email not confirmed/i, 'E-postadressen er ikke bekreftet ennå.'],
    [/members_no_duplicates/i, 'Personen står allerede i denne gruppen.'],
    [/group_leaders_one_leder/i, 'Gruppen har allerede en leder. En ny leder får sin egen smågruppe.'],
    [/members_name_ok/i, 'Navnet må ha minst to tegn og inneholde bokstaver.'],
    [/members_postal_code_ok/i, 'Postnummer må være fire siffer.'],
    [/members_city_ok/i, 'Stedsnavnet er for kort eller for langt.'],
    [/members_birth_year_ok/i, 'Fødselsåret ser ikke riktig ut.'],
    [/profiles_phone_ok|group_invites_phone_ok/i, 'Telefonnummeret ser ikke riktig ut.'],
    [/profiles_email_ok|group_invites_email_ok/i, 'E-postadressen ser ikke riktig ut.'],
    [/profiles_email_key/i, 'E-postadressen er allerede i bruk.'],
    [/members_group_id_fkey|foreign key/i, 'Gruppen har fortsatt deltakere. Flytt eller slett dem først, eller sett gruppen som inaktiv.'],
    [/row-level security|permission denied/i, 'Du har ikke tilgang til å gjøre dette.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.'],
    [/Password should be/i, 'Passordet må ha minst 8 tegn.'],
    [/already registered|already been registered|user_already_exists/i, 'Det finnes allerede en konto med denne e-posten. Velg «Jeg har konto».'],
    [/Signups not allowed|signup is disabled/i, 'Det er ikke åpnet for nye kontoer. Administratoren må slå på «Allow new users to sign up» i Supabase.'],
    [/Email address not authorized/i, 'Systemet kan ikke sende e-post til denne adressen ennå. Ta kontakt med administratoren.'],
    [/rate limit/i, 'For mange forsøk på kort tid. Vent litt og prøv igjen.'],
    [/Could not find the function|schema cache/i, 'Databasen er ikke oppdatert. Administratoren må kjøre schema.sql på nytt.'],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return msg;
}

/** Telefon: fjerner mellomrom o.l. Godtar 8 sifre (norsk) eller +landskode. */
export const normPhone = (s) => {
  let d = (s || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (/^\d{8}$/.test(d)) return '+47' + d;
  if (/^47\d{8}$/.test(d)) return '+' + d;
  return d;
};
export const validPhone = (s) => /^\+[0-9]{8,15}$/.test(normPhone(s));
export const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || '').trim());
export function fmtPhone(p) {
  if (!p) return '';
  if (/^\+47\d{8}$/.test(p)) return p.slice(3).replace(/(\d{3})(\d{2})(\d{3})/, '$1 $2 $3');
  if (/^\d{8}$/.test(p)) return p.replace(/(\d{3})(\d{2})(\d{3})/, '$1 $2 $3');
  return p;
}

/** Slår opp poststed. Gir null hvis postnummeret ikke finnes. */
export async function lookupPostalCode(code) {
  if (!supabase || !/^\d{4}$/.test(code)) return null;
  const { data } = await supabase.from('postal_codes').select('city').eq('code', code).maybeSingle();
  return data?.city || null;
}

/** Bekreftelsesdialog (penere enn confirm() og virker overalt). Gir true/false. */
export function ask(message, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const dlg = el('dialog', {},
      el('p', { style: 'margin:0 0 20px;font-size:1.05rem' }, message),
      el('div', { class: 'actions', style: 'justify-content:flex-end' },
        el('button', { class: 'secondary', value: 'no', onclick: () => dlg.close('no') }, 'Avbryt'),
        el('button', { class: danger ? 'danger' : '', onclick: () => dlg.close('yes') }, okLabel)));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Viser en lenke/tekst med Kopier-knapp. */
export function showCopyable(title, text, description = '') {
  const input = el('input', { type: 'text', value: text, readonly: true, onfocus: (e) => e.target.select() });
  const copy = el('button', {
    onclick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Kopiert.'); }
      catch { input.select(); toast('Marker teksten og kopier den.'); }
    },
  }, 'Kopier');
  const dlg = el('dialog', {},
    el('h2', {}, title),
    description ? el('p', { class: 'hint', style: 'margin:-4px 0 14px' }, description) : null,
    el('div', { class: 'copy-row' }, input, copy),
    el('div', { class: 'actions', style: 'justify-content:flex-end;margin-top:16px' },
      el('button', { class: 'secondary', onclick: () => dlg.close() }, 'Lukk')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  input.select();
}

export function notConfiguredBanner() {
  return el('div', { class: 'notice warn' },
    el('strong', {}, 'Nettsiden er ikke koblet til databasen ennå. '),
    'Fyll inn SUPABASE_URL og SUPABASE_KEY i config.js (se README.md).');
}
