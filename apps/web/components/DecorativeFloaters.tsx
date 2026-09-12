export function DecorativeFloaters() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      {/* Background Dots */}
      <span className="absolute left-[67%] top-[18%] h-2 w-2 rounded-full bg-[#7C5295]" />
      <span className="absolute left-[61%] top-[40%] h-2.5 w-2.5 rounded-full bg-[#F8C359]" />
      <span className="absolute left-[77%] top-[39%] h-2 w-2 rounded-full bg-[#18181B]" />
      <span className="absolute left-[89%] top-[60%] h-2.5 w-2.5 rounded-full bg-[#F8C359]" />

      {/* Flag / Purple Circle Icon */}
      <div className="absolute left-[55%] top-[24%] flex h-16 w-16 items-center justify-center rounded-full bg-[#8875DF] shadow-sm">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>

      {/* Female Avatar */}
      <div className="absolute left-[70%] top-[24%] h-8 w-8 overflow-hidden rounded-full ring-2 ring-white shadow-sm">
        <img src="/avatar-1.svg" alt="" className="h-full w-full object-cover" />
      </div>

      {/* Blue Hamburger Menu Icon */}
      <div className="absolute left-[79%] top-[17%] flex h-12 w-12 items-center justify-center rounded-full bg-[#4B8BF5] shadow-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </div>

      {/* Orange App Grid + Plus Icon */}
      <div className="absolute left-[63%] top-[42%] flex h-12 w-12 items-center justify-center rounded-full bg-[#EEA776] shadow-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <path d="M17 14v6M14 17h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Yellow Checklist Icon */}
      <div className="absolute left-[77%] top-[56%] flex h-12 w-12 items-center justify-center rounded-full bg-[#F8C359] shadow-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="7" x2="6" y2="7" />
          <line x1="10" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="6" y2="12" />
          <line x1="10" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="6" y2="17" />
          <line x1="10" y1="17" x2="20" y2="17" />
        </svg>
      </div>

      {/* Green Target Icon */}
      <div className="absolute left-[63%] top-[62%] flex h-12 w-12 items-center justify-center rounded-full bg-[#58B39B] shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" stroke="white" strokeWidth="2" fill="none">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="white" />
        </svg>
      </div>

      {/* Male Avatar (Large Circle) */}
      <div className="absolute left-[87%] top-[42%] h-16 w-16 overflow-hidden rounded-full ring-2 ring-white shadow-sm">
        <img src="/avatar-2.svg" alt="" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}