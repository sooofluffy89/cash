# CASH · LABULA

Jedna společná hotovost v CZK. Pohyby, týdenní fyzické kontroly, dohledatelné opravy, soukromé fotografie a čeština/angličtina.

## První použití

1. Otevři nasazený CASH a přihlas se přes ChatGPT účtem vlastníka `jan@bananasport.cz`. Účet byl ověřen v přístupové politice Sites a je jediný povolený pro prvotní založení správce.
2. Spočítej skutečnou hotovost a jednou zadej počáteční stav s důvodem. Do té doby jsou běžné pohyby vypnuté.
3. Ve Správě přidej člověka podle e-mailu jeho vlastního účtu ChatGPT a vyber Obsluha, Manažer nebo Správce. Přidání neposílá e-mail; sdílej s člověkem odkaz. Po prvním přihlášení se přístup trvale spojí s ověřeným identifikátorem tohoto účtu v CASH. E-mail existujícího přístupu se nemění; pro jiný účet přidej nový a starý deaktivuj.
4. Nastav den kontroly. Při kontrole zadej skutečně napočítanou částku, případně nulu, a porovnej ji s evidencí. U obsluhy rozdíl vyžaduje vysvětlení, zůstane k vyřešení a nemění zůstatek. Shoda obsluhy nezavírá dřívější otevřené případy.
5. Manažer nebo správce svou kontrolu po posledním potvrzení rovnou uzavře. Při rozdílu se zůstatek dorovná na aktuálně napočítanou hotovost jedním navazujícím finančním záznamem. Předchozí otevřené kontroly jsou před potvrzením výslovně vypsané; jejich rozdíly se nesčítají.
6. Starší rozdíl otevři v detailu přes „Prověřit a uzavřít“. Nejprve doplň chybějící pohyb nebo stornuj chybný zápis a zapiš správný. Potom hotovost znovu fyzicky spočítej a vyplň vysvětlení řešení, i když už sedí. Oprava používá pouze aktuální rozdíl, takže chybějící pohyb nezapočítá podruhé. Při změně evidence, role nebo počtu otevřených případů je nutné obnovit porovnání, znovu spočítat peníze a potvrdit nový souhrn.

## Tři role

Obsluha zapisuje vklady, výběry a kontroly a čte historii i fotografie. Nemůže uzavírat rozdíly, opravovat či stornovat záznamy, exportovat CSV ani spravovat aplikaci.

Manažer má navíc uzavírání kontrol, storno chybného pohybu a CSV. Nemůže měnit lidi a nastavení, počáteční stav, samostatné opravy ani stahovat kompletní zálohu. Správce má všechna oprávnění a spravuje přístupy. Poslední aktivní správce je chráněný i při převodu na manažera. Oprávnění kontroluje server při čtení i v transakci zápisu, nikoliv jen zobrazení tlačítek.

## Přístupy a data

Veřejně je dostupný vstup do aplikace. API, historie, fotografie, exporty a zálohy vždy vyžadují přihlášení a aktivní přístup uvnitř CASH. Správa navíc vyžaduje roli správce. Identita je poskytována Sites; CASH nemá vlastní OAuth nebo hesla. Posledního aktivního správce nelze deaktivovat ani demotovat.

