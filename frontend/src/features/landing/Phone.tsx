/** Screen contents of the phone: status bar, app header, screen body, home indicator. */
export function PhoneChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex h-full flex-col overflow-hidden bg-[#0a1112] text-left'>
      <div className='flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-fog'>
        <span>9:41</span>
        <span className='h-5 w-20 rounded-full bg-black' />
        <span className='flex gap-1'>
          <span className='h-2 w-3 rounded-sm bg-fog/80' />
          <span className='h-2 w-4 rounded-sm bg-mint' />
        </span>
      </div>
      <div className='flex items-center gap-2 border-b border-white/5 px-4 pb-2.5 pt-1.5'>
        <span className='grid size-6 place-items-center rounded-full bg-gradient-to-br from-mint to-teal text-[11px] font-bold text-night'>
          +
        </span>
        <span className='text-xs font-semibold text-fog'>HealthAccess</span>
        <span className='ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-fog-muted'>
          Fictional data
        </span>
      </div>
      <div className='relative flex-1 overflow-hidden'>{children}</div>
      <div className='mx-auto mb-2 mt-1 h-1 w-24 rounded-full bg-fog/40' />
    </div>
  );
}

/** CSS phone frame (no photo assets). Decorative: callers set aria-hidden. */
export function Phone({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[9/19] w-full rounded-[2.6rem] border border-white/10 bg-[#0b1213] p-2.5 shadow-[0_40px_120px_-20px_rgba(43,179,163,0.35),inset_0_0_0_1px_rgba(255,255,255,0.04)] ${className}`}>
      <div className='h-full overflow-hidden rounded-[2.1rem] ring-1 ring-white/5'>
        <PhoneChrome>{children}</PhoneChrome>
      </div>
    </div>
  );
}
