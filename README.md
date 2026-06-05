# Friction

μ = ∞

An OS-level focus system that creates friction against distractions.

## Demo

[Demo GIF / Video Here]

---

## Download

### Windows

Download Friction for Windows

### macOS

Coming Soon

### Linux

Coming Soon

---

## What is Friction?

Most productivity apps try to help you focus.

Friction makes distraction harder.

Instead of relying on willpower, Friction changes your environment.

Block websites.
Block applications.
Create schedules.
Run enforcement in the background.

When a distraction becomes harder than the work, focus becomes the default.

The name comes from the idea:

μ = ∞

Infinite friction against distractions.

---

## Features

* Website blocking
* Application blocking
* Schedule-based enforcement
* Background Windows service
* One-time admin setup
* Works even when the UI is closed
* Automatic startup on boot
* Website groups
* Application groups
* Custom schedules
* Local-first configuration
* Lightweight resource usage
* No account required
* No cloud dependency

---

## Screenshots

### Dashboard

[Screenshot]

### Website Blocking

[Screenshot]

### Application Blocking

[Screenshot]

### Schedule Management

[Screenshot]

---

## How It Works

```text
Electron UI
      ↓
Configuration
      ↓
Background Service
      ↓
Schedule Engine
      ↓
Website Blocking
Application Blocking
```

The background service continuously evaluates your schedule and applies blocking rules.

Once installed, blocking continues even if the application window is closed.

---

## Example Use Cases

### Deep Work

```text
9:00 AM → 1:00 PM

Block:
- YouTube
- Twitter
- Reddit
- Steam
- VLC
```

### Study Session

```text
6:00 PM → 9:00 PM

Block:
- Games
- Anime websites
- Video players
```

### Work Hours

```text
10:00 AM → 6:00 PM

Block:
- Social media
- Entertainment websites
```

---

## Installation

### Windows

Download the latest installer from GitHub Releases.

Run the installer and approve the one-time administrator prompt.

After installation:

* Background service starts automatically
* Friction launches normally
* No repeated admin prompts

---

## Development

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/friction.git
cd friction
```

Install dependencies:

```bash
npm install
```

Run development mode:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Package:

```bash
npm run dist:win
```

---

## Philosophy

Most distractions are only one click away.

Friction intentionally increases the cost of impulsive behavior.

The goal is not perfect discipline.

The goal is to make the productive choice easier than the distracting one.

---

## Privacy

Friction is completely local.

* No accounts
* No cloud sync
* No analytics
* No data collection

Your schedules and blocking rules remain on your machine.

---

## Contributing

Pull requests are welcome.

Areas for contribution:

* New blocking mechanisms
* Cross-platform support
* UI improvements
* Performance improvements
* Documentation
* Testing

---

## License

MIT