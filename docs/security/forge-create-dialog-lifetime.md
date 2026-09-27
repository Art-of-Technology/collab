# Forge new-issue dialog lifetime

The [issue actions guide](../forge-issue-actions.md#new-issue-drafts) owns draft disposal and in-flight request guidance. `ForgeBoardView` conditionally mounts `ForgeIssueCreate` while `creating` is true, independently of the dialog shell's exit animation. Existing issue details already use conditional mounting.

The change does not alter submit handlers, server authorization or the dialog's Escape/focus handling.

The focused regression uses actual React/ReactDOM and the actual board/create components in the existing locked jsdom dependency. A dialog double retains its children across close/reopen to exercise the relevant lifecycle boundary. It checks title and description reset, no create call on close, and one normal submission afterward. It does not prove native Radix animation timing, browser focus restoration, provider writes or runtime acceptance. Existing a59 scenario7 failure remains historical; a successor artifact needs its own admission.