Data jsou v D1 (`DB`), soubory v R2 (`BUCKET`). Částky jsou celé haléře. Každý zápis používá jednu atomickou D1 batch transakci: pojmenované CHECK ochrany v write_guards ověří aktuální přístup a roli, revizi, zůstatek, přílohu a navazující opravy. Uzavření ověřuje přesnou množinu potvrzených otevřených případů; nový případ se k ní nepřidává potichu. Kontrola, nejvýše jedna finanční oprava, vazby uzavření, stav a fotografie se uloží společně. Neúspěch vrátí celý zápis zpět. Pomocné validační řádky se ve stejné transakci odstraní. Garantované chování batch je popsané v [dokumentaci D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Unikátní identifikátor požadavku zabraňuje duplicitám včetně opakování po ztracené odpovědi. Aplikační API historii a audit pouze přidává; neobsahuje operace pro jejich přepsání či smazání. Autora, jeho tehdejší roli a čas určuje server. Staré záznamy bez uložené role ji zpětně neodhadují podle současného přístupu.

Nová tabulka `count_closures` spojuje všechny prověřené kontroly s jednou finální kontrolou a případnou společnou finanční opravou. Revize pokladny odpovídá počtu finančních/kontrolních záznamů; kontrola s opravou ji zvýší o dva. Migrační krok 0004 pouze přidává tabulku a nullable role do záznamů a auditu. Nemění existující peníze, přístupy ani starší uzavření; historická kontrola správce se sama zpětně neuzavře. Dříve uložené potvrzené požadavky lze stále bezpečně ověřit, ale nové uzavření starým způsobem „vysvětlit/opravit původní rozdíl“ server odmítá a vyžaduje nový přepočet.

Fotky z prohlížeče se převádějí na JPEG s delší stranou nejvýše 1800 px. Příloha je nepovinná, server přijímá pouze JPG/PNG/WebP do 8 MB a nikdy ji nevydává veřejně. Neúspěšný pohyb nemění zůstatek; předem nahraná nepřipojená fotka zůstane soukromá a není součástí zálohy. U skutečného velmi velkého provozu je možné přidat provozní úklid těchto souborů; žádný automatický úklid zatím neběží.

Jazyk a rozepsaný formulář jsou lokální preference. Formulář ukládá sessionStorage; fotografie musí být po obnovení stránky znovu vybrána, pokud ještě nebyla nahrána. Nejasný výsledek požadavku drží původní identifikátor a obsah. Ověření/opakování bezpečně vrátí tentýž uložený záznam. Při změně pokladny během formuláře je nutné obnovit a znovu zkontrolovat částku, u kontroly znovu spočítat peníze.

## Záloha a obnova

Manažer a správce mohou stáhnout CSV za období/typ. CSV obsahuje zaznamenanou roli autora a metadata uzavření; finanční částku opravy nese jeden samostatný řádek vyřešení. Kompletní soukromá záloha TAR je pouze pro správce. Formát `labula-cash-v2` obsahuje konzistentní snímek `cash.json`, vazby uzavření a všechny připojené fotografie. Uchovávej ho jako citlivá data. Automatické plánované zálohy nejsou nakonfigurované. Dostupnost a retenční dobu případné platformní obnovy D1 nelze z nástrojů Sites spolehlivě potvrdit; proto na ni tento projekt nespoléhá.

Obnova byla ověřena do nové oddělené SQLite databáze. Provozní postup:

```sh
node scripts/restore-backup.mjs cash-backup.tar NEW-empty-recovery.sqlite
```

Nástroj přijímá v1 i v2, odmítne již existující neprázdnou databázi a ověří formát, role, reference, součet pohybů, revizi, přítomnost fotografií i shodu společných vazeb uzavření s finální kontrolou a jedinou opravou. V1 doplní nové prázdné schéma bez odvozování historických rolí nebo uzavření. Fotografie uloží vedle souboru databáze. Tato operace je offline; web neobsahuje tlačítko pro přepsání produkce.

Před produkční obnovou správce hostingu ověří obnovený snímek v izolaci, zajistí zachování současného stavu a použije podporovaný import D1 a nahrání objektů do R2 pod původními klíči z tabulky media. Nativní Sites nástroje v této relaci přímý import runtime D1/R2 nenabízejí: produkční obnova vyžaduje přístup správce hostingu. Není automatická a nebyla provedena na ostré databázi. Při převodu snímku do jiného Sites projektu je nutné znovu ověřit vazby uživatelů, protože identifikátory se mezi Sites liší.

## Vývoj a ověření

Podporovaný Vinext Sites starter, zachovaná integrace Sites build/identity. Manifest `.openai/hosting.json` uchovává stejné ID projektu. Migrační SQL a Drizzle metadata se verzují; další změny přidávají migraci. Schéma se nevytváří za běhu požadavku.

```sh
node <Sites-plugin>/scripts/install-dependencies.mjs
npm run db:generate                 # pouze po změně schématu
node scripts/test-cash.mjs
node scripts/test-ui-requests.mjs
node node_modules/typescript/bin/tsc --noEmit
node <Sites-plugin>/scripts/build-site.mjs
npm run dev -- --port 5179
# Pouze proti samostatné lokální DB s aktivním testovacím správcem:
node scripts/test-local-api.mjs http://127.0.0.1:5179
node scripts/test-local-roles-api.mjs http://127.0.0.1:5179
```

Lokální D1 migrace podle README starteru se aplikují přes Wrangler proti `.wrangler/state`, nikoliv vzdálené databázi. Lokální přihlášení starteru (`seedy@sites.test`) vyžaduje samostatné testovací povolení v lokální DB. Testovací účty, přílohy a databáze z `.sites-runtime/` a `.wrangler/` jsou ignorované a nejsou nasazeny.

Publikace probíhá přes helper Sites `site-workflow.mjs` se zdrojovým credentialem pouze přes skrytý stdin; zkontrolovaný commit/archiv se předá nativnímu save/deploy nástroji. Nikdy nepřidávej runtime data nebo credentialy do zdrojů.

Odezvy rozhraní používají CSS a malé sdílené komponenty bez nové animační knihovny. Stavové zprávy rozlišují přípravu/nahrání fotky, uložení, ověření nejistého požadavku a přípravu exportu. Zvýraznění se váže na konkrétní událost; automatické obnovení neotevírá znovu stránku ani nemění zaměření. `prefers-reduced-motion` vypíná přechody, rotace a čekání na zavírací animaci. Detail, historie i příprava fotografie používají pořadové brány, aby stará odpověď nemohla přepsat novější výběr nebo jeho indikátor.

Aktualizace odezev byla ověřena na desktopu a telefonu v CZ/EN, včetně skutečného systémového omezení pohybu, klávesnice, pomalých a přerušených požadavků, bezpečného opakování zápisu, fotografií a správy. Síťové poruchy i testovací záznamy byly pouze v odděleném lokálním prostředí; do produkční evidence se testovací data neposílají.

Aktualizace tří rolí má 36 integračních kontrol a 5 kontrol pořadí UI požadavků. Lokální HTTP sada rolí ověřuje 10 scénářů přes skutečné D1 a Sites mock přihlášení, včetně souběžného uzavření, změny role a chráněné fotografie; původní HTTP sada má 8 kontrol. Browser ověřil předání obsluhou, nové fyzické počítání manažera, dvě starší kontroly uzavřené jednou opravou a bezpečné ověření po ztrátě odpovědi. Testy obnovy pokrývají v1, v2, zachování starých dat a odmítnutí poškozené vazby. Úspěšný lokální test neopravňuje vydávat skutečné produkční přihlášení vlastníka za ověřené, pokud bylo zastavené ručním zadáním hesla.

Kompatibilita Sites: první dvě nasazení selhala na SQL triggerech ještě před zveřejněním Workeru. Neúspěšné, v hostingu neaplikované migrace 0001/0002 byly opraveny na podporované indexy; původní prototypové SQL je uchované v docs/prototype-migrations jako reference a není součástí běžících migrací. Ochrany zajišťuje atomický backend a nové CHECK schéma v migraci 0003. Základní migrace 0000 zůstala beze změny. Po úspěšném nasazení se žádná aplikovaná migrace neupravuje.
