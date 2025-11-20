interface HeaderProps {
  workerName?: string;
  communityName?: string;
}

export default function Header({ workerName, communityName }: HeaderProps) {
  return (
    <header className="bg-primary text-primary-foreground px-4 py-2 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Didi Now</h1>
          {workerName && (
            <p className="text-xs opacity-90">{workerName}</p>
          )}
        </div>
        {communityName && (
          <div className="text-right">
            <p className="text-xs opacity-75">{communityName}</p>
          </div>
        )}
      </div>
    </header>
  );
}
