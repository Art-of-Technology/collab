const featureFlags = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return defaultValue;
  }
};

const realtimeKanbanEnv = process.env.NEXT_PUBLIC_IS_REALTIME_UPDATES_KANBANBOARD_ON
  ?? process.env.IS_REALTIME_UPDATES_KANBANBOARD_ON;

const collaborativeEditingEnv = process.env.NEXT_PUBLIC_IS_COLLABORATIVE_EDITING_ON
  ?? process.env.IS_COLLABORATIVE_EDITING_ON;

export const IS_KANBAN_REALTIME_ENABLED = featureFlags(
  realtimeKanbanEnv,
  true
);

export const IS_COLLABORATIVE_EDITING_ENABLED = featureFlags(
  collaborativeEditingEnv,
  true
);

export { featureFlags };
