# Frontend Components Map

The frontend codebase is split to isolate concerns and make additions or design changes fast.

## Styles Directory Layout
CSS files are placed in `public/styles/`:
- `variables.css`: Contains CSS variables, fonts, colors, and basic resets.
- `layout.css`: Focuses on structural styling such as flex grids, tab routing containers, and navigation alignments.
- `components.css`: Contains specific visual styles for buttons, cards, list groups, modal popups, and confirmation alerts.

## Script Modules Layout
JavaScript files are placed in `public/js/`:
- `app.js`: Connects core application states, defines default tab routing behavior, and manages listeners.
- `api.js`: Wraps all REST client operations (`fetch` HTTP calls to Node server).

### Component Modules (`public/js/components/`)
- `dashboard.js`: Pulls tasks from the current state and renders data visualization metrics:
  - Total and active task metrics.
  - Distribution graphs (tasks grouped by phase).
  - Activity list mapping (recent status updates).
- `board.js`: Renders the Kanban Board view:
  - Generates board lanes defined by columns.
  - Renders task cards within columns.
  - Implements browser Drag and Drop APIs (`ondragstart`, `ondragover`, `ondrop`).
- `library.js`: Renders instructions cards, list searches, and copy buttons.
- `modal.js`: Controls visual states of inputs, task/instruction forms, and manages custom confirm triggers (before running dangerous delete actions).
