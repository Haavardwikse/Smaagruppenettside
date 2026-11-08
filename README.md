# Smågrupper – Bergen Frikirke

En enkel nettside der folk melder seg på en smågruppe, og der ledere har oversikt over gruppen sin,
registrerer oppmøte og kan dele gruppen i to når den vokser.

| Hvem | Hva de ser og gjør |
|---|---|
| **Deltakere** | Bare påmeldingsskjemaet. Ingen innlogging. Kan ikke se noe etterpå. |
| **Leder / nestleder** | Ser bare sin egen gruppe og sin triade. Registrerer oppmøte, deler påmeldingslenken, arkiverer deltakere, velger nestleder og kan multiplisere gruppen. Nestlederen har samme tilgang som lederen. |
| **Administrator** | Ser alle grupper og deltakere. Oppretter grupper, inviterer ledere, setter sammen triader og styrer tilgang. |

Selve nettsiden ligger på **GitHub Pages** (gratis). Dataene og innloggingen ligger i **Supabase**
(gratisplanen holder godt for noen hundre personer). Tilgangsreglene ligger i databasen, ikke på
nettsiden, så ingen kan omgå dem ved å fikle med nettleseren.

## Filer

```
index.html          Påmeldingsskjemaet (det deltakerne ser)
oversikt.html       Ledersiden: innlogging, gruppen, oppmøte, administrasjon
personvern.html     Personvernerklæring (mal – må tilpasses)
config.js           Her limer du inn Supabase-adressen og -nøkkelen
css/style.css       Utseende
js/                 Programkoden
supabase/schema.sql Databaseoppsett og tilgangsregler
```

---

## Oppsett (ca. 30 minutter, gjøres én gang)

### 1. Lag databasen i Supabase

