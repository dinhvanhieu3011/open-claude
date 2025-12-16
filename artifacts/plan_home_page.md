# Plan: Implement "Flow" Dashboard Home Page

## Objective
Implement the "Home page when logged in" design as requested, matching the provided screenshot (Flow Pro Trial dashboard).

## Tech Stack
*   HTML5
*   CSS3 (Vanilla)
*   JavaScript (Vanilla/ES6 modules) - likely no behavior changes needed initially, just UI.

## Steps

1.  **Modify `static/index.html`**:
    *   Update the specific `#home` container to matched the 2-column layout.
    *   Structure:
        ```html
        <div id="home" class="home-container">
            <aside class="flow-sidebar">
                <!-- Sidebar content (Logo, Nav, Upgrade Card, Bottom Links) -->
            </aside>
            <main class="flow-main">
                <!-- Main Header (Welcome, Stats) -->
                <!-- Hero Card (Onboarding) -->
                <!-- Activity Feed -->
            </main>
        </div>
        ```

2.  **Add CSS Styles**:
    *   Add new styles for `.flow-sidebar`, `.flow-main`, and their children.
    *   Ensure layout matches the screenshot (flexbox/grid).
    *   Match colors and typography where possible.
        *   Sidebar: Light gray/white? The image shows a very clean white/light gray look.
        *   Main bg: White.
        *   Hero card: Light yellow/cream (`#FFFBEB`?).
        *   Accent colors: Purple (`#7C3AED`?) for "Pro Trial" label.
        *   Orange/Red/Yellow indicators for stats.

3.  **Verify**:
    *   Since I cannot see the rendered output live, I will use `read_file` to verify the code structure.
    *   The user will run the app to verify visual correctness.

## Detailed Elements

*   **Sidebar**:
    *   Logo: "Flow" (Text) + "Pro Trial" (Badge).
    *   Nav: `Home` (Active), `Dictionary`, `Snippets`, `Style`, `Notes`. Icons needed (will use Unicode or SVG placeholders if SVGs not available in the codebase, or existing icons).
    *   Upgrade Card: "Flow Pro Trial", Progress bar, "Upgrade to Pro" button.
    *   Footer: "Invite your team", "Get a free month", "Settings", "Help".

*   **Main**:
    *   Header: "Welcome back, Dinh". Stats: "1 week" (fire), "66 words" (rocket), "36 WPM" (snail/hand?).
    *   Hero: "Hold down Ctrl -> +k to dictate...". Button "See how it works".
    *   Activity: "YESTERDAY". List of items with timestamps.

## Implementation Details
I will start by creating the CSS and HTML structure. I will likely add the CSS to a new `<style>` block in `head` to keep it organized or append to the existing one.
