// =====================================================================
//  Innstillinger – fyll inn fra Supabase: Project Settings → API Keys
//  Nøkkelen her er den OFFENTLIGE nøkkelen (publishable / anon).
//  Den er laget for å ligge åpent på nettsiden. Tilgangsreglene i
//  databasen er det som beskytter dataene.
//  ALDRI lim inn "secret" eller "service_role"-nøkkelen her.
// =====================================================================

export const config = {
  SUPABASE_URL: 'https://kkrgzsrnlfrjgtfaebol.supabase.co',
  SUPABASE_KEY: 'sb_publishable_GtYCm8Bl0LKvghfEBnCMCw_nlUiYXI_',

  ORG_NAME: 'Bergen Frikirke',
  CONTACT_EMAIL: 'hei@bergenfrikirke.no', // vises i personvernerklæringen
};
