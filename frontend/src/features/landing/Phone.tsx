/** Screen contents of the phone: status bar, app header, screen body, home indicator. */
export function PhoneChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex h-full flex-col overflow-hidden bg-[#0a0f10] text-left'>
      <div className='flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-fog'>
        <span>9:41</span>
        <span className='h-5 w-20 rounded-full bg-black' />
        <span className='flex gap-1'>
          <span className='h-2 w-3 rounded-sm bg-fog/80' />
          <span className='h-2 w-4 rounded-sm bg-mint' />
        </span>
      </div>
      <div className='flex items-center gap-2 px-4 pb-2.5 pt-1.5'>
        <span className='grid size-7 place-items-center rounded-full bg-gradient-to-br from-mint via-teal to-amber text-[12px] font-bold text-night'>
          +
        </span>
        <span className='text-[13px] font-semibold text-fog'>HealthAccess</span>
        <span className='ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-fog-muted'>
          Fictional data
        </span>
      </div>
      <div className='relative flex-1 overflow-hidden'>{children}</div>
      <div className='mx-auto mb-2 mt-1 h-1 w-24 rounded-full bg-fog/40' />
    </div>
  );
}

/**
 * CSS phone modelled on Murmur's frame: brushed-metal rim, thick black bezel, side buttons, neutral drop
 * shadow (no coloured glow). Decorative: callers set aria-hidden.
 */
export function Phone({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative aspect-9/19 w-full ${className}`}>
      {/* Side buttons sit just outside the rim. */}
      <span className='phone-button absolute -left-1 top-[17%] h-[4%] w-1.5 rounded-l-sm' />
      <span className='phone-button absolute -left-1 top-[24%] h-[7.5%] w-1.5 rounded-l-sm' />
      <span className='phone-button absolute -left-1 top-[33%] h-[7.5%] w-1.5 rounded-l-sm' />
      <span className='phone-button absolute -right-1 top-[26%] h-[11%] w-1.5 rounded-r-sm' />

      <div className='phone-rim h-full rounded-[3.2rem] p-1.5'>
        <div className='h-full rounded-[2.9rem] bg-black p-2.25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'>
          <div className='h-full overflow-hidden rounded-[2.4rem]'>
            <PhoneChrome>{children}</PhoneChrome>
          </div>
        </div>
      </div>
    </div>
  );
}
