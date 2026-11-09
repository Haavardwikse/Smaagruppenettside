# Smågrupper – Bergen Frikirke

En enkel nettside der folk melder seg på en smågruppe, og der ledere har oversikt over gruppen sin,
registrerer oppmøte og kan dele gruppen i to når den vokser.

| Hvem | Hva de ser og gjør |
|---|---|
| **Deltakere** | Melder seg på via en lenke fra lederen. Ingen innlogging. Kan ikke se noe etterpå. |
| **Leder / nestleder** | Ser bare sin egen gruppe og sin triade. Registrerer oppmøte, deler påmeldingslenken, arkiverer deltakere, velger nestleder og kan multiplisere gruppen. Nestlederen har samme tilgang som lederen. |
| **Administrator** | Ser alle grupper og deltakere. Oppretter grupper, inviterer ledere, setter sammen triader og styrer tilgang. |

Selve nettsiden ligger på **GitHub Pages** (gratis). Dataene og innloggingen ligger i **Supabase**
(gratisplanen holder godt for noen hundre personer). Tilgangsreglene ligger i databasen, ikke på
nettsiden, så ingen kan omgå dem ved å fikle med nettleseren.

## Filer

```
index.html              Påmeldingsskjemaet (åpnes via lenke fra lederen)
oversikt.html           Ledersiden: innlogging, gruppen, oppmøte, administrasjon
sjekk.html              Systemsjekk: tester at nettside og database henger sammen
personvern.html         Personvernerklæring (mal – må tilpasses)
paaminnelse.ics         Kalenderpåminnelse: registrer oppmøte hver onsdag kl. 21:20
config.js               Supabase-adresse og -nøkkel, kirkens navn og kontakt-e-post
css/style.css           Utseende
js/                     Programkoden (js/handbok.js: tekstene i Håndbok)
supabase/schema.sql     Databaseoppsett, regler for datakvalitet og tilgang
supabase/postnummer.sql Postnummerregisteret (Bring), brukes til å fylle ut sted
```

---

## Oppsett (ca. 30 minutter, gjøres én gang)

### 1. Lag databasen i Supabase

