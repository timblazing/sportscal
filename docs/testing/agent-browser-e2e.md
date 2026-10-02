# Browser acceptance checks with agent-browser

These checks exercise the production build against live ESPN data. They are an interactive acceptance workflow, not a CI test runner: agent-browser is the project's browser automation CLI, while deterministic fixture coverage remains in Vitest.

## Start the app and browser

In one terminal, make sure the database has been migrated if you plan to test saved subscriptions, then start the production build:

```sh
pnpm build
pnpm start -p 3100
```

In a second terminal, create an isolated browser session and open the app:

```sh
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix sportscal-e2e)"
agent-browser open http://localhost:3100
agent-browser wait --load networkidle
agent-browser snapshot -i
```

Use the interactive refs from the latest snapshot for `click`, `fill`, and `download`. Re-run `snapshot -i` after navigation, opening a dialog, or any action that changes the page. The commands below describe the expected checks; refs will vary between snapshots.

To reset local builder preferences between scenarios:

```sh
agent-browser eval "localStorage.clear(); location.reload()"
agent-browser wait --load networkidle
agent-browser snapshot -i
```

## Builder and calendar download

1. Open the **League** dropdown, choose **NFL**, enter `steelers` in the team picker, and choose **Pittsburgh Steelers**. Confirm the season summary and schedule rows appear.
2. Confirm the first event preview contains `Steelers vs` or `Steelers @`.
3. Download the first calendar using the visible download button:

   ```sh
   agent-browser download '<download-button-ref>' /tmp/sportscal-steelers.ics
   ```

4. Check the downloaded calendar:

   ```sh
   rg 'BEGIN:VCALENDAR|UID:espn-[0-9]+-23@sportscal\.site' /tmp/sportscal-steelers.ics
   ```

## NHL

1. Reset local storage, open the **League** dropdown with the keyboard (focus it, press `Enter`), and confirm the options are NFL, NBA, NHL, NCAAF, each with its full name. Choose **NHL**.
2. Search `pit` and choose **Pittsburgh Penguins**. Confirm the URL includes `league=nhl&team=pittsburgh-penguins`, the season reads `2026-27`, and schedule rows appear.
3. Search `utah` and `st. louis` and confirm **Utah Mammoth** and **St. Louis Blues** appear.
4. Fetch the canonical feed and check UIDs and the 2h30 duration:

   ```sh
   curl -s 'http://localhost:3100/calendar/nhl/pittsburgh-penguins.ics' | rg -c 'UID:espn-[0-9]+-16@sportscal\.site'
   curl -s 'http://localhost:3100/calendar/nhl/pittsburgh-penguins.ics' | rg -m1 'DURATION:PT2H30M'
   ```

## Formatting and team search

1. Reset local storage, select **NBA**, search `okc`, and choose **Oklahoma City Thunder**. Open **Formatting options**.
2. Set the title template to `🏀 {teamAbbr} {homeAwaySymbol} {opponentAbbr}`. Confirm the preview starts with `🏀 OKC vs` or `🏀 OKC @`, and the URL includes `league=nba&team=oklahoma-city-thunder`.
3. Reset local storage, select **NCAAF**, search `zzzz`, and confirm **No teams found.**
4. Search `sooners`, select **Oklahoma Sooners**, and confirm the selected team, season summary, and schedule. Then search `montana grizzlies` and confirm **Montana Grizzlies** appears in the options.

## Schedule override

1. Select **NCAAF** and **Oklahoma Sooners**.
2. Open the first schedule row's **Edit** control. In the dialog, turn off **Include this game in the calendar**, then save.
3. Confirm the included count decreased by one and the row says **Excluded from calendar** and **Override**.

## Canonical subscription

1. Open `http://localhost:3100/?league=nfl&team=pittsburgh-steelers` and wait for the schedule.
2. Open the subscription dialog and copy the displayed subscription URL.
3. Confirm the URL ends in `/calendar/nfl/pittsburgh-steelers.ics`, then inspect the endpoint headers:

   ```sh
   curl -sSI 'http://localhost:3100/calendar/nfl/pittsburgh-steelers.ics'
   ```

4. Confirm the response is `200`, the content type includes `text/calendar`, and the cache-control header includes `s-maxage`.

## Saved subscription and editing

Requires a working `DATABASE_URL` and applied migrations.

1. Reset local storage, select **NBA** and **Oklahoma City Thunder**, open formatting options, and set `{teamAbbr} {homeAwaySymbol} {opponentAbbr}`.
2. Open the subscription dialog. Confirm the feed URL ends in `/calendar/nba/oklahoma-city-thunder/<12-character-id>.ics` and the manage URL contains `#token=`.
3. Copy the feed URL and public ID. Fetch the feed and confirm it contains a `SUMMARY:OKC vs` or `SUMMARY:OKC @` event and a UID containing `-<public-id>@sportscal.site`.
4. Confirm unauthorized edits are rejected:

   ```sh
   curl -i -X PATCH 'http://localhost:3100/api/calendars/<public-id>' \
     -H 'content-type: application/json' \
     -H 'authorization: Bearer not-the-right-token-000000' \
     --data '{"config":{}}'
   ```

   The response should be `403`.

5. Open the manage URL in agent-browser. Confirm the token is removed from the visible URL and **Editing is enabled in this browser.** appears. Change the title to `Thunder game: {opponent}`, save, and confirm **Calendar saved**. Fetch the feed again and confirm its event summary starts with `SUMMARY:Thunder game:`.

## Shared formatting and mobile layout

1. On the Thunder builder, set `Custom {teamAbbr} {opponent}` in formatting options.
2. Download a calendar and confirm the file contains `SUMMARY:Custom OKC `. Open the subscription dialog and confirm its feed also contains `SUMMARY:Custom OKC `.
3. Set a phone viewport and reset to the Oklahoma builder:

   ```sh
   agent-browser set viewport 393 852
   agent-browser open 'http://localhost:3100/?league=ncaaf&team=oklahoma-sooners'
   agent-browser wait --load networkidle
   ```

4. Check for horizontal overflow:

   ```sh
   agent-browser eval 'document.documentElement.scrollWidth - window.innerWidth'
   ```

   The result should be `0` or less. Set the template to `{teamAbbr} {homeAwaySymbol} {opponentAbbr}`, confirm the preview starts with `OU vs` or `OU @`, and download the last visible calendar button. Its filename should begin with `oklahoma-sooners-`.

Close the isolated browser session when finished:

```sh
agent-browser close
```
