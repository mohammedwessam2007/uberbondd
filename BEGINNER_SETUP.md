# Beginner Setup

## The simplest version

Run Nightshift in **rules mode** first. This costs no AI API money.

You need:

- a computer or cloud host that can run Node and Chromium;
- a CSV containing company names and website URLs;
- no Gmail or Hunter account for the research stage.

## Local setup

1. Extract the ZIP.
2. Open a terminal in the folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Run `npm start`.
6. Open `http://localhost:8080`.

## What the buttons do

- **Create campaign:** defines the target and minimum quality.
- **Import CSV:** adds companies to the queue.
- **Run nightshift:** starts research.
- **Pause:** stops starting new prospects.
- **Resume:** allows work again.
- **Open dossier:** shows screenshots, evidence, score, and draft.

## What requires your private credentials later

- OpenAI or Anthropic API for AI enhancement
- Hunter for external contact discovery
- Google Cloud OAuth for Gmail
- Railway or Render for 24/7 hosting

Do not paste those secrets into chats. Add them directly to the host's encrypted environment-variable dashboard.
