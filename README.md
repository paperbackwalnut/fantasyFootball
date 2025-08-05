# 🏈🏈✨🤖✨🏈🏈 Super Hype Max XL Triple Gold Star AI Powered Fantasy Football Super Duper Draft Helper Plus 🏈🏈✨🤖✨🏈🏈

🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨
Yeah, I know. The name is ridiculous. But hey, it actually works.
🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨🚀✨

## What is this thing?

I got tired of FantasyPros' draft assistant being slow and generic, so I built my own. This thing syncs with your ESPN or Sleeper league, watches your draft in real-time, and gives you AI-powered pick recommendations before you're even on the clock.

The best part? It learns from your league's draft history and can predict what your buddies are going to pick. No more reaching for players three rounds early because you panicked.

## Features that actually matter

- **Auto-syncs with ESPN and Sleeper** - No manual data entry nonsense
- **Real-time draft monitoring** - Updates instantly when picks are made
- **Pre-computed recommendations** - AI analyzes your next picks while others are drafting
- **Opponent modeling** - Learns draft patterns to predict what your leaguemates will do
- **Breaking news integration** - Automatically factors in injuries and trades
- **Stack analysis** - Suggests QB/WR combos and handcuff opportunities
- **Bye week optimization** - Won't leave you screwed in week 7

## Tech stuff (if you care)

Built with SvelteKit because React is getting old. Uses Supabase for real-time updates and auth. The AI runs on OpenAI's API with custom prompts I've tuned for fantasy football context.

Local-first architecture means it runs on your machine during drafts - no dependency on my servers when you need it most.

## Getting started

### Prerequisites

- Node.js (18+)
- pnpm (or npm/yarn if you're basic)
- A Supabase account (free tier works fine)
- OpenAI API key

### Setup

1. Clone this repo

```bash
git clone [your-repo-url]
cd fantasy-draft-assistant
```

2. Install dependencies

```bash
pnpm install
```

3. Set up your environment variables

```bash
cp .env.example .env.local
```

Fill in your Supabase URL, key, and OpenAI API key.

4. Run the development server

```bash
pnpm dev
```

5. Open http://localhost:5173 and sign up

### Connect your league

1. Sign in to the app
2. Go to your ESPN or Sleeper league
3. Copy the league ID from the URL
4. Paste it into the app
5. For ESPN: You might need to log in and grab some cookies (the app will walk you through it)

## How to use during your draft

1. Start the app before your draft begins
2. It'll automatically detect when your draft starts
3. Watch the real-time updates as picks are made
4. Check your recommendations panel for AI suggestions
5. Click on any player to see detailed reasoning
6. Draft better than your friends
7. Win your league
8. Buy me a beer

## Development

Want to contribute or customize it? Cool.

```bash
# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run tests (when I write them)
pnpm test
```

The codebase is pretty straightforward:

- `/src/routes` - SvelteKit pages and API endpoints
- `/src/lib` - Shared utilities and components
- `/src/hooks.server.ts` - Authentication handling

## Deployment

Works great on Vercel, Netlify, or any Node.js host. Just remember to set your environment variables.

## Known issues

- ESPN's API is unofficial and sometimes flaky
- The AI occasionally suggests kickers too early (working on it)
- Mobile interface could be better
- No auction draft support yet

## Contributing

Found a bug? Have an idea? Open an issue or PR. Just don't make the name even longer.

## Disclaimer

This won't guarantee you win your league. Your friends might still draft better than you. The AI doesn't know about your weird league rules or that one guy who always drafts three QBs.

Use at your own risk. Not responsible for lost buy-ins, angry commissioners, or existential crises about whether fantasy football is just elaborate gambling.

---

_Built because I was procrastinating on actual work and my draft was coming up._
