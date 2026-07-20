export function UserTurn({ text }: { text: string }) {
  return (
    <div className="turn-arrive flex justify-end">
      <p className="max-w-[85%] rounded-card border border-steel bg-glass px-3.5 py-2.5 text-[15px] leading-6 text-ice">
        {text}
      </p>
    </div>
  );
}
