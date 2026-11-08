import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { config } from '../config.js';

export { config };

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

/** Gjør tekniske feilmeldinger forståelige. */
export function friendlyError(error) {
  const msg = (error && (error.message || error.error_description)) || String(error);
  if (/Invalid login credentials/i.test(msg)) return 'Feil e-post eller passord.';
  if (/Email not confirmed/i.test(msg)) return 'E-postadressen er ikke bekreftet ennå.';
  if (/foreign key/i.test(msg)) return 'Gruppen har fortsatt medlemmer. Flytt eller slett dem først, eller sett gruppen som inaktiv.';
  if (/row-level security/i.test(msg)) return 'Du har ikke tilgang til å gjøre dette.';
  if (/Bare administratorer/i.test(msg)) return 'Bare administratorer kan endre roller.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.';
  if (/Password should be/i.test(msg)) return 'Passordet må ha minst 8 tegn.';
  if (/already registered|already been registered/i.test(msg)) return 'Det finnes allerede en konto med denne e-posten. Velg «Jeg har konto».';
  if (/Signups not allowed|signup is disabled/i.test(msg)) return 'Det er ikke åpnet for nye kontoer. Administratoren må slå på «Allow new users to sign up» i Supabase.';
  if (/Email address not authorized/i.test(msg)) return 'Systemet kan ikke sende e-post til denne adressen ennå. Ta kontakt med administratoren.';
  if (/rate limit/i.test(msg)) return 'For mange forsøk på kort tid. Vent litt og prøv igjen.';
  return msg;
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