1. Gå til [supabase.com](https://supabase.com), lag en gratis konto og trykk **New project**.
2. Gi prosjektet et navn (f.eks. `smagrupper`), velg et sterkt databasepassord og
   **velg en region i EU** (f.eks. Frankfurt). Det er viktig for personvernet.
3. Når prosjektet er klart: gå til **SQL Editor → New query**, lim inn hele innholdet i
   `supabase/schema.sql` og trykk **Run**. Du skal få «Success».

> **Har du allerede kjørt en eldre versjon av filen?** Kjør den nye `schema.sql` på samme måte.
> Den oppgraderer databasen, og alle deltakere og grupper blir liggende. Grupper som har en
> leder, får da navnet til lederen.

### 2. Innstillinger for innlogging

Nye ledere lager kontoen sin selv via en invitasjonslenke. Derfor:

1. **Authentication → Sign In / Providers**: la **«Allow new users to sign up»** stå **på**.
2. Under **Email** på samme side: slå **av** **«Confirm email»**.

Hvorfor er dette trygt? En konto gir i seg selv ingen tilgang til noe som helst. Man ser
bare en gruppe hvis man har fått en invitasjonslenke fra en leder eller administrator, eller
hvis en administrator legger personen til. Invitasjonslenken er hemmeligheten. Den kan brukes
én gang og varer i 30 dager.

«Confirm email» slås av fordi Supabase bare sender e-post til medlemmer av Supabase-teamet
deres, med mindre dere setter opp egen e-posttjeneste (se «E-post» nederst).

### 3. Lag din egen administrator-bruker

1. **Authentication → Users → Add user → Create new user**.
2. Skriv e-posten din og et passord, og huk av **Auto Confirm User**.
3. Gå til **SQL Editor** og kjør (med din e-post):
   ```sql
   update public.profiles set role = 'admin' where email = 'din@epost.no';
   ```

### 4. Koble nettsiden til databasen

1. Gå til **Project Settings → API Keys** (og **Data API** for adressen).
2. Kopier **Project URL** og **Publishable key** (heter «anon public» i eldre prosjekter).
3. Åpne `config.js` og lim dem inn. Fyll også inn kontakt-e-post.

> Publishable-nøkkelen er laget for å ligge åpent på nettsiden. **Bruk aldri
> «secret» eller «service_role»-nøkkelen** her. Den omgår alle tilgangsregler.

### 5. Legg nettsiden ut på GitHub Pages

1. Lag et nytt repository på GitHub (f.eks. `smagrupper`). På gratisplanen må det være **Public**.
   Det er greit, for koden inneholder ingen hemmeligheter, bare den offentlige nøkkelen.
2. Last opp alle filene (**Add file → Upload files**, dra inn hele mappen).
3. **Settings → Pages**: velg «Deploy from a branch», branch `main`, mappe `/ (root)`, og lagre.
4. Etter et par minutter ligger siden på `https://BRUKERNAVN.github.io/smagrupper/`.

### 6. Fortell Supabase hvor nettsiden ligger

1. **Authentication → URL Configuration**.
2. **Site URL**: `https://BRUKERNAVN.github.io/smagrupper/`
3. Under **Redirect URLs** legger du til `https://BRUKERNAVN.github.io/smagrupper/oversikt.html`.

### 7. Tilpass personvernerklæringen

Les gjennom `personvern.html` og tilpass den (hvem som er ansvarlig, hvor lenge dere lagrer).

---

## Daglig bruk

Gruppene heter det samme som lederen, for eksempel «Ingrid Berge». Navnet settes og oppdateres
automatisk: når en ny leder kommer inn, når en leder endrer navnet sitt, og når en gruppe
multipliseres. Har en gruppe to ledere, heter den «Ingrid Berge og Ola Hansen».

### For administratorer

Administratorer har fire faner:

- **Oversikt:** Alle grupper som kort, med nestleder, antall deltakere og når gruppen sist samlet seg.
  Grupper uten nestleder har en liten gul prikk. Trykk på en gruppe for å se den slik lederen ser
  den. Nederst i gruppen kan du endre beskrivelse, invitere leder eller slette en tom gruppe.
  Med **+ Ny gruppe** velger du en leder som har konto, eller inviterer en ny.
- **Deltakere:** Alle deltakere, med søk og filter. Trykk på en person for å redigere, flytte
  vedkommende til en annen gruppe eller arkivere. Her kan du også laste ned listen.
- **Triader:** Sett sammen triader med **+ Ny triade**, med to eller tre ledere. Nederst står
  hvilke ledere som ikke er i en triade ennå.
- **Tilgang:** Alle som har konto. Trykk på en person for å endre rolle eller grupper.

**Legge ned en gruppe:** Åpne gruppen → **Endre beskrivelse** → fjern haken for «Aktiv».

### For ledere og nestledere

Lederen har to faner: **Gruppen** og **Triade**.

På **Gruppen** ser lederen:

- **Leder og nestleder** med telefon og e-post. Mangler gruppen nestleder, står det «Ingen
  nestleder ennå» med knappen **Velg nestleder**.
- **Registrer oppmøte:** Trykk på dem som er til stede og lagre. Under **Tidligere samlinger**
  kan du åpne og rette en samling.
- **Deltakerne:** Prikkene viser de siste samlingene, og en fylt prikk betyr til stede.
  Trykk på en person for å redigere eller arkivere.
- **+ Legg til** gir en påmeldingslenke som lederen sender til dem som skal være med (SMS,
  e-post eller kopier). De fyller inn opplysningene selv og havner rett i gruppen. Ledere
  legger ikke inn deltakere selv. Det kan bare en administrator gjøre.
- **Arkiverte:** Folk som har sluttet. De kan gjenopprettes eller slettes for godt.

Under **Triade** ser lederen hvem hen er i triade med, hvilke grupper de leder, og hvordan de kan
kontaktes. Siden er laget slik at vi kan legge til mer der senere.

### Velge nestleder

1. Trykk **Velg nestleder** i gruppen.
2. Velg en person fra deltakerlisten, og skriv inn e-post og telefonnummer.
3. Du får en ferdig skrevet invitasjon med knappene **Send på SMS** og **Send på e-post**.
4. Til nestlederen har laget konto, står vedkommende som «Invitert». Etterpå har nestlederen
   samme tilgang som lederen.

### Multiplisere

Når gruppen har **10 deltakere eller flere**, vises et stille forslag om å multiplisere, med
lenken **Hvorfor multiplisere?**. Den forklarer kort hvorfor dette er viktig for oss som kirke.
Forklaringen ligger også nederst på gruppesiden. «Ikke nå» skjuler forslaget til gruppen vokser
igjen. Vi ønsker at lederne multipliserer i dialog med lederne for smågruppearbeidet.

1. **Ny leder:** Velg nestlederen, eller **en ny leder** (navn, e-post og telefon).
2. **Fordel:** Trykk på en person for å flytte vedkommende. «Foreslå fordeling etter bosted»
   deler etter postnummer.
3. **Ferdig:** Den nye gruppen får navnet til den nye lederen. En ny leder får en invitasjon på
   SMS eller e-post.

---

## Greit å vite

- **E-post:** Uten egen e-posttjeneste sender Supabase bare e-post til medlemmer av
  Supabase-teamet deres. Derfor virker **«Glemt passord»** bare for dem. Vil dere at alle ledere
  skal kunne nullstille passordet selv, kobler dere til en e-posttjeneste (f.eks. Brevo, som har
  en gratisplan) under **Authentication → Emails → SMTP Settings**.
  Inntil da kan en administrator sette et nytt passord for en leder i **SQL Editor**:
  ```sql
  update auth.users
  set encrypted_password = extensions.crypt('NyttPassord123', extensions.gen_salt('bf'))
  where email = 'leder@epost.no';
  ```
  Lederen kan så bytte passordet under **Min profil**.
- **Fødselsår i stedet for alder.** Skjemaet spør om fødselsår, og siden regner ut alderen.
- **Gratisplanen hos Supabase** kan sette prosjektet på pause hvis det ikke brukes på en stund.
  Da logger du inn på supabase.com og trykker «Restore».
- **Sikkerhetskopi:** Last ned «Alle deltakere» som CSV en gang i blant og lagre filen et trygt sted.
- **Personvern:** Medlemskap i en menighetsgruppe kan si noe om tro, som er en særlig beskyttet
  opplysning. Bruk EU-region, ha samtykke, og slett folk som har sluttet (arkiverte kan slettes
  for godt). Supabase har en databehandleravtale (DPA) som dere bør godta.
- **Spam:** Skjemaet har en enkel felle mot roboter. Får dere mye søppel, kan vi legge til en
  «jeg er ikke en robot»-sjekk.

## Testet

Tilgangsreglene er testet mot Postgres med egne brukere for hver rolle. Testene sjekker blant annet:

- Besøkende kan ikke lese noe.
- Ledere ser og endrer bare sin egen gruppe.
- Oppmøte kan bare registreres på egne deltakere.
- En invitasjonslenke kan bare brukes én gang.
- En nestleder kan bare velges blant deltakerne i egen gruppe, og kan bare fjernes av en leder i gruppen eller en administrator.
- Bare ledere i gruppen kan multiplisere den.
- Ledere kan ikke legge inn deltakere selv. Det går bare via påmeldingslenken.
- Bare administratorer kan lage grupper og triader.
- En leder ser bare sin egen triade, og aldri deltakerne i andres grupper.
- Gruppenavnet følger lederen.

Oppgradering fra tidligere versjoner er testet uten at data går tapt. Hele flyten er også testet i
nettleseren på mobil og PC: påmelding, oppmøte, arkivering, nestleder, multiplisering, triader og
ny leder via invitasjon.
