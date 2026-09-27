# Forge new-issue dialog lifetime

The create form is mounted only while the New issue dialog is open. Closing the dialog removes its local title, description and message state immediately, even if the dialog shell remains mounted for an exit animation. Reopening starts a fresh draft. Existing issue details already use conditional mounting.

The change does not alter submit handlers, pending/uncertain-result behavior, server authorization or the dialog's Escape/focus handling. Closing an unsent draft performs no create request. An in-flight request is not cancelled or rolled back by unmounting; uncertain outcomes still require source reconciliation.

The focused regression uses actual React/ReactDOM and the actual board/create components in the existing locked jsdom dependency. A dialog double retains its children across close/reopen to exercise the relevant lifecycle boundary. It checks title and description reset, no create call on close, and one normal submission afterward. It does not prove native Radix animation timing, browser focus restoration, provider writes or runtime acceptance. Existing a59 scenario7 failure remains historical; a successor artifact needs its own admission.
