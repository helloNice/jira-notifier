# AGENTS.md

## Project Snapshot

- Chrome MV3 extension built with WXT, React, TypeScript, antd, Zustand, and `jira.js`.
- Main extension output is `.output/chrome-mv3`.
- Popup entry is `entrypoints/popup`.
- Background entry is `entrypoints/background/index.ts`.
- User settings are persisted in Chrome local storage under `user-setting`.
- Jira task state is persisted in Chrome local storage under `jira-data`.

## Current Product Flow

- On first install, the background script opens `/popup.html#/setting?setup=jira`.
- The first-run setup page is a dedicated minimal page. It only asks for the Jira server address and then requests host permission.
- The full settings page remains available from the popup settings icon.
- The extension reuses the user's Chrome Jira session. It does not store Jira passwords.
- Background polling checks unresolved issues assigned to the current Jira user and sends system notifications for newly detected tasks.

## Internationalization

- Supported locales: `zh_CN` and `en`.
- Locale source files are `locales/zh_CN.yml` and `locales/en.yml`.
- Keep both locale files with the same key set.
- After changing locale keys, run `npm run postinstall` to regenerate WXT i18n types.
- Use `i18n.t(...)` for user-visible UI text, notifications, validation messages, and browser document titles.

## Build And Release

- Type check: `npm run compile`
- Build Chrome MV3 output: `npm run build`
- Build Chrome Web Store zip: `npm run zip`
- Chrome Web Store upload artifact is generated under `.output`.

## File Format

- Keep edited files as UTF-8 without BOM and CRLF line endings.
- Prefer scoped changes. Do not revert unrelated dirty working-tree changes.

## Operational Notes

- Do not perform Redis, MongoDB, or other database writes without explicit user approval.
- If browser automation is needed against the user's real Chrome, use `agent-browser connect 11415` and pass `--cdp 11415` on each command.
- Remote jumpserver access is view-only unless the user explicitly approves a change.
