# FlatScout - CreateMap Skill

Skill to generate and deploy interactive apartment maps from the FlatScout database to GitHub Pages.

## Core Features
*   **Dynamic Map Generation**: Filters data directly via the Scraper API.
*   **Custom Viewports**: Create multiple maps (e.g., `index.html`, `map_2hab.html`) using `--name`.
*   **Visual Enhancements**: Legend, distance radius, popup details, and live timestamp.
*   **Deployment**: Automated GitHub Pages sync.

## Quick Start
```bash
bash ./scripts/update_and_deploy.sh --name [name] --rooms [N] --status [S]
```

## Setup Requirements
1. `ITHUB_TOKEN` in the root `.env` file with `repo` permissions.
2. Ensure `git` is initialized and pushing to `origin main`.
