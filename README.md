# MessengerJump

Jump to any date in Facebook Messenger instantly. A floating calendar button appears on Facebook — click it, pick a date, and jump straight to those messages.

## Features
- **Exact date** search — jump to messages from a specific day
- **Date range** search — find messages between two dates
- **Auto-scroll** — automatically loads older messages until your date is found
- Navigate between multiple results with Prev / Next buttons
- Keyboard shortcut: `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
- Works on facebook.com and web.facebook.com

## Privacy
This extension runs entirely in your browser. It only reads date separator labels (e.g. "January 5, 2023") — never the content of your messages. It stores nothing and has zero network access.

---

## Installation (Chrome / Edge)

1. Download or clone this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `fb-date-search-extension` folder
6. The extension installs — pin it to your toolbar

---

## How to use

1. Go to **facebook.com** and open any Messenger conversation
2. Click the **blue calendar button** in the bottom-right corner
3. Pick "Exact date" or "Date range"
4. Click **Search messages**
5. If the date isn't loaded yet, the extension will **auto-scroll** to load older messages automatically
6. Click **Stop loading** at any time to cancel

---

## Troubleshooting

**"No date markers found"**
→ Make sure a conversation is open (not just the inbox). Facebook needs to render messages before the extension can scan them.

**"Date not found after loading"**
→ The date may be too far back. Very long conversations can take a while. Try letting it auto-scroll longer, or check you have the right conversation.

**The button doesn't appear**
→ Hard-refresh the Facebook page (`Ctrl+Shift+R`) after installing.

---

## Changelog

### v1.1.0
- Auto-scroll now uses MutationObserver (reacts instantly when new messages load)
- Added early exit: stops scrolling once oldest loaded date passes your target
- Added random timing jitter to scroll steps
- Added max scroll cap (80 attempts) with a clear message
- Handles conversation switching mid-search cleanly
- Panel auto-re-injects if Facebook's SPA removes it
- Expanded date format support (EU/PH locales: "5 Jan 2023", "5 Jan at 3:00 PM")
- Removed unused `activeTab` and `scripting` permissions

### v1.0.0
- Initial release
