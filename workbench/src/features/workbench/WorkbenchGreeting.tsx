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
          Describe the outcome. I&rsquo;ll keep the path visible: conversation, preview, validation,
          and approval before anything touches your files.
        </p>
      </div>
    </div>
  );
}
