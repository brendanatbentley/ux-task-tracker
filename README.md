# Design backlog and capacity tracker

A single-user design work queue with a read-only public snapshot. The owner view stores data in the current browser; it has no account system or backend.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Add and score requests, set weekly capacity, and use the queue-order selector to switch between score sorting and manual ordering. Export a `design-backlog.json` backup to move data to another browser or device.

## Publish the read-only view

The shared view is available at `/#share`. It reads `public/shared-snapshot.json`, which is intentionally safe to publish. The snapshot contains only the fields needed by viewers; impact and urgency are omitted unless explicitly selected by the owner.

1. In the owner view, choose whether to include scores, then download the shared snapshot.
2. Replace `public/shared-snapshot.json` with the downloaded file.
3. Commit and push the update to `main`. The GitHub Actions workflow tests, builds, and deploys the site.
4. In repository settings, configure **Pages → Build and deployment → Source: GitHub Actions**. The first deployment requires this setting.

The snapshot URL is public to anyone who has it. Do not include information you do not want to share. Owner data remains in browser storage and is not published unless included in the exported snapshot.

## Queue rules

- Priority is calculated in one place as `impact × urgency`.
- Priority mode sorts queued requests by highest score, then smallest estimate, then oldest date.
- Manual mode uses the saved order for the full queue.
- Queue totals and projected start weeks use only queued estimates. In-progress requests are excluded.
- Queue weeks are total queued hours divided by weekly capacity. An item starts in week `floor(hours ahead ÷ weekly capacity) + 1`.

## Checks

```sh
npm test
npm run build
```
