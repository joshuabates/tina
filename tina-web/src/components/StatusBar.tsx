interface Props {
  orchestrationCount: number;
}

export default function StatusBar({ orchestrationCount }: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-4 py-1.5 text-xs text-gray-400 flex items-center justify-between z-50">
      <span>
        {orchestrationCount}{" "}
        {orchestrationCount === 1 ? "orchestration" : "orchestrations"}
      </span>
      <span className="text-green-400">Connected</span>
    </div>
  );
}
