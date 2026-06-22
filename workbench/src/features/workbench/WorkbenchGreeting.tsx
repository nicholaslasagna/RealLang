/**
 * Friendly assistant opening for the Workbench conversation.
 * Pure presentation — no provider, network, tool, or workspace authority.
 */
export function WorkbenchGreeting() {
  return (
    <div className="thread-greeting" data-testid="workbench-greeting">
      <span className="mini-mark" aria-hidden="true" />
      <div>
        <b>RealForge</b>
        <p>
          Hi — tell me what you want to build or fix. I&rsquo;ll outline a plan and show exactly what
          would run. Nothing executes or touches your files until you approve it.
        </p>
      </div>
    </div>
  );
}