1. Gå til [supabase.com](https://supabase.com), lag en gratis konto og trykk **New project**.
2. Gi prosjektet et navn (f.eks. `smagrupper`), velg et sterkt databasepassord og
   **velg en region i Europa** (f.eks. Frankfurt eller London). Det er viktig for personvernet.
   Står det noe annet enn London på personvern.html, så rett teksten der.
3. Når prosjektet er klart: gå til **SQL Editor → New query**, lim inn hele innholdet i
   `supabase/schema.sql` og trykk **Run**. Du skal få «Success».
4. Gjør det samme med `supabase/postnummer.sql`. Den legger inn alle norske postnumre, slik at
   sted fylles ut automatisk og alltid blir riktig.

> **Har du allerede kjørt en eldre versjon av filen?** Kjør den nye `schema.sql` på samme måte.
> Den oppgraderer databasen, og alle deltakere og grupper blir liggende. Grupper som har en
> leder, får da navnet til lederen.

### 2. Innstillinger for innlogging

Nye ledere lager kontoen sin selv via en invitasjonslenke. Derfor:

1. **Authentication → Sign In / Providers**: la **«Allow new users to sign up»** stå **på**.
2. Under **Email** på samme side: slå **av** **«Confirm email»**.
3. Sett **minste passordlengde** til 8 tegn (samme side, under passord-innstillingene). Nettsiden
   krever 8, og da krever Supabase det samme.

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
4. Dette trengs bare for den første administratoren. Andre administratorer og ledere inviterer
   du fra nettsiden (fanen **Tilgang → + Inviter**).

### 4. Koble nettsiden til databasen

1. Gå til **Project Settings → API Keys** (og **Data API** for adressen).
2. Kopier **Project URL** og **Publishable key** (heter «anon public» i eldre prosjekter).
3. Åpne `config.js` og lim dem inn. Fyll også inn **CONTACT_EMAIL**. Den vises i
   personvernerklæringen.

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

### 8. Kjør systemsjekken

Åpne `https://BRUKERNAVN.github.io/Smaagruppenettside/sjekk.html`. Siden tester den ekte databasen:

- Har databasen riktig versjon, og finnes postnummerregisteret?
- Er alle data stengt for besøkende uten innlogging?
- Er innloggingsinnstillingene riktige?
- Finnes alle sidene?

Alt skal være grønt. Logger du først inn som administrator på ledersiden, sjekker den også dataene.
Kjør den gjerne igjen etter hver oppdatering.

---

## Daglig bruk

Gruppene heter det samme som lederen, for eksempel «Ingrid Berge». Navnet settes og oppdateres
automatisk: når en ny leder kommer inn, når en leder endrer navnet sitt, og når en gruppe
multipliseres. Har en gruppe to ledere, heter den «Ingrid Berge og Ola Hansen».

### For administratorer

Administratorer har fire faner:

- **Oversikt:** **Eksporter** gir en mappe (zip) med én Excel-fil per gruppe, i samme oppsett som
  fremmøtearket: dato, starttid, «Hvordan er samlingen gjennomført?» og timer øverst, deretter én rad
  per deltaker (navn, postnummer, poststed, telefon, kjønn, fødselsår) med «x» for oppmøte. Velg år
  eller egne datoer. Filene heter det samme som gruppene. Bare samlinger med registrert oppmøte tas
  med. Deltakere som har sluttet, men var med i perioden, kommer også med.
  Under knappene: alle grupper som kort, med nestleder, antall deltakere og når gruppen sist samlet seg.
  Grupper uten nestleder har en liten gul prikk. Trykk på en gruppe for å se den slik lederen ser
  den. Nederst i gruppen kan du endre beskrivelse, invitere leder eller slette en tom gruppe.
  Med **+ Ny gruppe** velger du en leder som har konto, eller inviterer en ny.
- **Deltakere:** Alle deltakere, med søk og filter. Trykk på en person for å redigere, flytte
  vedkommende til en annen gruppe eller arkivere. Her kan du også laste ned listen.
- **Triader:** Sett sammen triader med **+ Ny triade**, med to eller tre ledere. Nederst står
  hvilke ledere som ikke er i en triade ennå.
- **Tilgang:** Her gir du nye folk tilgang. Trykk **+ Inviter**, velg **Leder** (for en ny eller
  eksisterende gruppe) eller **Administrator**, og fyll inn navn og e-post (og telefon for ledere).
  Du får en lenke du sender på SMS eller e-post. Personen åpner lenken, lager konto og har tilgang
  med en gang. Under **Venter på å godta** ser du invitasjoner som ikke er brukt ennå. Der kan du
  sende lenken på nytt eller avbryte den. Under **Har tilgang** står alle som har konto. Trykk på
  en person for å endre rolle eller grupper.

**Legge ned en gruppe:** Åpne gruppen → **Endre beskrivelse** → fjern haken for «Aktiv».

### For ledere og nestledere

Lederen har tre faner: **Gruppen**, **Triade** og **Håndbok**.

På **Gruppen** ser lederen:

- **Leder og nestleder** med telefon og e-post. Mangler gruppen nestleder, står det «Ingen
  nestleder ennå» med knappen **Velg nestleder**.
- **Denne ukens samling** (øverst): Hver aktiv gruppe får automatisk en samling hver onsdag kl.
  19–21. Kortet viser datoen tydelig og om oppmøtet er registrert. Trykk **Registrer oppmøte**,
  kryss av dem som var der og lagre. Mandag og tirsdag står det «Neste samling», og oppmøte kan
  registreres fra onsdag. Tid, timer, Fysisk/Digitalt og dato kan endres under **Endre**.
  Under knappen står **Legg inn påminnelse i kalenderen** til lederen har gjort det én gang.
- **Tidligere samlinger:** Når en ny uke starter, flyttes forrige samling hit. Samlinger uten
  oppmøte står som «Ikke registrert» og kan fortsatt åpnes og registreres. **Fjern oppmøtet** gjør
  en samling tom igjen. Tomme samlinger tas ikke med i eksporten eller statistikken.
- **Deltakerne:** Prikkene viser de siste samlingene, og en fylt prikk betyr til stede.
  Trykk på en person for å redigere eller arkivere.
- **+ Legg til** gir en påmeldingslenke som lederen sender til dem som skal være med (SMS,
  e-post eller kopier). De fyller inn opplysningene selv og havner rett i gruppen. Ledere
  legger ikke inn deltakere selv. Det kan bare en administrator gjøre.
- **Arkiverte:** Folk som har sluttet. De kan gjenopprettes eller slettes for godt.
- **Påminnelse i kalenderen** (også nederst, alltid tilgjengelig): legger inn en påminnelse hver onsdag kl. 21:20 om å
  registrere oppmøte. Det finnes én knapp for iPhone, Mac og Outlook, og én for Google Kalender.
  Lenken i påminnelsen går rett til oppmøtet (`oversikt.html#oppmote`). Google bruker lederens
  vanlige varslingstid, så der må varselet settes til «Når aktiviteten starter».

Under **Triade** ser lederen hvem hen er i triade med, hvilke grupper de leder, og hvordan de kan
kontaktes. Siden er laget slik at vi kan legge til mer der senere.

**Håndbok** har korte informasjonspakker fra leder- og nestlederkurset: hvorfor smågrupper,
smågruppens fem hensikter, å være smågruppeleder, å være nestleder, godt oppmøte, god gruppekultur,
Gud gir vekst og hvorfor multiplisere. Administratorer finner den i menyen (**Lederhåndbok**).
Noen av pakkene dukker også opp der de er relevante: «Hva gjør en nestleder?» når gruppen mangler
nestleder, hva man ser etter når man velger nestleder, og en kort forklaring i invitasjonen til
nye ledere og nestledere. Teksten ligger i `js/handbok.js` og er lett å endre.

### Velge nestleder

1. Trykk **Velg nestleder** i gruppen.
2. Velg en person fra deltakerlisten, og skriv inn e-post og telefonnummer. Det er det vanligste.
   Er nestlederen ikke med i gruppen i dag, trykker du **Er ikke nestlederen med i gruppen i dag?**
   og skriver inn navnet i stedet. Nestlederen kommer da ikke på deltakerlisten.
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

## Datakvalitet: regler i databasen

Reglene ligger i selve databasen, så de gjelder uansett hvordan data kommer inn.

- **Deltaker-ID:** Hver deltaker får et fast nummer (#1, #2 …) som aldri gjenbrukes. Det vises i
  deltakerdetaljene og i nedlastede lister, og du kan søke på det.
- **Unik e-post for ledere:** E-posten er lederens innlogging og ID. En invitasjon gjelder én
  bestemt e-post, og den kan bare godtas av en konto med samme e-post.
- **Ingen dobbeltregistrering:** Samme navn og fødselsår kan ikke stå to ganger i samme gruppe.
  Melder noen seg på igjen, skjer det ingenting.
- **Påkrevde felt ved påmelding:** fullt navn (fornavn og etternavn), fødselsår (1900 til i år), kjønn (mann/kvinne),
  gyldig norsk postnummer og samtykke.
- **Fast format:** Navn ryddes for doble mellomrom og får stor forbokstav hvis alt er skrevet med
  små eller store bokstaver. Sted hentes alltid fra postnummeret. Telefon lagres som +47XXXXXXXX
  og e-post med små bokstaver.
- **Invitasjoner** krever navn, e-post og telefon. En ny invitasjon til samme e-post erstatter den
  gamle.
- **Sammenheng:** Oppmøte kan bare registreres på aktive deltakere i egen gruppe, og ikke fram i
  tid. En nestleder må være deltaker i samme gruppe. En triade kan bare bestå av ledere.
- **Datasjekk:** Øverst på Oversikt ser administratoren om noe bør ryddes: grupper uten leder,
  mulige dobbeltregistreringer, utløpte invitasjoner og deltakere som har vært arkivert i over
  ett år.

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
  opplysning. Bruk en europeisk region, ha samtykke, og slett folk som har sluttet (arkiverte kan slettes
  for godt). Supabase har en databehandleravtale (DPA) som dere bør godta.
- **Ingen offentlig gruppeliste:** Påmeldingssiden fungerer bare med lenken fra lederen. Det finnes
  ingen liste over grupper eller ledernavn som hvem som helst kan se.
- **Spam:** Skjemaet har en felle mot roboter, og databasen bremser hvis det kommer svært mange
  påmeldinger på kort tid.
- **Kontoer uten tilgang:** Siden alle kan lage en konto, kan det dukke opp kontoer uten tilgang.
  De ser ingenting. Datasjekken teller dem, og du kan slette dem under **Authentication → Users**
  i Supabase.

## Testet

Tilgangsreglene er testet mot Postgres med egne brukere for hver rolle. Testene sjekker blant annet:

- Besøkende kan ikke lese noe.
- Ledere ser og endrer bare sin egen gruppe.
- Oppmøte kan bare registreres på egne deltakere.
- En invitasjonslenke kan bare brukes én gang.
- En nestleder kan bare velges blant deltakerne i egen gruppe, og kan bare fjernes av en leder i gruppen eller en administrator.
- Bare ledere i gruppen kan multiplisere den.
- Ledere kan ikke legge inn deltakere selv. Det går bare via påmeldingslenken.
- Bare administratorer kan lage grupper og triader, og invitere nye administratorer.
- En administrator-lenke virker bare for e-posten den er laget til, og bare én gang.
- En leder ser bare sin egen triade, og aldri deltakerne i andres grupper.
- Gruppenavnet følger lederen.
- Besøkende kan bare slå opp postnumre og bruke de fire offentlige funksjonene. Alle tabeller har
  radtilgang (RLS), og alle funksjoner har fast søkesti.

Det er 178 automatiske kontroller av tilgang og datakvalitet, der hver rolle (besøkende, fremmed
konto, leder, nestleder, leder i annen gruppe og administrator) prøver alt den ikke skal få lov
til. Oppgradering fra tidligere versjoner er testet uten at data går tapt. Hele flyten er også testet i
nettleseren på mobil og PC: påmelding, oppmøte, arkivering, nestleder, multiplisering, triader og
ny leder via invitasjon.
