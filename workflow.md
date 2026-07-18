These five Kanban boards integrate the technical setup, strategic selection criteria, prompt design principles, and rigorous validation protocols detailed across our entire conversation and the project sources.

### **Board 1: Technical Foundation (Pre-Flight)**
*   **Column: Environment & Tools**
    *   **Task State: Toolchain Sync (Required)**
        *   **Snippets:** `claude --version` (v2.1.176+); `uv run python main.py --version` (v1.18.0 or v1.19.0).
    *   **Task State: Persisted Config (Completed Once)**
        *   **Snippet:** `echo -e "set-option -g history-limit 100000\nset -g mouse on" > ~/.tmux.conf`.
    *   **Task State: Proxy Variable Export (Active)**
        *   **Instructions:** Set `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` in your terminal before launching tmux.
*   **Column: Trace Infrastructure**
    *   **Task State: Certificate Generation (Ready)**
        *   **Snippet:** `uv run mitmproxy` (Wait for UI, then press `q`).
    *   **Task State: System Trust (Verified)**
        *   **Instructions (macOS):** `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem`.
        *   **Instructions (Linux):** `sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt && sudo update-ca-certificates`.

---

### **Board 2: Strategic Selection (Choosing the "Winner")**
*   **Column: Repository Sourcing**
    *   **Task State: Quality Signal Audit (Pending)**
        *   **Instructions:** Must be enterprise-grade (200+ source files, CI/CD, active maintenance, real users).
    *   **Task State: Exclusion Filter (Checked)**
        *   **Instructions:** Avoid SWE-Bench repos (Django, Flask, etc.) and over-covered repos (Baserow, Ghost, Superset, etc.).
    *   **Task State: License Verification (Required)**
        *   **Instructions:** Permissive only (MIT, Apache, or BSD).
*   **Column: Domain & Task Alignment**
    *   **Task State: Priority Mapping (Active)**
        *   **Instructions:** Target High-Need types: **Product Interaction, Test, Requirements, Code Review**. Deprioritize Feature Development.

---

### **Board 3: Prompt Engineering (The "Senior SWE" Request)**
*   **Column: Content Design**
    *   **Task State: Senior Persona Drafting (In Progress)**
        *   **Instructions:** Conversational "Slack-style" ask. Define the *what*, not the *how*. Avoid "Step 1, 2, 3".
    *   **Task State: Goal & Outcome Scoping (Drafted)**
        *   **Instructions:** Document the "Overall Goal." Specify which files should change and where the model is likely to fail.
*   **Column: Sanitization & Capture**
    *   **Task State: Environment Cleaning (Ready)**
        *   **Snippet:** `rm -rf .git`, `rm CLAUDE.md AGENTS.md`, and remove any enterprise (`ee/`) folders.
    *   **Task State: Initial State Capture (Pending)**
        *   **Snippet:** `tar -cf <project>-start.tar ./<project>` (Use lowercase/hyphens for names).

---

### **Board 4: Live Validation (Interactive/Autonomous)**
*   **Column: Execution**
    *   **Task State: Session Initialization (Active)**
        *   **Snippet:** `tmux kill-server` (Ensures fresh start for proxy variables).
        *   **Instructions:** Launch Trace Extractor first, then use the generated command to start Claude Code in tmux.
    *   **Task State: Validation Run (In Progress)**
        *   **Interactive:** 5+ meaningful turns (new edits/decisions) and 1.5+ hours.
        *   **Autonomous:** 45 mins to 1.5+ hours of model generation without follow-ups.
*   **Column: Difficulty Threshold**
    *   **Task State: Success Check (Critical Path)**
        *   **Instructions:** Verify if **Task Success ≤ 2** OR **Instruction Following ≤ 2**. If both are > 2, the prompt is too easy.
    *   **Task State: Failure Protocol (If Applicable)**
        *   **Instructions:** If too easy, redesign the *opening prompt* and restart with a **fresh project state**. If best efforts fail to challenge the model, submit honestly and take a **mandatory 24-hour break**.

---

### **Board 5: Artifact Submission**
*   **Column: Final Archiving**
    *   **Task State: Sequential Shutdown (Ready)**
        *   **Snippet:** `/exit` in Claude Code, then `Ctrl+C` in Trace Extractor window.
    *   **Task State: Final State Capture (Pending)**
        *   **Snippet:** `tar -cf <project>-end-claude.tar ./<project>` (Exclude `node_modules` or `.venv`).
*   **Column: Submission Rationale**
    *   **Task State: Evidence-Based Rating (Final)**
        *   **Instructions:** Provide 3-5+ sentences for each rating. Reference specific turns and behaviors where the model struggled or failed.
    *   **Task State: Form Completion (Done)**
        *   **Instructions:** Provide URL, SHA hash, `trace.json`, `transcript.txt`, `start.tar`, and `end.tar`.