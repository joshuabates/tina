interface Props {
  connected: boolean;
  lastUpdate: Date | null;
  orchestrationCount: number;
}

export default function StatusBar({
  connected,
  lastUpdate,
  orchestrationCount,
}: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-4 py-1 flex items-center gap-4 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        <span className={connected ? "text-green-400" : "text-red-400"}>
          {connected ? "\u25cf" : "\u25cb"}
        </span>
        {connected ? "Connected" : "Disconnected"}
      </span>
      {lastUpdate && (
        <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
      )}
      <span>{orchestrationCount} orchestration{orchestrationCount !== 1 ? "s" : ""}</span>
    </div>
  );
}
